import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AUTOMATIC_PROVIDER_ORDER,
  DURABLE_PROVIDERS,
  FACTORY_LABELS,
  desiredTaskLabels,
  initialDispatch,
  providerLabel,
  selectedAutomaticProvider,
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

test('zero-first routing selects OpenCode/Ollama before Jules', () => {
  const value = task({ preferredProviders: ['jules', 'opencode_ollama'] });
  assert.deepEqual(AUTOMATIC_PROVIDER_ORDER, ['opencode_ollama', 'jules']);
  assert.deepEqual(DURABLE_PROVIDERS, ['opencode_ollama']);
  assert.equal(selectedAutomaticProvider(value), 'opencode_ollama');
  assert.deepEqual(initialDispatch(value), { provider: 'opencode_ollama', status: 'ready' });
  assert.deepEqual(desiredTaskLabels(value), [
    FACTORY_LABELS.task,
    FACTORY_LABELS.providerOpenCode,
    FACTORY_LABELS.ready,
  ]);
});

test('retired Antigravity-only task is not dispatched automatically', () => {
  const value = task({ preferredProviders: ['antigravity'] });
  assert.deepEqual(initialDispatch(value), { provider: null, status: 'unassigned' });
  assert.deepEqual(desiredTaskLabels(value), [FACTORY_LABELS.task]);
});

test('dependent automatic task waits for declared dependencies', () => {
  const value = task({
    dependsOn: ['implementation'],
    preferredProviders: ['opencode_ollama', 'jules'],
  });
  assert.deepEqual(initialDispatch(value), { provider: null, status: 'waiting' });
  assert.deepEqual(desiredTaskLabels(value), [FACTORY_LABELS.task, FACTORY_LABELS.waiting]);
  assert.deepEqual(taskLabelPlan(value).triggerLabels, []);
});

test('human-gated task stays blocked even when automatic providers are preferred', () => {
  const value = task({
    humanGates: ['production_activation'],
    preferredProviders: ['opencode_ollama', 'jules'],
  });
  assert.deepEqual(initialDispatch(value), { provider: null, status: 'human-required' });
  assert.deepEqual(desiredTaskLabels(value), [FACTORY_LABELS.task, FACTORY_LABELS.blocked]);
  assert.deepEqual(taskLabelPlan(value).triggerLabels, []);
});

test('task without an automatic provider remains unassigned', () => {
  const value = task({ preferredProviders: ['manual'] });
  assert.deepEqual(initialDispatch(value), { provider: null, status: 'unassigned' });
  assert.deepEqual(desiredTaskLabels(value), [FACTORY_LABELS.task]);
  assert.deepEqual(taskLabelPlan(value).triggerLabels, []);
});

test('provider labels are explicit and retired providers receive no label', () => {
  assert.equal(providerLabel('jules'), FACTORY_LABELS.providerJules);
  assert.equal(providerLabel('opencode_ollama'), FACTORY_LABELS.providerOpenCode);
  assert.equal(providerLabel('antigravity'), null);
  assert.equal(providerLabel('codex'), null);
  assert.equal(selectedAutomaticProvider(null), null);
});
