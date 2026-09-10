import type { RuntimeEnv } from '../../../server/env';
import { validateEnv } from '../../../server/env';
import { requireAuth, AuthenticationError } from '../../../server/auth/session';
import { AuthorizationError } from '../../../server/auth/roles';
import { authorizeGradebookD1RuntimeV1 } from '../../../server/gradebook/persistence/d1/runtime/d1-runtime-authorization-v1';
import type { D1WriteDatabaseV1 } from '../../../server/gradebook/persistence/d1/write/d1-write-adapter-v1';
import { withOfficialGradebookDatabaseV1 } from '../../../server/gradebook/persistence/postgres/official-gradebook-database-v1';
import { createGradebookRelationalImportServiceV11 } from '../../../server/gradebook/application/import/import-relational-service-v11';
import {
  GRADEBOOK_IMPORT_PERSISTENCE_BODY_BYTES_V9,
  inspectGradebookImportPersistenceRequestV9,
  type GradebookImportPersistenceRequestV9,
  type GradebookImportPersistenceResponseV9,
} from '../../../shared/gradebook-contracts/imports/import-persistence-transport-v9';
import {
  enforceOfficialOrigin,
  enforceWriteOrigin,
  HttpError,
  withSecurityHeaders,
} from '../../../server/http/security';

type Context = EventContext<RuntimeEnv, string, unknown>;

function statusFor(value: GradebookImportPersistenceResponseV9): number {
  switch (value.state) {
    case 'applied':
    case 'no-changes':
    case 'review-required':
      return 200;
    case 'blocked':
    case 'conflict':
      return 409;
    case 'invalid-request':
      return 400;
    case 'not-authorized':
      return 403;
    case 'unavailable':
      return 503;
  }
}

function response(value: GradebookImportPersistenceResponseV9, serverMs: number): Response {
  const headers = new Headers({
    'Cache-Control': 'no-store',
    'X-Gradebook-Server-Ms': String(Math.round(serverMs * 10) / 10),
  });
  return Response.json(value, { status: statusFor(value), headers });
}

async function readPayload(request: Request): Promise<unknown> {
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > GRADEBOOK_IMPORT_PERSISTENCE_BODY_BYTES_V9) {
    throw new HttpError(413, 'Payload too large');
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

async function clearStaleImportDiagnostics(
  database: D1WriteDatabaseV1,
  payload: GradebookImportPersistenceRequestV9,
): Promise<void> {
  await database
    .prepare(
      `DELETE FROM gradebook.importacao_diagnostico
       WHERE ano IS NOT DISTINCT FROM ?
         AND arquivo = ?
         AND hash <> decode(?, 'hex')`,
    )
    .bind(payload.ano, payload.manifest.fileName, payload.manifest.sha256)
    .run();
}

async function handle(request: Request, env: RuntimeEnv): Promise<Response> {
  const started = performance.now();
  if (request.method !== 'POST') throw new HttpError(405, 'Method not allowed');
  enforceOfficialOrigin(request, env);
  enforceWriteOrigin(request, env);
  const session = await requireAuth(request, env);
  authorizeGradebookD1RuntimeV1(session);

  const payload = await readPayload(request);
  const inspection = inspectGradebookImportPersistenceRequestV9(payload);
  if (inspection !== 'ready') {
    return response(
      {
        transportVersion: 9,
        state: 'invalid-request',
        reason: inspection === 'payload-too-large' ? 'Pacote acadêmico excede o limite permitido.' : 'Pacote acadêmico canônico inválido.',
      },
      performance.now() - started,
    );
  }
  const database = env.GRADEBOOK_D1 as D1WriteDatabaseV1 | undefined;
  if (!database) return response({ transportVersion: 9, state: 'unavailable' }, performance.now() - started);
  const canonical = payload as GradebookImportPersistenceRequestV9;
  await clearStaleImportDiagnostics(database, canonical);
  const result = await createGradebookRelationalImportServiceV11(database).execute(canonical);
  return response(result, performance.now() - started);
}

export const onRequest: PagesFunction<RuntimeEnv> = async (context) => {
  try {
    const env = validateEnv((context as Context).env);
    const routed = await withOfficialGradebookDatabaseV1(env, (executionEnv) =>
      handle((context as Context).request, executionEnv),
    );
    return withSecurityHeaders(routed ?? Response.json({ transportVersion: 9, state: 'unavailable' }, { status: 503 }), true);
  } catch (error) {
    const status =
      error instanceof HttpError || error instanceof AuthenticationError || error instanceof AuthorizationError
        ? error.status
        : 500;
    const value: GradebookImportPersistenceResponseV9 =
      status === 401 || status === 403
        ? { transportVersion: 9, state: 'not-authorized' }
        : status < 500
          ? { transportVersion: 9, state: 'invalid-request', reason: error instanceof Error ? error.message : 'Pedido inválido.' }
          : { transportVersion: 9, state: 'unavailable' };
    if (status >= 500) console.error(JSON.stringify({ message: 'gradebook_relational_import_failed', error: error instanceof Error ? error.message : 'unknown' }));
    return withSecurityHeaders(Response.json(value, { status }), true);
  }
};