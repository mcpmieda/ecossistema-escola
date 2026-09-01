import {
  BULLETIN_CONTRACT_VERSION_V1,
  type BulletinIssuerIdV1,
  type BulletinSnapshotIdV1,
} from '../../../shared/gradebook-contracts/bulletins/bulletin-contract-v1';
import {
  inspectBulletinWorkspaceTransportRequestV1,
  type BulletinWorkspaceTransportRequestV1,
} from '../../../shared/gradebook-contracts/bulletins/bulletin-transport-v1';
import { AuthenticationError, requireAuth } from '../../auth/session';
import { AuthorizationError } from '../../auth/roles';
import type { RuntimeEnv } from '../../env';
import {
  enforceOfficialOrigin,
  enforceWriteOrigin,
  HttpError,
  readBoundedJson,
} from '../../http/security';
import { createBulletinWorkspaceServiceV1 } from '../application/bulletins/bulletin-workspace-service-v1';
import {
  createLocalBulletinSnapshotRepositoryV1,
  type BulletinSnapshotSeriesKeyV1,
} from '../application/bulletins/bulletin-snapshot-repository-v1';
import { authorizeGradebookD1RuntimeV1 } from '../persistence/d1/runtime/d1-runtime-authorization-v1';
import { createGradebookD1RuntimeV1 } from '../persistence/d1/runtime/d1-runtime-v1';

export const GRADEBOOK_BULLETIN_ROUTE_V1 = '/api/gradebook/bulletins';

const localSnapshots = createLocalBulletinSnapshotRepositoryV1();
let localSnapshotSequence = 0;

function localSnapshotId(_seriesKey: BulletinSnapshotSeriesKeyV1): BulletinSnapshotIdV1 {
  localSnapshotSequence += 1;
  return `bulletin-snapshot:local-preview:${localSnapshotSequence}` as BulletinSnapshotIdV1;
}

function noStoreResponse(body: BodyInit | null, status: number, contentType?: string): Response {
  const headers = new Headers({
    'Cache-Control': 'no-store, no-cache, must-revalidate, private',
    Expires: '0',
    Pragma: 'no-cache',
  });
  if (contentType) headers.set('Content-Type', contentType);
  return new Response(body, { status, headers });
}

function noStoreJson(value: unknown, status = 200): Response {
  return noStoreResponse(JSON.stringify(value), status, 'application/json; charset=utf-8');
}

function accessDenied(status: 401 | 403): Response {
  return noStoreResponse(null, status);
}

function unavailable(status = 503): Response {
  return noStoreResponse(null, status);
}

export async function handleBulletinRequestV1(
  request: Request,
  env: RuntimeEnv,
): Promise<Response | null> {
  if (new URL(request.url).pathname !== GRADEBOOK_BULLETIN_ROUTE_V1) return null;

  enforceOfficialOrigin(request, env);
  if (request.method !== 'POST') throw new HttpError(405, 'Method not allowed');
  enforceWriteOrigin(request, env);

  let session: Awaited<ReturnType<typeof requireAuth>>;
  let authorization: ReturnType<typeof authorizeGradebookD1RuntimeV1>;
  try {
    session = await requireAuth(request, env);
    authorization = authorizeGradebookD1RuntimeV1(session);
  } catch (cause) {
    if (cause instanceof AuthenticationError) return accessDenied(401);
    if (cause instanceof AuthorizationError) return accessDenied(403);
    return unavailable(500);
  }

  let payload: unknown;
  try {
    payload = await readBoundedJson(request, 65_536);
  } catch (cause) {
    return unavailable(cause instanceof HttpError ? cause.status : 400);
  }

  const readiness = inspectBulletinWorkspaceTransportRequestV1(payload);
  if (readiness !== 'ready') {
    return noStoreJson(
      {
        contractVersion: BULLETIN_CONTRACT_VERSION_V1,
        state: 'unavailable',
        reason: readiness,
      },
      400,
    );
  }

  try {
    // createGradebookD1RuntimeV1 enforces local/preview and fails closed before binding in production.
    const runtime = createGradebookD1RuntimeV1(env, authorization);
    const unit = runtime.persistenceUnitOfWork();
    const readModels = runtime.operationalReadModels();
    const workspace = createBulletinWorkspaceServiceV1({
      academicYears: runtime.operationalWorkspaceAcademicYears(),
      entities: unit.entities,
      classGroups: readModels.classGroups,
      academicRecords: unit.academicRecords,
      snapshots: localSnapshots,
      now: () => new Date().toISOString(),
      createSnapshotId: localSnapshotId,
    });
    const response = await workspace.execute(payload as BulletinWorkspaceTransportRequestV1, {
      decision: 'allowed',
      issuerId: session.oid as BulletinIssuerIdV1,
    });
    return noStoreJson(response);
  } catch (cause) {
    if (cause instanceof AuthenticationError) return accessDenied(401);
    if (cause instanceof AuthorizationError) return accessDenied(403);
    return unavailable();
  }
}
