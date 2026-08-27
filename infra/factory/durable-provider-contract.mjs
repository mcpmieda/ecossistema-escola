import { createHash, randomUUID } from 'node:crypto';

import { DURABLE_PROVIDERS } from './dispatch-policy.mjs';
import { changedFilesWithinDeclaredScope, TRUSTED_FACTORY_LOGIN } from './reconciliation-policy.mjs';

export const DURABLE_SCHEMA_VERSION = 1;
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

const SAFE_IDENTIFIER = /^[A-Za-z0-9._:@/-]{1,160}$/;
const SAFE_BRANCH = /^[A-Za-z0-9._/-]+$/;
const SHA_40 = /^[0-9a-f]{40}$/;
const SHA_64 = /^[0-9a-f]{64}$/;
const RESERVED_SCOPES = ['.github', 'infra/factory', 'infra/validation'];
const SENSITIVE_KEY = /(token|secret|password|api[_-]?key|authorization|cookie|credential)/i;
const SENSITIVE_PAIR = /(token|secret|password|api[_-]?key|authorization)(\s*[:=]\s*)([^\s,;]+)/gi;
const URL_CREDENTIALS = /(https?:\/\/)([^/@\s:]+):([^/@\s]+)@/gi;
const TOKEN_PATTERNS = [
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,
  /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/g,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{16,}\b/gi,
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
  text = text.replace(URL_CREDENTIALS, '$1<redacted>:<redacted>@');
  text = text.replace(SENSITIVE_PAIR, '$1$2<redacted>');
  for (const pattern of TOKEN_PATTERNS) text = text.replace(pattern, '<redacted>');
  return text.slice(0, limit);
}

export function sanitize(value, key = '', depth = 0) {
  if (depth > 8) return '<truncated>';
  if (value == null || typeof value === 'boolean' || typeof value === 'number') return value;
  if (SENSITIVE_KEY.test(key)) return '<redacted>';
  if (typeof value === 'string') return redactText(value);
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => sanitize(item, '', depth + 1));
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, 100)
        .map(([childKey, childValue]) => [
          String(childKey).slice(0, 100),
          sanitize(childValue, String(childKey), depth + 1),
        ]),
    );
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
  if (!text || !/(Z|[+-]\d{2}:\d{2})$/.test(text)) fail(`${label} must include a timezone.`);
  const milliseconds = Date.parse(text);
  if (Number.isNaN(milliseconds)) fail(`Invalid ${label}: ${value}`);
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

export function normalizeRuntimeScope(value) {
  const scope = String(value ?? '').trim().replace(/^\/+/, '');
  const withoutGlob = scope.endsWith('/**') ? scope.slice(0, -3).replace(/\/$/, '') : scope.replace(/\/$/, '');
  if (
    !withoutGlob ||
    withoutGlob.includes('\\') ||
    withoutGlob.split('/').some((part) => !part || part === '.' || part === '..')
  ) {
    fail(`Invalid runtime path scope: ${value}`);
  }
  if (
    RESERVED_SCOPES.some(
      (reserved) =>
        withoutGlob === reserved ||
        withoutGlob.startsWith(`${reserved}/`) ||
        reserved.startsWith(`${withoutGlob}/`),
    )
  ) {
    fail(`Runtime path scope overlaps a protected path: ${withoutGlob}`);
  }
  return withoutGlob;
}

export function runtimePathWithinScope(filename, scope) {
  const file = String(filename ?? '').trim().replace(/^\/+/, '');
  const root = normalizeRuntimeScope(scope);
  if (
    !file ||
    file.includes('\\') ||
    file.split('/').some((part) => !part || part === '.' || part === '..')
  ) {
    return false;
  }
  if (RESERVED_SCOPES.some((reserved) => file === reserved || file.startsWith(`${reserved}/`))) {
    return false;
  }
  return file === root || file.startsWith(`${root}/`);
}

export function runtimeChangedFilesWithinScope(files, scopes) {
  if (!Array.isArray(files) || files.length === 0) return false;
  if (!Array.isArray(scopes) || scopes.length === 0) return false;
  return files.every((file) => scopes.some((scope) => runtimePathWithinScope(file, scope)));
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
    paths: task.paths.map(normalizeRuntimeScope),
    instruction: `${run.goal}\n\n${task.title}`,
    allowed_commands: [],
    timeout_seconds: 1800,
    remote: 'origin',
  };
}

export function marker(kind, payload) {
  const name = String(kind ?? '').trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9_]{0,31}$/.test(name)) fail(`Invalid marker kind: ${kind}`);
  const encoded = Buffer.from(stableJson(sanitize(payload)), 'utf8').toString('base64url');
  return `<!-- FACTORY_PROVIDER_${name} ${encoded} -->`;
}

