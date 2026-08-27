import process from 'node:process';

import { FACTORY_LABELS, providerLabel } from './dispatch-policy.mjs';
import { manifestMarker, parseFactoryRunV2 } from './contract-v2.mjs';
import {
  addComment,
  addLabels,
  github,
  githubOptional,
  issueComments,
  labelNames,
  removeLabel,
  requiredEnv,
  sleep,
} from './github-api.mjs';
import {
  activeTrustedLease,
  buildLease,
  marker,
  parseJsonObject,
  redactText,
  runtimeChangedFilesWithinScope,
  sanitize,
  selectDurableProvider,
  trustedLeaseById,
  trustedMarkers,
  validateBranch,
  validateHealthPayload,
  validateHeartbeatCandidate,
  validateIdentifier,
  validateResultCandidate,
  validateSha40,
} from './durable-provider-contract.mjs';
import {
  changedFilesWithinDeclaredScope,
  mergedPrEvidenceFromComments,
  mergedPrMarker,
  parseMaterializedTask,
  TRUSTED_FACTORY_LOGIN,
} from './reconciliation-policy.mjs';
import { runParent } from './runner-v2.mjs';

const CI_WORKFLOW = 'ci.yml';
const POLL_MS = 10_000;
const MAX_CI_ATTEMPTS = 180;
const PARENT_MARKER = /Parent Factory Run:\s*#(\d+)/;
const PROVIDER_LABELS = [
  FACTORY_LABELS.providerJules,
  FACTORY_LABELS.providerAntigravity,
  FACTORY_LABELS.providerOpenCode,
];

function fail(message) {
  throw new Error(message);
}

function sameStringSet(left, right) {
  const a = [...new Set((left ?? []).map(String))].sort();
  const b = [...new Set((right ?? []).map(String))].sort();
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

export function parentIssueNumber(issue) {
  const match = String(issue?.body ?? '').match(PARENT_MARKER);
  const value = match ? Number(match[1]) : 0;
  if (!Number.isInteger(value) || value <= 0) fail('Materialized task has no valid parent issue.');
  return value;
}

async function ensureLabel(owner, repo, name, description, color) {
  const existing = await githubOptional(
    `/repos/${owner}/${repo}/labels/${encodeURIComponent(name)}`,
  );
  if (existing) return;
  await github(`/repos/${owner}/${repo}/labels`, {
    method: 'POST',
    body: JSON.stringify({ name, description, color }),
  });
}

async function ensureDurableLabels(owner, repo) {
  await ensureLabel(
    owner,
    repo,
    FACTORY_LABELS.providerAntigravity,
    'Factory task selected Antigravity durable executor.',
    '8250df',
  );
  await ensureLabel(
    owner,
    repo,
    FACTORY_LABELS.providerOpenCode,
    'Factory task selected OpenCode/Ollama durable executor.',
    '8250df',
  );
  await ensureLabel(
    owner,
    repo,
    FACTORY_LABELS.durableAgent,
    'Factory task is controlled by the GitHub-backed durable provider gateway.',
    '1d76db',
  );
}

async function setTaskState(owner, repo, issueNumber, add, remove = []) {
  for (const label of remove) await removeLabel(owner, repo, issueNumber, label);
  await addLabels(owner, repo, issueNumber, add);
}

export async function loadDurableTaskContext(owner, repo, issueNumber) {
  const issue = await github(`/repos/${owner}/${repo}/issues/${issueNumber}`);
  const materialized = parseMaterializedTask(issue);
  if (!materialized) fail('Task issue is not a trusted materialized Factory task.');
  const parentNumber = parentIssueNumber(issue);
  const parent = await github(`/repos/${owner}/${repo}/issues/${parentNumber}`);
  const run = parseFactoryRunV2(parent.body ?? '');
  if (run.runId !== materialized.runId) fail('Task run_id does not match the parent manifest.');
  const task = run.tasks.find((item) => item.id === materialized.taskId);
  if (!task) fail('Task is absent from the immutable parent manifest.');
  const parentComments = await issueComments(owner, repo, parentNumber);
  const locked = parentComments.some(
    (comment) =>
      comment?.user?.login === TRUSTED_FACTORY_LOGIN &&
      String(comment?.body ?? '').includes(manifestMarker(run)),
  );
  if (!locked) fail('Parent manifest has no trusted immutable fingerprint marker.');
  return { issue, materialized, parent, parentNumber, run, task };
}

function trustedBranchRecord(comments, branch, integrationBranch) {
  const records = trustedMarkers(comments, 'BRANCH').filter(
    ({ payload }) =>
      payload?.branch === branch && payload?.integration_branch === integrationBranch,
  );
  if (records.length > 1) fail(`Multiple trusted ownership markers exist for ${branch}.`);
  return records[0] ?? null;
}

async function ensureWorkerBranch(owner, repo, context) {
  const branch = validateBranch(
    `factory/${context.run.runId}/${context.task.id}`,
    'durable worker branch',
  );
  const comments = await issueComments(owner, repo, context.issue.number);
  const ownership = trustedBranchRecord(comments, branch, context.run.integrationBranch);
  const existing = await githubOptional(
    `/repos/${owner}/${repo}/branches/${encodeURIComponent(branch)}`,
  );
  if (existing) {
    if (!ownership)
      fail(`Durable worker branch ${branch} exists without trusted ownership evidence.`);
    return {
      branch,
      headSha: existing.commit.sha,
      startingSha: validateSha40(ownership.payload.starting_sha, 'branch starting_sha'),
      created: false,
    };
  }
  if (ownership) fail(`Trusted branch marker exists but branch ${branch} is missing.`);
  const integration = await github(
    `/repos/${owner}/${repo}/branches/${encodeURIComponent(context.run.integrationBranch)}`,
  );
  await github(`/repos/${owner}/${repo}/git/refs`, {
    method: 'POST',
    body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: integration.commit.sha }),
  });
  await addComment(
    owner,
    repo,
    context.issue.number,
    `${marker('BRANCH', {
      branch,
      integration_branch: context.run.integrationBranch,
      starting_sha: integration.commit.sha,
    })}\nDurable worker branch created by the trusted Control Plane. The executor may publish only this branch.`,
  );
  return {
    branch,
    headSha: integration.commit.sha,
    startingSha: integration.commit.sha,
    created: true,
  };
}

