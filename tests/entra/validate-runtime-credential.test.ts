import { afterEach, describe, expect, it, vi } from 'vitest';
import { validateExactRuntimeCredential } from '../../scripts/entra/validate-runtime-credential';

async function credential(createdAt: string) {
  const pair = await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify'],
  );
  const bytes = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey));
  const base64 = Buffer.from(bytes).toString('base64');
  const keyId = crypto.randomUUID();
  return {
    keyId,
    serialized: JSON.stringify({
      privateKeyPkcs8: `-----BEGIN PRIVATE KEY-----\n${base64}\n-----END PRIVATE KEY-----`,
      certificateThumbprint: 'synthetic-thumbprint-value',
      keyId,
      createdAt,
    }),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('exact runtime credential validation', () => {
  it('validates the exact Web slot through the production runtime parser and token request', async () => {
    const candidate = await credential('2026-09-19T13:00:00.000Z');
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({ access_token: 'token', id_token: 'id', expires_in: 3600 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await validateExactRuntimeCredential({
      target: 'web',
      slot: 'A',
      tenantId: 'f04e0fa3-b8dc-4f77-be3c-7dfda0635188',
      clientId: '78185e20-c824-4acc-9ccd-41b9f7509a6f',
      serializedCredential: candidate.serialized,
    });

    expect(result).toEqual({
      status: 'ok',
      target: 'web',
      slot: 'A',
      credentialKeyId: candidate.keyId,
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('validates the exact Graph slot through the production runtime parser and token request', async () => {
    const candidate = await credential('2026-09-19T13:00:00.000Z');
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({ access_token: 'token', expires_in: 3600 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await validateExactRuntimeCredential({
      target: 'graph',
      slot: 'B',
      tenantId: 'f04e0fa3-b8dc-4f77-be3c-7dfda0635188',
      clientId: '7d565352-1f77-4a7c-a4a4-4ae1b55b5c0c',
      serializedCredential: candidate.serialized,
    });

    expect(result).toEqual({
      status: 'ok',
      target: 'graph',
      slot: 'B',
      credentialKeyId: candidate.keyId,
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
