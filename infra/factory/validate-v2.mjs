import { readFileSync } from 'node:fs';
import process from 'node:process';

import { manifestFingerprint, parseFactoryRunV2 } from './contract-v2.mjs';

const path = process.argv[2];
if (!path) throw new Error('Usage: node infra/factory/validate-v2.mjs <issue-file>');

const run = parseFactoryRunV2(readFileSync(path, 'utf8'));
process.stdout.write(
  `${JSON.stringify({
    status: 'valid-v2',
    run_id: run.runId,
    target_branch: run.baseBranch,
    integration_branch: run.integrationBranch,
    max_parallel: run.maxParallel,
    task_count: run.tasks.length,
    manifest_sha256: manifestFingerprint(run),
  })}\n`,
);
