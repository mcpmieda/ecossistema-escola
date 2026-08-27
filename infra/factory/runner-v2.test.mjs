import assert from 'node:assert/strict';
import test from 'node:test';

import { FACTORY_LABELS } from './dispatch-policy.mjs';
import {
  dependenciesMerged,
  isProcessableTaskState,
  selectMandatoryCiRun,
  shouldDispatchMandatoryCi,
  taskFromManifest,
  workerRecoveryDecision,
} from './runner-v2.mjs';

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

test('mandatory CI selection requires workflow_dispatch and the exact worker head SHA', () => {
  const expectedSha = 'a'.repeat(40);
  const otherSha = 'b'.repeat(40);
  const pullRequestRun = {
    id: 1,
    event: 'pull_request',
    head_sha: expectedSha,
    status: 'completed',
    conclusion: 'success',
  };
  const wrongShaRun = {
    id: 2,
    event: 'workflow_dispatch',
    head_sha: otherSha,
    status: 'completed',
    conclusion: 'success',
  };
  const expectedRun = {
    id: 3,
    event: 'workflow_dispatch',
    head_sha: expectedSha,
    status: 'completed',
    conclusion: 'success',
  };

  assert.equal(
    selectMandatoryCiRun([pullRequestRun, wrongShaRun, expectedRun], expectedSha),
    expectedRun,
  );
  assert.equal(selectMandatoryCiRun([pullRequestRun, wrongShaRun], expectedSha), null);
});

test('CI reentry does not dispatch again when a mandatory run already exists for the exact SHA', () => {
  const sha = 'c'.repeat(40);
  const existing = selectMandatoryCiRun(
    [{ id: 7, event: 'workflow_dispatch', head_sha: sha, status: 'in_progress' }],
    sha,
  );

  assert.equal(shouldDispatchMandatoryCi(existing), false);
  assert.equal(shouldDispatchMandatoryCi(null), true);
});

test('worker recovery distinguishes unmerged, merged-unrecorded, and trusted-recorded states', () => {
  const prNumber = 85;
  const mergeSha = 'd'.repeat(40);

  assert.deepEqual(
    workerRecoveryDecision({
      mergedEvidence: null,
      pr: { merged: false, merge_commit_sha: null },
      prNumber,
    }),
    { kind: 'continue', mergeSha: null },
  );

  assert.deepEqual(
    workerRecoveryDecision({
      mergedEvidence: null,
      pr: { merged: true, merge_commit_sha: mergeSha },
      prNumber,
    }),
    { kind: 'unrecorded', mergeSha },
  );

  assert.deepEqual(
    workerRecoveryDecision({
      mergedEvidence: { prNumber, sha: mergeSha },
      pr: { merged: true, merge_commit_sha: mergeSha },
      prNumber,
    }),
    { kind: 'recorded', mergeSha },
  );
});

test('trusted merged evidence fails closed when it disagrees with GitHub state', () => {
  const prNumber = 85;
  const mergeSha = 'e'.repeat(40);
  const otherSha = 'f'.repeat(40);

  assert.throws(
    () =>
      workerRecoveryDecision({
        mergedEvidence: { prNumber: 84, sha: mergeSha },
        pr: { merged: true, merge_commit_sha: mergeSha },
        prNumber,
      }),
    /references PR #84, expected #85/,
  );

  assert.throws(
    () =>
      workerRecoveryDecision({
        mergedEvidence: { prNumber, sha: mergeSha },
        pr: { merged: false, merge_commit_sha: mergeSha },
        prNumber,
      }),
    /reports it unmerged/,
  );

  assert.throws(
    () =>
      workerRecoveryDecision({
        mergedEvidence: { prNumber, sha: otherSha },
        pr: { merged: true, merge_commit_sha: mergeSha },
        prNumber,
      }),
    /does not match PR #85 merge commit/,
  );
});
