import { readFileSync } from 'node:fs';
import process from 'node:process';

import { FACTORY_LABELS, initialDispatch, taskLabelPlan } from './dispatch-policy.mjs';

const API_ROOT = 'https://api.github.com';
const RUN_BEGIN = '<!-- FACTORY_RUN_BEGIN -->';
const RUN_END = '<!-- FACTORY_RUN_END -->';
const ALLOWED_HUMAN_GATES = new Set([
  'product_decision',
  'destructive_operation',
  'production_activation',
  'privilege_change',
  'legal_or_organizational_decision',
]);
const ALLOWED_PROVIDERS = new Set(['jules', 'antigravity', 'opencode_ollama', 'manual']);

function fail(message) {
  throw new Error(message);
}

function env(name) {
  const value = process.env[name]?.trim();
  if (!value) fail(`Missing required environment variable: ${name}`);
  return value;
}

function cleanText(value, label, max = 200) {
  const text = String(value ?? '').trim();
  if (!text) fail(`${label} is required`);
  if (text.length > max) fail(`${label} exceeds ${max} characters`);
  return text;
}

function stringArray(value, label) {
  if (value == null) return [];
  if (!Array.isArray(value)) fail(`${label} must be an array`);
  const result = [];
  for (const item of value) {
    const text = String(item ?? '').trim();
    if (text && !result.includes(text)) result.push(text);
  }
  return result;
}

export function parseManifest(body) {
  const start = body.indexOf(RUN_BEGIN);
  const end = body.indexOf(RUN_END);
  if (start < 0 || end < 0 || end <= start) {
    fail('Issue body must contain FACTORY_RUN_BEGIN/FACTORY_RUN_END markers.');
  }
  const raw = body.slice(start + RUN_BEGIN.length, end).trim();
  let value;
  try {
    value = JSON.parse(raw);
  } catch (error) {
    fail(`Factory Run JSON is invalid: ${error.message}`);
  }
  if (!value || typeof value !== 'object' || Array.isArray(value))
    fail('Factory Run must be a JSON object.');
  if ((value.schema_version ?? 1) !== 1)
    fail(`Unsupported schema_version: ${value.schema_version}`);
  const runId = cleanText(value.run_id, 'run_id', 120);
  const goal = cleanText(value.goal, 'goal', 1000);
  if (!Array.isArray(value.tasks) || value.tasks.length === 0)
    fail('Factory Run requires a non-empty tasks array.');
  if (value.tasks.length > 20) fail('Factory Run is limited to 20 tasks per parent issue.');

  const ids = new Set();
  const tasks = value.tasks.map((rawTask, index) => {
    if (!rawTask || typeof rawTask !== 'object' || Array.isArray(rawTask))
      fail(`Task #${index + 1} must be an object.`);
    const id = cleanText(rawTask.id, `task #${index + 1} id`, 120);
    if (ids.has(id)) fail(`Duplicate task id: ${id}`);
    ids.add(id);
    const title = cleanText(rawTask.title, `title for ${id}`, 200);
    const role = cleanText(rawTask.role ?? 'implementation', `role for ${id}`, 80);
    const dependsOn = stringArray(rawTask.depends_on, `depends_on for ${id}`);
    const paths = stringArray(rawTask.paths, `paths for ${id}`);
    const requiredCapabilities = stringArray(
      rawTask.required_capabilities,
      `required_capabilities for ${id}`,
    );
    const preferredProviders = stringArray(
      rawTask.preferred_providers,
      `preferred_providers for ${id}`,
    );
    for (const provider of preferredProviders) {
      if (!ALLOWED_PROVIDERS.has(provider)) fail(`Unknown provider '${provider}' in task ${id}.`);
    }
    const humanGates = stringArray(rawTask.human_gates, `human_gates for ${id}`);
    for (const gate of humanGates) {
      if (!ALLOWED_HUMAN_GATES.has(gate)) fail(`Unknown human gate '${gate}' in task ${id}.`);
    }
    return {
      id,
      title,
      role,
      dependsOn,
      paths,
      requiredCapabilities,
      preferredProviders,
      humanGates,
    };
  });

  for (const task of tasks) {
    for (const dependency of task.dependsOn) {
      if (!ids.has(dependency)) fail(`Task ${task.id} depends on unknown task ${dependency}.`);
      if (dependency === task.id) fail(`Task ${task.id} cannot depend on itself.`);
    }
  }

  const byId = new Map(tasks.map((task) => [task.id, task]));
  const visiting = new Set();
  const visited = new Set();
  const visit = (id) => {
    if (visited.has(id)) return;
    if (visiting.has(id)) fail('Factory Run dependency graph contains a cycle.');
    visiting.add(id);
    for (const dep of byId.get(id).dependsOn) visit(dep);
    visiting.delete(id);
    visited.add(id);
  };
  for (const task of tasks) visit(task.id);

  return { runId, goal, tasks };
}

