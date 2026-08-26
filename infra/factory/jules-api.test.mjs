import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildJulesPrompt,
  julesSessionMarker,
  julesSessionNameFromComments,
  pullRequestUrlsFromSession,
} from './jules-api.mjs';

test('stores and recovers a Jules session through a non-secret issue marker', () => {
  const marker = julesSessionMarker('sessions/12345');
  assert.equal(marker, '<!-- factory-jules-session:sessions/12345 -->');
  assert.equal(
    julesSessionNameFromComments([{ body: `audit\n${marker}\nstarted` }]),
    'sessions/12345',
  );
});

test('ignores malformed Jules session markers', () => {
  assert.equal(julesSessionNameFromComments([{ body: '<!-- factory-jules-session:bad -->' }]), null);
  assert.throws(() => julesSessionMarker('bad'));
});

test('extracts unique GitHub pull request URLs from session outputs', () => {
  assert.deepEqual(
    pullRequestUrlsFromSession({
      outputs: [
        { pullRequest: { url: 'https://github.com/acme/repo/pull/10' } },
        { pullRequest: { url: 'https://github.com/acme/repo/pull/10' } },
        { file: { url: 'https://example.test/file' } },
      ],
    }),
    ['https://github.com/acme/repo/pull/10'],
  );
});

test('prompt hard-bounds Jules to the declared task scope and integration branch', () => {
  const prompt = buildJulesPrompt({
    runId: 'run-1',
    taskId: 'task-a',
    issueNumber: 42,
    goal: 'Implement the feature',
    title: 'Edit the scoped module',
    paths: ['src/a.ts'],
    integrationBranch: 'factory/run-1',
  });
  assert.match(prompt, /src\/a\.ts/);
  assert.match(prompt, /factory\/run-1/);
  assert.match(prompt, /Do not merge the pull request yourself/);
  assert.match(prompt, /Do not enable Banco de Notas synchronization/);
});
