import { beforeAll, describe, expect, it } from 'vitest';
import { encodeBase64Url, encodeJson } from '../server/auth/base64url';
import {
  BearerAuthenticationError,
  BearerAuthorizationError,
  verifyMicrosoftEntraAccessToken,
} from '../server/auth/entra-access-token';

const tenantId = '11111111-1111-4111-8111-111111111111';
const audience = 'api://banco-notas-addin';
const requiredScope = 'BancoNotas.Sync';
const now = 2_000_000_000;
const kid = 'test-signing-key';
let privateKey: CryptoKey;
let publicJwk: JsonWebKey;

beforeAll(async () => {
  const pair = (await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify'],
  )) as CryptoKeyPair;
  privateKey = pair.privateKey;
  publicJwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
});

async function token(overrides: Record<string, unknown> = {}): Promise<string> {
  const header = encodeJson({ alg: 'RS256', kid });
  const payload = encodeJson({
    aud: audience,
    iss: `https://login.microsoftonline.com/${tenantId}/v2.0`,
    tid: tenantId,
    oid: '22222222-2222-4222-8222-222222222222',
    sub: 'subject-1',
    exp: now + 300,
    nbf: now - 30,
    iat: now - 30,
    scp: `openid ${requiredScope}`,
    ...overrides,
  });
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    privateKey,
    new TextEncoder().encode(`${header}.${payload}`),
  );
  return `${header}.${payload}.${encodeBase64Url(new Uint8Array(signature))}`;
}

const fetcher: typeof fetch = async () =>
  new Response(
    JSON.stringify({ keys: [{ ...publicJwk, kid, use: 'sig', alg: 'RS256' }] }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );

function verify(authorization: string | null) {
  return verifyMicrosoftEntraAccessToken({
    authorization,
    tenantId,
    audience,
    requiredScope,
    now,
    fetcher,
  });
}

describe('Banco de Notas add-in Microsoft Entra bearer', () => {
  it('accepts a valid delegated access token with the exact audience and scope', async () => {
    const claims = await verify(`Bearer ${await token()}`);
    expect(claims.oid).toBe('22222222-2222-4222-8222-222222222222');
    expect(claims.scp.split(' ')).toContain(requiredScope);
  });

  it('rejects a token issued for another audience', async () => {
    await expect(verify(`Bearer ${await token({ aud: 'api://other' })}`)).rejects.toBeInstanceOf(
      BearerAuthenticationError,
    );
  });

  it('rejects a valid identity without the delegated sync scope', async () => {
    await expect(verify(`Bearer ${await token({ scp: 'openid profile' })}`)).rejects.toBeInstanceOf(
      BearerAuthorizationError,
    );
  });

  it('rejects expired tokens and malformed authorization headers', async () => {
    await expect(verify(`Bearer ${await token({ exp: now })}`)).rejects.toBeInstanceOf(
      BearerAuthenticationError,
    );
    await expect(verify('Basic abc')).rejects.toBeInstanceOf(BearerAuthenticationError);
    await expect(verify(null)).rejects.toBeInstanceOf(BearerAuthenticationError);
  });
});
