import { describe, expect, it } from 'vitest';
import { graphCredentials, TechnicalCredentialError } from '../server/auth/technical-identity';
import { testEnv } from './fixtures';

function rotated(createdAt: string, keyId: string): string {
  return JSON.stringify({
    privateKeyPkcs8: 'k'.repeat(256),
    certificateThumbprint: 'thumbprint-value-12345',
    keyId,
    createdAt,
  });
}

describe('technical identity slots', () => {
  it('uses the legacy certificate when no rotated slot exists', () => {
    expect(graphCredentials(testEnv).map((credential) => credential.slot)).toEqual(['LEGACY']);
  });

  it('prefers the newest rotated certificate and retains fallbacks', () => {
    const env = {
      ...testEnv,
      GRAPH_CREDENTIAL_A: rotated('2026-01-01T00:00:00.000Z', crypto.randomUUID()),
      GRAPH_CREDENTIAL_B: rotated('2026-02-01T00:00:00.000Z', crypto.randomUUID()),
    };
    expect(graphCredentials(env).map((credential) => credential.slot)).toEqual([
      'B',
      'A',
      'LEGACY',
    ]);
  });

  it('never falls back when the maintenance endpoint requests an exact slot', () => {
    const env = {
      ...testEnv,
      GRAPH_CREDENTIAL_A: rotated('2026-01-01T00:00:00.000Z', crypto.randomUUID()),
    };
    expect(graphCredentials(env, 'A').map((credential) => credential.slot)).toEqual(['A']);
    expect(() => graphCredentials(env, 'B')).toThrow(TechnicalCredentialError);
  });

  it('skips one malformed rotated slot without preventing the valid fallback', () => {
    const env = {
      ...testEnv,
      GRAPH_PRIVATE_KEY_PKCS8: undefined,
      GRAPH_CERT_THUMBPRINT: undefined,
      GRAPH_CREDENTIAL_A: '{invalid',
      GRAPH_CREDENTIAL_B: rotated('2026-02-01T00:00:00.000Z', crypto.randomUUID()),
    };
    expect(graphCredentials(env).map((credential) => credential.slot)).toEqual(['B']);
  });

  it('reports only sanitized slot metadata when every configured slot is malformed', () => {
    const env = { ...testEnv, GRAPH_PRIVATE_KEY_PKCS8: undefined, GRAPH_CERT_THUMBPRINT: undefined,
      GRAPH_CREDENTIAL_A: '{sensitive-invalid', GRAPH_CREDENTIAL_B: 'also-sensitive-invalid' };
    try { graphCredentials(env); throw new Error('Expected the inventory to fail'); }
    catch (error) {
      expect(error).toBeInstanceOf(TechnicalCredentialError);
      expect(error).toMatchObject({ stage: 'invalid', slots: ['A', 'B'] });
      expect(String(error)).not.toContain('sensitive');
    }
  });
});
