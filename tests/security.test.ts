import { describe, expect, it } from 'vitest';
import {
  enforceOfficialOrigin,
  enforceWriteOrigin,
  HttpError,
  readBoundedJson,
  SECURITY_HEADERS,
  withSecurityHeaders,
} from '../server/http/security';
import { testEnv } from './fixtures';

describe('HTTP security', () => {
  it('accepts the official production origin', () =>
    expect(() =>
      enforceOfficialOrigin(new Request(`${testEnv.OFFICIAL_ORIGIN}/api/health`), testEnv),
    ).not.toThrow());
  it('rejects pages.dev for production API', () =>
    expect(() =>
      enforceOfficialOrigin(
        new Request('https://ecossistema-escola.pages.dev/api/health'),
        testEnv,
      ),
    ).toThrow(HttpError));
  it('rejects a foreign write Origin', () =>
    expect(() =>
      enforceWriteOrigin(
        new Request(`${testEnv.OFFICIAL_ORIGIN}/x`, {
          method: 'POST',
          headers: { Origin: 'https://evil.test' },
        }),
        testEnv,
      ),
    ).toThrow(HttpError));
  it('rejects a null write Origin instead of weakening CSRF protection', () =>
    expect(() =>
      enforceWriteOrigin(
        new Request(`${testEnv.OFFICIAL_ORIGIN}/x`, {
          method: 'POST',
          headers: { Origin: 'null' },
        }),
        testEnv,
      ),
    ).toThrow(HttpError));
  it('accepts the exact write Origin', () =>
    expect(() =>
      enforceWriteOrigin(
        new Request(`${testEnv.OFFICIAL_ORIGIN}/x`, {
          method: 'POST',
          headers: { Origin: testEnv.OFFICIAL_ORIGIN },
        }),
        testEnv,
      ),
    ).not.toThrow());
  it('adds CSP and anti-framing headers', () => {
    const response = withSecurityHeaders(new Response('ok'));
    expect(response.headers.get('Content-Security-Policy')).toContain("frame-ancestors 'none'");
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(response.headers.get('Referrer-Policy')).toBe('same-origin');
  });
  it('marks protected responses no-store', () =>
    expect(withSecurityHeaders(new Response('ok'), true).headers.get('Cache-Control')).toContain(
      'no-store',
    ));
  it('requires application/json', async () =>
    await expect(
      readBoundedJson(
        new Request('https://x.test', {
          method: 'POST',
          body: '{}',
          headers: { 'Content-Type': 'text/plain' },
        }),
      ),
    ).rejects.toMatchObject({ status: 415 }));
  it('rejects invalid JSON', async () =>
    await expect(
      readBoundedJson(
        new Request('https://x.test', {
          method: 'POST',
          body: '{',
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    ).rejects.toMatchObject({ status: 400 }));
  it('rejects bodies above the limit by header', async () =>
    await expect(
      readBoundedJson(
        new Request('https://x.test', {
          method: 'POST',
          body: '{}',
          headers: { 'Content-Type': 'application/json', 'Content-Length': '20000' },
        }),
      ),
    ).rejects.toMatchObject({ status: 413 }));
  it('defines HSTS and a restrictive permissions policy', () => {
    expect(SECURITY_HEADERS['Strict-Transport-Security']).toContain('max-age=31536000');
    expect(SECURITY_HEADERS['Permissions-Policy']).toContain('camera=()');
  });
});
