import {
  INSTITUTIONAL_REPORTS_CONTRACT_VERSION_V1,
  type InstitutionalReportRequestV1,
  type InstitutionalReportResponseV1,
} from '../../../../shared/gradebook-contracts/reports/institutional-reports-contract-v1';

const INSTITUTIONAL_REPORTS_ENDPOINT = '/api/gradebook/reports';

export type InstitutionalReportsClientFailureV1 = 'not-authorized' | 'unavailable';

export class InstitutionalReportsClientErrorV1 extends Error {
  constructor(readonly code: InstitutionalReportsClientFailureV1) {
    super(
      code === 'not-authorized'
        ? 'Relatórios institucionais não autorizados.'
        : 'Relatórios institucionais indisponíveis.',
    );
    this.name = 'InstitutionalReportsClientErrorV1';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isResponse(
  value: unknown,
  request: InstitutionalReportRequestV1,
): value is InstitutionalReportResponseV1 {
  if (
    !isRecord(value) ||
    value.contractVersion !== INSTITUTIONAL_REPORTS_CONTRACT_VERSION_V1 ||
    !['ready', 'empty', 'insufficient-data', 'invalid-request', 'not-authorized', 'unavailable'].includes(
      String(value.state),
    )
  ) {
    return false;
  }
  if (value.state === 'ready') {
    return value.family === request.family && isRecord(value.report);
  }
  if ('family' in value && value.family !== request.family) return false;
  return value.report === null;
}

export async function requestInstitutionalReportV1(
  request: InstitutionalReportRequestV1,
  signal?: AbortSignal,
): Promise<InstitutionalReportResponseV1> {
  const response = await fetch(INSTITUTIONAL_REPORTS_ENDPOINT, {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
    signal,
  });
  if (response.status === 401 || response.status === 403) {
    throw new InstitutionalReportsClientErrorV1('not-authorized');
  }
  if (response.status >= 500) throw new InstitutionalReportsClientErrorV1('unavailable');
  const payload: unknown = await response.json().catch(() => null);
  if (!isResponse(payload, request)) throw new InstitutionalReportsClientErrorV1('unavailable');
  return payload;
}
