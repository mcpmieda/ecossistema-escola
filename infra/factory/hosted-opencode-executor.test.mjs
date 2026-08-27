import assert from 'node:assert/strict';
import test from 'node:test';

import {
  hostedWorkerId,
  isExactCreateOnlyScope,
  leasedRequestForWorktree,
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
