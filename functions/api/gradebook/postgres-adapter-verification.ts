import { capabilitiesForRoles, requireCapability } from '../../../server/auth/capabilities';
import { requireAuth } from '../../../server/auth/session';
import type { RuntimeEnv } from '../../../server/env';
import { validateEnv } from '../../../server/env';
import {
  enforceOfficialOrigin,
  enforceWriteOrigin,
  HttpError,
} from '../../../server/http/security';
import { createGradebookPostgresDatabaseV1 } from '../../../server/gradebook/persistence/postgres/postgres-database-v1';
import { verifyGradebookPostgresAdaptersSyntheticV1 } from '../../../server/gradebook/persistence/postgres/postgres-synthetic-verification-v1';

type HyperdriveBindingV1 = { readonly connectionString: string };
type VerificationEnvV1 = RuntimeEnv & { readonly PROD_DB?: HyperdriveBindingV1 };
type Context = EventContext<VerificationEnvV1, string, unknown>;

function noStoreJson(value: unknown, status = 200): Response {
  return Response.json(value, {
    status,
    headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, private' },
  });
}

function safeSqlState(cause: unknown): string | undefined {
  if (!cause || typeof cause !== 'object' || !('code' in cause)) return undefined;
  const value = cause.code;
  return typeof value === 'string' && /^[0-9A-Z]{5}$/u.test(value) ? value : undefined;
}

async function parseBody(request: Request): Promise<void> {
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > 1_024) {
    throw new HttpError(413, 'Verification request too large');
  }
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new HttpError(400, 'Invalid verification request');
  }
  if (
    body === null ||
    typeof body !== 'object' ||
    Array.isArray(body) ||
    (body as Record<string, unknown>).operation !== 'verify-synthetic-adapters'
  ) {
    throw new HttpError(400, 'Invalid verification request');
  }
}

export const onRequestPost: PagesFunction<VerificationEnvV1> = async (context: Context) => {
  const rawEnv = context.env;
  const env = validateEnv(rawEnv as RuntimeEnv);
  enforceOfficialOrigin(context.request, env);
  enforceWriteOrigin(context.request, env);
  const session = await requireAuth(context.request, env);
  requireCapability(capabilitiesForRoles(session.roles), 'gradebook.persistence.admin');
  await parseBody(context.request);

  const binding = rawEnv.PROD_DB;
  if (!binding?.connectionString) {
    return noStoreJson(
      { version: 1, state: 'failed', stage: 'binding', code: 'binding-missing' },
      503,
    );
  }

  const database = await createGradebookPostgresDatabaseV1(binding.connectionString);
  try {
    return noStoreJson(await verifyGradebookPostgresAdaptersSyntheticV1(database));
  } catch (cause) {
    const diagnostic = database.lastFailure();
    const sqlState = diagnostic?.sqlState ?? safeSqlState(cause);
    console.error(
      JSON.stringify({
        message: 'gradebook_postgres_adapter_verification_failed',
        errorType: cause instanceof Error ? cause.name : 'unknown',
        sqlState: sqlState ?? null,
        database: diagnostic,
      }),
    );
    return noStoreJson(
      {
        version: 1,
        state: 'failed',
        stage: 'adapter-verification',
        code: 'adapter-verification-failed',
        ...(sqlState ? { sqlState } : {}),
        ...(diagnostic
          ? {
              database: {
                operation: diagnostic.operation,
                relation: diagnostic.relation,
                category: diagnostic.category,
              },
            }
          : {}),
      },
      503,
    );
  } finally {
    await database.close().catch(() => {
      console.error(JSON.stringify({ message: 'gradebook_postgres_adapter_close_failed' }));
    });
  }
};
