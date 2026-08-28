import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import process from 'node:process';

import { FACTORY_LABELS } from './dispatch-policy.mjs';
import {
  claimDurableLease,
  loadDurableTaskContext,
  recordDurableHeartbeat,
  recordDurableResult,
} from './durable-provider-gateway.mjs';
import { githubOptional, labelNames, requiredEnv } from './github-api.mjs';

const OPENCODE_PROVIDER = 'opencode_ollama';
const DEFAULT_MODEL = 'qwen3:0.6b';
const DEFAULT_LEASE_SECONDS = 7_200;
const SHA_40 = /^[0-9a-f]{40}$/;

function fail(message) {
  throw new Error(message);
}

function repositoryParts() {
  const repository = requiredEnv('GITHUB_REPOSITORY');
  const [owner, repo] = repository.split('/');
  if (!owner || !repo) fail('GITHUB_REPOSITORY must be owner/repo.');
  return { owner, repo };
}

function issueNumber() {
  const value = Number(requiredEnv('FACTORY_HOSTED_OPENCODE_ISSUE'));
  if (!Number.isInteger(value) || value <= 0) {
    fail('FACTORY_HOSTED_OPENCODE_ISSUE must be a positive issue number.');
  }
  return value;
}

export function hostedWorkerId(runId, attempt) {
  const id = `github-hosted-opencode-${runId}-${attempt}`;
  if (id.length > 160) fail('Hosted OpenCode worker identifier exceeds durable contract.');
  return id;
}

export function isExactCreateOnlyScope(paths) {
  if (!Array.isArray(paths) || paths.length !== 1) return false;
  const raw = String(paths[0] ?? '').trim();
  if (
    !raw ||
    raw.startsWith('/') ||
    raw.endsWith('/**') ||
    raw.endsWith('/') ||
    raw.includes('\\') ||
    raw.includes('//')
  ) {
    return false;
  }
  const parts = raw.split('/');
  if (parts.some((part) => !part || part === '.' || part === '..')) return false;
  const name = basename(raw);
  return name.includes('.') && name !== '.' && name !== '..';
}

export function leasedRequestForWorktree(lease, worktree) {
  if (!lease?.request || typeof lease.request !== 'object') fail('Lease has no portable request.');
  return {
    ...lease.request,
    worktree,
  };
}

export function normalizeProbeHealth(value) {
  const providerId = String(value?.provider_id ?? value?.provider ?? '').trim();
  const status = String(value?.status ?? '').trim().toLowerCase();
  if (providerId !== OPENCODE_PROVIDER || status !== 'healthy') {
    fail('Pinned OpenCode/Ollama runtime did not pass the required healthy probe.');
  }
  return {
    ...value,
    provider_id: providerId,
    status,
  };
}

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? process.cwd(),
    env: options.env ?? process.env,
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
    stdio: options.capture === false ? 'inherit' : 'pipe',
  });
  if (result.error) throw result.error;
  return result;
}

function git(...args) {
  const result = runCommand('git', args);
  if (result.status !== 0) {
    fail(`Trusted git command failed: git ${args[0]}.`);
  }
  return String(result.stdout ?? '').trim();
}

async function pathMissingOnIntegration(owner, repo, branch, path) {
  const encodedPath = String(path)
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');
  const query = new URLSearchParams({ ref: branch });
  const value = await githubOptional(
    `/repos/${owner}/${repo}/contents/${encodedPath}?${query.toString()}`,
  );
  return value == null;
}

export async function hostedTaskEligibility(owner, repo, context) {
  const labels = new Set(labelNames(context.issue.labels));
  if (
    !labels.has(FACTORY_LABELS.task) ||
    !labels.has(FACTORY_LABELS.ready) ||
    !labels.has(FACTORY_LABELS.providerOpenCode) ||
    labels.has(FACTORY_LABELS.running) ||
    labels.has(FACTORY_LABELS.ci) ||
    labels.has(FACTORY_LABELS.merged) ||
    labels.has(FACTORY_LABELS.failed)
  ) {
    return { eligible: false, reason: 'task-state' };
  }
  if (context.task.humanGates.length > 0) {
    return { eligible: false, reason: 'human-gate' };
  }
  if (!context.task.preferredProviders.includes(OPENCODE_PROVIDER)) {
    return { eligible: false, reason: 'provider' };
  }
  if (!isExactCreateOnlyScope(context.task.paths)) {
    return { eligible: false, reason: 'not-create-only-exact-file' };
  }
  if (
    !(await pathMissingOnIntegration(
      owner,
      repo,
      context.run.integrationBranch,
      context.task.paths[0],
    ))
  ) {
    return { eligible: false, reason: 'path-already-exists' };
  }
  return { eligible: true, reason: 'github-hosted-create-only' };
}

function loadProbeHealth(path) {
  return normalizeProbeHealth(JSON.parse(readFileSync(path, 'utf8')));
}

function healthPayload(health) {
  return {
    providers: [
      {
        provider_id: OPENCODE_PROVIDER,
        status: 'healthy',
        observed_at: new Date().toISOString(),
        reason: health.reason ?? 'Pinned GitHub-hosted OpenCode/Ollama probe succeeded.',
        details: {
          executor: 'github-hosted-ubuntu-24.04',
          model: process.env.OPENCODE_OLLAMA_MODEL ?? DEFAULT_MODEL,
          ...(health.details ?? {}),
        },
      },
    ],
  };
}

