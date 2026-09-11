import {
  IMPORT_DIAGNOSTIC_TREATMENT_CONTRACT_VERSION_V1,
  importDiagnosticTreatmentResponseSchemaV1,
  type ImportDiagnosticTreatmentRequestV1,
  type ImportDiagnosticTreatmentResponseV1,
} from '../../../../shared/gradebook-contracts/audit/import-diagnostic-treatment-v1';

const ENDPOINT = '/api/gradebook/audit-treatment';

function fallback(state: 'not-authorized' | 'unavailable'): ImportDiagnosticTreatmentResponseV1 {
  return {
    contractVersion: IMPORT_DIAGNOSTIC_TREATMENT_CONTRACT_VERSION_V1,
    state,
  };
}

export async function requestImportDiagnosticTreatmentV1(
  request: ImportDiagnosticTreatmentRequestV1,
  signal?: AbortSignal,
): Promise<ImportDiagnosticTreatmentResponseV1> {
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
    signal,
  });
  if (response.status === 401 || response.status === 403) return fallback('not-authorized');
  let value: unknown;
  try {
    value = await response.json();
  } catch {
    return fallback('unavailable');
  }
  const parsed = importDiagnosticTreatmentResponseSchemaV1.safeParse(value);
  return parsed.success ? parsed.data : fallback('unavailable');
}

export function importDiagnosticTreatmentIdempotencyKeyV1(): string {
  return `audit:${crypto.randomUUID()}`;
}
