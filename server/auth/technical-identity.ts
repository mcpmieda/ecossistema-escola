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

function rotatedCredential(env: RuntimeEnv, slot: 'A' | 'B'): GraphCredential {
  const serialized = env[`GRAPH_CREDENTIAL_${slot}`];
  if (!serialized) throw new Error(`Graph credential slot ${slot} is missing`);
  return { ...rotatedCredentialSchema.parse(JSON.parse(serialized)), slot };
}

export function graphCredentials(
  env: RuntimeEnv,
  requestedSlot?: GraphCredentialSlot,
): GraphCredential[] {
  const legacy: GraphCredential = {
    privateKeyPkcs8: env.GRAPH_PRIVATE_KEY_PKCS8,
    certificateThumbprint: env.GRAPH_CERT_THUMBPRINT,
    keyId: '00000000-0000-0000-0000-000000000000',
    createdAt: '1970-01-01T00:00:00.000Z',
    slot: 'LEGACY',
  };
  if (requestedSlot === 'LEGACY') return [legacy];
  if (requestedSlot === 'A' || requestedSlot === 'B')
    return [rotatedCredential(env, requestedSlot)];
  const rotated = (['A', 'B'] as const)
    .filter((slot) => Boolean(env[`GRAPH_CREDENTIAL_${slot}`]))
    .map((slot) => rotatedCredential(env, slot))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  return [...rotated, legacy];
}
