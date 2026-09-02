import {
  AUDIT_WORKSPACE_CONTRACT_VERSION_V1,
  inspectAuditWorkspaceDetailRequestV1,
  inspectAuditWorkspaceListRequestV1,
  inspectAuditWorkspaceResolutionRequestV1,
  type AuditWorkspaceDetailRequestV1,
  type AuditWorkspaceListRequestV1,
  type AuditWorkspaceResolutionRequestV1,
} from '../../../shared/gradebook-contracts/audit-workspace/audit-workspace-contract-v1';
import type { ReconciliationResultId } from '../../../shared/gradebook-contracts/audit/audit-contract-v1';
import type { AcademicYearId } from '../../../shared/gradebook-contracts/entities';
import type {
  DeterministicCorrectionCaseRecordV2,
  DeterministicCorrectionCaseReferenceV2,
} from '../application/audit-workspace/deterministic-correction-v2';
import { AuthenticationError, requireAuth } from '../../auth/session';
import { AuthorizationError } from '../../auth/roles';
import type { RuntimeEnv } from '../../env';
import {
  enforceOfficialOrigin,
  enforceWriteOrigin,
  HttpError,
  readBoundedJson,
} from '../../http/security';
import { authorizeGradebookD1RuntimeV1 } from '../persistence/d1/runtime/d1-runtime-authorization-v1';
import { createGradebookD1RuntimeV1 } from '../persistence/d1/runtime/d1-runtime-v1';

export const GRADEBOOK_AUDIT_WORKSPACE_ROUTE_V1 = '/api/gradebook/audit-workspace';
const DETERMINISTIC_CORRECTION_TRANSPORT_VERSION_V2 = 2 as const;

type DeterministicCorrectionTransportRequestV2 =
  | {
      readonly contractVersion: 2;
      readonly operation: 'inspect-deterministic-correction';
      readonly academicYearId: AcademicYearId;
      readonly reconciliationId: ReconciliationResultId;
    }
  | {
      readonly contractVersion: 2;
      readonly operation: 'execute-deterministic-correction';
      readonly academicYearId: AcademicYearId;
      readonly caseReference: string;
      readonly expectedVersion: number;
    };

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

type AuditWorkspaceHttpOperationV1 =
  'list' | 'detail' | 'resolve' | DeterministicCorrectionTransportRequestV2['operation'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function onlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const allowed = new Set(keys);
  return Object.keys(value).every((key) => allowed.has(key));
}

function inspectDeterministicCorrectionTransportRequestV2(
  value: unknown,
): value is DeterministicCorrectionTransportRequestV2 {
  if (
    !isRecord(value) ||
    value.contractVersion !== DETERMINISTIC_CORRECTION_TRANSPORT_VERSION_V2 ||
    !nonEmpty(value.academicYearId)
  ) {
    return false;
  }
  if (value.operation === 'inspect-deterministic-correction') {
    return (
      onlyKeys(value, ['contractVersion', 'operation', 'academicYearId', 'reconciliationId']) &&
      nonEmpty(value.reconciliationId)
    );
  }
  return (
    value.operation === 'execute-deterministic-correction' &&
    onlyKeys(value, [
      'contractVersion',
      'operation',
      'academicYearId',
      'caseReference',
      'expectedVersion',
    ]) &&
    nonEmpty(value.caseReference) &&
    Number.isInteger(value.expectedVersion) &&
    Number(value.expectedVersion) > 0
  );
}

function projectDeterministicCorrectionCaseSummaryV2(input: DeterministicCorrectionCaseRecordV2) {
  const divergence = {
    id: input.case.divergence.id,
    target: input.case.divergence.target,
    status: input.case.divergence.status,
    difference: input.case.divergence.difference,
    ruleVersion: input.case.divergence.ruleVersion,
    ...('explanation' in input.case.divergence && input.case.divergence.explanation
      ? { explanation: input.case.divergence.explanation }
      : {}),
  };
  const automaticCorrection =
    input.case.automaticCorrection.state === 'eligible'
      ? {
          state: 'eligible' as const,
          rootCauseCode: input.case.automaticCorrection.proof.rootCause.code,
          operation: input.case.automaticCorrection.proof.operation.kind,
          requiresHumanJudgment: false as const,
        }
      : input.case.automaticCorrection;
  return {
    reference: input.reference,
    version: input.version,
    recordedAt: input.recordedAt,
    divergence,
    academicImpact: input.case.academicImpact,
    investigation: input.case.investigation,
    automaticCorrection,
    correctionOutcome: input.case.correctionOutcome,
    institutionalRelease: input.case.institutionalRelease,
    pilotFlow: input.case.pilotFlow,
  };
}

function operationFromPayload(value: unknown): AuditWorkspaceHttpOperationV1 | null {
  if (!isRecord(value)) return null;
  if (
    value.operation === 'inspect-deterministic-correction' ||
    value.operation === 'execute-deterministic-correction'
  ) {
    return value.operation;
  }
  const markers: AuditWorkspaceHttpOperationV1[] = [];
  if (Object.hasOwn(value, 'collection')) markers.push('list');
  if (Object.hasOwn(value, 'reference')) markers.push('detail');
  if (Object.hasOwn(value, 'occurrenceId') || Object.hasOwn(value, 'transition')) {
    markers.push('resolve');
  }
  return markers.length === 1 ? (markers[0] ?? null) : null;
}