function writeLeaseContract(root, lease, worktree) {
  mkdirSync(root, { recursive: true });
  const spec = leasedRequestForWorktree(lease, worktree);
  const files = {
    spec: join(root, 'request.json'),
    manifest: join(root, 'manifest.json'),
    lease: join(root, 'lease.json'),
  };
  writeFileSync(files.spec, `${JSON.stringify(spec, null, 2)}\n`, 'utf8');
  writeFileSync(files.manifest, `${JSON.stringify(lease.manifest, null, 2)}\n`, 'utf8');
  writeFileSync(files.lease, `${JSON.stringify(lease, null, 2)}\n`, 'utf8');
  return files;
}

function parseProviderCandidate(result) {
  const stdout = String(result.stdout ?? '').trim();
  if (!stdout) fail('Durable provider agent produced no machine-readable candidate.');
  let payload;
  try {
    payload = JSON.parse(stdout);
  } catch {
    fail('Durable provider agent returned invalid JSON.');
  }
  if (payload?.candidate !== 'provider-result' || !payload?.result) {
    fail(
      `Durable provider agent did not return a provider-result candidate (exit ${result.status}).`,
    );
  }
  return payload;
}

async function checkoutWorkerBranch(lease) {
  const branch = lease.working_branch;
  git('fetch', '--no-tags', 'origin', `refs/heads/${branch}:refs/remotes/origin/${branch}`);
  git('checkout', '--force', '-B', branch, `refs/remotes/origin/${branch}`);
  git('config', 'user.name', 'github-actions[bot]');
  git('config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com');
  const head = git('rev-parse', 'HEAD');
  if (!SHA_40.test(head)) fail('Trusted worker checkout has an invalid Git SHA.');
  return head;
}

async function executeHostedTask(owner, repo, context, workerId, health) {
  const claimed = await claimDurableLease(
    owner,
    repo,
    context.issue.number,
    workerId,
    healthPayload(health),
    DEFAULT_LEASE_SECONDS,
  );
  if (!['issued', 'reused'].includes(claimed.status)) {
    return { status: claimed.status, issue_number: context.issue.number };
  }
  if (claimed.lease.provider_id !== OPENCODE_PROVIDER) {
    fail(`Hosted executor received unexpected provider ${claimed.lease.provider_id}.`);
  }

  const headSha = await checkoutWorkerBranch(claimed.lease);
  await recordDurableHeartbeat(owner, repo, context.issue.number, {
    heartbeat: {
      schema_version: 1,
      lease_id: claimed.lease.lease_id,
      run_id: claimed.lease.run_id,
      task_id: claimed.lease.task_id,
      provider_id: claimed.lease.provider_id,
      worker_id: claimed.lease.worker_id,
      phase: 'preparing',
      observed_at: new Date().toISOString(),
      head_sha: headSha,
      detail: 'Pinned GitHub-hosted OpenCode/Ollama runtime preparing exact leased request.',
      metrics: { progress: 0.1 },
    },
  });

  const tempRoot = join(
    requiredEnv('RUNNER_TEMP'),
    'factory-hosted-opencode',
    String(context.issue.number),
  );
  const files = writeLeaseContract(tempRoot, claimed.lease, process.cwd());
  const appFactoryRoot = requiredEnv('FACTORY_APP_FACTORY_DIR');
  const profileHome = requiredEnv('OPENCODE_PROFILE_HOME');
  mkdirSync(profileHome, { recursive: true });
  const model = process.env.OPENCODE_OLLAMA_MODEL ?? DEFAULT_MODEL;
  const result = runCommand(
    process.env.PYTHON_BIN ?? 'python3',
    [
      join(appFactoryRoot, 'scripts', 'durable_provider_agent.py'),
      'run',
      files.spec,
      files.manifest,
      files.lease,
      '--worker-id',
      workerId,
      '--publish',
      '--model',
      model,
      '--ollama-base-url',
      requiredEnv('OLLAMA_BASE_URL'),
      '--profile-home',
      profileHome,
    ],
    { capture: true },
  );
  const candidate = parseProviderCandidate(result);
  const recorded = await recordDurableResult(owner, repo, context.issue.number, {
    result: candidate.result,
  });
  return {
    status: recorded.status,
    issue_number: context.issue.number,
    provider_status: candidate.result.status,
    remote_sha: candidate.result.remote_sha ?? null,
    final_merge: 'not-performed',
    production_activation: 'not-performed',
  };
}

export async function runHostedOpenCode() {
  const { owner, repo } = repositoryParts();
  const issue = issueNumber();
  const context = await loadDurableTaskContext(owner, repo, issue);
  const eligibility = await hostedTaskEligibility(owner, repo, context);
  if (!eligibility.eligible) {
    return {
      status: 'not-eligible',
      issue_number: issue,
      reason: eligibility.reason,
    };
  }

  const health = loadProbeHealth(requiredEnv('FACTORY_OPENCODE_HEALTH_FILE'));
  const workerId = hostedWorkerId(
    requiredEnv('GITHUB_RUN_ID'),
    process.env.GITHUB_RUN_ATTEMPT ?? '1',
  );
  return executeHostedTask(owner, repo, context, workerId, health);
}

async function main() {
  const result = await runHostedOpenCode();
  const summaryPath = process.env.FACTORY_HOSTED_SUMMARY_FILE;
  if (summaryPath) {
    mkdirSync(dirname(summaryPath), { recursive: true });
    writeFileSync(summaryPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  }
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1]?.endsWith('/hosted-opencode-executor.mjs')) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
