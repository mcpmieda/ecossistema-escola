import { createHash, randomUUID } from 'node:crypto';
import process from 'node:process';

import {
  DURABLE_PROVIDERS,
  FACTORY_LABELS,
  providerLabel,
} from './dispatch-policy.mjs';
import {
  manifestMarker,
  parseFactoryRunV2,
} from './contract-v2.mjs';
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
  changedFilesWithinDeclaredScope,
  mergedPrMarker,
  parseMaterializedTask,
  TRUSTED_FACTORY_LOGIN,
} from './reconciliation-policy.mjs';
import { runParent } from './runner-v2.mjs';

export const DURABLE_GATEWAY_SCHEMA_VERSION = 1;
export const LEASE_MIN_SECONDS = 60;
export const LEASE_MAX_SECONDS = 21_600;
export const HEALTH_MAX_AGE_SECONDS = 600;
export const FUTURE_CLOCK_SKEW_SECONDS = 120;
export const HEALTH_STATES = Object.freeze(['healthy', 'degraded', 'unavailable', 'unknown']);
export const HEARTBEAT_PHASES = Object.freeze([
  'claimed',
  'preparing',
  'running',
  'publishing',
  'completed',
  'failed',
]);
export const TERMINAL_STATES = Object.freeze(['success', 'failed', 'canceled', 'interrupted']);

const CI_WORKFLOW = 'ci.yml';
const POLL_MS = 10_000;
const MAX_CI_ATTEMPTS = 180;
const SAFE_IDENTIFIER = /^[A-Za-z0-9._:@/-]{1,160}$/;
const SAFE_BRANCH = /^[A-Za-z0-9._/-]+$/;
const SHA_40 = /^[0-9a-f]{40}$/;
const SHA_64 = /^[0-9a-f]{64}$/;
const PARENT_MARKER = /Parent Factory Run:\s*#(\d+)/;
const SENSITIVE_KEY = /(token|secret|password|api[_-]?key|authorization|cookie|credential)/i;
const SENSITIVE_VALUE_PATTERNS = [
  /(token|secret|password|api[_-]?key|authorization)(\s*[:=]\s*)([^\s,;]+)/gi,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,
  /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/g,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{16,}\b/gi,
  /(https?:\/\/)([^/@\s:]+):([^/@\s]+)@/gi,
];
const PROVIDER_LABELS = [
  FACTORY_LABELS.providerJules,
  FACTORY_LABELS.providerAntigravity,
  FACTORY_LABELS.providerOpenCode,
];

function fail(message) {
  throw new Error(message);
}

export function stableValue(value) {
  if (Array.isArray(value)) return value.map((item) => stableValue(item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, stableValue(value[key])]),
    );
  }
  return value;
}

export function stableJson(value) {
  return JSON.stringify(stableValue(value));
}

export function sha256(value) {
  return createHash('sha256').update(stableJson(value)).digest('hex');
}

export function redactText(value, limit = 800) {
  let text = String(value ?? '');
  for (const pattern of SENSITIVE_VALUE_PATTERNS) {
    text = text.replace(pattern, (...args) => {
      if (pattern.source.startsWith('(https?')) return `${args[1]}<redacted>:<redacted>@`;
      if (args[2] != null) return `${args[1]}${args[2]}<redacted>`;
      return '<redacted>';
    });
  }
  return text.slice(0, limit);
}

export function sanitize(value, key = '', depth = 0) {
  if (depth > 8) return '<truncated>';
  if (value == null || typeof value === 'boolean' || typeof value === 'number') return value;
  if (SENSITIVE_KEY.test(key)) return '<redacted>';
  if (typeof value === 'string') return redactText(value);
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => sanitize(item, '', depth + 1));
  if (typeof value === 'object') {
    const entries = Object.entries(value)
      .slice(0, 100)
      .map(([childKey, childValue]) => [
        String(childKey).slice(0, 100),
        sanitize(childValue, String(childKey), depth + 1),
      ]);
    return Object.fromEntries(entries);
  }
  return redactText(value);
}

