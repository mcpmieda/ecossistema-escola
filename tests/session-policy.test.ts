import { describe, expect, it } from 'vitest';
import {
  createSessionDurationPreferenceCookie,
  DEFAULT_SESSION_DURATION_HOURS,
  readSessionDurationPreference,
  SESSION_POLICY_COOKIE,
} from '../server/auth/session-policy';
import { testEnv } from './fixtures';

const USER_OID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER_OID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function cookieRequest(setCookie: string, tamper = false): Request {
  const stored = setCookie.match(new RegExp(`${SESSION_POLICY_COOKIE}=([^;]+)`, 'u'))?.[1];
  const value = tamper && stored ? `${stored[0] === 'a' ? 'b' : 'a'}${stored.slice(1)}` : stored;
  if (!value) throw new Error('Missing session policy cookie');
  return new Request(testEnv.OFFICIAL_ORIGIN, {
    headers: { Cookie: `${SESSION_POLICY_COOKIE}=${value}` },
  });
}

describe('administrative session duration preference', () => {
  it('defaults to eight hours without a stored preference', async () => {
    await expect(
      readSessionDurationPreference(new Request(testEnv.OFFICIAL_ORIGIN), testEnv, USER_OID),
    ).resolves.toBe(DEFAULT_SESSION_DURATION_HOURS);
  });

  it('stores an allowed duration in a sealed __Host cookie bound to the user', async () => {
    const now = 1_800_000_000;
    const cookie = await createSessionDurationPreferenceCookie(testEnv, USER_OID, 12, now);
    const request = cookieRequest(cookie);

    expect(cookie).toContain('Path=/; HttpOnly; Secure; SameSite=Lax');
    await expect(readSessionDurationPreference(request, testEnv, USER_OID, now)).resolves.toBe(12);
    await expect(readSessionDurationPreference(request, testEnv, OTHER_OID, now)).resolves.toBe(8);
  });

  it('falls back safely when the sealed preference is tampered', async () => {
    const cookie = await createSessionDurationPreferenceCookie(testEnv, USER_OID, 4);
    const request = cookieRequest(cookie, true);

    await expect(readSessionDurationPreference(request, testEnv, USER_OID)).resolves.toBe(8);
  });
});
