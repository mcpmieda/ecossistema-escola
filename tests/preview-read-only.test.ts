import { describe, expect, it } from 'vitest';
import type { RuntimeEnv } from '../server/env';
import { previewRequestAllowed } from '../server/preview-read-only';

const preview = { RUNTIME_ENVIRONMENT: 'preview' } as RuntimeEnv;
const production = { RUNTIME_ENVIRONMENT: 'production' } as RuntimeEnv;
const request = (path: string, method = 'GET', body?: unknown) => new Request(
  `https://ecossistema-escola-testes.pages.dev${path}`,
  { method, ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) },
);

describe('read-only real-data preview', () => {
  it('allows the panel reads and preserves the official runtime behavior', async () => {
    expect(await previewRequestAllowed(request('/api/me'), preview)).toBe(true);
    expect(await previewRequestAllowed(request('/api/student-portal/admin/query', 'POST'), preview)).toBe(true);
    expect(await previewRequestAllowed(request('/api/student-photos/admin/state', 'POST'), preview)).toBe(true);
    expect(await previewRequestAllowed(request('/api/student-photos/admin/image'), preview)).toBe(true);
    expect(await previewRequestAllowed(request('/api/gradebook/operational-workspace', 'POST', { operation: 'search' }), preview)).toBe(true);
    expect(await previewRequestAllowed(request('/api/student-portal/admin/command', 'POST'), production)).toBe(true);
  });

  it('blocks writes before they reach production bindings', async () => {
    for (const path of [
      '/api/student-portal/admin/command',
      '/api/student-photos/admin/save',
      '/api/student-photos/admin/open',
      '/api/student-photos/admin/recover',
      '/api/platform/settings/session',
      '/api/gradebook/year-reset',
    ]) expect(await previewRequestAllowed(request(path, 'POST'), preview)).toBe(false);
    expect(await previewRequestAllowed(request('/api/gradebook/operational-workspace', 'POST', { operation: 'publish' }), preview)).toBe(false);
    expect(await previewRequestAllowed(request('/api/gradebook/operational-workspace', 'POST', { operation: 'search' }), preview)).toBe(true);
  });
});