export function parseJsonObject(raw, label = 'payload') {
  const text = String(raw ?? '').trim();
  if (!text) return {};
  if (text.length > 50_000) fail(`${label} exceeds 50000 characters.`);
  let value;
  try {
    value = JSON.parse(text);
  } catch (error) {
    fail(`${label} is invalid JSON: ${error.message}`);
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${label} must be a JSON object.`);
  }
  return value;
}

export function parseTimestamp(value, label = 'timestamp') {
  const text = String(value ?? '').trim();
  const milliseconds = Date.parse(text);
  if (!text || Number.isNaN(milliseconds)) fail(`Invalid ${label}: ${value}`);
  return new Date(milliseconds);
}

export function validateIdentifier(value, label) {
  const text = String(value ?? '').trim();
  if (!SAFE_IDENTIFIER.test(text)) fail(`Invalid ${label}: ${value}`);
  return text;
}

export function validateSha40(value, label) {
  const text = String(value ?? '').trim().toLowerCase();
  if (!SHA_40.test(text)) fail(`Invalid ${label}.`);
  return text;
}

export function validateSha64(value, label) {
  const text = String(value ?? '').trim().toLowerCase();
  if (!SHA_64.test(text)) fail(`Invalid ${label}.`);
  return text;
}

export function validateBranch(value, label) {
  const branch = String(value ?? '').trim();
  if (
    !branch ||
    branch.length > 200 ||
    !SAFE_BRANCH.test(branch) ||
    branch.startsWith('/') ||
    branch.startsWith('-') ||
    branch.endsWith('/') ||
    branch.endsWith('.') ||
    branch.includes('..') ||
    branch.includes('@{') ||
    branch.includes('//') ||
    branch.includes('\\')
  ) {
    fail(`Invalid ${label}: ${value}`);
  }
  return branch;
}

function runtimeScope(scope) {
  const text = String(scope ?? '').trim();
  return text.endsWith('/**') ? text.slice(0, -3).replace(/\/$/, '') : text.replace(/\/$/, '');
}

export function normalizedManifest(run) {
  return {
    schema_version: 1,
    run_id: run.runId,
    goal: run.goal,
    base_branch: run.baseBranch,
    integration_branch: run.integrationBranch,
    max_parallel: run.maxParallel,
    tasks: run.tasks.map((task) => ({
      id: task.id,
      title: task.title,
      role: task.role,
      depends_on: task.dependsOn,
      paths: task.paths,
      required_capabilities: task.requiredCapabilities,
      preferred_providers: task.preferredProviders,
      human_gates: task.humanGates,
    })),
  };
}

export function portableRequest({ repository, run, task, workingBranch }) {
  return {
    schema_version: 1,
    run_id: run.runId,
    task_id: task.id,
    repository,
    integration_branch: run.integrationBranch,
    target_branch: run.baseBranch,
    working_branch: workingBranch,
    paths: task.paths.map(runtimeScope),
    instruction: task.title,
    allowed_commands: [],
    timeout_seconds: 1800,
    remote: 'origin',
  };
}

export function marker(kind, payload) {
  const name = String(kind ?? '').trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9_]{0,31}$/.test(name)) fail(`Invalid marker kind: ${kind}`);
  const rendered = stableJson(sanitize(payload));
  if (rendered.includes('-->')) fail('Marker contains an unsafe terminator.');
  return `<!-- FACTORY_PROVIDER_${name} ${rendered} -->`;
}

export function markerPayload(body, kind) {
  const name = String(kind ?? '').trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9_]{0,31}$/.test(name)) fail(`Invalid marker kind: ${kind}`);
  const expression = new RegExp(
    `<!--\\s*FACTORY_PROVIDER_${name}\\s+(\\{.*?\\})\\s*-->`,
    's',
  );
  const match = String(body ?? '').match(expression);
  if (!match) return null;
  return parseJsonObject(match[1], `${name} marker`);
}

export function parentIssueNumber(issue) {
  const match = String(issue?.body ?? '').match(PARENT_MARKER);
  const number = match ? Number(match[1]) : 0;
  if (!Number.isInteger(number) || number <= 0) fail('Materialized task has no valid parent issue.');
  return number;
}

export function validateHealthPayload(payload, now = new Date()) {
  const entries = Array.isArray(payload?.providers) ? payload.providers : [];
  if (entries.length === 0 || entries.length > DURABLE_PROVIDERS.length) {
    fail('Health payload requires one or two durable provider observations.');
  }
  const seen = new Set();
  return entries.map((raw) => {
    const providerId = String(raw?.provider_id ?? '').trim();
    if (!DURABLE_PROVIDERS.includes(providerId)) fail(`Invalid durable provider: ${providerId}`);
    if (seen.has(providerId)) fail(`Duplicate provider health: ${providerId}`);
    seen.add(providerId);
    const status = String(raw?.status ?? '').trim().toLowerCase();
    if (!HEALTH_STATES.includes(status)) fail(`Invalid provider health status: ${status}`);
    const observed = parseTimestamp(raw?.observed_at, 'provider health observed_at');
    const ageSeconds = (now.getTime() - observed.getTime()) / 1000;
    if (ageSeconds > HEALTH_MAX_AGE_SECONDS) fail(`Provider health is stale: ${providerId}`);
    if (ageSeconds < -FUTURE_CLOCK_SKEW_SECONDS) fail(`Provider health is from the future: ${providerId}`);
    return {
      provider_id: providerId,
      status,
      observed_at: observed.toISOString(),
      reason: redactText(raw?.reason),
      details: sanitize(raw?.details ?? {}),
    };
  });
}

export function selectDurableProvider(task, observations) {
  const byProvider = new Map(observations.map((item) => [item.provider_id, item]));
  const eligible = DURABLE_PROVIDERS.filter((provider) =>
    (task?.preferredProviders ?? []).includes(provider),
  );
  for (const desiredStatus of ['healthy', 'degraded']) {
    for (const provider of eligible) {
      if (byProvider.get(provider)?.status === desiredStatus) return provider;
    }
  }
  return null;
}

export function buildLease({
  issueNumber,
  repository,
  run,
  task,
  workerId,
  providerId,
  workingBranch,
  now = new Date(),
  ttlSeconds = 1800,
  leaseId = randomUUID(),
}) {
  if (!Number.isInteger(issueNumber) || issueNumber <= 0) fail('issue_number must be positive.');
  validateIdentifier(workerId, 'worker_id');
  if (!DURABLE_PROVIDERS.includes(providerId)) fail(`Invalid lease provider: ${providerId}`);
  const ttl = Number(ttlSeconds);
  if (!Number.isInteger(ttl) || ttl < LEASE_MIN_SECONDS || ttl > LEASE_MAX_SECONDS) {
    fail(`Lease TTL must be ${LEASE_MIN_SECONDS}-${LEASE_MAX_SECONDS} seconds.`);
  }
  const request = portableRequest({ repository, run, task, workingBranch });
  const manifest = normalizedManifest(run);
  return {
    schema_version: DURABLE_GATEWAY_SCHEMA_VERSION,
    lease_id: validateIdentifier(leaseId, 'lease_id'),
    run_id: run.runId,
    task_id: task.id,
    issue_number: issueNumber,
    provider_id: providerId,
    worker_id: validateIdentifier(workerId, 'worker_id'),
    repository,
    working_branch: validateBranch(workingBranch, 'worker branch'),
    integration_branch: validateBranch(run.integrationBranch, 'integration branch'),
    target_branch: validateBranch(run.baseBranch, 'target branch'),
    request_sha256: sha256(request),
    manifest_sha256: sha256(manifest),
    issued_at: now.toISOString(),
    expires_at: new Date(now.getTime() + ttl * 1000).toISOString(),
    actor: TRUSTED_FACTORY_LOGIN,
    request,
    manifest,
  };
}

export function validateLease(lease) {
  if (Number(lease?.schema_version) !== DURABLE_GATEWAY_SCHEMA_VERSION) {
    fail('Unsupported durable lease schema_version.');
  }
  validateIdentifier(lease?.lease_id, 'lease_id');
  validateIdentifier(lease?.run_id, 'run_id');
  validateIdentifier(lease?.task_id, 'task_id');
  validateIdentifier(lease?.worker_id, 'worker_id');
  if (!Number.isInteger(Number(lease?.issue_number)) || Number(lease.issue_number) <= 0) {
    fail('Invalid lease issue_number.');
  }
  if (!DURABLE_PROVIDERS.includes(lease?.provider_id)) fail('Invalid lease provider.');
  validateBranch(lease?.working_branch, 'lease working branch');
  validateBranch(lease?.integration_branch, 'lease integration branch');
  validateBranch(lease?.target_branch, 'lease target branch');
  if (new Set([lease.working_branch, lease.integration_branch, lease.target_branch]).size !== 3) {
    fail('Lease branches must be distinct.');
  }
  validateSha64(lease?.request_sha256, 'lease request_sha256');
  validateSha64(lease?.manifest_sha256, 'lease manifest_sha256');
  const issued = parseTimestamp(lease?.issued_at, 'lease issued_at');
  const expires = parseTimestamp(lease?.expires_at, 'lease expires_at');
  const ttl = (expires.getTime() - issued.getTime()) / 1000;
  if (ttl < LEASE_MIN_SECONDS || ttl > LEASE_MAX_SECONDS) fail('Lease TTL is outside policy.');
  if (lease?.actor !== TRUSTED_FACTORY_LOGIN) fail('Lease actor is not github-actions[bot].');
  if (sha256(lease?.request) !== lease.request_sha256) fail('Lease request fingerprint mismatch.');
  if (sha256(lease?.manifest) !== lease.manifest_sha256) fail('Lease manifest fingerprint mismatch.');
  return lease;
}

export function leaseActiveAt(lease, when = new Date()) {
  validateLease(lease);
  const point = when.getTime();
  return (
    parseTimestamp(lease.issued_at).getTime() <= point &&
    point < parseTimestamp(lease.expires_at).getTime()
  );
}

export function trustedLeases(comments) {
  const result = [];
  for (const comment of comments ?? []) {
    if (comment?.user?.login !== TRUSTED_FACTORY_LOGIN) continue;
    const payload = markerPayload(comment?.body, 'LEASE');
    if (!payload) continue;
    validateLease(payload);
    result.push({ lease: payload, comment });
  }
  return result;
}

export function activeTrustedLease(comments, now = new Date()) {
  const byId = new Map();
  for (const record of trustedLeases(comments)) {
    if (leaseActiveAt(record.lease, now)) byId.set(record.lease.lease_id, record);
  }
  if (byId.size > 1) fail('Multiple active trusted leases exist for the same task.');
  return [...byId.values()][0] ?? null;
}

export function trustedLeaseById(comments, leaseId) {
  const matches = trustedLeases(comments).filter((record) => record.lease.lease_id === leaseId);
  return matches.at(-1) ?? null;
}

export function validateHeartbeatCandidate(candidate, lease) {
  const heartbeat = candidate?.heartbeat ?? candidate;
  if (Number(heartbeat?.schema_version) !== DURABLE_GATEWAY_SCHEMA_VERSION) {
    fail('Unsupported heartbeat schema_version.');
  }
  for (const field of ['lease_id', 'run_id', 'task_id', 'provider_id', 'worker_id']) {
    if (String(heartbeat?.[field] ?? '') !== String(lease?.[field] ?? '')) {
      fail(`Heartbeat ${field} does not match the trusted lease.`);
    }
  }
  if (!HEARTBEAT_PHASES.includes(heartbeat?.phase)) fail('Invalid heartbeat phase.');
  const observed = parseTimestamp(heartbeat?.observed_at, 'heartbeat observed_at');
  if (!leaseActiveAt(lease, observed)) fail('Heartbeat was not observed inside the lease window.');
  const headSha = heartbeat?.head_sha == null ? null : validateSha40(heartbeat.head_sha, 'heartbeat head_sha');
  const metrics = heartbeat?.metrics ?? {};
  if (!metrics || typeof metrics !== 'object' || Array.isArray(metrics)) fail('Heartbeat metrics must be an object.');
  if (Object.values(metrics).some((value) => typeof value !== 'number' || !Number.isFinite(value))) {
    fail('Heartbeat metrics must be finite numbers.');
  }
  return {
    schema_version: DURABLE_GATEWAY_SCHEMA_VERSION,
    lease_id: lease.lease_id,
    run_id: lease.run_id,
    task_id: lease.task_id,
    provider_id: lease.provider_id,
    worker_id: lease.worker_id,
    phase: heartbeat.phase,
    observed_at: observed.toISOString(),
    head_sha: headSha,
    detail: redactText(heartbeat?.detail),
    metrics: sanitize(metrics),
  };
}

export function validateResultCandidate(candidate, lease) {
  const result = candidate?.result ?? candidate;
  if (Number(result?.schema_version) !== DURABLE_GATEWAY_SCHEMA_VERSION) {
    fail('Unsupported provider result schema_version.');
  }
  for (const field of [
    'lease_id',
    'run_id',
    'task_id',
    'issue_number',
    'provider_id',
    'worker_id',
    'request_sha256',
    'manifest_sha256',
  ]) {
    if (String(result?.[field] ?? '') !== String(lease?.[field] ?? '')) {
      fail(`Provider result ${field} does not match the trusted lease.`);
    }
  }
  const status = String(result?.status ?? '').toLowerCase();
  if (!TERMINAL_STATES.includes(status)) fail('Invalid provider result status.');
  const observed = parseTimestamp(result?.observed_at, 'provider result observed_at');
  if (!leaseActiveAt(lease, observed)) fail('Provider result was not observed inside the lease window.');
  const normalized = {
    schema_version: DURABLE_GATEWAY_SCHEMA_VERSION,
    lease_id: lease.lease_id,
    run_id: lease.run_id,
    task_id: lease.task_id,
    issue_number: Number(lease.issue_number),
    provider_id: lease.provider_id,
    worker_id: lease.worker_id,
    status,
    branch: String(result?.branch ?? ''),
    commit_sha: String(result?.commit_sha ?? ''),
    remote_sha: String(result?.remote_sha ?? ''),
    changed_paths: Array.isArray(result?.changed_paths)
      ? result.changed_paths.map((item) => String(item))
      : [],
    pushed: result?.pushed === true,
    request_sha256: lease.request_sha256,
    manifest_sha256: lease.manifest_sha256,
    observed_at: observed.toISOString(),
    session_id: result?.session_id ? redactText(result.session_id) : null,
    error: result?.error ? redactText(result.error) : null,
  };
  if (status === 'success') {
    if (normalized.branch !== lease.working_branch) fail('Provider result branch mismatch.');
    validateSha40(normalized.commit_sha, 'provider result commit_sha');
    validateSha40(normalized.remote_sha, 'provider result remote_sha');
    if (normalized.commit_sha !== normalized.remote_sha) fail('Provider result remote SHA mismatch.');
    if (!normalized.pushed) fail('Successful provider result was not pushed.');
    if (normalized.changed_paths.length === 0) fail('Successful provider result has no changed paths.');
    if (!changedFilesWithinDeclaredScope(normalized.changed_paths, lease.request.paths)) {
      fail('Provider result changed paths outside the leased scope.');
    }
  }
  return normalized;
}

async function ensureLabel(owner, repo, name, description, color) {
  const existing = await githubOptional(`/repos/${owner}/${repo}/labels/${encodeURIComponent(name)}`);
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

async function loadContext(owner, repo, issueNumber) {
  const issue = await github(`/repos/${owner}/${repo}/issues/${issueNumber}`);
  const materialized = parseMaterializedTask(issue);
  if (!materialized) fail('Task issue is not a trusted materialized Factory task.');
  const parentNumber = parentIssueNumber(issue);
  const parent = await github(`/repos/${owner}/${repo}/issues/${parentNumber}`);
  const run = parseFactoryRunV2(parent.body ?? '');
  if (run.runId !== materialized.runId) fail('Task run_id does not match parent manifest.');
  const task = run.tasks.find((item) => item.id === materialized.taskId);
  if (!task) fail('Task is absent from immutable parent manifest.');
  const parentComments = await issueComments(owner, repo, parentNumber);
  const expectedMarker = manifestMarker(run);
  const manifestLocked = parentComments.some(
    (comment) =>
      comment?.user?.login === TRUSTED_FACTORY_LOGIN &&
      String(comment?.body ?? '').includes(expectedMarker),
  );
  if (!manifestLocked) fail('Parent manifest has no trusted immutable fingerprint marker.');
  return { issue, materialized, parent, parentNumber, run, task };
}

async function ensureWorkerBranch(owner, repo, issueNumber, run, task) {
  const branch = validateBranch(`factory/${run.runId}/${task.id}`, 'durable worker branch');
  const comments = await issueComments(owner, repo, issueNumber);
  const owned = comments.some((comment) => {
    if (comment?.user?.login !== TRUSTED_FACTORY_LOGIN) return false;
    const payload = markerPayload(comment?.body, 'BRANCH');
    return payload?.branch === branch && payload?.integration_branch === run.integrationBranch;
  });
  const existing = await githubOptional(`/repos/${owner}/${repo}/branches/${encodeURIComponent(branch)}`);
  if (existing) {
    if (!owned) fail(`Durable worker branch ${branch} exists without trusted ownership evidence.`);
    return { branch, sha: existing.commit.sha, created: false };
  }
  const integration = await github(
    `/repos/${owner}/${repo}/branches/${encodeURIComponent(run.integrationBranch)}`,
  );
  await github(`/repos/${owner}/${repo}/git/refs`, {
    method: 'POST',
    body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: integration.commit.sha }),
  });
  await addComment(
    owner,
    repo,
    issueNumber,
    `${marker('BRANCH', {
      branch,
      integration_branch: run.integrationBranch,
      starting_sha: integration.commit.sha,
    })}\nDurable worker branch created by the trusted Control Plane. The executor may push only this branch.`,
  );
  return { branch, sha: integration.commit.sha, created: true };
}

async function persistHealth(owner, repo, issueNumber, workerId, observations) {
  await addComment(
    owner,
    repo,
    issueNumber,
    `${marker('HEALTH', {
      schema_version: DURABLE_GATEWAY_SCHEMA_VERSION,
      worker_id: workerId,
      observations,
    })}\nSanitized provider health persisted by the trusted Control Plane.`,
  );
}

async function claimLease(owner, repo, issueNumber, workerId, payload, ttlSeconds) {
  const context = await loadContext(owner, repo, issueNumber);
  const labels = new Set(labelNames(context.issue.labels));
  if (!labels.has(FACTORY_LABELS.task)) fail('Issue is not labeled as a Factory task.');
  if (!labels.has(FACTORY_LABELS.ready)) fail('Factory task is not ready for provider claim.');
  if (
    [FACTORY_LABELS.running, FACTORY_LABELS.ci, FACTORY_LABELS.merged, FACTORY_LABELS.failed].some(
      (label) => labels.has(label),
    )
  ) {
    fail('Factory task is already running, in CI, merged, or failed.');
  }
  if (context.task.humanGates.length > 0) fail('Human-gated task cannot receive an automatic lease.');
  const observations = validateHealthPayload(payload);
  await ensureDurableLabels(owner, repo);
  await persistHealth(owner, repo, issueNumber, workerId, observations);
  const provider = selectDurableProvider(context.task, observations);
  if (!provider) {
    if (context.task.preferredProviders.includes('jules')) {
      await setTaskState(
        owner,
        repo,
        issueNumber,
        [FACTORY_LABELS.providerJules, FACTORY_LABELS.ready],
        [FACTORY_LABELS.providerAntigravity, FACTORY_LABELS.providerOpenCode, FACTORY_LABELS.durableAgent],
      );
      await addComment(
        owner,
        repo,
        issueNumber,
        'No healthy/degraded durable provider was available. Task fell back to Jules without creating a local lease.',
      );
      return { status: 'fallback-jules', context };
    }
    fail('No healthy or degraded durable provider is eligible for this task.');
  }

  const comments = await issueComments(owner, repo, issueNumber);
  const active = activeTrustedLease(comments);
  if (active) {
    const lease = active.lease;
    if (lease.worker_id !== workerId || lease.provider_id !== provider) {
      fail(`Task already has active lease ${lease.lease_id} for another executor/provider.`);
    }
    return { status: 'reused', lease, context };
  }

  const branch = await ensureWorkerBranch(owner, repo, issueNumber, context.run, context.task);
  const lease = buildLease({
    issueNumber,
    repository: `${owner}/${repo}`,
    run: context.run,
    task: context.task,
    workerId,
    providerId: provider,
    workingBranch: branch.branch,
    ttlSeconds: Number(ttlSeconds),
  });
  await addComment(
    owner,
    repo,
    issueNumber,
    `${marker('LEASE', lease)}\nDurable provider lease issued by GitHub Actions. Local output remains untrusted until result reconciliation.`,
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
  return { status: 'issued', lease, context };
}

async function recordHeartbeat(owner, repo, issueNumber, payload) {
  const comments = await issueComments(owner, repo, issueNumber);
  const heartbeatRaw = payload?.heartbeat ?? payload;
  const record = trustedLeaseById(comments, heartbeatRaw?.lease_id);
  if (!record) fail('Heartbeat references no trusted lease.');
  const heartbeat = validateHeartbeatCandidate(payload, record.lease);
  if (heartbeat.head_sha) {
    const branch = await github(
      `/repos/${owner}/${repo}/branches/${encodeURIComponent(record.lease.working_branch)}`,
    );
    if (branch.commit.sha !== heartbeat.head_sha) fail('Heartbeat head SHA is not current on GitHub.');
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
      if (run.conclusion !== 'success') fail(`Mandatory CI run ${run.id} concluded ${run.conclusion}.`);
      return run;
    }
    await sleep(POLL_MS);
  }
  fail(`Mandatory CI timed out for ${branch}@${sha}.`);
}

async function synchronizeWorker(owner, repo, lease) {
  const integration = await github(
    `/repos/${owner}/${repo}/branches/${encodeURIComponent(lease.integration_branch)}`,
  );
  const worker = await github(
    `/repos/${owner}/${repo}/branches/${encodeURIComponent(lease.working_branch)}`,
  );
  const compare = await github(
    `/repos/${owner}/${repo}/compare/${encodeURIComponent(lease.integration_branch)}...${encodeURIComponent(lease.working_branch)}`,
  );
  if ((compare.behind_by ?? 0) > 0) {
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
  }
  const current = await github(
    `/repos/${owner}/${repo}/branches/${encodeURIComponent(lease.working_branch)}`,
  );
  return {
    integrationSha: integration.commit.sha,
    previousWorkerSha: worker.commit.sha,
    headSha: current.commit.sha,
  };
}

async function validateWorkerDiff(owner, repo, lease) {
  const compare = await github(
    `/repos/${owner}/${repo}/compare/${encodeURIComponent(lease.integration_branch)}...${encodeURIComponent(lease.working_branch)}`,
  );
  const files = (compare.files ?? []).map((item) => item.filename).filter(Boolean);
  if ((compare.ahead_by ?? 0) <= 0 || files.length === 0) fail('Durable worker branch has no changes to integrate.');
  if (!changedFilesWithinDeclaredScope(files, lease.request.paths)) {
    fail('Durable worker branch changed files outside the leased scope.');
  }
  return { compare, files };
}

async function findOrCreateWorkerPr(owner, repo, lease, issueNumber) {
  const head = encodeURIComponent(`${owner}:${lease.working_branch}`);
  const base = encodeURIComponent(lease.integration_branch);
  const existing = await github(
    `/repos/${owner}/${repo}/pulls?state=open&head=${head}&base=${base}`,
  );
  if (existing.length > 1) fail('Multiple open worker PRs exist for the durable branch.');
  if (existing[0]) return existing[0];
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

async function integrateSuccessfulResult(owner, repo, issueNumber, lease, result) {
  const branch = await github(
    `/repos/${owner}/${repo}/branches/${encodeURIComponent(lease.working_branch)}`,
  );
  if (branch.commit.sha !== result.remote_sha) fail('GitHub worker branch SHA does not match provider result.');
  await validateWorkerDiff(owner, repo, lease);
  const synchronized = await synchronizeWorker(owner, repo, lease);
  const validated = await validateWorkerDiff(owner, repo, lease);
  const pr = await findOrCreateWorkerPr(owner, repo, lease, issueNumber);
  if (pr.base.ref !== lease.integration_branch || pr.head.ref !== lease.working_branch) {
    fail('Durable worker PR branch contract is invalid.');
  }
  await setTaskState(
    owner,
    repo,
    issueNumber,
    [FACTORY_LABELS.ci],
    [FACTORY_LABELS.running, FACTORY_LABELS.ready],
  );
  const ci = await waitForCi(owner, repo, lease.working_branch, synchronized.headSha);
  const latestPr = await github(`/repos/${owner}/${repo}/pulls/${pr.number}`);
  if (latestPr.head.sha !== synchronized.headSha) fail('Worker PR head moved after mandatory CI.');
  const merged = await github(`/repos/${owner}/${repo}/pulls/${pr.number}/merge`, {
    method: 'PUT',
    body: JSON.stringify({
      merge_method: 'squash',
      sha: synchronized.headSha,
      commit_title: `[Factory:${lease.run_id}] ${lease.task_id}`,
      commit_message: `Durable provider task #${issueNumber}; exact-SHA CI run ${ci.id} succeeded.`,
    }),
  });
  if (!merged?.merged || !SHA_40.test(String(merged.sha ?? ''))) {
    fail(`GitHub did not merge durable worker PR #${pr.number}.`);
  }
  await addComment(
    owner,
    repo,
    issueNumber,
    `${mergedPrMarker(pr.number, merged.sha)}\nDurable worker result ${result.commit_sha} was synchronized to ${synchronized.headSha}, passed mandatory CI run ${ci.id}, and was squash-merged only into \`${lease.integration_branch}\`. Files: ${validated.files.join(', ')}. Target branch remains untouched.`,
  );
  await github(`/repos/${owner}/${repo}/issues/${issueNumber}`, {
    method: 'PATCH',
    body: JSON.stringify({ state: 'closed', state_reason: 'completed' }),
  });
  await setTaskState(
    owner,
    repo,
    issueNumber,
    [FACTORY_LABELS.merged],
    [FACTORY_LABELS.ci, FACTORY_LABELS.running, FACTORY_LABELS.ready, FACTORY_LABELS.waiting],
  );
  return { pr, ci, mergeSha: merged.sha, synchronized };
}

