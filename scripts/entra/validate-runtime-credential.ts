import { readFileSync } from 'node:fs';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import type { RuntimeEnv } from '../../server/env';
import { getGraphToken } from '../../server/graph/client';
import { validateWebCredential } from '../../server/auth/oidc';
import { graphCredentials, webCredentials, type GraphCredentialSlot } from '../../server/auth/technical-identity';

type Target = 'web' | 'graph';

function target(value: string): Target {
  if (value !== 'web' && value !== 'graph') throw new Error('invalid-target');
  return value;
}

function slot(value: string): Exclude<GraphCredentialSlot, 'LEGACY'> {
  if (value !== 'A' && value !== 'B') throw new Error('invalid-slot');
  return value;
}

export async function validateExactRuntimeCredential(input: {
  target: Target;
  slot: Exclude<GraphCredentialSlot, 'LEGACY'>;
  tenantId: string;
  clientId: string;
  serializedCredential: string;
}): Promise<{ status: 'ok'; target: Target; slot: 'A' | 'B'; credentialKeyId: string }> {
  const env = {
    TENANT_ID: input.tenantId,
    WEB_CLIENT_ID: input.target === 'web' ? input.clientId : '00000000-0000-4000-8000-000000000000',
    GRAPH_CLIENT_ID: input.target === 'graph' ? input.clientId : '00000000-0000-4000-8000-000000000000',
    OFFICIAL_ORIGIN: 'https://admin.escolaieda.com',
    ...(input.target === 'web'
      ? { [`WEB_CREDENTIAL_${input.slot}`]: input.serializedCredential }
      : { [`GRAPH_CREDENTIAL_${input.slot}`]: input.serializedCredential }),
  } as unknown as RuntimeEnv;

  const credential =
    input.target === 'web'
      ? webCredentials(env, input.slot)[0]
      : graphCredentials(env, input.slot)[0];
  if (!credential) throw new Error('credential-not-resolved');

  if (input.target === 'web') {
    const result = await validateWebCredential(env, input.slot);
    if (result.credentialKeyId !== credential.keyId) throw new Error('credential-key-mismatch');
  } else {
    const token = await getGraphToken(env, undefined, input.slot);
    if (!token) throw new Error('graph-token-missing');
  }

  return {
    status: 'ok',
    target: input.target,
    slot: input.slot,
    credentialKeyId: credential.keyId,
  };
}

async function main(): Promise<void> {
  const credentialPath = process.env.CREDENTIAL_FILE ?? '';
  if (!credentialPath) throw new Error('missing-credential-file');
  const result = await validateExactRuntimeCredential({
    target: target(process.env.ROTATION_TARGET ?? ''),
    slot: slot(process.env.ROTATION_SLOT ?? ''),
    tenantId: process.env.ENTRA_TENANT_ID ?? '',
    clientId: process.env.TARGET_CLIENT_ID ?? '',
    serializedCredential: readFileSync(credentialPath, 'utf8'),
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => {
    console.error('Exact runtime credential validation failed');
    process.exitCode = 1;
  });
}
