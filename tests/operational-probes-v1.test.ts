import { describe, expect, it, vi } from 'vitest';
import { collectOperationalProbesV1 } from '../scripts/operational-probes-v1';
const NOW = new Date('2026-09-29T14:00:00Z');
function response(body: unknown, type = 'application/json', status = 200) {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: {
      'content-type': type,
      'set-cookie': 'private-cookie',
      'x-private': 'private-header',
      'content-security-policy': "default-src 'self'",
      'strict-transport-security': 'max-age=31536000',
      'x-content-type-options': 'nosniff',
    },
  });
}
function healthy(input: string | URL | Request) {
  const url = String(input);
  if (url.includes('sonarcloud'))
    return response({ projectStatus: { status: 'OK', private: 'private-body' } });
  if (url.endsWith('/healthz')) return response({ contractVersion: 1, state: 'ok' });
  if (url.endsWith('/api/health')) return response({ status: 'ok', service: 'ecossistema-escola' });
  if (url.endsWith('/api/student/status'))
    return response({ contractVersion: 1, state: 'status', scope: 'school' });
  if (url.endsWith('.js')) return response('', 'application/javascript');
  if (url.endsWith('.css')) return response('', 'text/css');
  return response(
    '<!doctype html><html><script src="/assets/index-Abc123.js"></script><link href="/assets/style-Abc123.css"><p>private-body</p></html>',
    'text/html',
  );
}
describe('fixed operational public probes', () => {
  it('checks fixed anonymous routes and returns only sanitized availability facts', async () => {
    const fetcher = vi.fn<typeof fetch>(async (input) => healthy(input));
    const result = await collectOperationalProbesV1({ fetcher, now: NOW });
    expect(result.checkedAt).toBe(NOW.toISOString());
    expect(result.probes).toHaveLength(8);
    expect(result.probes.every((probe) => probe.healthy && probe.state === 'ok')).toBe(true);
    expect(result.probes.at(-1)?.checkedAssets).toBe(2);
    expect(result.sonar).toEqual({ state: 'ok', status: 'OK' });
    expect(
      result.probes.every((probe) => Number.isFinite(probe.durationMs) && probe.durationMs >= 0),
    ).toBe(true);
    for (const [url, init] of fetcher.mock.calls) {
      expect(String(url)).toMatch(
        /^https:\/\/(aluno\.escolaieda\.com|admin\.escolaieda\.com|escolaieda\.com|sonarcloud\.io)\//,
      );
      expect(init).toMatchObject({ credentials: 'omit', redirect: 'error' });
      expect(init?.headers).toBeUndefined();
    }
    expect(JSON.stringify(result)).not.toMatch(/private|cookie|assets\/|requestId|notices/);
    expect(result).not.toHaveProperty('authenticatedUse');
  });
  it('rejects noncanonical health/status and does not confuse a 200 login document with JSON health', async () => {
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      if (String(input).endsWith('/healthz')) return response('<html>ok</html>', 'text/html');
      if (String(input).endsWith('/api/student/status'))
        return response({ contractVersion: 1, state: 'status', scope: 'student' });
      return healthy(input);
    });
    const result = await collectOperationalProbesV1({ fetcher });
    expect(result.probes.find((p) => p.id === 'portal-health')?.state).toBe('failed');
    expect(result.probes.find((p) => p.id === 'portal-status')?.state).toBe('failed');
  });
  it('never follows asset URLs outside strict same-origin paths and bounds checks to five', async () => {
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      if (String(input) === 'https://aluno.escolaieda.com/')
        return response(
          '<html><script src="https://evil.invalid/assets/steal.js"></script><script src="//evil.invalid/assets/steal.js"></script><script src="/assets/../secret.js"></script><script src="/assets/%2e%2e/secret.js"></script><script src="/assets/x.js?secret=value"></script>' +
            Array.from(
              { length: 9 },
              (_, i) => `<script src="/assets/good-${i}.js"></script>`,
            ).join('') +
            '</html>',
          'text/html',
        );
      return healthy(input);
    });
    const result = await collectOperationalProbesV1({ fetcher });
    expect(result.probes.at(-1)?.checkedAssets).toBe(5);
    expect(fetcher.mock.calls.filter(([url]) => String(url).includes('/assets/'))).toHaveLength(5);
    expect(
      fetcher.mock.calls.every(
        ([url]) => !String(url).includes('evil') && !String(url).includes('secret'),
      ),
    ).toBe(true);
  });
  it('marks missing assets inconclusive and content-type mismatches failed', async () => {
    const missing = await collectOperationalProbesV1({
      fetcher: async (input) =>
        String(input) === 'https://aluno.escolaieda.com/'
          ? response('<html></html>', 'text/html')
          : healthy(input),
    });
    expect(missing.probes.at(-1)).toMatchObject({
      state: 'inconclusive',
      checkedAssets: 0,
      healthy: false,
    });
    const mismatch = await collectOperationalProbesV1({
      fetcher: async (input) =>
        String(input).endsWith('.js') ? response('<html></html>', 'text/html') : healthy(input),
    });
    expect(mismatch.probes.at(-1)?.state).toBe('failed');
  });
  it('discards oversize payloads and provider errors without leaking them or claiming availability', async () => {
    const result = await collectOperationalProbesV1({
      fetcher: async (input) => {
        if (String(input).endsWith('/healthz')) return response('x'.repeat(512_001));
        if (String(input).includes('sonarcloud')) throw new Error('private-secret');
        return healthy(input);
      },
    });
    expect(result.probes.find((p) => p.id === 'portal-health')?.state).toBe('unavailable');
    expect(result.sonar.state).toBe('unavailable');
    expect(JSON.stringify(result)).not.toContain('private-secret');
  });
  it('bounds stalled response-body consumption and isolates other probes', async () => {
    vi.useFakeTimers();
    try {
      const pending = collectOperationalProbesV1({
        fetcher: async (input) =>
          String(input).endsWith('/healthz')
            ? new Response(new ReadableStream({ start() {} }), {
                headers: { 'content-type': 'application/json' },
              })
            : healthy(input),
      });
      await vi.advanceTimersByTimeAsync(10_001);
      const result = await pending;
      expect(result.probes.find((p) => p.id === 'portal-health')?.state).toBe('unavailable');
      expect(result.probes.find((p) => p.id === 'admin-health')?.state).toBe('ok');
    } finally {
      vi.useRealTimers();
    }
  });
  it('does not pass through unknown Sonar states or details', async () => {
    const result = await collectOperationalProbesV1({
      fetcher: async (input) =>
        String(input).includes('sonarcloud')
          ? response({ projectStatus: { status: 'private-secret' } })
          : healthy(input),
    });
    expect(result.sonar).toEqual({ state: 'inconclusive' });
  });
});