async function recordResult(owner, repo, issueNumber, payload) {
  const context = await loadContext(owner, repo, issueNumber);
  const comments = await issueComments(owner, repo, issueNumber);
  const resultRaw = payload?.result ?? payload;
  const record = trustedLeaseById(comments, resultRaw?.lease_id);
  if (!record) fail('Provider result references no trusted lease.');
  const result = validateResultCandidate(payload, record.lease);
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
  const integration = await integrateSuccessfulResult(owner, repo, issueNumber, record.lease, result);
  return { status: 'merged-integration', result, context, integration };
}

async function recordHealth(owner, repo, issueNumber, workerId, payload) {
  await loadContext(owner, repo, issueNumber);
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
  const actor = requiredEnv('GITHUB_ACTOR');
  if (actor !== owner) fail('Durable provider gateway may be dispatched only by the repository owner.');
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
    const claimed = await claimLease(owner, repo, issue, workerId, payload, ttlSeconds);
    if (claimed.status === 'fallback-jules') {
      const resumed = await runParent(claimed.context.parentNumber);
      return { ...claimed, resumed };
    }
    return claimed;
  }
  if (operation === 'heartbeat') {
    return { status: 'heartbeat-recorded', heartbeat: await recordHeartbeat(owner, repo, issue, payload) };
  }
  if (operation === 'result') {
    const recorded = await recordResult(owner, repo, issue, payload);
    if (recorded.status === 'merged-integration') {
      try {
        recorded.resumed = await runParent(recorded.context.parentNumber);
      } catch (error) {
        await addComment(
          owner,
          repo,
          recorded.context.parentNumber,
          `Durable task #${issue} was integrated successfully, but automatic parent reconciliation stopped: ${redactText(error instanceof Error ? error.message : String(error))}. Durable state remains preserved in GitHub.`,
        );
        recorded.resume_error = redactText(error instanceof Error ? error.message : String(error));
      }
    }
    return recorded;
  }
  if (operation === 'health') {
    return {
      status: 'health-recorded',
      observations: await recordHealth(owner, repo, issue, workerId, payload),
    };
  }
  fail(`Unsupported durable provider gateway operation: ${operation}`);
}

async function main() {
  const operation = requiredEnv('FACTORY_PROVIDER_OPERATION');
  const issueNumber = requiredEnv('FACTORY_PROVIDER_ISSUE');
  const workerId = requiredEnv('FACTORY_PROVIDER_WORKER');
  const payload = parseJsonObject(process.env.FACTORY_PROVIDER_PAYLOAD ?? '{}', 'provider payload');
  const ttlSeconds = Number(process.env.FACTORY_PROVIDER_TTL_SECONDS ?? 1800);
  const result = await executeGateway({ operation, issueNumber, workerId, payload, ttlSeconds });
  process.stdout.write(
    `${JSON.stringify({
      status: result.status,
      operation,
      issue_number: Number(issueNumber),
      worker_id: workerId,
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
