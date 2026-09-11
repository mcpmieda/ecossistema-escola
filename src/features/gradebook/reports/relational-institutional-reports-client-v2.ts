import {
  relationalInstitutionalReportResponseMatchesV2,
  relationalInstitutionalReportResponseSchemaV2,
  type RelationalInstitutionalReportFailureV2,
  type RelationalInstitutionalReportRequestV2,
  type RelationalInstitutionalReportResponseV2,
} from '../../../../shared/gradebook-contracts/reports/relational-institutional-reports-v2';

const ENDPOINT = '/api/gradebook/reports';

export class RelationalInstitutionalReportsClientErrorV2 extends Error {
  constructor(readonly code: RelationalInstitutionalReportFailureV2) {
    super(code);
    this.name = 'RelationalInstitutionalReportsClientErrorV2';
  }
}

export async function requestRelationalInstitutionalReportV2(
  request: RelationalInstitutionalReportRequestV2,
  signal?: AbortSignal,
): Promise<RelationalInstitutionalReportResponseV2> {
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
    signal,
  });
  if (response.status === 401 || response.status === 403) {
    throw new RelationalInstitutionalReportsClientErrorV2('not-authorized');
  }
  const payload: unknown = await response.json().catch(() => null);
  const parsed = relationalInstitutionalReportResponseSchemaV2.safeParse(payload);
  if (!parsed.success || !relationalInstitutionalReportResponseMatchesV2(request, parsed.data)) {
    throw new RelationalInstitutionalReportsClientErrorV2('unavailable');
  }
  if (parsed.data.state !== 'ready') {
    throw new RelationalInstitutionalReportsClientErrorV2(parsed.data.state);
  }
  if (!response.ok) throw new RelationalInstitutionalReportsClientErrorV2('unavailable');
  return parsed.data;
}
