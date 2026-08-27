import assert from 'node:assert/strict';
import process from 'node:process';
import test from 'node:test';

import { removeLabel } from './github-api.mjs';

async function withMockedGithub(fetchImpl, callback) {
  const originalFetch = globalThis.fetch;
  const originalToken = process.env.GITHUB_TOKEN;
  globalThis.fetch = fetchImpl;
  process.env.GITHUB_TOKEN = 'test-token';
  try {
    await callback();
  } finally {
    globalThis.fetch = originalFetch;
    if (originalToken === undefined) delete process.env.GITHUB_TOKEN;
    else process.env.GITHUB_TOKEN = originalToken;
  }
}

test('removeLabel performs one direct DELETE without a preflight GET', async () => {
  const calls = [];
  await withMockedGithub(
    async (url, options = {}) => {
      calls.push({ url: String(url), method: options.method ?? 'GET' });
      return {
        status: 200,
        ok: true,
        async text() {
          return '[]';
        },
      };
    },
    async () => {
      await removeLabel('owner', 'repo', 123, 'factory:ready');
    },
  );

  assert.deepEqual(calls, [
    {
      url: 'https://api.github.com/repos/owner/repo/issues/123/labels/factory%3Aready',
      method: 'DELETE',
    },
  ]);
});

test('removeLabel is idempotent when GitHub reports the label is absent', async () => {
  await withMockedGithub(
    async () => ({
      status: 404,
      ok: false,
      async text() {
        return '{"message":"Label does not exist"}';
      },
    }),
    async () => {
      await assert.doesNotReject(() => removeLabel('owner', 'repo', 123, 'factory:ci'));
    },
  );
});
