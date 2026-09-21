import { readFileSync } from 'node:fs';
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import type { HealthStateV1, SystemHealthSnapshotV1 } from '../../../shared/system-health-v1';

let runtime: Miniflare;
let upstreamStatus = 200;
const outgoing: {
  url: string;
  method: string;
  accept: string | null;
  cookie: string | null;
  authorization: string | null;
}[] = [];

beforeAll(async () => {
  // Bundle the real collector; only the remote HTTP endpoint is replaced by a fixture.
  // esbuild is already supplied by Wrangler, with no additional test dependency.
  const bundled = await build({
    stdin: {
      contents: `
        import { collectSystemHealthV1 } from './server/platform/system-health-source-v1';
        import { systemHealthStateV1 } from './shared/system-health-v1';
        export default { async fetch() {
          const snapshot = await collectSystemHealthV1({ production: true });
          return Response.json({ snapshot, state: systemHealthStateV1(snapshot, Date.now()) });
        } };
      `,
      resolveDir: process.cwd(),
      sourcefile: 'system-health-public-harness.ts',
      loader: 'ts',
    },
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
  });
  const config = JSON.parse(readFileSync('wrangler.jsonc', 'utf8'));
  runtime = new Miniflare(
    convertV4MiniflareOptions({
      name: 'system-health-public-harness',
      modules: true,
      script: bundled.outputFiles[0]!.text,
      compatibilityDate: config.compatibility_date,
      compatibilityFlags: config.compatibility_flags,
      outboundService: async (request) => {
        outgoing.push({
          url: request.url,
          method: request.method,
          accept: request.headers.get('accept'),
          cookie: request.headers.get('cookie'),
          authorization: request.headers.get('authorization'),
        });
        const redirect = upstreamStatus === 302 && request.url === 'https://aluno.escolaieda.com/';
        return new Response(null, {
          status: redirect ? 302 : 200,
          headers: redirect
            ? { location: 'https://redirect.invalid/should-not-be-requested' }
            : { 'content-type': 'text/html; charset=utf-8' },
        });
      },
    }),
  );
});
beforeEach(() => {
  upstreamStatus = 200;
  outgoing.length = 0;
});
afterAll(async () => {
  await runtime?.dispose();
});

async function collect() {
  const response = await runtime.dispatchFetch('https://admin.escolaieda.com/health-fixture', {
    headers: {
      cookie: 'synthetic-session=never-forward',
      authorization: 'Bearer synthetic-never-forward',
    },
  });
  expect(response.status).toBe(200);
  return (await response.json()) as { snapshot: SystemHealthSnapshotV1; state: HealthStateV1 };
}

it('performs the real public HEAD with fetch options supported by the ADM Workerd runtime', async () => {
  const { snapshot } = await collect();
  expect(snapshot.publicEntry).toMatchObject({ outcome: 'ok', status: 200 });
  expect(outgoing).toEqual([
    {
      url: 'https://aluno.escolaieda.com/',
      method: 'HEAD',
      accept: 'text/html',
      cookie: null,
      authorization: null,
    },
  ]);
});

it('reports a redirect as critical without following its Location', async () => {
  upstreamStatus = 302;
  const { snapshot, state } = await collect();
  expect(snapshot.publicEntry).toMatchObject({ outcome: 'http-error', status: 302 });
  expect(state).toBe('critical');
  expect(outgoing).toHaveLength(1);
  expect(outgoing[0]?.url).toBe('https://aluno.escolaieda.com/');
});
