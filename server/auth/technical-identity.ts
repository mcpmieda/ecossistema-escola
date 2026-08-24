import type { RuntimeEnv } from '../env';
import { z } from 'zod';

export type GraphCredentialSlot = 'LEGACY' | 'A' | 'B';

const rotatedCredentialSchema = z.object({
  privateKeyPkcs8: z.string().min(256),
  certificateThumbprint: z.string().min(20),
  keyId: z.string().uuid(),
  createdAt: z.string().datetime(),
});

export type GraphCredential = z.infer<typeof rotatedCredentialSchema> & {
  slot: GraphCredentialSlot;
};

type CredentialPurpose = 'GRAPH' | 'WEB';

function rotatedCredential(
  env: RuntimeEnv,
  purpose: CredentialPurpose,
  slot: 'A' | 'B',
): GraphCredential {
  const serialized = env[`${purpose}_CREDENTIAL_${slot}`];
  if (!serialized) throw new Error(`${purpose} credential slot ${slot} is missing`);
  return { ...rotatedCredentialSchema.parse(JSON.parse(serialized)), slot };
}

function technicalCredentials(
  env: RuntimeEnv,
  purpose: CredentialPurpose,
  requestedSlot?: GraphCredentialSlot,
): GraphCredential[] {
  const privateKeyPkcs8 =
    purpose === 'GRAPH' ? env.GRAPH_PRIVATE_KEY_PKCS8 : env.WEB_PRIVATE_KEY_PKCS8;
  const certificateThumbprint =
    purpose === 'GRAPH' ? env.GRAPH_CERT_THUMBPRINT : env.WEB_CERT_THUMBPRINT;
  const legacy: GraphCredential | null =
    privateKeyPkcs8 && certificateThumbprint
      ? {
          privateKeyPkcs8,
          certificateThumbprint,
          keyId: '00000000-0000-0000-0000-000000000000',
          createdAt: '1970-01-01T00:00:00.000Z',
          slot: 'LEGACY',
        }
      : null;
  if (requestedSlot === 'LEGACY') {
    if (!legacy) throw new Error(`${purpose} legacy credential is missing`);
    return [legacy];
  }
  if (requestedSlot === 'A' || requestedSlot === 'B')
    return [rotatedCredential(env, purpose, requestedSlot)];
  const rotated = (['A', 'B'] as const)
    .filter((slot) => Boolean(env[`${purpose}_CREDENTIAL_${slot}`]))
    .map((slot) => rotatedCredential(env, purpose, slot))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  return legacy ? [...rotated, legacy] : rotated;
}

export function graphCredentials(
  env: RuntimeEnv,
  requestedSlot?: GraphCredentialSlot,
): GraphCredential[] {
  return technicalCredentials(env, 'GRAPH', requestedSlot);
}

export function webCredentials(
  env: RuntimeEnv,
  requestedSlot?: GraphCredentialSlot,
): GraphCredential[] {
  return technicalCredentials(env, 'WEB', requestedSlot);
}
