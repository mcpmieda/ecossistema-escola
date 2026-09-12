import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawn, execFileSync } from 'node:child_process';

const cli = resolve('node_modules/wrangler/bin/wrangler.js');
const manifest = resolve('node_modules/.cache/portal-runtime-proof.json');
async function cleanup() {
  const state = JSON.parse(await readFile(manifest, 'utf8'));
  if (state.cleaned) return;
  if (
    !/^[a-f0-9]{32}$/.test(state.runId) ||
    state.name !== `student-portal-proof-${state.runId.slice(0, 12)}`
  )
    throw new Error('invalid-proof-cleanup');
  const configPath = resolve('node_modules/.cache', state.name, 'wrangler.jsonc');
  execFileSync(process.execPath, [cli, 'delete', state.name, '--config', configPath], {
    stdio: 'inherit',
    timeout: 120_000,
  });
  await writeFile(manifest, JSON.stringify({ ...state, cleaned: true }));
}
if (process.argv.includes('--cleanup')) {
  await cleanup().catch((error) => {
    if (error.code !== 'ENOENT') throw error;
  });
  process.exit(0);
}
const runId = randomBytes(16).toString('hex');
const name = `student-portal-proof-${runId.slice(0, 12)}`;
const folder = resolve('node_modules/.cache', name);
const configPath = resolve(folder, 'wrangler.jsonc');
const config = JSON.parse(await readFile('wrangler.student-portal.jsonc', 'utf8'));
await mkdir(folder, { recursive: true });
await writeFile(
  configPath,
  JSON.stringify({
    name,
    main: resolve('workers/student-portal/runtime-proof.ts'),
    compatibility_date: config.compatibility_date,
    compatibility_flags: config.compatibility_flags,
    workers_dev: false,
    preview_urls: false,
    send_metrics: false,
    limits: { cpu_ms: 1000 },
    hyperdrive: config.env.production.hyperdrive,
    vars: { PROOF_RUN_ID: runId, PROOF_DEADLINE: String(Date.now() + 18 * 60_000) },
    triggers: { crons: ['* * * * *'] },
  }),
);
await writeFile(manifest, JSON.stringify({ name, runId, cleaned: false }));
let tail;
let timer;
try {
  execFileSync(process.execPath, [cli, 'deploy', '--config', configPath], {
    stdio: 'inherit',
    timeout: 120_000,
  });
  const result = await new Promise((resolveProof, reject) => {
    let buffer = '';
    tail = spawn(process.execPath, [cli, 'tail', name, '--format', 'json'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    tail.stdout.on('data', (chunk) => {
      buffer = (buffer + chunk.toString()).slice(-64_000);
      if (buffer.includes(`PORTAL_PROOF_V1:${runId}:pass`)) resolveProof(true);
      if (buffer.includes(`PORTAL_PROOF_V1:${runId}:fail`)) resolveProof(false);
    });
    tail.stderr.on('data', () => {});
    tail.on('error', () => reject(new Error('proof-tail-failed')));
    tail.on('exit', () => reject(new Error('proof-tail-closed')));
    timer = setTimeout(() => reject(new Error('proof-deadline-exceeded')), 18 * 60_000);
  });
  console.log(JSON.stringify({ proof: 'portal-hyperdrive-v1', runId, passed: result }));
  if (!result) throw new Error('proof-failed');
} finally {
  clearTimeout(timer);
  tail?.kill('SIGTERM');
  // Only the fresh random name created by this invocation; never a production service.
  await cleanup();
}