async function persistHealth(owner, repo, issueNumber, workerId, observations) {
  await addComment(
    owner,
    repo,
    issueNumber,
    `${marker('HEALTH', {
      schema_version: 1,
      worker_id: workerId,
      observations,
    })}\nSanitized provider health persisted by the trusted Control Plane.`,
  );
}

export async function claimDurableLease(owner, repo, issueNumber, workerId, payload, ttlSeconds) {
  const context = await loadDurableTaskContext(owner, repo, issueNumber);
  if (context.task.humanGates.length > 0)
    fail('Human-gated task cannot receive an automatic lease.');
  const observations = validateHealthPayload(payload);
  await ensureDurableLabels(owner, repo);
  await persistHealth(owner, repo, issueNumber, workerId, observations);

  const comments = await issueComments(owner, repo, issueNumber);
  const active = activeTrustedLease(comments);
  if (active) {
    const observation = observations.find((item) => item.provider_id === active.lease.provider_id);
    if (
      active.lease.worker_id !== workerId ||
      !observation ||
      !['healthy', 'degraded'].includes(observation.status)
    ) {
      fail(
        `Task already has active lease ${active.lease.lease_id} that cannot be reused by this claim.`,
      );
    }
    return { status: 'reused', lease: active.lease, context };
  }

  const labels = new Set(labelNames(context.issue.labels));
  if (!labels.has(FACTORY_LABELS.task) || !labels.has(FACTORY_LABELS.ready)) {
    fail('Factory task is not in the clean ready state.');
  }
  if (
    [FACTORY_LABELS.running, FACTORY_LABELS.ci, FACTORY_LABELS.merged, FACTORY_LABELS.failed].some(
      (label) => labels.has(label),
    )
  ) {
    fail('Factory task is already running, in CI, merged, or failed.');
  }

  const provider = selectDurableProvider(context.task, observations);
  if (!provider) {
    if (!context.task.preferredProviders.includes('jules')) {
      fail('No healthy or degraded durable provider is eligible for this task.');
    }
    await setTaskState(
      owner,
      repo,
      issueNumber,
      [FACTORY_LABELS.providerJules, FACTORY_LABELS.ready],
      [
        FACTORY_LABELS.providerAntigravity,
        FACTORY_LABELS.providerOpenCode,
        FACTORY_LABELS.durableAgent,
      ],
    );
    await addComment(
      owner,
      repo,
      issueNumber,
      'No healthy/degraded durable provider was available. Task fell back to Jules without creating a local lease.',
    );
    return { status: 'fallback-jules', context };
  }

  const workerBranch = await ensureWorkerBranch(owner, repo, context);
  const lease = buildLease({
    issueNumber,
    repository: `${owner}/${repo}`,
    run: context.run,
    task: context.task,
    workerId,
    providerId: provider,
    workingBranch: workerBranch.branch,
    ttlSeconds: Number(ttlSeconds),
  });
  await addComment(
    owner,
    repo,
    issueNumber,
    `${marker('LEASE', lease)}\nDurable provider lease issued by GitHub Actions. Executor output remains untrusted until result reconciliation.`,
  );
  const selectedLabel = providerLabel(provider);
  await setTaskState(
    owner,
    repo,
    issueNumber,
    [selectedLabel, FACTORY_LABELS.durableAgent, FACTORY_LABELS.running],
    [
      FACTORY_LABELS.ready,
      FACTORY_LABELS.julesApi,
      ...PROVIDER_LABELS.filter((label) => label !== selectedLabel),
    ],
  );
  return { status: 'issued', lease, context, workerBranch };
}

