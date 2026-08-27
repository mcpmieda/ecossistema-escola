import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DURABLE_SCHEMA_VERSION,
  HEALTH_MAX_AGE_SECONDS,
  activeTrustedLease,
  buildLease,
  leaseActiveAt,
  marker,
  markerPayload,
  normalizeRuntimeScope,
  normalizedManifest,
  parseJsonObject,
  parseTimestamp,
  portableRequest,
  redactText,
  runtimeChangedFilesWithinScope,
  runtimePathWithinScope,
  sanitize,
  selectDurableProvider,
  sha256,
  stableJson,
  trustedLeaseById,
  validateBranch,
  validateHealthPayload,
  validateHeartbeatCandidate,
  validateIdentifier,
  validateLease,
  validateResultCandidate,
  validateSha40,
  validateSha64,
} from './durable-provider-contract.mjs';
import { FACTORY_LABELS } from './dispatch-policy.mjs';

const NOW = new Date('2026-08-27T12:00:00.000Z');
const SHA_A = 'a'.repeat(40);
const SHA_B = 'b'.repeat(40);

function task(overrides = {}) {
  return {
    id: 'worker-a',
    title: 'Create durable docs.',
    role: 'implementation',
    dependsOn: [],
    paths: ['docs/worker-a/**'],
    requiredCapabilities: ['reasoning', 'repo_read', 'repo_write'],
    preferredProviders: ['opencode_ollama', 'jules'],
    humanGates: [],
    ...overrides,
  };
}

function run(overrides = {}) {
  return {
    runId: 'durable-run',
    goal: 'Build docs.',
    baseBranch: 'main',
    integrationBranch: 'factory/durable-run',
    maxParallel: 2,
    tasks: [task()],
    ...overrides,
  };
}

function health(providerId, status, observedAt = NOW.toISOString(), overrides = {}) {
  return {
    provider_id: providerId,
    status,
    observed_at: observedAt,
    reason: 'ready',
    details: {},
    ...overrides,
  };
}

function lease(overrides = {}) {
  return buildLease({
    issueNumber: 101,
    repository: 'owner/repo',
    run: run(),
    task: task(),
    workerId: 'executor-01',
    providerId: 'opencode_ollama',
    workingBranch: 'factory/durable-run/worker-a',
    now: new Date('2026-08-27T11:55:00.000Z'),
    ttlSeconds: 1800,
    leaseId: 'lease-001',
    ...overrides,
  });
}

test('canonical JSON and fingerprints match the Python durable agent contract', () => {
  const manifest = normalizedManifest(run());
  const request = portableRequest({
    repository: 'owner/repo',
    run: run(),
    task: task(),
    workingBranch: 'factory/durable-run/worker-a',
  });

  assert.equal(
    sha256(manifest),
    '797c952bf08b70aa54d502db0f339202d46a186ff0687e22a85a513a01fd0cb0',
  );
  assert.equal(
    sha256(request),
    'ba8ed2614fae559ab56e4ac81d8764bfc79174244642bfa81d2f62143856cf99',
  );
  assert.equal(request.instruction, 'Build docs.\n\nCreate durable docs.');
  assert.deepEqual(request.paths, ['docs/worker-a']);
  assert.equal(
    stableJson({ z: 2, nested: { b: 2, a: 1 }, a: 1 }),
    '{"a":1,"nested":{"a":1,"b":2},"z":2}',
  );
});

test('secret redaction is deterministic for pairs, URLs, bearer tokens, and GitHub tokens', () => {
  const rendered = redactText(
    'token=abc password: xyz https://user:pass@example.test Bearer abcdefghijklmnop github_pat_abcdefghijklmnopqrstuvwxyz123456 ghp_abcdefghijklmnopqrstuvwxyz123456',
  );
  assert.equal(rendered.includes('abc '), false);
  assert.equal(rendered.includes('xyz'), false);
  assert.equal(rendered.includes('user:pass'), false);
  assert.equal(rendered.includes('github_pat_'), false);
  assert.equal(rendered.includes('ghp_'), false);
  assert.equal(rendered.includes('<redacted>'), true);

  assert.deepEqual(
    sanitize({ token: 'secret', nested: { api_key: 'secret', value: 'password=bad' } }),
    {
      token: '<redacted>',
      nested: { api_key: '<redacted>', value: 'password=<redacted>' },
    },
  );
  assert.equal(sanitize({ value: { deeper: { again: { x: { y: { z: { q: { r: { s: 1 } } } } } } } } }).value.deeper.again.x.y.z.q.r, '<truncated>');
});

