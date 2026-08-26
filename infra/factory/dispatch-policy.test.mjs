import assert from 'node:assert/strict';
import test from 'node:test';

import {
  FACTORY_LABELS,
  desiredTaskLabels,
  initialDispatch,
  taskLabelPlan,
} from './dispatch-policy.mjs';

function task(overrides = {}) {
  return {
    id: 'task',
    dependsOn: [],
    preferredProviders: ['jules'],
    humanGates: [],
    ...overrides,
  };
}

test('root Jules task is queued for the API runner without external label trigger', () => {
  assert.deepEqual(initialDispatch(task()), { provider: 'jules', status: 'ready' });
  assert.deepEqual(desiredTaskLabels(task()), [
    FACTORY_LABELS.task,
    FACTORY_LABELS.providerJules,
    FACTORY_LABELS.ready,
  ]);
  assert.deepEqual(taskLabelPlan(task()), {
    creationLabels: [FACTORY_LABELS.task, FACTORY_LABELS.providerJules, FACTORY_LABELS.ready],
    triggerLabels: [],
    desiredLabels: [FACTORY_LABELS.task, FACTORY_LABELS.providerJules, FACTORY_LABELS.ready],
  });
});

test('dependent Jules task waits for declared dependencies', () => {
  const value = task({ dependsOn: ['implementation'] });
  assert.deepEqual(initialDispatch(value), { provider: null, status: 'waiting' });
  assert.deepEqual(desiredTaskLabels(value), [FACTORY_LABELS.task, FACTORY_LABELS.waiting]);
  assert.deepEqual(taskLabelPlan(value).triggerLabels, []);
});

test('human-gated task stays blocked even when Jules is preferred', () => {
  const value = task({ humanGates: ['production_activation'] });
  assert.deepEqual(initialDispatch(value), { provider: null, status: 'human-required' });
  assert.deepEqual(desiredTaskLabels(value), [FACTORY_LABELS.task, FACTORY_LABELS.blocked]);
  assert.deepEqual(taskLabelPlan(value).triggerLabels, []);
});

test('task without explicit Jules preference remains unassigned', () => {
  const value = task({ preferredProviders: ['antigravity'] });
  assert.deepEqual(initialDispatch(value), { provider: null, status: 'unassigned' });
  assert.deepEqual(desiredTaskLabels(value), [FACTORY_LABELS.task]);
  assert.deepEqual(taskLabelPlan(value).triggerLabels, []);
});