export async function recordDurableHeartbeat(owner, repo, issueNumber, payload) {
  const comments = await issueComments(owner, repo, issueNumber);
  const raw = payload?.heartbeat ?? payload;
  const record = trustedLeaseById(comments, raw?.lease_id);
  if (!record) fail('Heartbeat references no trusted lease.');
  const heartbeat = validateHeartbeatCandidate(payload, record.lease);
  if (heartbeat.head_sha) {
    const branch = await github(
      `/repos/${owner}/${repo}/branches/${encodeURIComponent(record.lease.working_branch)}`,
    );
    if (branch.commit.sha !== heartbeat.head_sha)
      fail('Heartbeat head SHA is not current on GitHub.');
  }
  await addComment(
    owner,
    repo,
    issueNumber,
    `${marker('HEARTBEAT', heartbeat)}\nDurable executor heartbeat accepted. Lease expiry was not extended.`,
  );
  return heartbeat;
}

async function findCiRun(owner, repo, sha) {
  const parameters = new URLSearchParams({
    event: 'workflow_dispatch',
    head_sha: sha,
    per_page: '30',
  });
  const payload = await github(
    `/repos/${owner}/${repo}/actions/workflows/${CI_WORKFLOW}/runs?${parameters.toString()}`,
  );
  return (
    (payload.workflow_runs ?? []).find(
      (run) => run.event === 'workflow_dispatch' && run.head_sha === sha,
    ) ?? null
  );
}

async function waitForCi(owner, repo, branch, sha) {
  let run = await findCiRun(owner, repo, sha);
  if (!run) {
    await github(`/repos/${owner}/${repo}/actions/workflows/${CI_WORKFLOW}/dispatches`, {
      method: 'POST',
      body: JSON.stringify({ ref: branch }),
    });
  }
  for (let attempt = 0; attempt < MAX_CI_ATTEMPTS; attempt += 1) {
    run = await findCiRun(owner, repo, sha);
    if (run?.status === 'completed') {
      if (run.conclusion !== 'success')
        fail(`Mandatory CI run ${run.id} concluded ${run.conclusion}.`);
      return run;
    }
    await sleep(POLL_MS);
  }
  fail(`Mandatory CI timed out for ${branch}@${sha}.`);
}

