import assert from 'node:assert/strict';
import test from 'node:test';

import {
  integrationMarker,
  manifestFingerprint,
  manifestMarker,
  parseFactoryRunV2,
  pathScopesOverlap,
  taskMarker,
} from './contract-v2.mjs';

function task(id = 'a', overrides = {}) {
  return {
    id,
    title: `Implement ${id.toUpperCase()}`,
    role: 'implementation',
    depends_on: [],
    paths: [`docs/${id}.md`],
    required_capabilities: ['repo_read', 'repo_write'],
    preferred_providers: ['jules'],
    human_gates: [],
    ...overrides,
  };
}

function issueBody(overrides = {}) {
  const value = {
    schema_version: 1,
    run_id: 'pilot-api-001',
    goal: 'Prove API-first orchestration.',
    base_branch: 'main',
    max_parallel: 2,
    tasks: [task()],
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

test('rejects unsafe identifiers, branches, path scopes, provider names, and parallelism', () => {
  assert.throws(() => parseFactoryRunV2(issueBody({ run_id: '../bad' })));
  assert.throws(() => parseFactoryRunV2(issueBody({ base_branch: 'main..bad' })));
  assert.throws(() => parseFactoryRunV2(issueBody({ max_parallel: 4 })));
  assert.throws(() =>
    parseFactoryRunV2(issueBody({ tasks: [task('a', { paths: ['../secret'] })] })),
  );
  assert.throws(() =>
    parseFactoryRunV2(issueBody({ tasks: [task('a', { paths: ['src/*.ts'] })] })),
  );
  assert.throws(() =>
    parseFactoryRunV2(
      issueBody({ tasks: [task('a', { preferred_providers: ['unknown-provider'] })] }),
    ),
  );
});

test('rejects reserved automation control-plane scopes but permits them behind a human gate', () => {
  assert.throws(() =>
    parseFactoryRunV2(issueBody({ tasks: [task('a', { paths: ['.github/workflows/ci.yml'] })] })),
  );
  assert.throws(() =>
    parseFactoryRunV2(issueBody({ tasks: [task('a', { paths: ['infra/factory/**'] })] })),
  );
  assert.throws(() =>
    parseFactoryRunV2(issueBody({ tasks: [task('a', { paths: ['infra/validation/**'] })] })),
  );
  assert.doesNotThrow(() =>
    parseFactoryRunV2(
      issueBody({
        tasks: [
          task('a', {
            paths: ['.github/workflows/ci.yml'],
            preferred_providers: ['manual'],
            human_gates: ['privilege_change'],
          }),
        ],
      }),
    ),
  );
});

test('requires a currently active remote provider for ungated automation', () => {
  assert.throws(() =>
    parseFactoryRunV2(issueBody({ tasks: [task('a', { preferred_providers: ['antigravity'] })] })),
  );
  assert.doesNotThrow(() =>
    parseFactoryRunV2(
      issueBody({
        tasks: [task('a', { preferred_providers: ['antigravity', 'jules'] })],
      }),
    ),
  );
});

test('rejects dependency cycles and unknown dependencies', () => {
  assert.throws(() =>
    parseFactoryRunV2(
      issueBody({
        tasks: [task('a', { depends_on: ['b'] }), task('b', { depends_on: ['a'] })],
      }),
    ),
  );
  assert.throws(() =>
    parseFactoryRunV2(issueBody({ tasks: [task('a', { depends_on: ['missing'] })] })),
  );
});

test('rejects overlapping scopes for tasks that may execute in parallel', () => {
  assert.equal(pathScopesOverlap('src/module/**', 'src/module/a.ts'), true);
  assert.equal(pathScopesOverlap('src/a.ts', 'src/b.ts'), false);
  assert.throws(() =>
    parseFactoryRunV2(
      issueBody({
        tasks: [task('a', { paths: ['src/module/**'] }), task('b', { paths: ['src/module/b.ts'] })],
      }),
    ),
  );
});

test('allows overlapping scopes when dependency order makes execution sequential', () => {
  assert.doesNotThrow(() =>
    parseFactoryRunV2(
      issueBody({
        tasks: [
          task('a', { paths: ['src/module/**'] }),
          task('b', { paths: ['src/module/b.ts'], depends_on: ['a'] }),
        ],
      }),
    ),
  );
});

test('generates deterministic non-secret ownership and immutable manifest markers', () => {
  const run = parseFactoryRunV2(issueBody());
  assert.equal(taskMarker(run.runId, 'a'), '<!-- factory-run:pilot-api-001;task:a -->');
  assert.equal(
    integrationMarker(run),
    '<!-- factory-integration-branch:factory/pilot-api-001;base:main -->',
  );
  assert.match(manifestFingerprint(run), /^[0-9a-f]{64}$/);
  assert.equal(manifestMarker(run), `<!-- factory-manifest-sha256:${manifestFingerprint(run)} -->`);
  assert.equal(manifestFingerprint(run), manifestFingerprint(parseFactoryRunV2(issueBody())));
});
