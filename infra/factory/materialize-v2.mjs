import process from 'node:process';

import { FACTORY_LABELS, initialDispatch, taskLabelPlan } from './dispatch-policy.mjs';
import {
  integrationMarker,
  manifestMarker,
  parseFactoryRunV2,
  taskMarker,
} from './contract-v2.mjs';
import {
  addComment,
  addLabels,
  github,
  githubOptional,
  issueComments,
  labelNames,
  requiredEnv,
} from './github-api.mjs';

const TRUSTED_FACTORY_LOGIN = 'github-actions[bot]';
const MANIFEST_MARKER = /<!-- factory-manifest-sha256:([0-9a-f]{64}) -->/;
const PROVIDER_LABELS = new Set([
  FACTORY_LABELS.providerJules,
  FACTORY_LABELS.providerAntigravity,
  FACTORY_LABELS.providerOpenCode,
]);
const RUNTIME_LABELS = new Set([
  FACTORY_LABELS.running,
  FACTORY_LABELS.ci,
  FACTORY_LABELS.merged,
  FACTORY_LABELS.failed,
]);

async function ensureLabel(owner, repo, name, description, color) {
  const existing = await githubOptional(
    `/repos/${owner}/${repo}/labels/${encodeURIComponent(name)}`,
  );
  if (existing) return;
  await github(`/repos/${owner}/${repo}/labels`, {
    method: 'POST',
    body: JSON.stringify({ name, color, description }),
  });
}

async function ensureLabels(owner, repo) {
  const definitions = [
    [FACTORY_LABELS.parent, 'Parent orchestration issue for a Factory Run.', '5319e7'],
    [FACTORY_LABELS.task, 'Materialized child task from a Factory Run.', '5319e7'],
    [FACTORY_LABELS.blocked, 'Factory task requires explicit human decision.', 'b60205'],
    [FACTORY_LABELS.waiting, 'Factory task is waiting for declared dependencies.', 'fbca04'],
    [FACTORY_LABELS.ready, 'Factory task is ready for an allowlisted provider.', '0e8a16'],
    [FACTORY_LABELS.running, 'Factory provider session is active.', '1d76db'],
    [FACTORY_LABELS.ci, 'Factory worker result is under mandatory CI.', '0052cc'],
    [
      FACTORY_LABELS.merged,
      'Factory worker result was integrated into the isolated branch.',
      '0e8a16',
    ],
    [FACTORY_LABELS.failed, 'Factory task failed closed and requires inspection.', 'b60205'],
    [FACTORY_LABELS.final, 'Final consolidated Factory Run pull request.', '5319e7'],
    [FACTORY_LABELS.providerJules, 'Factory task selected Jules as remote worker.', '0e8a16'],
    [
      FACTORY_LABELS.providerAntigravity,
      'Factory task selected Antigravity as a durable headless worker.',
      '8250df',
    ],
    [
      FACTORY_LABELS.providerOpenCode,
      'Factory task selected OpenCode/Ollama as a durable local worker.',
      '8250df',
    ],
    [
      FACTORY_LABELS.durableAgent,
      'Factory task is controlled by the GitHub-backed durable provider gateway.',
      '1d76db',
    ],
    [FACTORY_LABELS.julesApi, 'Factory task was dispatched through the Jules REST API.', '1d76db'],
    [
      FACTORY_LABELS.julesTrigger,
      'Legacy Jules label trigger; not used by API-first runs.',
      'c5def5',
    ],
  ];
  for (const [name, description, color] of definitions) {
    await ensureLabel(owner, repo, name, description, color);
  }
}

function trustedFactoryComments(comments) {
  return (comments ?? []).filter((comment) => comment?.user?.login === TRUSTED_FACTORY_LOGIN);
}

function taskBody(parentIssue, run, task) {
  const dispatch = initialDispatch(task);
  return [
    taskMarker(run.runId, task.id),
    '',
    `Parent Factory Run: #${parentIssue}`,
    '',
    `Goal: ${run.goal}`,
    `Task ID: \`${task.id}\``,
    `Role: \`${task.role}\``,
    `Dependencies: ${task.dependsOn.join(', ') || 'none'}`,
    `Path scopes: ${task.paths.join(', ') || 'unknown/conservative'}`,
    `Required capabilities: ${task.requiredCapabilities.join(', ') || 'none'}`,
    `Preferred providers: ${task.preferredProviders.join(', ') || 'auto'}`,
    `Initial dispatch: ${dispatch.status} (${dispatch.provider ?? 'none'})`,
    `Human gates: ${task.humanGates.join(', ') || 'none'}`,
    `Integration branch: \`${run.integrationBranch}\``,
    `Target branch: \`${run.baseBranch}\``,
    '',
    '## Task',
    '',
    task.title,
    '',
    '## Guardrails',
    '',
    '- Work in an isolated branch/PR targeting the integration branch.',
    '- Modify only the declared write scopes.',
    '- Do not merge or deploy production from this task.',
    '- Do not enable Banco de Notas sync.',
    '- Do not broaden permissions or credentials.',
    '- Preserve repository contracts and run required CI/review gates.',
    '- A provider session never grants final merge or production authority.',
    '',
  ].join('\n');
}

async function ensureImmutableManifest(owner, repo, parentIssue, run) {
  const comments = trustedFactoryComments(await issueComments(owner, repo, parentIssue));
  const expected = manifestMarker(run);
  const existing = [];
  for (const comment of comments) {
    const match = String(comment.body ?? '').match(MANIFEST_MARKER);
    if (match) existing.push(match[0]);
  }
  if (existing.length === 0) {
    await addComment(
      owner,
      repo,
      parentIssue,
      `${expected}\nFactory Run manifest locked. Future re-executions must preserve the exact normalized run contract.`,
    );
    return;
  }
  if (existing.some((marker) => marker !== expected)) {
    throw new Error(
      'Factory Run manifest changed after materialization and was rejected fail-closed.',
    );
  }
}