async function github(path, options = {}) {
  const token = env('GITHUB_TOKEN');
  const response = await fetch(`${API_ROOT}${path}`, {
    ...options,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) {
    fail(
      `GitHub API ${options.method ?? 'GET'} ${path} failed (${response.status}): ${payload?.message ?? text}`,
    );
  }
  return payload;
}

async function ensureLabel(owner, repo, name, description, color = '5319e7') {
  const encoded = encodeURIComponent(name);
  const existing = await fetch(`${API_ROOT}/repos/${owner}/${repo}/labels/${encoded}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${env('GITHUB_TOKEN')}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (existing.ok) return;
  if (existing.status !== 404) fail(`Unable to inspect label ${name}: ${existing.status}`);
  await github(`/repos/${owner}/${repo}/labels`, {
    method: 'POST',
    body: JSON.stringify({ name, color, description }),
  });
}

function labelNames(labels) {
  return (labels ?? [])
    .map((item) => (typeof item === 'string' ? item : item?.name))
    .filter(Boolean);
}

async function ensureIssueLabels(owner, repo, issueNumber, currentLabels, desiredLabels) {
  const current = new Set(labelNames(currentLabels));
  const missing = desiredLabels.filter((label) => !current.has(label));
  if (missing.length === 0) return false;
  await github(`/repos/${owner}/${repo}/issues/${issueNumber}/labels`, {
    method: 'POST',
    body: JSON.stringify({ labels: missing }),
  });
  return true;
}

function taskMarker(runId, taskId) {
  return `<!-- factory-run:${runId};task:${taskId} -->`;
}

function taskBody(parentIssue, manifest, task) {
  const providers = task.preferredProviders.length ? task.preferredProviders.join(', ') : 'auto';
  const dependencies = task.dependsOn.length ? task.dependsOn.join(', ') : 'none';
  const scopes = task.paths.length ? task.paths.join(', ') : 'unknown/conservative';
  const gates = task.humanGates.length ? task.humanGates.join(', ') : 'none';
  const dispatch = initialDispatch(task);
  const initialProvider = dispatch.provider ?? 'none';
  return (
    `${taskMarker(manifest.runId, task.id)}\n\n` +
    `Parent Factory Run: #${parentIssue}\n\n` +
    `Goal: ${manifest.goal}\n\n` +
    `Task ID: \`${task.id}\`\n` +
    `Role: \`${task.role}\`\n` +
    `Dependencies: ${dependencies}\n` +
    `Path scopes: ${scopes}\n` +
    `Required capabilities: ${task.requiredCapabilities.join(', ') || 'none'}\n` +
    `Preferred providers: ${providers}\n` +
    `Initial dispatch: ${dispatch.status} (${initialProvider})\n` +
    `Human gates: ${gates}\n\n` +
    `## Task\n\n${task.title}\n\n` +
    `## Guardrails\n\n` +
    `- Work in an isolated branch/PR.\n` +
    `- Do not merge or deploy production from this task.\n` +
    `- Do not enable Banco de Notas sync.\n` +
    `- Do not broaden permissions or credentials.\n` +
    `- Preserve repository contracts and run required CI/review gates.\n` +
    `- A provider trigger is only a work request; it never grants merge or production authority.\n`
  );
}

async function existingTaskIssues(owner, repo, runId) {
  const query = encodeURIComponent(`repo:${owner}/${repo} is:issue "factory-run:${runId};task:"`);
  const result = await github(`/search/issues?q=${query}&per_page=100`);
  return result.items ?? [];
}

async function ensureControlPlaneLabels(owner, repo) {
  await ensureLabel(owner, repo, FACTORY_LABELS.parent, 'Parent orchestration issue for a Factory Run.');
  await ensureLabel(owner, repo, FACTORY_LABELS.task, 'Materialized child task from a Factory Run.');
  await ensureLabel(
    owner,
    repo,
    FACTORY_LABELS.blocked,
    'Factory task requires explicit human decision before execution.',
  );
  await ensureLabel(
    owner,
    repo,
    FACTORY_LABELS.waiting,
    'Factory task is waiting for declared dependencies before provider dispatch.',
    'fbca04',
  );
  await ensureLabel(
    owner,
    repo,
    FACTORY_LABELS.providerJules,
    'Factory task selected Jules as the initial remote worker.',
    '0e8a16',
  );
  await ensureLabel(
    owner,
    repo,
    FACTORY_LABELS.julesTrigger,
    'External Jules GitHub App trigger. Applied only to eligible root Factory tasks.',
    '1d76db',
  );
}

async function materialize() {
  const repository = env('GITHUB_REPOSITORY');
  const [owner, repo] = repository.split('/');
  if (!owner || !repo) fail('GITHUB_REPOSITORY must be owner/repo.');
  const issueNumber = Number(env('FACTORY_PARENT_ISSUE'));
  if (!Number.isInteger(issueNumber) || issueNumber <= 0)
    fail('FACTORY_PARENT_ISSUE must be a positive integer.');

  const issue = await github(`/repos/${owner}/${repo}/issues/${issueNumber}`);
  const manifest = parseManifest(issue.body ?? '');

  await ensureControlPlaneLabels(owner, repo);
  await ensureIssueLabels(owner, repo, issueNumber, issue.labels, [FACTORY_LABELS.parent]);

  const existing = await existingTaskIssues(owner, repo, manifest.runId);
  const existingBodies = new Map(existing.map((item) => [item.body ?? '', item]));
  const created = [];
  const reused = [];
  const dispatchRecords = [];

  for (const task of manifest.tasks) {
    const marker = taskMarker(manifest.runId, task.id);
    const found = [...existingBodies.entries()].find(([body]) => body.includes(marker))?.[1];
    const labelPlan = taskLabelPlan(task);
    const dispatch = initialDispatch(task);

    if (found) {
      await ensureIssueLabels(owner, repo, found.number, found.labels, labelPlan.desiredLabels);
      reused.push({ task: task.id, issue: found.number });
      dispatchRecords.push({ task: task.id, issue: found.number, ...dispatch });
      continue;
    }

    const child = await github(`/repos/${owner}/${repo}/issues`, {
      method: 'POST',
      body: JSON.stringify({
        title: `[Factory:${manifest.runId}] ${task.title}`,
        body: taskBody(issueNumber, manifest, task),
        labels: labelPlan.creationLabels,
      }),
    });
    if (labelPlan.triggerLabels.length > 0) {
      await ensureIssueLabels(owner, repo, child.number, child.labels, labelPlan.triggerLabels);
    }
    created.push({ task: task.id, issue: child.number });
    dispatchRecords.push({ task: task.id, issue: child.number, ...dispatch });
  }

  const julesRequested = dispatchRecords.filter((item) => item.provider === 'jules');
  const waiting = dispatchRecords.filter((item) => item.status === 'waiting');
  const humanRequired = dispatchRecords.filter((item) => item.status === 'human-required');
  const unassigned = dispatchRecords.filter((item) => item.status === 'unassigned');

  const summary = {
    status: 'materialized',
    run_id: manifest.runId,
    parent_issue: issueNumber,
    task_count: manifest.tasks.length,
    created,
    reused,
    provider_dispatch: {
      jules_trigger_requested: julesRequested,
      waiting,
      human_required: humanRequired,
      unassigned,
    },
    production_activation: 'not-performed',
  };

  await github(`/repos/${owner}/${repo}/issues/${issueNumber}/comments`, {
    method: 'POST',
    body: JSON.stringify({
      body:
        `Factory Run \`${manifest.runId}\` materialized safely.\n\n` +
        `Created: ${created.length}\n` +
        `Reused: ${reused.length}\n` +
        `Jules trigger requested: ${julesRequested.length}\n` +
        `Waiting on dependencies: ${waiting.length}\n` +
        `Human-required: ${humanRequired.length}\n` +
        `Unassigned: ${unassigned.length}\n\n` +
        `The exact \`jules\` label is emitted as a separate post-creation label event only for eligible root tasks that explicitly prefer Jules. ` +
        `External execution still requires the Jules GitHub App to have repository access.\n\n` +
        `Production: untouched.`,
    }),
  });
  process.stdout.write(`${JSON.stringify(summary)}\n`);
}

function validateFile(path) {
  const manifest = parseManifest(readFileSync(path, 'utf8'));
  const initialDispatches = manifest.tasks.map((task) => ({
    task: task.id,
    ...initialDispatch(task),
  }));
  process.stdout.write(
    `${JSON.stringify({
      status: 'valid',
      run_id: manifest.runId,
      task_count: manifest.tasks.length,
      human_gate_tasks: manifest.tasks
        .filter((task) => task.humanGates.length > 0)
        .map((task) => task.id),
      initial_dispatches: initialDispatches,
    })}\n`,
  );
}

const command = process.argv[2];
if (command === 'validate-file') {
  const path = process.argv[3];
  if (!path) fail('validate-file requires a path.');
  validateFile(path);
} else if (command === 'materialize') {
  materialize().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
} else {
  fail(`Unsupported command: ${command ?? '(missing)'}`);
}
