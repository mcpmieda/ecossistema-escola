// @vitest-environment node
import { readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { onRequest } from '../../../workers/student-portal/edge/[[path]]';

const ORIGIN = 'https://aluno.escolaieda.com';

async function serve(pathname: string) {
  const env = {
    PORTAL_ENVIRONMENT: 'production',
    PORTAL_ORIGIN: ORIGIN,
    ASSETS: {
      fetch: async () => new Response('bytes', { status: 200, headers: { 'Content-Type': 'image/webp' } }),
    },
  };
  const context = { request: new Request(ORIGIN + pathname), env } as unknown as Parameters<typeof onRequest>[0];
  return onRequest(context);
}

describe('student portal edge assets', () => {
  it('serves every image the Portal bundles (regression: WebP cover and logo returned 404)', async () => {
    const images = readdirSync('src/student-portal/assets').filter((name) => /\.[a-z0-9]+$/u.test(name));
    expect(images.length).toBeGreaterThan(0);
    for (const name of images) {
      const extension = name.split('.').at(-1);
      const response = await serve(`/assets/${name.replace(/\.[^.]+$/u, '')}-Ab12_cd.${extension}`);
      expect(response.status, name).toBe(200);
      expect(response.headers.get('Cache-Control')).toContain('immutable');
    }
  });

  it('still refuses unknown asset types', async () => {
    expect((await serve('/assets/payload-Ab12.exe')).status).toBe(404);
  });
});
