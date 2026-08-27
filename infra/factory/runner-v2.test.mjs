import assert from 'node:assert/strict';
import process from 'node:process';
import test from 'node:test';

import {
  dependenciesMerged,
  findCiRun,
  isTaskProcessable,
  processCompletedSessions,
  taskFromManifest,
} from './runner-v2.mjs';

const FACTORY_ACTOR = 'github-actions[bot]';

async function withMockedApi(fetchImpl, callback) {
  const originalFetch = globalThis.fetch;
  const originalToken = process.env.GITHUB_TOKEN;
  const originalJulesKey = process.env.JULES_API_KEY;
  globalThis.fetch = fetchImpl;
  process.env.GITHUB_TOKEN = 'test-token';
  process.env.JULES_API_KEY = 'test-jules-key';
  try {
    await callback();
  } finally {
    globalThis.fetch = originalFetch;
    if (originalToken === undefined) delete process.env.GITHUB_TOKEN;
    else process.env.GITHUB_TOKEN = originalToken;
    if (originalJulesKey === undefined) delete process.env.JULES_API_KEY;
    else process.env.JULES_API_KEY = originalJulesKey;
  }
}

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

test('isTaskProcessable accepts running and ci states, rejects waiting, ready, merged, failed', () => {
  assert.equal(isTaskProcessable([{ name: 'factory:running' }]), true);
  assert.equal(isTaskProcessable(['factory:ci']), true);
  assert.equal(isTaskProcessable(['factory:waiting']), false);
  assert.equal(isTaskProcessable(['factory:ready']), false);
  assert.equal(isTaskProcessable(['factory:merged']), false);
  assert.equal(isTaskProcessable(['factory:failed']), false);
  assert.equal(isTaskProcessable(['factory:running', 'factory:merged']), false);
  assert.equal(isTaskProcessable(['factory:ci', 'factory:failed']), false);
  assert.equal(isTaskProcessable(['factory:ci', 'factory:waiting']), false);
});

test('findCiRun queries workflow_dispatch without branch param and filters by head_sha', async () => {
  let requestedUrl = '';
  await withMockedApi(
    async (url) => {
      requestedUrl = String(url);
      return {
        status: 200,
        ok: true,
        async text() {
          return JSON.stringify({
            workflow_runs: [
              { id: 101, head_sha: '1111111111111111111111111111111111111111' },
              { id: 102, head_sha: '2222222222222222222222222222222222222222' },
            ],
          });
        },
      };
    },
    async () => {
      const run = await findCiRun('owner', 'repo', '2222222222222222222222222222222222222222');
      assert.equal(run?.id, 102);
    },
  );
  assert.equal(
    requestedUrl,
    'https://api.github.com/repos/owner/repo/actions/workflows/ci.yml/runs?event=workflow_dispatch&per_page=30',
  );
  assert.doesNotMatch(requestedUrl, /branch=/);
});

test('processCompletedSessions recovers task when trusted merged evidence already exists', async () => {
  const calls = [];
  const run = {
    runId: 'run-1',
    integrationBranch: 'factory/run-1',
    baseBranch: 'main',
    tasks: [{ id: 'task-1', paths: ['src/allowed.ts'] }],
  };
  const siblings = new Map([['task-1', { issue: { number: 10 }, task: { taskId: 'task-1' } }]]);

  await withMockedApi(
    async (url, options = {}) => {
      const method = options.method ?? 'GET';
      const path = String(url).replace('https://api.github.com', '');
      calls.push({ method, path, body: options.body ? JSON.parse(options.body) : null });

      if (path === '/repos/owner/repo/issues/10') {
        return {
          status: 200,
          ok: true,
          async text() {
            return JSON.stringify({ number: 10, labels: [{ name: 'factory:running' }] });
          },
        };
      }
      if (path === '/repos/owner/repo/issues/10/comments?per_page=100&page=1') {
        return {
          status: 200,
          ok: true,
          async text() {
            return JSON.stringify([
              {
                user: { login: FACTORY_ACTOR },
                body: '<!-- factory-merged-pr:42;sha:1111111111111111111111111111111111111111 -->',
              },
            ]);
          },
        };
      }
      if (method === 'DELETE' || method === 'POST' || method === 'PATCH') {
        return {
          status: 200,
          ok: true,
          async text() {
            return JSON.stringify({});
          },
        };
      }
      throw new Error(`Unexpected request: ${method} ${path}`);
    },
    async () => {
      await processCompletedSessions('owner', 'repo', run, siblings);
    },
  );

  assert.ok(
    calls.some(
      (c) =>
        c.method === 'PATCH' &&
        c.path === '/repos/owner/repo/issues/10' &&
        c.body?.state === 'closed' &&
        c.body?.state_reason === 'completed',
    ),
  );
  assert.ok(
    calls.some(
      (c) =>
        c.method === 'POST' &&
        c.path === '/repos/owner/repo/issues/10/labels' &&
        c.body?.labels?.includes('factory:merged'),
    ),
  );
  assert.ok(!calls.some((c) => c.path.includes('/pulls/') || c.path.includes('jules')));
});

