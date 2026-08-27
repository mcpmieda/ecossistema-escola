import assert from 'node:assert/strict';
import test from 'node:test';

import { FACTORY_LABELS } from './dispatch-policy.mjs';
import { dependenciesMerged, isProcessableTaskState, taskFromManifest } from './runner-v2.mjs';

test('dependency readiness uses immutable manifest dependsOn shape', () => {
  const task = { id: 'verify', dependsOn: ['a', 'b'] };
  const siblings = new Map([
    ['a', {}],
    ['b', {}],
  ]);
  const merged = new Map([
    ['a', { sha: 'a' }],
    ['b', { sha: 'b' }],
  ]);

  assert.equal(dependenciesMerged(task, siblings, merged), true);
  merged.delete('b');
  assert.equal(dependenciesMerged(task, siblings, merged), false);
});

test('runtime task definition comes only from immutable parent manifest', () => {
  const run = {
    tasks: [
      {
        id: 'a',
        paths: ['src/allowed.ts'],
        preferredProviders: ['jules'],
        humanGates: [],
        dependsOn: [],
      },
    ],
  };

  const task = taskFromManifest(run, 'a');
  assert.deepEqual(task.paths, ['src/allowed.ts']);
  assert.throws(() => taskFromManifest(run, 'forged-task'), /immutable parent manifest/);
});

test('running and ci are processable task states while waiting, ready, merged, failed are not', () => {
  assert.equal(isProcessableTaskState([FACTORY_LABELS.running]), true);
  assert.equal(isProcessableTaskState([FACTORY_LABELS.ci]), true);
  assert.equal(isProcessableTaskState([{ name: FACTORY_LABELS.running }]), true);
  assert.equal(isProcessableTaskState([{ name: FACTORY_LABELS.ci }]), true);

  assert.equal(isProcessableTaskState([FACTORY_LABELS.waiting]), false);
  assert.equal(isProcessableTaskState([FACTORY_LABELS.ready]), false);
  assert.equal(isProcessableTaskState([FACTORY_LABELS.merged]), false);
  assert.equal(isProcessableTaskState([FACTORY_LABELS.failed]), false);
  assert.equal(isProcessableTaskState([]), false);
});