async function validateProviderCommit(owner, repo, context, lease, providerSha, startingSha) {
  const compare = await github(`/repos/${owner}/${repo}/compare/${startingSha}...${providerSha}`);
  if (compare?.merge_base_commit?.sha !== startingSha) {
    fail('Provider commit does not descend from the trusted worker starting SHA.');
  }
  if ((compare.ahead_by ?? 0) <= 0)
    fail('Provider produced no commits after the trusted starting SHA.');
  const files = (compare.files ?? []).map((item) => item.filename).filter(Boolean);
  if (!runtimeChangedFilesWithinScope(files, lease.request.paths)) {
    fail('Provider commit changed files outside the leased runtime scope.');
  }
  if (!changedFilesWithinDeclaredScope(files, context.task.paths)) {
    fail('Provider commit changed files outside the immutable task scopes.');
  }
  if (!sameStringSet(files, leaseResultPaths(lease, providerSha))) {
    // The caller replaces this synthetic placeholder through result validation below.
  }
  if ((compare.commits ?? []).some((commit) => (commit.parents ?? []).length > 1)) {
    fail('Provider introduced a merge commit before trusted Control Plane synchronization.');
  }
  return { compare, files };
}

function leaseResultPaths(lease, providerSha) {
  return Array.isArray(lease?.__result_paths?.[providerSha])
    ? lease.__result_paths[providerSha]
    : [];
}

async function findWorkerPr(owner, repo, lease) {
  const head = encodeURIComponent(`${owner}:${lease.working_branch}`);
  const base = encodeURIComponent(lease.integration_branch);
  const pulls = await github(
    `/repos/${owner}/${repo}/pulls?state=all&head=${head}&base=${base}&per_page=20`,
  );
  const relevant = pulls.filter(
    (pr) => pr.head.ref === lease.working_branch && pr.base.ref === lease.integration_branch,
  );
  if (relevant.length > 1) fail('Multiple worker PRs exist for the durable branch.');
  if (relevant[0]?.state === 'closed' && relevant[0]?.merged !== true) {
    fail('Durable worker PR was closed without merge.');
  }
  return relevant[0] ?? null;
}

async function createWorkerPr(owner, repo, lease, issueNumber) {
  return github(`/repos/${owner}/${repo}/pulls`, {
    method: 'POST',
    body: JSON.stringify({
      title: `[Factory:${lease.run_id}] ${lease.task_id}`,
      head: lease.working_branch,
      base: lease.integration_branch,
      draft: false,
      body: [
        `Durable Factory task #${issueNumber}.`,
        '',
        `Provider: \`${lease.provider_id}\``,
        `Lease: \`${lease.lease_id}\``,
        '',
        'This PR may be squash-merged only into the isolated integration branch after exact-SHA mandatory CI.',
        'Target/main merge and production activation remain forbidden.',
      ].join('\n'),
    }),
  });
}

async function ensureTrustedWorkerHead(owner, repo, context, lease, providerSha) {
  const comments = await issueComments(owner, repo, context.issue.number);
  const ownership = trustedBranchRecord(comments, lease.working_branch, lease.integration_branch);
  if (!ownership) fail('Durable worker branch has no trusted ownership marker.');
  const startingSha = validateSha40(ownership.payload.starting_sha, 'branch starting_sha');
  const branch = await github(
    `/repos/${owner}/${repo}/branches/${encodeURIComponent(lease.working_branch)}`,
  );
  if (branch.commit.sha !== providerSha) {
    const sync = trustedMarkers(comments, 'SYNC').filter(
      ({ payload }) =>
        payload?.lease_id === lease.lease_id &&
        payload?.provider_sha === providerSha &&
        payload?.synchronized_sha === branch.commit.sha,
    );
    if (sync.length !== 1) {
      fail('Current worker head differs from provider result without one trusted sync marker.');
    }
  }
  return { startingSha, currentSha: branch.commit.sha, comments };
}