function invalidDeterministicCorrection(): Response {
  return noStoreJson(
    {
      contractVersion: DETERMINISTIC_CORRECTION_TRANSPORT_VERSION_V2,
      outcome: 'invalid-request',
      case: null,
    },
    400,
  );
}

function invalidList(outcome: 'invalid-request' | 'invalid-cursor'): Response {
  return noStoreJson(
    {
      contractVersion: AUDIT_WORKSPACE_CONTRACT_VERSION_V1,
      outcome,
      items: [],
      nextCursor: null,
    },
    400,
  );
}

function invalidDetail(): Response {
  return noStoreJson(
    {
      contractVersion: AUDIT_WORKSPACE_CONTRACT_VERSION_V1,
      outcome: 'invalid-request',
      detail: null,
    },
    400,
  );
}

function invalidResolution(outcome: 'invalid-request' | 'invalid-transition'): Response {
  return noStoreJson(
    {
      contractVersion: AUDIT_WORKSPACE_CONTRACT_VERSION_V1,
      outcome,
      currentVersion: null,
    },
    400,
  );
}

export async function handleAuditWorkspaceRequestV1(
  request: Request,
  env: RuntimeEnv,
): Promise<Response | null> {
  if (new URL(request.url).pathname !== GRADEBOOK_AUDIT_WORKSPACE_ROUTE_V1) return null;

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
    payload = await readBoundedJson(request, 16_384);
  } catch (cause) {
    return unavailable(cause instanceof HttpError ? cause.status : 400);
  }

  const operation = operationFromPayload(payload);
  if (operation === null) return unavailable(400);

  const deterministicOperation =
    operation === 'inspect-deterministic-correction' ||
    operation === 'execute-deterministic-correction';

  if (deterministicOperation) {
    if (!inspectDeterministicCorrectionTransportRequestV2(payload)) {
      return invalidDeterministicCorrection();
    }
  } else if (operation === 'list') {
    const candidate = payload as AuditWorkspaceListRequestV1;
    const readiness = inspectAuditWorkspaceListRequestV1(candidate);
    if (readiness !== 'ready') return invalidList(readiness);
  } else if (operation === 'detail') {
    const candidate = payload as AuditWorkspaceDetailRequestV1;
    if (inspectAuditWorkspaceDetailRequestV1(candidate) !== 'ready') return invalidDetail();
  } else if (operation === 'resolve') {
    const candidate = payload as AuditWorkspaceResolutionRequestV1;
    const readiness = inspectAuditWorkspaceResolutionRequestV1(candidate);
    if (readiness !== 'ready') return invalidResolution(readiness);
  }

  try {
    const runtime = createGradebookD1RuntimeV1(env, authorization);
    const workspace = runtime.auditWorkspace({
      resolutionIdentity: () => ({
        actorId: session.oid,
        occurredAt: new Date().toISOString(),
      }),
    });

    if (deterministicOperation) {
      const request = payload as DeterministicCorrectionTransportRequestV2;
      const deterministicWorkspace = runtime.deterministicCorrectionWorkspace({
        correctionIdentity: () => ({
          actorId: session.oid,
          occurredAt: new Date().toISOString(),
        }),
      });
      if (request.operation === 'inspect-deterministic-correction') {
        const result = await deterministicWorkspace.inspect({
          academicYearId: request.academicYearId,
          reconciliationId: request.reconciliationId,
        });
        return result.outcome === 'case'
          ? noStoreJson({
              contractVersion: DETERMINISTIC_CORRECTION_TRANSPORT_VERSION_V2,
              outcome: 'case',
              case: projectDeterministicCorrectionCaseSummaryV2(result.record),
            })
          : noStoreJson({
              contractVersion: DETERMINISTIC_CORRECTION_TRANSPORT_VERSION_V2,
              outcome: result.outcome,
              case: null,
            });
      }
      const result = await deterministicWorkspace.execute({
        academicYearId: request.academicYearId,
        reference: request.caseReference as DeterministicCorrectionCaseReferenceV2,
        expectedVersion: request.expectedVersion,
      });
      if (
        result.outcome === 'applied' ||
        result.outcome === 'already-completed' ||
        result.outcome === 'not-eligible' ||
        result.outcome === 'blocked'
      ) {
        return noStoreJson({
          contractVersion: DETERMINISTIC_CORRECTION_TRANSPORT_VERSION_V2,
          outcome: result.outcome,
          case: projectDeterministicCorrectionCaseSummaryV2(result.record),
        });
      }
      return noStoreJson({
        contractVersion: DETERMINISTIC_CORRECTION_TRANSPORT_VERSION_V2,
        outcome: result.outcome,
        case: null,
        ...(result.outcome === 'version-conflict' ? { currentVersion: result.currentVersion } : {}),
      });
    }

    if (operation === 'list') {
      return noStoreJson(await workspace.list(payload as AuditWorkspaceListRequestV1));
    }
    if (operation === 'detail') {
      return noStoreJson(await workspace.detail(payload as AuditWorkspaceDetailRequestV1));
    }
    return noStoreJson(await workspace.resolve(payload as AuditWorkspaceResolutionRequestV1));
  } catch (cause) {
    if (cause instanceof AuthenticationError) return accessDenied(401);
    if (cause instanceof AuthorizationError) return accessDenied(403);
    return unavailable();
  }
}