test('JSON, timestamp, identifier, branch, and SHA validators fail closed', () => {
  assert.deepEqual(parseJsonObject(''), {});
  assert.deepEqual(parseJsonObject('{"a":1}'), { a: 1 });
  assert.throws(() => parseJsonObject('[]'), /JSON object/);
  assert.throws(() => parseJsonObject('{bad}'), /invalid JSON/);
  assert.throws(() => parseJsonObject(`{"x":"${'a'.repeat(50_001)}"}`), /50000/);

  assert.equal(parseTimestamp('2026-08-27T12:00:00Z').toISOString(), NOW.toISOString());
  assert.throws(() => parseTimestamp('2026-08-27T12:00:00'), /timezone/);
  assert.throws(() => parseTimestamp('invalid'), /timezone|Invalid/);

  assert.equal(validateIdentifier('executor:host-1', 'worker'), 'executor:host-1');
  assert.throws(() => validateIdentifier('bad worker', 'worker'), /Invalid worker/);
  assert.equal(validateBranch('factory/run/worker', 'branch'), 'factory/run/worker');
  for (const value of ['', '/bad', '-bad', 'bad/', 'bad.', 'bad..x', 'bad@{x', 'bad//x', 'bad\\x']) {
    assert.throws(() => validateBranch(value, 'branch'), /Invalid branch/);
  }
  assert.equal(validateSha40(SHA_A.toUpperCase(), 'sha'), SHA_A);
  assert.equal(validateSha64('A'.repeat(64), 'fingerprint'), 'a'.repeat(64));
  assert.throws(() => validateSha40('bad', 'sha'), /Invalid sha/);
  assert.throws(() => validateSha64('bad', 'fingerprint'), /Invalid fingerprint/);
});

test('runtime scopes allow descendants but reject traversal, reserved paths, and parent escapes', () => {
  assert.equal(normalizeRuntimeScope('docs/worker/**'), 'docs/worker');
  assert.equal(runtimePathWithinScope('docs/worker/result.md', 'docs/worker'), true);
  assert.equal(runtimePathWithinScope('docs/worker', 'docs/worker'), true);
  assert.equal(runtimePathWithinScope('docs/other.md', 'docs/worker'), false);
  assert.equal(runtimePathWithinScope('.github/workflows/escape.yml', 'docs'), false);
  assert.equal(runtimePathWithinScope('../escape', 'docs'), false);
  assert.equal(
    runtimeChangedFilesWithinScope(
      ['docs/worker/a.md', 'docs/worker/nested/b.md'],
      ['docs/worker'],
    ),
    true,
  );
  assert.equal(runtimeChangedFilesWithinScope([], ['docs']), false);
  assert.equal(runtimeChangedFilesWithinScope(['docs/a.md'], []), false);

  for (const scope of ['', '../escape', 'docs\\escape', '.github', 'infra', 'infra/factory']) {
    assert.throws(() => normalizeRuntimeScope(scope), /Invalid runtime|protected path/);
  }
});

test('base64url markers roundtrip nested payloads and reject malformed or non-object data', () => {
  const payload = {
    lease_id: 'lease-001',
    request: { paths: ['docs/a'], nested: { value: 1 } },
    manifest: { tasks: [{ id: 'a' }] },
  };
  const rendered = marker('lease', payload);
  assert.equal(rendered.includes('{'), false);
  assert.deepEqual(markerPayload(`before\n${rendered}\nafter`, 'lease'), payload);
  assert.equal(markerPayload('no marker', 'lease'), null);
  assert.throws(() => marker('bad kind', {}), /marker kind/);
  assert.throws(() => markerPayload('', 'bad kind'), /marker kind/);

  const malformed = '<!-- FACTORY_PROVIDER_LEASE not_base64_ -->';
  assert.throws(() => markerPayload(malformed, 'lease'), /Invalid LEASE marker/);
  const arrayEncoded = Buffer.from('[]').toString('base64url');
  assert.throws(
    () => markerPayload(`<!-- FACTORY_PROVIDER_LEASE ${arrayEncoded} -->`, 'lease'),
    /JSON object/,
  );
});

