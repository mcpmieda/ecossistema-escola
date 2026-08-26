import assert from 'node:assert/strict';
import test from 'node:test';

import { integrationMarker, parseFactoryRunV2, taskMarker } from './contract-v2.mjs';

function issueBody(overrides = {}) {
  const value = {
    schema_version: 1,
    run_id: 'pilot-api-001',
    goal: 'Prove API-first orchestration.',
    base_branch: 'main',
    max_parallel: 2,
    tasks: [
      {
        id: 'a',
        title: 'Implement A',
        role: 'implementation',
        depends_on: [],
        paths: ['docs/a.md'],
        required_capabilities: ['repo_read', 'repo_write'],
        preferred_providers: ['jules'],
        human_gates: [],
      },
    ],
    ...overrides,
  };
  return `<!-- FACTORY_RUN_BEGIN -->\n${JSON.stringify(value)}\n<!-- FACTORY_RUN_END -->`;
}

test('derives an isolated integration branch and bounded parallelism', () => {
  const run = parseFactoryRunV2(issueBody());
  assert.equal(run.runId, 'pilot-api-001');
  assert.equal(run.baseBranch, 'main');
  assert.equal(run.integrationBranch, 'factory/pilot-api-001');
  assert.equal(run.maxParallel, 2);
});

test('defaults to main and at most three parallel workers', () => {
  const run = parseFactoryRunV2(issueBody({ base_branch: undefined, max_parallel: undefined }));
  assert.equal(run.baseBranch, 'main');
  assert.equal(run.maxParallel, 3);
});

test('rejects unsafe run ids, branches, provider names, and excessive parallelism', () => {
  assert.throws(() => parseFactoryRunV2(issueBody({ run_id: '../bad' })));
  assert.throws(() => parseFactoryRunV2(issueBody({ base_branch: 'main..bad' })));
  assert.throws(() => parseFactoryRunV2(issueBody({ max_parallel: 4 })));
  assert.throws(() =>
    parseFactoryRunV2(
      issueBody({
        tasks: [
          {
            id: 'a',
            title: 'A',
            preferred_providers: ['unknown-provider'],
          },
        ],
      }),
    ),
  );
});

test('rejects dependency cycles and unknown dependencies', () => {
  assert.throws(() =>
    parseFactoryRunV2(
      issueBody({
        tasks: [
          { id: 'a', title: 'A', depends_on: ['b'] },
          { id: 'b', title: 'B', depends_on: ['a'] },
        ],
      }),
    ),
  );
  assert.throws(() =>
    parseFactoryRunV2(issueBody({ tasks: [{ id: 'a', title: 'A', depends_on: ['missing'] }] })),
  );
});

test('generates deterministic non-secret ownership markers', () => {
  const run = parseFactoryRunV2(issueBody());
  assert.equal(taskMarker(run.runId, 'a'), '<!-- factory-run:pilot-api-001;task:a -->');
  assert.equal(
    integrationMarker(run),
    '<!-- factory-integration-branch:factory/pilot-api-001;base:main -->',
  );
});