async function syncWorker(owner, repo, context, lease, providerSha, currentSha) {
  const integration = await github(
    `/repos/${owner}/${repo}/branches/${encodeURIComponent(lease.integration_branch)}`,
  );
  const compareBefore = await github(
    `/repos/${owner}/${repo}/compare/${encodeURIComponent(lease.integration_branch)}...${encodeURIComponent(lease.working_branch)}`,
  );
  let synchronizedSha = currentSha;
  if ((compareBefore.behind_by ?? 0) > 0) {
    try {
      await github(`/repos/${owner}/${repo}/merges`, {
        method: 'POST',
        body: JSON.stringify({
          base: lease.working_branch,
          head: lease.integration_branch,
          commit_message: `Factory: sync ${lease.integration_branch} before durable provider CI`,
        }),
      });
    } catch (error) {
      if (!String(error.message).includes('(204)')) throw error;
    }
    const branch = await github(
      `/repos/${owner}/${repo}/branches/${encodeURIComponent(lease.working_branch)}`,
    );
    synchronizedSha = branch.commit.sha;
  }
  const comments = await issueComments(owner, repo, context.issue.number);
  const existing = trustedMarkers(comments, 'SYNC').some(
    ({ payload }) =>
      payload?.lease_id === lease.lease_id &&
      payload?.provider_sha === providerSha &&
      payload?.synchronized_sha === synchronizedSha &&
      payload?.integration_sha === integration.commit.sha,
  );
  if (!existing) {
    await addComment(
      owner,
      repo,
      context.issue.number,
      `${marker('SYNC', {
        lease_id: lease.lease_id,
        provider_sha: providerSha,
        synchronized_sha: synchronizedSha,
        integration_sha: integration.commit.sha,
      })}\nTrusted Control Plane synchronization recorded before mandatory CI.`,
    );
  }
  const compare = await github(
    `/repos/${owner}/${repo}/compare/${encodeURIComponent(lease.integration_branch)}...${encodeURIComponent(lease.working_branch)}`,
  );
  const files = (compare.files ?? []).map((item) => item.filename).filter(Boolean);
  if ((compare.ahead_by ?? 0) <= 0 || files.length === 0) {
    fail('No durable diff remains after synchronization.');
  }
  if (!changedFilesWithinDeclaredScope(files, context.task.paths)) {
    fail('Synchronized worker branch changed files outside immutable task scopes.');
  }
  return { headSha: synchronizedSha, integrationSha: integration.commit.sha, files };
}

async function finalizeIntegratedTask(owner, repo, context, pr, mergeSha, ci, files) {
  const comments = await issueComments(owner, repo, context.issue.number);
  const evidence = mergedPrEvidenceFromComments(comments);
  if (evidence) {
    if (evidence.prNumber !== pr.number || evidence.sha !== mergeSha) {
      fail('Existing trusted merge evidence conflicts with the durable PR merge.');
    }
  } else {
    await addComment(
      owner,
      repo,
      context.issue.number,
      `${mergedPrMarker(pr.number, mergeSha)}\nDurable worker passed exact-SHA mandatory CI run ${ci.id} and was squash-merged only into \`${context.run.integrationBranch}\`. Files: ${files.join(', ')}. Target branch remains untouched.`,
    );
  }
  await github(`/repos/${owner}/${repo}/issues/${context.issue.number}`, {
    method: 'PATCH',
    body: JSON.stringify({ state: 'closed', state_reason: 'completed' }),
  });
  await setTaskState(
    owner,
    repo,
    context.issue.number,
    [FACTORY_LABELS.merged],
    [FACTORY_LABELS.ci, FACTORY_LABELS.running, FACTORY_LABELS.ready, FACTORY_LABELS.waiting],
  );
}

