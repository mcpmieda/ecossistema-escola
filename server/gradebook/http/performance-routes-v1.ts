import {
  PERFORMANCE_TRANSPORT_VERSION_V1,
  isPerformanceTransportRequestV1,
  type PerformanceCellDetailTransportV1,
  type PerformanceInvalidRequestReasonV1,
  type PerformanceStudentDetailTransportV1,
  type PerformanceTransportOperationV1,
  type PerformanceTransportRequestV1,
} from '../../../shared/gradebook-contracts/performance/performance-transport-v1';
import { AuthenticationError, requireAuth } from '../../auth/session';
import { AuthorizationError } from '../../auth/roles';
import type { RuntimeEnv } from '../../env';
import {
  enforceOfficialOrigin,
  enforceWriteOrigin,
  HttpError,
  readBoundedJson,
} from '../../http/security';
import {
  ClassPerformanceReadModelErrorV1,
  type ClassPerformanceReadModelProviderV1,
  type PerformanceCellDetailV1,
  type PerformanceStudentDetailV1,
} from '../application/read-models/performance/class-performance-read-model-v1';
import {
  authorizeGradebookD1RuntimeV1,
  type GradebookD1RuntimeAuthorizationV1,
} from '../persistence/d1/runtime/d1-runtime-authorization-v1';
import { createGradebookD1RuntimeV1 } from '../persistence/d1/runtime/d1-runtime-v1';

export const GRADEBOOK_PERFORMANCE_ROUTE_V1 = '/api/gradebook/performance';

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

function notAuthorized(status: 401 | 403): Response {
  return noStoreJson(
    { transportVersion: PERFORMANCE_TRANSPORT_VERSION_V1, state: 'not-authorized' },
    status,
  );
}

function unavailable(status = 503): Response {
  return noStoreJson(
    { transportVersion: PERFORMANCE_TRANSPORT_VERSION_V1, state: 'unavailable' },
    status,
  );
}

function invalidRequest(reason: PerformanceInvalidRequestReasonV1): Response {
  return noStoreJson(
    { transportVersion: PERFORMANCE_TRANSPORT_VERSION_V1, state: 'invalid-request', reason },
    400,
  );
}

function empty(operation: PerformanceTransportOperationV1): Response {
  return noStoreJson({ transportVersion: PERFORMANCE_TRANSPORT_VERSION_V1, state: 'empty', operation });
}

function studentDetailTransport(
  detail: PerformanceStudentDetailV1,
): PerformanceStudentDetailTransportV1 {
  return {
    detailRef: detail.detailRef,
    academicYearId: detail.academicYearId,
    classGroupId: detail.classGroupId,
    student:
      detail.student === null
        ? null
        : {
            id: detail.student.id,
            displayName: detail.student.displayName,
          },
    enrollment: {
      id: detail.enrollment.id,
      studentId: detail.enrollment.studentId,
      classGroupId: detail.enrollment.classGroupId,
      position: detail.enrollment.position,
      ...(detail.enrollment.sourcePosition === undefined
        ? {}
        : { sourcePosition: detail.enrollment.sourcePosition }),
    },
    statusHistory: detail.statusHistory.map((event) => ({
      id: event.id,
      status: event.status,
      ...(event.occurredOn === undefined ? {} : { occurredOn: event.occurredOn }),
    })),
  };
}

function cellDetailTransport(detail: PerformanceCellDetailV1): PerformanceCellDetailTransportV1 {
  return {
    detailRef: detail.detailRef,
    studentId: detail.studentId,
    authorityMode: detail.authorityMode,
    cell: detail.cell,
  };
}

export interface PerformanceRequestHandlerDependenciesV1 {
  authorizeRequest(
    request: Request,
    env: RuntimeEnv,
  ): Promise<GradebookD1RuntimeAuthorizationV1>;
  createProvider(
    env: RuntimeEnv,
    authorization: GradebookD1RuntimeAuthorizationV1,
  ): ClassPerformanceReadModelProviderV1;
}

const defaultDependencies: PerformanceRequestHandlerDependenciesV1 = {
  async authorizeRequest(request, env) {
    const session = await requireAuth(request, env);
    return authorizeGradebookD1RuntimeV1(session);
  },
  createProvider(env, authorization) {
    const runtime = createGradebookD1RuntimeV1(env, authorization);
    return runtime.classPerformanceReadModel();
  },
};

function errorResponse(cause: unknown): Response {
  if (!(cause instanceof ClassPerformanceReadModelErrorV1)) return unavailable();
  switch (cause.code) {
    case 'invalid-request':
    case 'invalid-row-cursor':
    case 'invalid-column-cursor':
    case 'invalid-detail-reference':
      return invalidRequest(cause.code);
    case 'incompatible-source-result':
    case 'source-failure':
      return unavailable();
  }
}

export function createPerformanceRequestHandlerV1(
  dependencies: PerformanceRequestHandlerDependenciesV1 = defaultDependencies,
): (request: Request, env: RuntimeEnv) => Promise<Response | null> {
  return async (request, env) => {
    if (new URL(request.url).pathname !== GRADEBOOK_PERFORMANCE_ROUTE_V1) return null;

    enforceOfficialOrigin(request, env);
    if (request.method !== 'POST') throw new HttpError(405, 'Method not allowed');
    enforceWriteOrigin(request, env);

    let authorization: GradebookD1RuntimeAuthorizationV1;
    try {
      authorization = await dependencies.authorizeRequest(request, env);
    } catch (cause) {
      if (cause instanceof AuthenticationError) return notAuthorized(401);
      if (cause instanceof AuthorizationError) return notAuthorized(403);
      return unavailable(500);
    }

    let payload: unknown;
    try {
      payload = await readBoundedJson(request, 32_768);
    } catch (cause) {
      return invalidRequest(cause instanceof HttpError ? 'invalid-request' : 'invalid-request');
    }
    if (!isPerformanceTransportRequestV1(payload)) return invalidRequest('invalid-request');

    let provider: ClassPerformanceReadModelProviderV1;
    try {
      provider = dependencies.createProvider(env, authorization);
    } catch {
      return unavailable();
    }

    try {
      const transportRequest: PerformanceTransportRequestV1 = payload;
      if (transportRequest.operation === 'matrix') {
        const matrix = await provider.get(transportRequest.request);
        return matrix === null
          ? empty('matrix')
          : noStoreJson({
              transportVersion: PERFORMANCE_TRANSPORT_VERSION_V1,
              state: 'ready',
              operation: 'matrix',
              matrix,
            });
      }

      if (transportRequest.operation === 'student-detail') {
        const detail = await provider.getStudentDetail(transportRequest.detailRef);
        return detail === null
          ? empty('student-detail')
          : noStoreJson({
              transportVersion: PERFORMANCE_TRANSPORT_VERSION_V1,
              state: 'ready',
              operation: 'student-detail',
              detail: studentDetailTransport(detail),
            });
      }

      const detail = await provider.getCellDetail(transportRequest.detailRef);
      return detail === null
        ? empty('cell-detail')
        : noStoreJson({
            transportVersion: PERFORMANCE_TRANSPORT_VERSION_V1,
            state: 'ready',
            operation: 'cell-detail',
            detail: cellDetailTransport(detail),
          });
    } catch (cause) {
      return errorResponse(cause);
    }
  };
}

export const handlePerformanceRequestV1 = createPerformanceRequestHandlerV1();
