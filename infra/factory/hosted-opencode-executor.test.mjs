import assert from 'node:assert/strict';
import test from 'node:test';

import {
  hostedWorkerId,
  isExactCreateOnlyScope,
  leasedRequestForWorktree,
  normalizeProbeHealth,
} from './hosted-opencode-executor.mjs';

test('hosted OpenCode accepts only one exact file scope', () => {
  assert.equal(isExactCreateOnlyScope(['docs/pilot/RESULT.md']), true);
  assert.equal(isExactCreateOnlyScope(['docs/pilot/**']), false);
  assert.equal(isExactCreateOnlyScope(['docs/pilot']), false);
  assert.equal(isExactCreateOnlyScope(['docs/a.md', 'docs/b.md']), false);
  assert.equal(isExactCreateOnlyScope(['../outside.md']), false);
  assert.equal(isExactCreateOnlyScope(['docs\\outside.md']), false);
});

test('hosted request adds only local worktree to the leased portable request', () => {
  const portable = {
    schema_version: 1,
    run_id: 'hosted-pilot',
    task_id: 'worker-a',
    repository: 'owner/repo',
    integration_branch: 'factory/hosted-pilot',
    target_branch: 'main',
    working_branch: 'factory/hosted-pilot/worker-a',
    paths: ['docs/pilot/RESULT.md'],
    instruction: 'Create the evidence file.',
    allowed_commands: [],
    timeout_seconds: 1800,
    remote: 'origin',
  };
  const request = leasedRequestForWorktree({ request: portable }, '/tmp/worktree');
  assert.deepEqual(request, { ...portable, worktree: '/tmp/worktree' });
  assert.deepEqual(portable.paths, ['docs/pilot/RESULT.md']);
  assert.equal('worktree' in portable, false);
});

test('hosted worker id is stable and bounded', () => {
  assert.equal(hostedWorkerId('1234', '2'), 'github-hosted-opencode-1234-2');
});

test('hosted probe accepts provider_worker canonical provider field and normalizes it', () => {
  const health = normalizeProbeHealth({
    provider: 'opencode_ollama',
    status: 'healthy',
    reason: 'available',
    details: { model: 'ollama/qwen3:0.6b' },
  });
  assert.equal(health.provider_id, 'opencode_ollama');
  assert.equal(health.status, 'healthy');
  assert.equal(health.provider, 'opencode_ollama');
});

test('hosted probe remains fail-closed for wrong provider or unhealthy status', () => {
  assert.throws(
    () => normalizeProbeHealth({ provider: 'antigravity', status: 'healthy' }),
    /did not pass the required healthy probe/,
  );
  assert.throws(
    () => normalizeProbeHealth({ provider: 'opencode_ollama', status: 'degraded' }),
    /did not pass the required healthy probe/,
  );
});
