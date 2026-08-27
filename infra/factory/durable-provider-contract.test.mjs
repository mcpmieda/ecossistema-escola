import assert from 'node:assert/strict';
import test from 'node:test';

import {
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

function factoryRun(overrides = {}) {
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

function observation(providerId, status, observedAt = NOW.toISOString(), overrides = {}) {
  return {
    provider_id: providerId,
    status,
    observed_at: observedAt,
    reason: 'ready',
    details: {},
    ...overrides,
  };
}

function factoryLease(overrides = {}) {
  return buildLease({
    issueNumber: 101,
    repository: 'owner/repo',
    run: factoryRun(),
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

test('canonical hashes match the Python durable agent contract exactly', () => {
  const run = factoryRun();
  const manifest = normalizedManifest(run);
  const request = portableRequest({
    repository: 'owner/repo',
    run,
    task: task(),
    workingBranch: 'factory/durable-run/worker-a',
  });

  assert.equal(
    sha256(manifest),
    '797c952bf08b70aa54d502db0f339202d46a186ff0687e22a85a513a01fd0cb0',
  );
  assert.equal(sha256(request), 'ba8ed2614fae559ab56e4ac81d8764bfc79174244642bfa81d2f62143856cf99');
  assert.equal(request.instruction, 'Build docs.\n\nCreate durable docs.');
  assert.deepEqual(request.paths, ['docs/worker-a']);
  assert.equal(stableJson({ z: 2, a: { y: 2, x: 1 } }), '{"a":{"x":1,"y":2},"z":2}');
});

test('redaction removes secret pairs, URL credentials, bearer values, and GitHub tokens', () => {
  const rendered = redactText(
    'token=abc password:xyz https://user:pass@example.test Bearer abcdefghijklmnop github_pat_abcdefghijklmnopqrstuvwxyz123456 ghp_abcdefghijklmnopqrstuvwxyz123456',
  );
  for (const secret of ['token=abc', 'password:xyz', 'user:pass', 'github_pat_', 'ghp_']) {
    assert.equal(rendered.includes(secret), false);
  }
  assert.equal(rendered.includes('<redacted>'), true);
  assert.deepEqual(sanitize({ token: 'x', nested: { api_key: 'y', value: 'password=bad' } }), {
    token: '<redacted>',
    nested: { api_key: '<redacted>', value: 'password=<redacted>' },
  });
});

test('basic payload, timestamp, identifier, branch, and SHA validators fail closed', () => {
  assert.deepEqual(parseJsonObject(''), {});
  assert.deepEqual(parseJsonObject('{"a":1}'), { a: 1 });
  assert.throws(() => parseJsonObject('[]'), /JSON object/);
  assert.throws(() => parseJsonObject('{bad}'), /invalid JSON/);
  assert.equal(parseTimestamp('2026-08-27T12:00:00Z').toISOString(), NOW.toISOString());
  assert.throws(() => parseTimestamp('2026-08-27T12:00:00'), /timezone/);
  assert.equal(validateIdentifier('executor:host-1', 'worker'), 'executor:host-1');
  assert.throws(() => validateIdentifier('bad worker', 'worker'), /Invalid worker/);
  assert.equal(validateBranch('factory/run/worker', 'branch'), 'factory/run/worker');
  for (const value of [
    '',
    '/bad',
    '-bad',
    'bad/',
    'bad.',
    'bad..x',
    'bad@{x',
    'bad//x',
    'bad\\x',
  ]) {
    assert.throws(() => validateBranch(value, 'branch'), /Invalid branch/);
  }
  assert.equal(validateSha40(SHA_A.toUpperCase(), 'sha'), SHA_A);
  assert.equal(validateSha64('A'.repeat(64), 'fingerprint'), 'a'.repeat(64));
  assert.throws(() => validateSha40('bad', 'sha'), /Invalid sha/);
  assert.throws(() => validateSha64('bad', 'fingerprint'), /Invalid fingerprint/);
});

test('runtime scopes allow descendants and reject traversal or protected parents', () => {
  assert.equal(normalizeRuntimeScope('docs/worker/**'), 'docs/worker');
  assert.equal(runtimePathWithinScope('docs/worker/result.md', 'docs/worker'), true);
  assert.equal(runtimePathWithinScope('docs/other.md', 'docs/worker'), false);
  assert.equal(runtimePathWithinScope('.github/workflows/escape.yml', 'docs'), false);
  assert.equal(
    runtimeChangedFilesWithinScope(
      ['docs/worker/a.md', 'docs/worker/nested/b.md'],
      ['docs/worker'],
    ),
    true,
  );
  assert.equal(runtimeChangedFilesWithinScope([], ['docs']), false);
  for (const scope of ['', '../escape', 'docs\\escape', '.github', 'infra', 'infra/factory']) {
    assert.throws(() => normalizeRuntimeScope(scope), /Invalid runtime|protected path/);
  }
});

test('base64url markers roundtrip nested objects and require trusted JSON object shapes', () => {
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
  const arrayEncoded = Buffer.from('[]').toString('base64url');
  assert.throws(
    () => markerPayload(`<!-- FACTORY_PROVIDER_LEASE ${arrayEncoded} -->`, 'lease'),
    /JSON object/,
  );
});

test('provider health is fresh, sanitized, and selected by health then zero-first order', () => {
  const mixed = validateHealthPayload(
    {
      providers: [
        observation('antigravity', 'healthy', NOW.toISOString(), {
          reason: 'token=secret',
          details: { api_key: 'secret' },
        }),
        observation('opencode_ollama', 'degraded'),
      ],
    },
    NOW,
  );
  assert.equal(mixed[0].reason, 'token=<redacted>');
  assert.equal(mixed[0].details.api_key, '<redacted>');
  assert.equal(
    selectDurableProvider(task({ preferredProviders: ['opencode_ollama', 'antigravity'] }), mixed),
    'antigravity',
  );

  const bothHealthy = validateHealthPayload(
    {
      providers: [observation('antigravity', 'healthy'), observation('opencode_ollama', 'healthy')],
    },
    NOW,
  );
  assert.equal(
    selectDurableProvider(
      task({ preferredProviders: ['antigravity', 'opencode_ollama'] }),
      bothHealthy,
    ),
    'opencode_ollama',
  );
  assert.equal(selectDurableProvider(task({ preferredProviders: ['jules'] }), bothHealthy), null);
  assert.throws(() => validateHealthPayload({ providers: [] }, NOW), /one or two/);
  assert.throws(
    () => validateHealthPayload({ providers: [observation('unknown', 'healthy')] }, NOW),
    /Invalid durable provider/,
  );
  assert.throws(
    () => validateHealthPayload({ providers: [observation('antigravity', 'bad')] }, NOW),
    /health status/,
  );
  assert.throws(
    () =>
      validateHealthPayload(
        { providers: [observation('antigravity', 'healthy', '2026-08-27T11:49:59Z')] },
        NOW,
      ),
    /stale/,
  );
});

test('lease validation binds hashes, branches, provider, actor, and bounded TTL', () => {
  const value = factoryLease();
  assert.equal(validateLease(value), value);
  assert.equal(leaseActiveAt(value, NOW), true);
  assert.equal(leaseActiveAt(value, new Date('2026-08-27T12:25:00Z')), false);

  const cases = [
    [{ schema_version: 2 }, /schema_version/],
    [{ lease_id: 'bad lease' }, /lease_id/],
    [{ issue_number: 0 }, /issue_number/],
    [{ provider_id: 'codex' }, /provider/],
    [{ working_branch: value.integration_branch }, /distinct/],
    [{ request_sha256: 'c'.repeat(64) }, /fingerprint mismatch/],
    [{ manifest_sha256: 'd'.repeat(64) }, /fingerprint mismatch/],
    [{ actor: 'local-user' }, /github-actions/],
    [{ expires_at: '2026-08-27T11:55:30Z' }, /TTL/],
  ];
  for (const [overrides, expression] of cases) {
    assert.throws(() => validateLease({ ...value, ...overrides }), expression);
  }
});

test('only bot-authored active leases are recoverable and concurrent claims conflict', () => {
  const value = factoryLease();
  const trusted = { user: { login: 'github-actions[bot]' }, body: marker('LEASE', value) };
  const forged = { user: { login: 'user' }, body: marker('LEASE', value) };
  assert.equal(activeTrustedLease([forged], NOW), null);
  assert.equal(activeTrustedLease([trusted], NOW).lease.lease_id, 'lease-001');
  assert.equal(trustedLeaseById([trusted], 'lease-001').lease.worker_id, 'executor-01');
  assert.equal(trustedLeaseById([trusted], 'missing'), null);

  const second = factoryLease({ leaseId: 'lease-002' });
  assert.throws(
    () =>
      activeTrustedLease(
        [trusted, { user: { login: 'github-actions[bot]' }, body: marker('LEASE', second) }],
        NOW,
      ),
    /Multiple active/,
  );
});

test('heartbeat and result candidates must match the exact active lease', () => {
  const value = factoryLease();
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
    metrics: { elapsed: 12 },
  };
  const normalizedHeartbeat = validateHeartbeatCandidate({ heartbeat }, value);
  assert.equal(normalizedHeartbeat.detail, 'token=<redacted>');
  assert.throws(
    () => validateHeartbeatCandidate({ ...heartbeat, worker_id: 'other' }, value),
    /worker_id/,
  );
  assert.throws(
    () => validateHeartbeatCandidate({ ...heartbeat, metrics: { bad: 'value' } }, value),
    /finite numbers/,
  );

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
    changed_paths: ['docs/worker-a/result.md'],
    pushed: true,
    request_sha256: value.request_sha256,
    manifest_sha256: value.manifest_sha256,
    observed_at: NOW.toISOString(),
  };
  assert.equal(validateResultCandidate({ result }, value).status, 'success');
  for (const [overrides, expression] of [
    [{ lease_id: 'other' }, /lease_id/],
    [{ status: 'unknown' }, /status/],
    [{ branch: 'factory/other' }, /branch mismatch/],
    [{ remote_sha: SHA_B }, /remote SHA mismatch/],
    [{ pushed: false }, /not pushed/],
    [{ changed_paths: ['src/escape.js'] }, /outside the leased scope/],
    [{ observed_at: '2026-08-27T12:30:00Z' }, /lease window/],
  ]) {
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