async function integrateSuccessfulResult(owner, repo, context, lease, result) {
  const workerState = await ensureTrustedWorkerHead(owner, repo, context, lease, result.remote_sha);
  lease.__result_paths = { [result.remote_sha]: result.changed_paths };
  const providerEvidence = await validateProviderCommit(
    owner,
    repo,
    context,
    lease,
    result.remote_sha,
    workerState.startingSha,
  );
  if (!sameStringSet(providerEvidence.files, result.changed_paths)) {
    fail('Provider result changed_paths do not match the GitHub provider commit diff.');
  }

  let pr = await findWorkerPr(owner, repo, lease);
  if (pr?.merged === true) {
    const ci = await waitForCi(owner, repo, lease.working_branch, pr.head.sha);
    const mergeSha = validateSha40(pr.merge_commit_sha, 'existing worker merge SHA');
    await finalizeIntegratedTask(owner, repo, context, pr, mergeSha, ci, providerEvidence.files);
    return { pr, ci, mergeSha, recovered: true };
  }

  const synchronized = await syncWorker(
    owner,
    repo,
    context,
    lease,
    result.remote_sha,
    workerState.currentSha,
  );
  pr ??= await createWorkerPr(owner, repo, lease, context.issue.number);
  if (pr.base.ref !== lease.integration_branch || pr.head.ref !== lease.working_branch) {
    fail('Durable worker PR branch contract is invalid.');
  }
  await setTaskState(
    owner,
    repo,
    context.issue.number,
    [FACTORY_LABELS.ci],
    [FACTORY_LABELS.running, FACTORY_LABELS.ready],
  );
  const ci = await waitForCi(owner, repo, lease.working_branch, synchronized.headSha);
  const latestPr = await github(`/repos/${owner}/${repo}/pulls/${pr.number}`);
  if (latestPr.head.sha !== synchronized.headSha) fail('Worker PR head moved after mandatory CI.');

  let mergeSha;
  if (latestPr.merged === true) {
    mergeSha = validateSha40(latestPr.merge_commit_sha, 'existing worker merge SHA');
  } else {
    const merged = await github(`/repos/${owner}/${repo}/pulls/${pr.number}/merge`, {
      method: 'PUT',
      body: JSON.stringify({
        merge_method: 'squash',
        sha: synchronized.headSha,
        commit_title: `[Factory:${lease.run_id}] ${lease.task_id}`,
        commit_message: `Durable provider task #${context.issue.number}; exact-SHA CI run ${ci.id} succeeded.`,
      }),
    });
    if (!merged?.merged) fail(`GitHub did not merge durable worker PR #${pr.number}.`);
    mergeSha = validateSha40(merged.sha, 'worker merge SHA');
  }
  await finalizeIntegratedTask(owner, repo, context, latestPr, mergeSha, ci, synchronized.files);
  return { pr: latestPr, ci, mergeSha, synchronized, recovered: false };
}

export async function recordDurableResult(owner, repo, issueNumber, payload) {
  const context = await loadDurableTaskContext(owner, repo, issueNumber);
  const comments = await issueComments(owner, repo, issueNumber);
  const raw = payload?.result ?? payload;
  const record = trustedLeaseById(comments, raw?.lease_id);
  if (!record) fail('Provider result references no trusted lease.');
  const result = validateResultCandidate(payload, record.lease);

  const mergedEvidence = mergedPrEvidenceFromComments(comments);
  if (mergedEvidence) {
    if (result.status !== 'success') fail('A merged task cannot accept a later failure result.');
    const pr = await github(`/repos/${owner}/${repo}/pulls/${mergedEvidence.prNumber}`);
    if (pr.merged !== true || pr.merge_commit_sha !== mergedEvidence.sha) {
      fail('Trusted merge evidence no longer agrees with GitHub PR state.');
    }
    return { status: 'already-merged', result, context, pr };
  }

  await addComment(
    owner,
    repo,
    issueNumber,
    `${marker('RESULT', result)}\nDurable provider result accepted for Control Plane reconciliation.`,
  );
  if (result.status !== 'success') {
    await setTaskState(
      owner,
      repo,
      issueNumber,
      [FACTORY_LABELS.failed],
      [FACTORY_LABELS.running, FACTORY_LABELS.ci, FACTORY_LABELS.ready, FACTORY_LABELS.waiting],
    );
    await addComment(
      owner,
      repo,
      issueNumber,
      `Durable provider ended in \`${result.status}\`. Task failed closed; no merge or production action was performed.`,
    );
    return { status: 'failed', result, context };
  }
  const integration = await integrateSuccessfulResult(owner, repo, context, record.lease, result);
  return { status: 'merged-integration', result, context, integration };
}