test('processCompletedSessions recovers already-merged PR with valid SHA-40 merge_commit_sha', async () => {
  const calls = [];
  const run = {
    runId: 'run-1',
    integrationBranch: 'factory/run-1',
    baseBranch: 'main',
    tasks: [{ id: 'task-1', paths: ['src/allowed.ts'] }],
  };
  const siblings = new Map([['task-1', { issue: { number: 10 }, task: { taskId: 'task-1' } }]]);
  const headSha = '2222222222222222222222222222222222222222';
  const mergeSha = '3333333333333333333333333333333333333333';

  await withMockedApi(
    async (url, options = {}) => {
      const strUrl = String(url);
      const method = options.method ?? 'GET';
      const body = options.body ? JSON.parse(options.body) : null;
      calls.push({ method, url: strUrl, body });

      if (strUrl === 'https://api.github.com/repos/owner/repo/issues/10') {
        return {
          status: 200,
          ok: true,
          async text() {
            return JSON.stringify({ number: 10, labels: [{ name: 'factory:ci' }] });
          },
        };
      }
      if (
        strUrl === 'https://api.github.com/repos/owner/repo/issues/10/comments?per_page=100&page=1'
      ) {
        return {
          status: 200,
          ok: true,
          async text() {
            return JSON.stringify([
              {
                user: { login: FACTORY_ACTOR },
                body: '<!-- factory-jules-session:sessions/s1 -->',
              },
            ]);
          },
        };
      }
      if (strUrl === 'https://jules.googleapis.com/v1alpha/sessions/s1') {
        return {
          status: 200,
          ok: true,
          async text() {
            return JSON.stringify({
              state: 'COMPLETED',
              outputs: [{ pullRequest: { url: 'https://github.com/owner/repo/pull/42' } }],
            });
          },
        };
      }
      if (strUrl === 'https://api.github.com/repos/owner/repo/pulls/42') {
        return {
          status: 200,
          ok: true,
          async text() {
            return JSON.stringify({
              number: 42,
              merged: true,
              merge_commit_sha: mergeSha,
              base: { ref: 'factory/run-1' },
              head: { sha: headSha },
            });
          },
        };
      }
      if (strUrl === 'https://api.github.com/repos/owner/repo/pulls/42/files?per_page=100&page=1') {
        return {
          status: 200,
          ok: true,
          async text() {
            return JSON.stringify([{ filename: 'src/allowed.ts' }]);
          },
        };
      }
      if (
        strUrl.startsWith('https://api.github.com/repos/owner/repo/actions/workflows/ci.yml/runs')
      ) {
        return {
          status: 200,
          ok: true,
          async text() {
            return JSON.stringify({
              workflow_runs: [
                { id: 99, status: 'completed', conclusion: 'success', head_sha: headSha },
              ],
            });
          },
        };
      }
      if (method === 'DELETE' || method === 'POST' || method === 'PATCH') {
        return {
          status: 200,
          ok: true,
          async text() {
            return JSON.stringify({});
          },
        };
      }
      throw new Error(`Unexpected request: ${method} ${strUrl}`);
    },
    async () => {
      await processCompletedSessions('owner', 'repo', run, siblings);
    },
  );

  assert.ok(
    calls.some(
      (c) =>
        c.method === 'POST' &&
        c.url === 'https://api.github.com/repos/owner/repo/issues/10/comments' &&
        c.body?.body?.includes(`<!-- factory-merged-pr:42;sha:${mergeSha} -->`),
    ),
  );
  assert.ok(
    calls.some(
      (c) =>
        c.method === 'PATCH' &&
        c.url === 'https://api.github.com/repos/owner/repo/issues/10' &&
        c.body?.state === 'closed',
    ),
  );
  assert.ok(!calls.some((c) => c.method === 'PUT' && c.url.includes('/merge')));
});

