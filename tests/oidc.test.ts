import { describe, expect, it } from 'vitest';
import { authorizationUrl, newAuthTransaction } from '../server/auth/oidc';
import { testEnv } from './fixtures';

describe('OIDC transaction', () => {
  it('creates unique state, nonce, verifier and S256 challenge', async () => {
    const a = await newAuthTransaction(0);
    const b = await newAuthTransaction(0);
    expect(a.state).not.toBe(b.state);
    expect(a.nonce).not.toBe(b.nonce);
    expect(a.verifier.length).toBeGreaterThan(43);
    expect(a.challenge.length).toBeGreaterThan(40);
  });
  it('expires in ten minutes', async () => expect((await newAuthTransaction(1_000)).exp).toBe(601));
  it('uses the single tenant authority', async () => {
    const url = new URL(authorizationUrl(testEnv, await newAuthTransaction()));
    expect(url.pathname).toContain(testEnv.TENANT_ID);
    expect(url.pathname).not.toContain('common');
  });
  it('uses only the official callback', async () => {
    const url = new URL(authorizationUrl(testEnv, await newAuthTransaction()));
    expect(url.searchParams.get('redirect_uri')).toBe(`${testEnv.OFFICIAL_ORIGIN}/auth/callback`);
  });
  it('requests OIDC scopes without broad Graph scopes', async () => {
    const url = new URL(authorizationUrl(testEnv, await newAuthTransaction()));
    expect(url.searchParams.get('scope')).toBe('openid profile email');
  });
  it('uses authorization code with PKCE', async () => {
    const url = new URL(authorizationUrl(testEnv, await newAuthTransaction()));
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
  });
});
