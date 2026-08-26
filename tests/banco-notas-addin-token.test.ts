import { beforeAll, describe, expect, it } from 'vitest';
import { encodeBase64Url, encodeJson } from '../server/auth/base64url';
import {
  BearerAuthenticationError,
  BearerAuthorizationError,
  BearerConfigurationError,
  BearerVerificationUnavailableError,
  verifyBancoNotasAddinToken,
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
  new Response(JSON.stringify({ keys: [{ ...publicJwk, kid, use: 'sig', alg: 'RS256' }] }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

function verify(authorization: string | null, customFetcher: typeof fetch = fetcher) {
  return verifyMicrosoftEntraAccessToken({
    authorization,
    tenantId,
    audience,
    requiredScope,
    now,
    fetcher: customFetcher,
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

  it('supports an audience array and rejects incorrect issuer or tenant', async () => {
    await expect(
      verify(`Bearer ${await token({ aud: ['api://other', audience] })}`),
    ).resolves.toBeDefined();
    await expect(
      verify(`Bearer ${await token({ iss: 'https://issuer.invalid/example' })}`),
    ).rejects.toBeInstanceOf(BearerAuthenticationError);
    await expect(
      verify(`Bearer ${await token({ tid: '33333333-3333-4333-8333-333333333333' })}`),
    ).rejects.toBeInstanceOf(BearerAuthenticationError);
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

  it('rejects future nbf, unknown kid and invalid signatures as authentication failures', async () => {
    await expect(verify(`Bearer ${await token({ nbf: now + 61 })}`)).rejects.toBeInstanceOf(
      BearerAuthenticationError,
    );
    const unknownKidFetcher: typeof fetch = async () =>
      new Response(JSON.stringify({ keys: [{ ...publicJwk, kid: 'another-key' }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    await expect(verify(`Bearer ${await token()}`, unknownKidFetcher)).rejects.toBeInstanceOf(
      BearerAuthenticationError,
    );
    const validToken = await token();
    const tampered = `${validToken.slice(0, -2)}aa`;
    await expect(verify(`Bearer ${tampered}`)).rejects.toBeInstanceOf(BearerAuthenticationError);
  });

  it('treats JWKS transport and provider failures as temporarily unavailable, not bad credentials', async () => {
    const validToken = `Bearer ${await token()}`;
    const networkFailure: typeof fetch = async () => {
      throw new Error('network unavailable');
    };
    const providerFailure: typeof fetch = async () => new Response('unavailable', { status: 503 });
    const invalidProviderBody: typeof fetch = async () =>
      new Response(JSON.stringify({ unexpected: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });

    await expect(verify(validToken, networkFailure)).rejects.toBeInstanceOf(
      BearerVerificationUnavailableError,
    );
    await expect(verify(validToken, providerFailure)).rejects.toBeInstanceOf(
      BearerVerificationUnavailableError,
    );
    await expect(verify(validToken, invalidProviderBody)).rejects.toBeInstanceOf(
      BearerVerificationUnavailableError,
    );
  });

  it('fails closed with 503 semantics when audience or scope is not configured', async () => {
    await expect(
      verifyBancoNotasAddinToken({
        authorization: `Bearer ${await token()}`,
        env: { TENANT_ID: tenantId } as never,
        now,
        fetcher,
      }),
    ).rejects.toMatchObject({ status: 503 });
    await expect(
      verifyBancoNotasAddinToken({
        authorization: `Bearer ${await token()}`,
        env: { TENANT_ID: tenantId } as never,
        now,
        fetcher,
      }),
    ).rejects.toBeInstanceOf(BearerConfigurationError);
  });
});