test('processCompletedSessions executes normal flow for open PR', async () => {
  const calls = [];
  const run = {
    runId: 'run-1',
    integrationBranch: 'factory/run-1',
    baseBranch: 'main',
    tasks: [{ id: 'task-1', paths: ['src/allowed.ts'] }],
  };
  const siblings = new Map([['task-1', { issue: { number: 10 }, task: { taskId: 'task-1' } }]]);
  const headSha = '2222222222222222222222222222222222222222';
  const mergeSha = '4444444444444444444444444444444444444444';
  const baseSha = '1111111111111111111111111111111111111111';

  await withMockedApi(
    async (url, options = {}) => {
      const strUrl = String(url);
      const method = options.method ?? 'GET';
      const body = options.body ? JSON.parse(options.body) : null;
      calls.push({ method, url: strUrl, body });

      if (strUrl === 'https://api.github.com/repos/owner/repo/issues/10') {
        return {
          status: 200,
          ok: true,
          async text() {
            return JSON.stringify({ number: 10, labels: [{ name: 'factory:running' }] });
          },
        };
      }
      if (
        strUrl === 'https://api.github.com/repos/owner/repo/issues/10/comments?per_page=100&page=1'
      ) {
        return {
          status: 200,
          ok: true,
          async text() {
            return JSON.stringify([
              {
                user: { login: FACTORY_ACTOR },
                body: '<!-- factory-jules-session:sessions/s1 -->',
              },
            ]);
          },
        };
      }
      if (strUrl === 'https://jules.googleapis.com/v1alpha/sessions/s1') {
        return {
          status: 200,
          ok: true,
          async text() {
            return JSON.stringify({
              state: 'COMPLETED',
              outputs: [{ pullRequest: { url: 'https://github.com/owner/repo/pull/42' } }],
            });
          },
        };
      }
      if (strUrl === 'https://api.github.com/repos/owner/repo/pulls/42') {
        return {
          status: 200,
          ok: true,
          async text() {
            return JSON.stringify({
              number: 42,
              merged: false,
              base: { ref: 'factory/run-1', sha: baseSha },
              head: { ref: 'worker-branch', sha: headSha },
            });
          },
        };
      }
      if (strUrl === 'https://api.github.com/repos/owner/repo/pulls/42/files?per_page=100&page=1') {
        return {
          status: 200,
          ok: true,
          async text() {
            return JSON.stringify([{ filename: 'src/allowed.ts' }]);
          },
        };
      }
      if (strUrl === 'https://api.github.com/repos/owner/repo/branches/factory%2Frun-1') {
        return {
          status: 200,
          ok: true,
          async text() {
            return JSON.stringify({ commit: { sha: baseSha } });
          },
        };
      }
      if (
        strUrl.startsWith('https://api.github.com/repos/owner/repo/actions/workflows/ci.yml/runs')
      ) {
        return {
          status: 200,
          ok: true,
          async text() {
            return JSON.stringify({
              workflow_runs: [
                { id: 99, status: 'completed', conclusion: 'success', head_sha: headSha },
              ],
            });
          },
        };
      }
      if (strUrl === 'https://api.github.com/repos/owner/repo/pulls/42/merge') {
        return {
          status: 200,
          ok: true,
          async text() {
            return JSON.stringify({ merged: true, sha: mergeSha });
          },
        };
      }
      if (method === 'DELETE' || method === 'POST' || method === 'PATCH') {
        return {
          status: 200,
          ok: true,
          async text() {
            return JSON.stringify({});
          },
        };
      }
      throw new Error(`Unexpected request: ${method} ${strUrl}`);
    },
    async () => {
      await processCompletedSessions('owner', 'repo', run, siblings);
    },
  );

  assert.ok(
    calls.some(
      (c) =>
        c.method === 'PUT' &&
        c.url === 'https://api.github.com/repos/owner/repo/pulls/42/merge' &&
        c.body?.merge_method === 'squash',
    ),
  );
  assert.ok(
    calls.some(
      (c) =>
        c.method === 'POST' &&
        c.url === 'https://api.github.com/repos/owner/repo/issues/10/comments' &&
        c.body?.body?.includes(`<!-- factory-merged-pr:42;sha:${mergeSha} -->`),
    ),
  );
  assert.ok(
    calls.some(
      (c) =>
        c.method === 'PATCH' &&
        c.url === 'https://api.github.com/repos/owner/repo/issues/10' &&
        c.body?.state === 'closed',
    ),
  );
});

