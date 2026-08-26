import assert from 'node:assert/strict';
import test from 'node:test';

import {
  TRUSTED_FACTORY_LOGIN,
  TRUSTED_JULES_LOGIN,
  changedFilesWithinDeclaredScope,
  mergedPrEvidenceFromComments,
  mergedPrMarker,
  parseMaterializedTask,
  sameRepositoryPrNumberFromUrl,
  sameRepositoryPrNumbers,
  shouldReleaseTask,
} from './reconciliation-policy.mjs';

function issue(overrides = {}) {
  return {
    user: { login: TRUSTED_FACTORY_LOGIN },
    body:
      '<!-- factory-run:pilot;task:verify -->\n' +
      'Goal: Prove the factory\n' +
      'Role: `verification`\n' +
      'Dependencies: pilot-a, pilot-b\n' +
      'Path scopes: docs/factory-pilot/JULES_WORKER_VERIFICATION.md\n' +
      'Required capabilities: repo_read, repo_write, review\n' +
      'Preferred providers: jules\n' +
      'Human gates: none\n' +
      'Integration branch: `factory/pilot`\n' +
      'Target branch: `main`\n',
    ...overrides,
  };
}

test('parses only GitHub Actions materialized task issues', () => {
  assert.deepEqual(parseMaterializedTask(issue()), {
    runId: 'pilot',
    taskId: 'verify',
    goal: 'Prove the factory',
    role: 'verification',
    dependencies: ['pilot-a', 'pilot-b'],
    paths: ['docs/factory-pilot/JULES_WORKER_VERIFICATION.md'],
    requiredCapabilities: ['repo_read', 'repo_write', 'review'],
    preferredProviders: ['jules'],
    humanGates: [],
    integrationBranch: 'factory/pilot',
    targetBranch: 'main',
  });
  assert.equal(parseMaterializedTask(issue({ user: { login: 'someone' } })), null);
});

test('accepts PR links only from trusted Jules bot comments and same repo', () => {
  const comments = [
    {
      user: { login: TRUSTED_JULES_LOGIN },
      body: 'Done: https://github.com/mcpmieda/ecossistema-escola/pull/123',
    },
    {
      user: { login: 'someone' },
      body: 'https://github.com/mcpmieda/ecossistema-escola/pull/999',
    },
    {
      user: { login: TRUSTED_JULES_LOGIN },
      body: 'https://github.com/other/repo/pull/77',
    },
  ];
  assert.deepEqual(sameRepositoryPrNumbers(comments, 'mcpmieda', 'ecossistema-escola'), [123]);
  assert.equal(
    sameRepositoryPrNumberFromUrl(
      'https://github.com/mcpmieda/ecossistema-escola/pull/123',
      'mcpmieda',
      'ecossistema-escola',
    ),
    123,
  );
  assert.equal(
    sameRepositoryPrNumberFromUrl(
      'https://github.com/other/repo/pull/123',
      'mcpmieda',
      'ecossistema-escola',
    ),
    null,
  );
});

test('stores merged PR evidence only from the trusted Factory actor', () => {
  const marker = mergedPrMarker(123, 'a'.repeat(40));
  assert.equal(mergedPrEvidenceFromComments([{ user: { login: 'someone' }, body: marker }]), null);
  assert.deepEqual(
    mergedPrEvidenceFromComments([{ user: { login: TRUSTED_FACTORY_LOGIN }, body: marker }]),
    {
      prNumber: 123,
      sha: 'a'.repeat(40),
    },
  );
});

test('requires every changed file to stay inside declared scope', () => {
  assert.equal(
    changedFilesWithinDeclaredScope(
      ['docs/factory-pilot/JULES_WORKER_A.md'],
      ['docs/factory-pilot/JULES_WORKER_A.md'],
    ),
    true,
  );
  assert.equal(
    changedFilesWithinDeclaredScope(
      ['docs/factory-pilot/JULES_WORKER_A.md', 'src/index.ts'],
      ['docs/factory-pilot/JULES_WORKER_A.md'],
    ),
    false,
  );
  assert.equal(
    changedFilesWithinDeclaredScope(['docs/factory-pilot/a.md'], ['docs/factory-pilot/**']),
    true,
  );
});

test('releases dependent task only when all declared dependencies are ready', () => {
  const task = parseMaterializedTask(issue());
  const evidence = new Map([
    ['pilot-a', { ready: true }],
    ['pilot-b', { ready: true }],
  ]);
  assert.equal(shouldReleaseTask(task, evidence), true);
  evidence.set('pilot-b', { ready: false });
  assert.equal(shouldReleaseTask(task, evidence), false);
});