test('fresh provider health is sanitized and zero-first selection prefers OpenCode/Ollama', () => {
  const observations = validateHealthPayload(
    {
      providers: [
        health('antigravity', 'healthy', NOW.toISOString(), {
          reason: 'token=secret',
          details: { api_key: 'secret' },
        }),
        health('opencode_ollama', 'degraded'),
      ],
    },
    NOW,
  );
  assert.equal(observations[0].reason, 'token=<redacted>');
  assert.equal(observations[0].details.api_key, '<redacted>');
  assert.equal(selectDurableProvider(task({ preferredProviders: ['antigravity', 'opencode_ollama'] }), observations), 'antigravity');

  const bothHealthy = validateHealthPayload(
    { providers: [health('antigravity', 'healthy'), health('opencode_ollama', 'healthy')] },
    NOW,
  );
  assert.equal(
    selectDurableProvider(task({ preferredProviders: ['antigravity', 'opencode_ollama'] }), bothHealthy),
    'opencode_ollama',
  );
  assert.equal(selectDurableProvider(task({ preferredProviders: ['jules'] }), bothHealthy), null);

  assert.throws(() => validateHealthPayload({ providers: [] }, NOW), /one or two/);
  assert.throws(
    () => validateHealthPayload({ providers: [health('unknown', 'healthy')] }, NOW),
    /Invalid durable provider/,
  );
  assert.throws(
    () => validateHealthPayload({ providers: [health('antigravity', 'bad')] }, NOW),
    /health status/,
  );
  assert.throws(
    () => validateHealthPayload({ providers: [health('antigravity', 'healthy'), health('antigravity', 'healthy')] }, NOW),
    /Duplicate/,
  );
  assert.throws(
    () =>
      validateHealthPayload(
        {
          providers: [
            health(
              'antigravity',
              'healthy',
              new Date(NOW.getTime() - (HEALTH_MAX_AGE_SECONDS + 1) * 1000).toISOString(),
            ),
          ],
        },
        NOW,
      ),
    /stale/,
  );
  assert.throws(
    () =>
      validateHealthPayload(
        {
          providers: [
            health('antigravity', 'healthy', new Date(NOW.getTime() + 121_000).toISOString()),
          ],
        },
        NOW,
      ),
    /future/,
  );
});

test('lease binds immutable manifest, portable request, branches, provider, and expiry', () => {
  const value = lease();
  assert.equal(value.schema_version, DURABLE_SCHEMA_VERSION);
  assert.equal(value.request_sha256, 'ba8ed2614fae559ab56e4ac81d8764bfc79174244642bfa81d2f62143856cf99');
  assert.equal(value.manifest_sha256, '797c952bf08b70aa54d502db0f339202d46a186ff0687e22a85a513a01fd0cb0');
  assert.equal(validateLease(value), value);
  assert.equal(leaseActiveAt(value, NOW), true);
  assert.equal(leaseActiveAt(value, new Date('2026-08-27T12:25:00.000Z')), false);

  const cases = [
    [{ schema_version: 2 }, /schema_version/],
    [{ lease_id: 'bad lease' }, /lease_id/],
    [{ issue_number: 0 }, /issue_number/],
    [{ provider_id: 'codex' }, /provider/],
    [{ working_branch: value.integration_branch }, /distinct/],
    [{ request_sha256: 'c'.repeat(64) }, /fingerprint mismatch/],
    [{ manifest_sha256: 'd'.repeat(64) }, /fingerprint mismatch/],
    [{ actor: 'local-user' }, /github-actions/],
    [{ expires_at: '2026-08-27T11:55:30.000Z' }, /TTL/],
    [{ expires_at: '2026-08-27T18:00:01.000Z' }, /TTL/],
  ];
  for (const [overrides, expression] of cases) {
    assert.throws(() => validateLease({ ...value, ...overrides }), expression);
  }
  assert.throws(
    () =>
      buildLease({
        issueNumber: 1,
        repository: 'owner/repo',
        run: run(),
        task: task(),
        workerId: 'worker',
        providerId: 'opencode_ollama',
        workingBranch: 'factory/durable-run/worker-a',
        ttlSeconds: 30,
      }),
    /TTL/,
  );
});

test('only bot-authored active leases are recoverable and conflicts fail closed', () => {
  const value = lease();
  const trustedComment = { user: { login: 'github-actions[bot]' }, body: marker('LEASE', value) };
  const forgedComment = { user: { login: 'user' }, body: marker('LEASE', value) };
  assert.equal(activeTrustedLease([forgedComment], NOW), null);
  assert.equal(activeTrustedLease([trustedComment], NOW).lease.lease_id, 'lease-001');
  assert.equal(trustedLeaseById([trustedComment], 'lease-001').lease.worker_id, 'executor-01');
  assert.equal(trustedLeaseById([trustedComment], 'missing'), null);

  const second = lease({ leaseId: 'lease-002' });
  assert.throws(
    () =>
      activeTrustedLease(
        [trustedComment, { user: { login: 'github-actions[bot]' }, body: marker('LEASE', second) }],
        NOW,
      ),
    /Multiple active/,
  );
});

