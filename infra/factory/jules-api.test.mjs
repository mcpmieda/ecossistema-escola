import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildJulesPrompt,
  julesSessionMarker,
  julesSessionNameFromComments,
  pullRequestUrlsFromSession,
  sourceHasBranch,
} from './jules-api.mjs';

const FACTORY_ACTOR = 'github-actions[bot]';

test('stores and recovers a Jules session only through a trusted Factory marker', () => {
  const marker = julesSessionMarker('sessions/12345');
  assert.equal(marker, '<!-- factory-jules-session:sessions/12345 -->');
  assert.equal(
    julesSessionNameFromComments([
      { user: { login: FACTORY_ACTOR }, body: `audit\n${marker}\nstarted` },
    ]),
    'sessions/12345',
  );
  assert.equal(
    julesSessionNameFromComments([{ user: { login: 'someone' }, body: marker }]),
    null,
  );
});

test('ignores malformed Jules session markers', () => {
  assert.equal(
    julesSessionNameFromComments([
      { user: { login: FACTORY_ACTOR }, body: '<!-- factory-jules-session:bad -->' },
    ]),
    null,
  );
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

test('recognizes integration branch visibility in a Jules GitHub source', () => {
  const source = {
    githubRepo: {
      defaultBranch: { displayName: 'main' },
      branches: [{ displayName: 'main' }, { displayName: 'factory/run-1' }],
    },
  };
  assert.equal(sourceHasBranch(source, 'factory/run-1'), true);
  assert.equal(sourceHasBranch(source, 'main'), true);
  assert.equal(sourceHasBranch(source, 'factory/missing'), false);
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
