import { copyFile, cp, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve, sep } from 'node:path';

const output = 'node_modules/.cache/student-portal-edge';
const cache = await realpath('node_modules/.cache');
if (resolve(output) !== `${cache}${sep}student-portal-edge`) throw new Error('Unexpected build output path');
await rm(resolve(output), { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp('node_modules/.cache/student-portal-ui', output, { recursive: true });
execFileSync(
  process.execPath,
  [
    'node_modules/wrangler/bin/wrangler.js',
    'pages',
    'functions',
    'build',
    'workers/student-portal/edge',
    '--outdir',
    `${output}-bundle`,
    '--build-output-directory',
    'workers/student-portal/edge-assets',
    '--compatibility-date',
    '2026-09-11',
    '--compatibility-flags',
    'nodejs_compat',
  ],
  { stdio: 'inherit' },
);
const config = JSON.parse(await readFile('wrangler.student-portal-edge.jsonc', 'utf8'));
await copyFile(`${output}-bundle/index.js`, `${output}/_worker.js`);
delete config.$schema;
await writeFile(`${output}/wrangler.jsonc`, `${JSON.stringify(config, null, 2)}\n`);
await writeFile(
  `${output}/_routes.json`,
  JSON.stringify({ version: 1, include: ['/*'], exclude: [] }),
);