test('heartbeat candidates must match the lease, stay inside TTL, and contain only numeric metrics', () => {
  const value = lease();
  const heartbeat = {
    schema_version: 1,
    lease_id: value.lease_id,
    run_id: value.run_id,
    task_id: value.task_id,
    provider_id: value.provider_id,
    worker_id: value.worker_id,
    phase: 'running',
    observed_at: NOW.toISOString(),
    head_sha: SHA_A,
    detail: 'token=secret',
    metrics: { elapsed: 12, progress: 0.5 },
  };
  const normalized = validateHeartbeatCandidate({ heartbeat }, value);
  assert.equal(normalized.detail, 'token=<redacted>');
  assert.equal(normalized.head_sha, SHA_A);
  assert.deepEqual(normalized.metrics, { elapsed: 12, progress: 0.5 });

  assert.throws(
    () => validateHeartbeatCandidate({ ...heartbeat, lease_id: 'other' }, value),
    /lease_id/,
  );
  assert.throws(
    () => validateHeartbeatCandidate({ ...heartbeat, phase: 'unknown' }, value),
    /phase/,
  );
  assert.throws(
    () => validateHeartbeatCandidate({ ...heartbeat, observed_at: '2026-08-27T12:30:00Z' }, value),
    /lease window/,
  );
  assert.throws(
    () => validateHeartbeatCandidate({ ...heartbeat, metrics: { bad: 'value' } }, value),
    /finite numbers/,
  );
});

test('successful results require exact lease identity, remote SHA, publication, and scoped files', () => {
  const value = lease();
  const result = {
    schema_version: 1,
    lease_id: value.lease_id,
    run_id: value.run_id,
    task_id: value.task_id,
    issue_number: value.issue_number,
    provider_id: value.provider_id,
    worker_id: value.worker_id,
    status: 'success',
    branch: value.working_branch,
    commit_sha: SHA_A,
    remote_sha: SHA_A,
    changed_paths: ['docs/worker-a/result.md', 'docs/worker-a/nested/a.md'],
    pushed: true,
    request_sha256: value.request_sha256,
    manifest_sha256: value.manifest_sha256,
    observed_at: NOW.toISOString(),
    session_id: 'session',
  };
  const normalized = validateResultCandidate({ result }, value);
  assert.equal(normalized.status, 'success');
  assert.deepEqual(normalized.changed_paths, result.changed_paths);

  const cases = [
    [{ lease_id: 'other' }, /lease_id/],
    [{ status: 'unknown' }, /status/],
    [{ branch: 'factory/other' }, /branch mismatch/],
    [{ commit_sha: 'bad' }, /commit_sha/],
    [{ remote_sha: SHA_B }, /remote SHA mismatch/],
    [{ pushed: false }, /not pushed/],
    [{ changed_paths: [] }, /outside the leased scope/],
    [{ changed_paths: ['src/escape.js'] }, /outside the leased scope/],
    [{ changed_paths: ['.github/workflows/escape.yml'] }, /outside the leased scope/],
    [{ observed_at: '2026-08-27T12:30:00Z' }, /lease window/],
  ];
  for (const [overrides, expression] of cases) {
    assert.throws(() => validateResultCandidate({ ...result, ...overrides }, value), expression);
  }

  const failed = validateResultCandidate(
    {
      ...result,
      status: 'failed',
      branch: '',
      commit_sha: '',
      remote_sha: '',
      changed_paths: [],
      pushed: false,
      error: 'password=bad',
    },
    value,
  );
  assert.equal(failed.status, 'failed');
  assert.equal(failed.error, 'password=<redacted>');
});

test('dispatch labels referenced by the durable contract remain stable', () => {
  assert.equal(FACTORY_LABELS.providerOpenCode, 'factory:provider:opencode-ollama');
  assert.equal(FACTORY_LABELS.providerAntigravity, 'factory:provider:antigravity');
  assert.equal(FACTORY_LABELS.durableAgent, 'factory:dispatch:durable-agent');
});
