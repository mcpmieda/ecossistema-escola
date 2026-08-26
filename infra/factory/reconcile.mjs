import process from 'node:process';

import { FACTORY_LABELS } from './dispatch-policy.mjs';
import {
  changedFilesWithinDeclaredScope,
  parseMaterializedTask,
  sameRepositoryPrNumbers,
  shouldReleaseTask,
} from './reconciliation-policy.mjs';

const API_ROOT = 'https://api.github.com';

function fail(message) {
  throw new Error(message);
}

function env(name) {
  const value = process.env[name]?.trim();
  if (!value) fail(`Missing required environment variable: ${name}`);
  return value;
}

async function github(path, options = {}) {
  const response = await fetch(`${API_ROOT}${path}`, {
    ...options,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${env('GITHUB_TOKEN')}`,
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

async function githubPaged(path, maxPages = 10) {
  const items = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const separator = path.includes('?') ? '&' : '?';
    const payload = await github(`${path}${separator}per_page=100&page=${page}`);
    if (!Array.isArray(payload)) fail(`Expected array from paged GitHub API path: ${path}`);
    items.push(...payload);
    if (payload.length < 100) break;
  }
  return items;
}

async function ensureLabel(owner, repo, name, description, color) {
  const encoded = encodeURIComponent(name);
  const response = await fetch(`${API_ROOT}/repos/${owner}/${repo}/labels/${encoded}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${env('GITHUB_TOKEN')}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (response.ok) return;
  if (response.status !== 404) fail(`Unable to inspect label ${name}: ${response.status}`);
  await github(`/repos/${owner}/${repo}/labels`, {
    method: 'POST',
    body: JSON.stringify({ name, description, color }),
  });
}

function labelsOf(issue) {
  return (issue?.labels ?? [])
    .map((label) => (typeof label === 'string' ? label : label?.name))
    .filter(Boolean);
}

async function addLabels(owner, repo, issueNumber, labels) {
  if (labels.length === 0) return;
  await github(`/repos/${owner}/${repo}/issues/${issueNumber}/labels`, {
    method: 'POST',
    body: JSON.stringify({ labels }),
  });
}

async function removeLabel(owner, repo, issueNumber, label) {
  await github(
    `/repos/${owner}/${repo}/issues/${issueNumber}/labels/${encodeURIComponent(label)}`,
    { method: 'DELETE' },
  );
}

async function siblingTasks(owner, repo, runId) {
  const query = encodeURIComponent(`repo:${owner}/${repo} is:issue "factory-run:${runId};task:"`);
  const result = await github(`/search/issues?q=${query}&per_page=100`);
  const tasks = new Map();
  for (const issue of result.items ?? []) {
    const parsed = parseMaterializedTask(issue);
    if (parsed?.runId === runId) tasks.set(parsed.taskId, { issue, task: parsed });
  }
  return tasks;
}

async function changedFilesForPr(owner, repo, prNumber) {
  const files = await githubPaged(`/repos/${owner}/${repo}/pulls/${prNumber}/files`);
  return files.map((item) => item.filename).filter(Boolean);
}

async function verifyDependency(owner, repo, defaultBranch, dependency) {
  if (!dependency?.issue || !dependency?.task) {
    return { ready: false, reason: 'dependency-task-missing' };
  }
  if (dependency.task.paths.length === 0) {
    return { ready: false, reason: 'dependency-path-scope-missing' };
  }

  const comments = await githubPaged(
    `/repos/${owner}/${repo}/issues/${dependency.issue.number}/comments`,
  );
  const prNumbers = sameRepositoryPrNumbers(comments, owner, repo);
  if (prNumbers.length === 0) {
    return { ready: false, reason: 'trusted-jules-pr-link-missing' };
  }

  for (const prNumber of prNumbers) {
    const pr = await github(`/repos/${owner}/${repo}/pulls/${prNumber}`);
    if (!pr.merged_at) continue;
    if (pr.base?.ref !== defaultBranch) continue;

    const changedFiles = await changedFilesForPr(owner, repo, prNumber);
    if (!changedFilesWithinDeclaredScope(changedFiles, dependency.task.paths)) continue;

    return {
      ready: true,
      pr: prNumber,
      mergedAt: pr.merged_at,
      changedFiles,
    };
  }

  return { ready: false, reason: 'no-merged-in-scope-pr-on-default-branch' };
}

async function reconcileWaitingIssue(owner, repo, defaultBranch, issue) {
  const task = parseMaterializedTask(issue);
  if (!task) return { issue: issue.number, status: 'ignored-invalid-task-contract' };
  if (!labelsOf(issue).includes(FACTORY_LABELS.waiting)) {
    return { issue: issue.number, task: task.taskId, status: 'ignored-not-waiting' };
  }
  if (task.dependencies.length === 0 || task.humanGates.length > 0) {
    return { issue: issue.number, task: task.taskId, status: 'blocked-by-contract' };
  }

  const siblings = await siblingTasks(owner, repo, task.runId);
  const dependencyEvidence = new Map();
  for (const dependencyId of task.dependencies) {
    dependencyEvidence.set(
      dependencyId,
      await verifyDependency(owner, repo, defaultBranch, siblings.get(dependencyId)),
    );
  }

  if (!shouldReleaseTask(task, dependencyEvidence)) {
    return {
      issue: issue.number,
      task: task.taskId,
      status: 'waiting',
      dependencies: Object.fromEntries(dependencyEvidence),
    };
  }

  await removeLabel(owner, repo, issue.number, FACTORY_LABELS.waiting);

  if (task.preferredProviders.includes('jules')) {
    const current = new Set(labelsOf(issue));
    if (!current.has(FACTORY_LABELS.providerJules)) {
      await addLabels(owner, repo, issue.number, [FACTORY_LABELS.providerJules]);
    }
    if (!current.has(FACTORY_LABELS.julesTrigger)) {
      await addLabels(owner, repo, issue.number, [FACTORY_LABELS.julesTrigger]);
    }
    await github(`/repos/${owner}/${repo}/issues/${issue.number}/comments`, {
      method: 'POST',
      body: JSON.stringify({
        body:
          `Factory reconciliation verified all declared dependencies through trusted Jules-linked PRs merged into \`${defaultBranch}\` with changed files inside declared scopes.\n\n` +
          `Next provider trigger: \`jules\`. Merge and production authority remain unchanged.`,
      }),
    });
    return {
      issue: issue.number,
      task: task.taskId,
      status: 'trigger-requested',
      provider: 'jules',
      dependencies: Object.fromEntries(dependencyEvidence),
    };
  }

  await addLabels(owner, repo, issue.number, [FACTORY_LABELS.ready]);
  return {
    issue: issue.number,
    task: task.taskId,
    status: 'ready-unassigned',
    dependencies: Object.fromEntries(dependencyEvidence),
  };
}

async function reconcileAll() {
  const repository = env('GITHUB_REPOSITORY');
  const [owner, repo] = repository.split('/');
  if (!owner || !repo) fail('GITHUB_REPOSITORY must be owner/repo.');

  const repositoryData = await github(`/repos/${owner}/${repo}`);
  const defaultBranch = repositoryData.default_branch;
  if (!defaultBranch) fail('Repository default branch is missing.');

  await ensureLabel(
    owner,
    repo,
    FACTORY_LABELS.ready,
    'Factory task dependencies are verified and the task is ready for provider assignment.',
    '0e8a16',
  );

  const query = encodeURIComponent(
    `repo:${owner}/${repo} is:issue is:open label:"${FACTORY_LABELS.waiting}"`,
  );
  const result = await github(`/search/issues?q=${query}&per_page=100`);
  const records = [];

  for (const issue of result.items ?? []) {
    records.push(await reconcileWaitingIssue(owner, repo, defaultBranch, issue));
  }

  process.stdout.write(
    `${JSON.stringify({
      status: 'reconciled',
      default_branch: defaultBranch,
      waiting_scanned: records.length,
      records,
      merge_authority: 'not-granted',
      production_activation: 'not-performed',
    })}\n`,
  );
}

const command = process.argv[2];
if (command === 'reconcile-all') {
  reconcileAll().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
} else {
  fail(`Unsupported command: ${command ?? '(missing)'}`);
}
