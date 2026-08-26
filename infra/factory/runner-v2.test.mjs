import assert from 'node:assert/strict';
import test from 'node:test';

import { dependenciesMerged, taskFromManifest } from './runner-v2.mjs';

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