export function markerPayload(body, kind) {
  const name = String(kind ?? '').trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9_]{0,31}$/.test(name)) fail(`Invalid marker kind: ${kind}`);
  const match = String(body ?? '').match(
    new RegExp(`<!--\\s*FACTORY_PROVIDER_${name}\\s+([A-Za-z0-9_-]+)\\s*-->`),
  );
  if (!match) return null;
  let value;
  try {
    value = JSON.parse(Buffer.from(match[1], 'base64url').toString('utf8'));
  } catch (error) {
    fail(`Invalid ${name} marker: ${error.message}`);
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${name} marker payload must be a JSON object.`);
  }
  return value;
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
  for (const status of ['healthy', 'degraded']) {
    for (const provider of eligible) {
      if (byProvider.get(provider)?.status === status) return provider;
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
    schema_version: DURABLE_SCHEMA_VERSION,
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
  if (Number(lease?.schema_version) !== DURABLE_SCHEMA_VERSION) fail('Unsupported durable lease schema_version.');
  for (const field of ['lease_id', 'run_id', 'task_id', 'worker_id']) {
    validateIdentifier(lease?.[field], field);
  }
  if (!Number.isInteger(Number(lease?.issue_number)) || Number(lease.issue_number) <= 0) {
    fail('Invalid lease issue_number.');
  }
  if (!DURABLE_PROVIDERS.includes(lease?.provider_id)) fail('Invalid lease provider.');
  for (const field of ['working_branch', 'integration_branch', 'target_branch']) {
    validateBranch(lease?.[field], `lease ${field}`);
  }
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
  return parseTimestamp(lease.issued_at).getTime() <= point && point < parseTimestamp(lease.expires_at).getTime();
}

export function trustedMarkers(comments, kind) {
  const result = [];
  for (const comment of comments ?? []) {
    if (comment?.user?.login !== TRUSTED_FACTORY_LOGIN) continue;
    const payload = markerPayload(comment?.body, kind);
    if (payload) result.push({ payload, comment });
  }
  return result;
}

export function trustedLeases(comments) {
  return trustedMarkers(comments, 'LEASE').map(({ payload, comment }) => ({
    lease: validateLease(payload),
    comment,
  }));
}

export function activeTrustedLease(comments, now = new Date()) {
  const active = trustedLeases(comments).filter((record) => leaseActiveAt(record.lease, now));
  const byId = new Map(active.map((record) => [record.lease.lease_id, record]));
  if (byId.size > 1) fail('Multiple active trusted leases exist for the same task.');
  return [...byId.values()][0] ?? null;
}

export function trustedLeaseById(comments, leaseId) {
  return trustedLeases(comments).filter((record) => record.lease.lease_id === leaseId).at(-1) ?? null;
}

export function validateHeartbeatCandidate(candidate, lease) {
  const heartbeat = candidate?.heartbeat ?? candidate;
  if (Number(heartbeat?.schema_version) !== DURABLE_SCHEMA_VERSION) fail('Unsupported heartbeat schema_version.');
  for (const field of ['lease_id', 'run_id', 'task_id', 'provider_id', 'worker_id']) {
    if (String(heartbeat?.[field] ?? '') !== String(lease?.[field] ?? '')) {
      fail(`Heartbeat ${field} does not match the trusted lease.`);
    }
  }
  if (!HEARTBEAT_PHASES.includes(heartbeat?.phase)) fail('Invalid heartbeat phase.');
  const observed = parseTimestamp(heartbeat?.observed_at, 'heartbeat observed_at');
  if (!leaseActiveAt(lease, observed)) fail('Heartbeat was not observed inside the lease window.');
  const metrics = heartbeat?.metrics ?? {};
  if (!metrics || typeof metrics !== 'object' || Array.isArray(metrics)) fail('Heartbeat metrics must be an object.');
  if (Object.values(metrics).some((value) => typeof value !== 'number' || !Number.isFinite(value))) {
    fail('Heartbeat metrics must be finite numbers.');
  }
  return {
    schema_version: DURABLE_SCHEMA_VERSION,
    lease_id: lease.lease_id,
    run_id: lease.run_id,
    task_id: lease.task_id,
    provider_id: lease.provider_id,
    worker_id: lease.worker_id,
    phase: heartbeat.phase,
    observed_at: observed.toISOString(),
    head_sha: heartbeat?.head_sha == null ? null : validateSha40(heartbeat.head_sha, 'heartbeat head_sha'),
    detail: redactText(heartbeat?.detail),
    metrics: sanitize(metrics),
  };
}

export function validateResultCandidate(candidate, lease) {
  const result = candidate?.result ?? candidate;
  if (Number(result?.schema_version) !== DURABLE_SCHEMA_VERSION) fail('Unsupported provider result schema_version.');
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
    schema_version: DURABLE_SCHEMA_VERSION,
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
    changed_paths: Array.isArray(result?.changed_paths) ? result.changed_paths.map(String) : [],
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
    if (!runtimeChangedFilesWithinScope(normalized.changed_paths, lease.request.paths)) {
      fail('Provider result changed paths outside the leased scope.');
    }
  }
  return normalized;
}

export function declaredChangedFilesWithinScope(files, scopes) {
  return changedFilesWithinDeclaredScope(files, scopes);
}