test('processCompletedSessions fails task if merged PR lacks a valid SHA-40 merge_commit_sha', async () => {
  const run = {
    runId: 'run-1',
    integrationBranch: 'factory/run-1',
    baseBranch: 'main',
    tasks: [{ id: 'task-1', paths: ['src/allowed.ts'] }],
  };
  const siblings = new Map([['task-1', { issue: { number: 10 }, task: { taskId: 'task-1' } }]]);

  await withMockedApi(
    async (url, options = {}) => {
      const strUrl = String(url);
      const method = options.method ?? 'GET';

      if (strUrl === 'https://api.github.com/repos/owner/repo/issues/10') {
        return {
          status: 200,
          ok: true,
          async text() {
            return JSON.stringify({ number: 10, labels: [{ name: 'factory:running' }] });
          },
        };
      }
      if (
        strUrl === 'https://api.github.com/repos/owner/repo/issues/10/comments?per_page=100&page=1'
      ) {
        return {
          status: 200,
          ok: true,
          async text() {
            return JSON.stringify([
              {
                user: { login: FACTORY_ACTOR },
                body: '<!-- factory-jules-session:sessions/s1 -->',
              },
            ]);
          },
        };
      }
      if (strUrl === 'https://jules.googleapis.com/v1alpha/sessions/s1') {
        return {
          status: 200,
          ok: true,
          async text() {
            return JSON.stringify({
              state: 'COMPLETED',
              outputs: [{ pullRequest: { url: 'https://github.com/owner/repo/pull/42' } }],
            });
          },
        };
      }
      if (strUrl === 'https://api.github.com/repos/owner/repo/pulls/42') {
        return {
          status: 200,
          ok: true,
          async text() {
            return JSON.stringify({
              number: 42,
              merged: true,
              merge_commit_sha: 'invalid-sha',
              base: { ref: 'factory/run-1' },
              head: { sha: '2222222222222222222222222222222222222222' },
            });
          },
        };
      }
      if (strUrl === 'https://api.github.com/repos/owner/repo/pulls/42/files?per_page=100&page=1') {
        return {
          status: 200,
          ok: true,
          async text() {
            return JSON.stringify([{ filename: 'src/allowed.ts' }]);
          },
        };
      }
      if (method === 'DELETE' || method === 'POST' || method === 'PATCH') {
        return {
          status: 200,
          ok: true,
          async text() {
            return JSON.stringify({});
          },
        };
      }
      throw new Error(`Unexpected request: ${method} ${strUrl}`);
    },
    async () => {
      await assert.rejects(
        () => processCompletedSessions('owner', 'repo', run, siblings),
        /lacks a valid SHA-40 merge commit SHA/,
      );
    },
  );
});
