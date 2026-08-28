import assert from 'node:assert/strict';
import test from 'node:test';

import { durableWorkerBranch } from './durable-worker-branch.mjs';

test('durable worker branch is a sibling of the integration ref', () => {
  const integration = 'factory/multi-provider-hosted-pilot-001';
  const worker = durableWorkerBranch('multi-provider-hosted-pilot-001', 'opencode-worker');

  assert.equal(worker, 'factory/multi-provider-hosted-pilot-001-opencode-worker');
  assert.notEqual(worker, integration);
  assert.equal(worker.startsWith(`${integration}/`), false);
});

test('durable worker branch remains deterministic per task', () => {
  assert.equal(
    durableWorkerBranch('run-001', 'worker-a'),
    durableWorkerBranch('run-001', 'worker-a'),
  );
  assert.notEqual(
    durableWorkerBranch('run-001', 'worker-a'),
    durableWorkerBranch('run-001', 'worker-b'),
  );
});