export async function recordDurableHealth(owner, repo, issueNumber, workerId, payload) {
  await loadDurableTaskContext(owner, repo, issueNumber);
  const observations = validateHealthPayload(payload);
  await ensureDurableLabels(owner, repo);
  await persistHealth(owner, repo, issueNumber, workerId, observations);
  return observations;
}

function repositoryParts() {
  const repository = requiredEnv('GITHUB_REPOSITORY');
  const [owner, repo] = repository.split('/');
  if (!owner || !repo) fail('GITHUB_REPOSITORY must be owner/repo.');
  return { owner, repo };
}

function requireTrustedInvocation(owner) {
  if (requiredEnv('GITHUB_ACTOR') !== owner) {
    fail('Durable provider gateway may be dispatched only by the repository owner.');
  }
  if (requiredEnv('GITHUB_REF') !== 'refs/heads/main') {
    fail('Durable provider gateway must execute trusted code from main.');
  }
}

export async function executeGateway({ operation, issueNumber, workerId, payload, ttlSeconds }) {
  const { owner, repo } = repositoryParts();
  requireTrustedInvocation(owner);
  const issue = Number(issueNumber);
  if (!Number.isInteger(issue) || issue <= 0) fail('FACTORY_PROVIDER_ISSUE must be positive.');
  validateIdentifier(workerId, 'worker_id');

  if (operation === 'claim') {
    const claimed = await claimDurableLease(owner, repo, issue, workerId, payload, ttlSeconds);
    if (claimed.status === 'fallback-jules') {
      claimed.resumed = await runParent(claimed.context.parentNumber);
    }
    return claimed;
  }
  if (operation === 'heartbeat') {
    return {
      status: 'heartbeat-recorded',
      heartbeat: await recordDurableHeartbeat(owner, repo, issue, payload),
    };
  }
  if (operation === 'result') {
    const recorded = await recordDurableResult(owner, repo, issue, payload);
    if (recorded.status === 'merged-integration') {
      try {
        recorded.resumed = await runParent(recorded.context.parentNumber);
      } catch (error) {
        const detail = redactText(error instanceof Error ? error.message : String(error));
        await addComment(
          owner,
          repo,
          recorded.context.parentNumber,
          `Durable task #${issue} was integrated successfully, but automatic parent reconciliation stopped: ${detail}. Durable state remains preserved in GitHub.`,
        );
        recorded.resume_error = detail;
      }
    }
    return recorded;
  }
  if (operation === 'health') {
    return {
      status: 'health-recorded',
      observations: await recordDurableHealth(owner, repo, issue, workerId, payload),
    };
  }
  fail(`Unsupported durable provider gateway operation: ${operation}`);
}

async function main() {
  const result = await executeGateway({
    operation: requiredEnv('FACTORY_PROVIDER_OPERATION'),
    issueNumber: requiredEnv('FACTORY_PROVIDER_ISSUE'),
    workerId: requiredEnv('FACTORY_PROVIDER_WORKER'),
    payload: parseJsonObject(process.env.FACTORY_PROVIDER_PAYLOAD ?? '{}', 'provider payload'),
    ttlSeconds: Number(process.env.FACTORY_PROVIDER_TTL_SECONDS ?? 1800),
  });
  process.stdout.write(
    `${JSON.stringify({
      status: result.status,
      final_merge: 'not-performed',
      production_activation: 'not-performed',
      result: sanitize(result),
    })}\n`,
  );
}

if (process.argv[1]?.endsWith('/durable-provider-gateway.mjs')) {
  main().catch((error) => {
    console.error(redactText(error instanceof Error ? error.message : String(error)));
    process.exitCode = 1;
  });
}
