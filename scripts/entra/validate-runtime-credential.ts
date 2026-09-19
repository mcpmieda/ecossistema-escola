import { readFileSync } from 'node:fs';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import type { RuntimeEnv } from '../../server/env';
import { createClientAssertion } from '../../server/auth/client-assertion';
import {
  graphCredentials,
  webCredentials,
  type GraphCredentialSlot,
} from '../../server/auth/technical-identity';

type Target = 'web' | 'graph';

export class ExactRuntimeCredentialError extends Error {
  readonly httpStatus: number;
  readonly aadstsCode: number | null;

  constructor(httpStatus: number, aadstsCode: number | null) {
    super('Exact runtime credential validation failed');
    this.name = 'ExactRuntimeCredentialError';
    this.httpStatus = httpStatus;
    this.aadstsCode = aadstsCode;
  }
}

function target(value: string): Target {
  if (value !== 'web' && value !== 'graph') throw new Error('invalid-target');
  return value;
}

function slot(value: string): Exclude<GraphCredentialSlot, 'LEGACY'> {
  if (value !== 'A' && value !== 'B') throw new Error('invalid-slot');
  return value;
}

function aadstsCode(payload: unknown): number | null {
  if (
    typeof payload !== 'object' ||
    payload === null ||
    !('error_codes' in payload) ||
    !Array.isArray(payload.error_codes)
  ) {
    return null;
  }
  const value = payload.error_codes.find(
    (candidate): candidate is number => Number.isInteger(candidate) && candidate > 0,
  );
  return value ?? null;
}

export async function validateExactRuntimeCredential(input: {
  target: Target;
  slot: Exclude<GraphCredentialSlot, 'LEGACY'>;
  tenantId: string;
  clientId: string;
  serializedCredential: string;
  fetcher?: typeof fetch;
}): Promise<{ status: 'ok'; target: Target; slot: 'A' | 'B'; credentialKeyId: string }> {
  const env = {
    TENANT_ID: input.tenantId,
    WEB_CLIENT_ID: input.target === 'web'
      ? input.clientId
      : '00000000-0000-4000-8000-000000000000',
    GRAPH_CLIENT_ID: input.target === 'graph'
      ? input.clientId
      : '00000000-0000-4000-8000-000000000000',
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

  const assertion = await createClientAssertion({
    clientId: input.clientId,
    tenantId: input.tenantId,
    privateKeyPkcs8: credential.privateKeyPkcs8,
    certificateThumbprint: credential.certificateThumbprint,
  });

  const fetcher = input.fetcher ?? fetch;
  const endpoint =
    `https://login.microsoftonline.com/${input.tenantId}/oauth2/v2.0/token`;
  const response = await fetcher(endpoint, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: input.clientId,
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials',
      client_assertion_type:
        'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
      client_assertion: assertion,
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      await response.body?.cancel().catch(() => undefined);
    }
    throw new ExactRuntimeCredentialError(response.status, aadstsCode(payload));
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error('token-response-invalid');
  }
  if (
    typeof payload !== 'object' ||
    payload === null ||
    !('access_token' in payload) ||
    typeof payload.access_token !== 'string' ||
    payload.access_token.length === 0
  ) {
    throw new Error('token-response-invalid');
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
  main().catch((error: unknown) => {
    const safe =
      error instanceof ExactRuntimeCredentialError
        ? {
            status: 'error',
            httpStatus: error.httpStatus,
            aadstsCode: error.aadstsCode,
          }
        : { status: 'error', kind: 'local' };
    process.stdout.write(`${JSON.stringify(safe)}\n`);
    process.exitCode = 1;
  });
}