async function ensureIntegrationBranch(owner, repo, parentIssue, run) {
  const comments = trustedFactoryComments(await issueComments(owner, repo, parentIssue));
  const marker = integrationMarker(run);
  const branch = await githubOptional(
    `/repos/${owner}/${repo}/branches/${encodeURIComponent(run.integrationBranch)}`,
  );
  const owned = comments.some((comment) => String(comment.body ?? '').includes(marker));

  if (branch) {
    if (!owned) {
      throw new Error(
        `Integration branch ${run.integrationBranch} exists without trusted Factory ownership evidence.`,
      );
    }
    return { created: false, sha: branch.commit.sha };
  }

  const base = await githubOptional(
    `/repos/${owner}/${repo}/branches/${encodeURIComponent(run.baseBranch)}`,
  );
  if (!base?.commit?.sha) throw new Error(`Base branch ${run.baseBranch} does not exist.`);

  await github(`/repos/${owner}/${repo}/git/refs`, {
    method: 'POST',
    body: JSON.stringify({
      ref: `refs/heads/${run.integrationBranch}`,
      sha: base.commit.sha,
    }),
  });
  await addComment(
    owner,
    repo,
    parentIssue,
    `${marker}\nFactory integration branch created from \`${run.baseBranch}\`: \`${run.integrationBranch}\`. Worker merges stay isolated here; the target branch is never auto-merged.`,
  );
  return { created: true, sha: base.commit.sha };
}

async function findTasks(owner, repo, runId) {
  const query = encodeURIComponent(`repo:${owner}/${repo} is:issue "factory-run:${runId};task:"`);
  const result = await github(`/search/issues?q=${query}&per_page=100`);
  return result.items ?? [];
}

async function ensureTaskLabels(owner, repo, issue, desired) {
  const current = new Set(labelNames(issue.labels));
  const runtimeStarted =
    issue.state !== 'open' || [...current].some((label) => RUNTIME_LABELS.has(label));
  const safeDesired = runtimeStarted
    ? desired.filter(
        (label) => label === FACTORY_LABELS.task || PROVIDER_LABELS.has(label),
      )
    : desired;
  await addLabels(
    owner,
    repo,
    issue.number,
    safeDesired.filter((label) => !current.has(label)),
  );
}

export async function materializeParent(parentIssueNumber) {
  const repository = requiredEnv('GITHUB_REPOSITORY');
  const [owner, repo] = repository.split('/');
  if (!owner || !repo) throw new Error('GITHUB_REPOSITORY must be owner/repo.');

  const parent = await github(`/repos/${owner}/${repo}/issues/${parentIssueNumber}`);
  const run = parseFactoryRunV2(parent.body ?? '');
  await ensureLabels(owner, repo);
  await ensureTaskLabels(owner, repo, parent, [FACTORY_LABELS.parent]);
  await ensureImmutableManifest(owner, repo, parentIssueNumber, run);
  const integration = await ensureIntegrationBranch(owner, repo, parentIssueNumber, run);

  const existing = await findTasks(owner, repo, run.runId);
  const created = [];
  const reused = [];

  for (const task of run.tasks) {
    const marker = taskMarker(run.runId, task.id);
    const found = existing.find((item) => String(item.body ?? '').includes(marker));
    const plan = taskLabelPlan(task);
    if (found) {
      await ensureTaskLabels(owner, repo, found, plan.desiredLabels);
      reused.push({ task: task.id, issue: found.number });
      continue;
    }
    const child = await github(`/repos/${owner}/${repo}/issues`, {
      method: 'POST',
      body: JSON.stringify({
        title: `[Factory:${run.runId}] ${task.title}`,
        body: taskBody(parentIssueNumber, run, task),
        labels: plan.creationLabels,
      }),
    });
    created.push({ task: task.id, issue: child.number });
  }

  await addComment(
    owner,
    repo,
    parentIssueNumber,
    [
      `Factory Run \`${run.runId}\` materialized in multi-provider mode.`,
      '',
      `Target branch: \`${run.baseBranch}\``,
      `Integration branch: \`${run.integrationBranch}\``,
      `Integration branch created: ${integration.created}`,
      `Max parallel workers: ${run.maxParallel}`,
      `Created tasks: ${created.length}`,
      `Reused tasks: ${reused.length}`,
      '',
      'No final merge or production activation was performed.',
    ].join('\n'),
  );

  return { run, created, reused, integration };
}

async function main() {
  const parentIssue = Number(requiredEnv('FACTORY_PARENT_ISSUE'));
  if (!Number.isInteger(parentIssue) || parentIssue <= 0) {
    throw new Error('FACTORY_PARENT_ISSUE must be a positive integer.');
  }
  const result = await materializeParent(parentIssue);
  process.stdout.write(
    `${JSON.stringify({
      status: 'materialized-v2',
      run_id: result.run.runId,
      target_branch: result.run.baseBranch,
      integration_branch: result.run.integrationBranch,
      max_parallel: result.run.maxParallel,
      created: result.created,
      reused: result.reused,
      final_merge: 'not-performed',
      production_activation: 'not-performed',
    })}\n`,
  );
}

if (process.argv[1]?.endsWith('/materialize-v2.mjs')) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
