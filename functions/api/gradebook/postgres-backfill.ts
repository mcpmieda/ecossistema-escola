import { capabilitiesForRoles, requireCapability } from '../../../server/auth/capabilities';
import { requireAuth } from '../../../server/auth/session';
import type { RuntimeEnv } from '../../../server/env';
import { validateEnv } from '../../../server/env';
import {
  enforceOfficialOrigin,
  enforceWriteOrigin,
  HttpError,
} from '../../../server/http/security';
import type { D1WriteDatabaseV1 } from '../../../server/gradebook/persistence/d1/write/d1-write-adapter-v1';
import { createGradebookShadowReadOnlyD1V1 } from '../../../server/gradebook/persistence/shadow/gradebook-shadow-d1-v1';
import {
  backfillGradebookFamilyPageV1,
  createGradebookBackfillSqlV1,
  GRADEBOOK_BACKFILL_FAMILIES_V1,
  gradebookBackfillFamilyV1,
  inspectGradebookBackfillCountsV1,
  verifyGradebookBackfillIntegrityV1,
} from '../../../server/gradebook/persistence/postgres/postgres-backfill-v1';

type HyperdriveBindingV1 = { readonly connectionString: string };
type BackfillEnvV1 = RuntimeEnv & { readonly PROD_DB?: HyperdriveBindingV1 };
type Context = EventContext<BackfillEnvV1, string, unknown>;

type RequestV1 =
  | { readonly operation: 'inspect' }
  | { readonly operation: 'verify-integrity' }
  | {
      readonly operation: 'copy-page';
      readonly family: string;
      readonly afterRowId: number;
      readonly limit: number;
    };

function noStoreJson(value: unknown, status = 200): Response {
  return Response.json(value, {
    status,
    headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, private' },
  });
}

function writeDatabase(value: unknown): D1WriteDatabaseV1 {
  if (
    !value ||
    typeof value !== 'object' ||
    !('prepare' in value) ||
    typeof value.prepare !== 'function' ||
    !('exec' in value) ||
    typeof value.exec !== 'function'
  ) {
    throw new HttpError(503, 'Gradebook database unavailable');
  }
  return value as D1WriteDatabaseV1;
}

async function parseRequest(request: Request): Promise<RequestV1> {
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > 2_048) {
    throw new HttpError(413, 'Backfill request too large');
  }
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new HttpError(400, 'Invalid backfill request');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new HttpError(400, 'Invalid backfill request');
  }
  const value = body as Record<string, unknown>;
  if (value.operation === 'inspect' || value.operation === 'verify-integrity') {
    return { operation: value.operation };
  }
  if (
    value.operation !== 'copy-page' ||
    typeof value.family !== 'string' ||
    !Number.isSafeInteger(value.afterRowId) ||
    (value.afterRowId as number) < 0 ||
    !Number.isSafeInteger(value.limit) ||
    (value.limit as number) < 1 ||
    (value.limit as number) > 2_000 ||
    !gradebookBackfillFamilyV1(value.family)
  ) {
    throw new HttpError(400, 'Invalid backfill request');
  }
  return {
    operation: 'copy-page',
    family: value.family,
    afterRowId: value.afterRowId as number,
    limit: value.limit as number,
  };
}

export const onRequestPost: PagesFunction<BackfillEnvV1> = async (context: Context) => {
  const rawEnv = context.env;
  const env = validateEnv(rawEnv as RuntimeEnv);
  enforceOfficialOrigin(context.request, env);
  enforceWriteOrigin(context.request, env);
  const session = await requireAuth(context.request, env);
  requireCapability(capabilitiesForRoles(session.roles), 'gradebook.persistence.admin');
  const request = await parseRequest(context.request);

  const binding = rawEnv.PROD_DB;
  if (!binding?.connectionString) {
    return noStoreJson(
      { version: 1, state: 'failed', stage: 'binding', code: 'binding-missing' },
      503,
    );
  }

  const guard = createGradebookShadowReadOnlyD1V1(writeDatabase(rawEnv.GRADEBOOK_D1));
  const target = await createGradebookBackfillSqlV1(binding.connectionString);
  try {
    if (request.operation === 'inspect') {
      const families = await inspectGradebookBackfillCountsV1(guard.database, target);
      return noStoreJson({
        version: 1,
        state: 'inspected',
        authorityMode: 'imported-source',
        d1Written: false,
        familyOrder: GRADEBOOK_BACKFILL_FAMILIES_V1.map((value) => value.name),
        families,
      });
    }
    if (request.operation === 'verify-integrity') {
      const result = await verifyGradebookBackfillIntegrityV1(guard.database, target);
      return noStoreJson({
        version: 1,
        ...result,
        authorityMode: 'imported-source',
        d1Written: false,
      });
    }

    const definition = gradebookBackfillFamilyV1(request.family);
    if (!definition) throw new HttpError(400, 'Invalid backfill request');
    const page = await backfillGradebookFamilyPageV1(guard.database, target, {
      family: definition,
      afterRowId: request.afterRowId,
      limit: request.limit,
    });
    if (guard.writeAttempts() !== 0) {
      throw new Error('gradebook-backfill-d1-write-attempt');
    }
    return noStoreJson({
      version: 1,
      state: 'page-verified',
      authorityMode: 'imported-source',
      d1Written: false,
      page,
    });
  } catch (cause) {
    console.error(
      JSON.stringify({
        message: 'gradebook_postgres_backfill_failed',
        operation: request.operation,
        family: request.operation === 'copy-page' ? request.family : null,
        errorType: cause instanceof Error ? cause.name : 'unknown',
      }),
    );
    return noStoreJson(
      {
        version: 1,
        state: 'failed',
        stage: request.operation,
        code: 'backfill-operation-failed',
        d1Written: false,
      },
      503,
    );
  } finally {
    await target.end?.({ timeout: 1 }).catch(() => {
      console.error(JSON.stringify({ message: 'gradebook_postgres_backfill_close_failed' }));
    });
  }
};
