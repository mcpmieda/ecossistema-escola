import assert from 'node:assert/strict';
import test from 'node:test';

import { manifestMarker, parseFactoryRunV2 } from './contract-v2.mjs';
import {
  executeGateway,
  loadDurableTaskContext,
  parentIssueNumber,
} from './durable-provider-gateway.mjs';

const ORIGINAL_FETCH = globalThis.fetch;
const ORIGINAL_ENV = { ...process.env };

function response(payload, status = 200) {
  return new Response(payload == null ? '' : JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function installFetchQueue(entries) {
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (entries.length === 0) throw new Error(`Unexpected fetch: ${url}`);
    const next = entries.shift();
    if (next.assert) next.assert(String(url), options);
    return response(next.payload, next.status ?? 200);
  };
  return calls;
}

function factoryBody() {
  return `<!-- FACTORY_RUN_BEGIN -->
${JSON.stringify({
  schema_version: 1,
  run_id: 'durable-run',
  goal: 'Create durable documentation.',
  base_branch: 'main',
  max_parallel: 1,
  tasks: [
    {
      id: 'worker-a',
      title: 'Create the durable result.',
      role: 'implementation',
      depends_on: [],
      paths: ['docs/worker-a/**'],
      required_capabilities: ['reasoning', 'repo_read', 'repo_write'],
      preferred_providers: ['antigravity'],
      human_gates: [],
    },
  ],
})}
<!-- FACTORY_RUN_END -->`;
}

function taskIssue() {
  return {
    number: 101,
    title: '[Factory Task:durable-run] worker-a — Create the durable result.',
    body: [
      '<!-- factory-run:durable-run;task:worker-a -->',
      'Parent Factory Run: #100',
      'Goal: Create durable documentation.',
      'Role: `implementation`',
      'Dependencies: none',
      'Path scopes: docs/worker-a/**',
      'Required capabilities: reasoning, repo_read, repo_write',
      'Preferred providers: antigravity',
      'Human gates: none',
      'Integration branch: `factory/durable-run`',
      'Target branch: `main`',
    ].join('\n'),
    user: { login: 'github-actions[bot]' },
    labels: [{ name: 'factory:task' }, { name: 'factory:ready' }],
  };
}

function resetEnvironment() {
  globalThis.fetch = ORIGINAL_FETCH;
  process.env = { ...ORIGINAL_ENV };
}

test.afterEach(resetEnvironment);

test('parent issue extraction rejects missing or invalid ownership links', () => {
  assert.equal(parentIssueNumber({ body: 'Parent Factory Run: #100' }), 100);
  assert.throws(() => parentIssueNumber({ body: 'Parent Factory Run: #0' }), /valid parent/);
  assert.throws(() => parentIssueNumber({ body: 'no parent' }), /valid parent/);
});

test('durable task context requires bot materialization and a bot-authored immutable manifest marker', async () => {
  process.env.GITHUB_TOKEN = 'test-token';
  const parentBody = factoryBody();
  const run = parseFactoryRunV2(parentBody);
  const calls = installFetchQueue([
    {
      payload: taskIssue(),
      assert: (url) => assert.match(url, /\/repos\/owner\/repo\/issues\/101$/),
    },
    {
      payload: { number: 100, body: parentBody },
      assert: (url) => assert.match(url, /\/repos\/owner\/repo\/issues\/100$/),
    },
    {
      payload: [
        {
          user: { login: 'github-actions[bot]' },
          body: `${manifestMarker(run)}\nImmutable manifest recorded.`,
        },
      ],
      assert: (url) => assert.match(url, /\/issues\/100\/comments\?per_page=100&page=1$/),
    },
  ]);

  const context = await loadDurableTaskContext('owner', 'repo', 101);
  assert.equal(context.parentNumber, 100);
  assert.equal(context.run.runId, 'durable-run');
  assert.equal(context.task.id, 'worker-a');
  assert.deepEqual(context.task.preferredProviders, ['antigravity']);
  assert.equal(calls.length, 3);
  assert.equal(calls[0].options.headers.Authorization, 'Bearer test-token');
});

test('forged or missing parent manifest comments cannot authorize durable work', async () => {
  process.env.GITHUB_TOKEN = 'test-token';
  const parentBody = factoryBody();
  const run = parseFactoryRunV2(parentBody);
  installFetchQueue([
    { payload: taskIssue() },
    { payload: { number: 100, body: parentBody } },
    {
      payload: [
        {
          user: { login: 'attacker' },
          body: manifestMarker(run),
        },
      ],
    },
  ]);
  await assert.rejects(
    () => loadDurableTaskContext('owner', 'repo', 101),
    /no trusted immutable fingerprint marker/,
  );
});

test('gateway rejects non-owner dispatch, non-main code, and unknown operations before mutation', async () => {
  process.env.GITHUB_TOKEN = 'test-token';
  process.env.GITHUB_REPOSITORY = 'owner/repo';
  process.env.GITHUB_ACTOR = 'attacker';
  process.env.GITHUB_REF = 'refs/heads/main';
  await assert.rejects(
    () =>
      executeGateway({
        operation: 'health',
        issueNumber: 101,
        workerId: 'executor-01',
        payload: {},
        ttlSeconds: 1800,
      }),
    /repository owner/,
  );

  process.env.GITHUB_ACTOR = 'owner';
  process.env.GITHUB_REF = 'refs/heads/feature';
  await assert.rejects(
    () =>
      executeGateway({
        operation: 'health',
        issueNumber: 101,
        workerId: 'executor-01',
        payload: {},
        ttlSeconds: 1800,
      }),
    /trusted code from main/,
  );

  process.env.GITHUB_REF = 'refs/heads/main';
  await assert.rejects(
    () =>
      executeGateway({
        operation: 'unknown',
        issueNumber: 101,
        workerId: 'executor-01',
        payload: {},
        ttlSeconds: 1800,
      }),
    /Unsupported durable provider gateway operation/,
  );
  await assert.rejects(
    () =>
      executeGateway({
        operation: 'unknown',
        issueNumber: 0,
        workerId: 'executor-01',
        payload: {},
        ttlSeconds: 1800,
      }),
    /must be positive/,
  );
});
