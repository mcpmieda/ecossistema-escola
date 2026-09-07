/** Optional operational telemetry only; never contains academic data or raw errors. */
export const GRADEBOOK_IMPORT_FAILURE_HEADER_V1 = 'X-Gradebook-Import-Failure';
export const GRADEBOOK_IMPORT_FAILURE_PHASES_V1 = [
  'd1',
  'runtime',
  'catalog',
  'catalog-preflight',
  'logical-source',
  'official-records',
  'source-lookup',
  'assessment-definitions',
  'reconciliation',
  'envelope',
  'transaction',
] as const;
export const GRADEBOOK_IMPORT_FAILURE_CODES_V1 = [
  'd1-subrequest-limit',
  'd1-size-limit',
  'd1-parameter-limit',
  'd1-timeout',
  'd1-overloaded',
  'd1-memory',
  'd1-foreign-key',
  'd1-unique',
  'd1-check',
  'd1-not-null',
  'd1-schema',
  'd1-transient',
  'd1-cas',
  'd1-other',
  'database-read-failed',
  'database-write-failed',
  'invalid-json',
  'incompatible-row',
  'broken-reference',
  'invalid-request',
  'nested-transaction',
  'transaction-failed',
  'batch-version-conflict',
  'reconciliation-read-failed',
  'catalog-reference-failed',
  'response-incompatible',
  'unexpected-error',
] as const;
export const GRADEBOOK_IMPORT_FAILURE_OPERATIONS_V1 = [
  'none',
  'prepare',
  'bind',
  'first',
  'all',
  'run',
  'batch',
  'exec',
] as const;
export type GradebookImportFailurePhaseV1 = (typeof GRADEBOOK_IMPORT_FAILURE_PHASES_V1)[number];
export type GradebookImportFailureCodeV1 = (typeof GRADEBOOK_IMPORT_FAILURE_CODES_V1)[number];
export type GradebookImportFailureOperationV1 =
  (typeof GRADEBOOK_IMPORT_FAILURE_OPERATIONS_V1)[number];
export interface GradebookImportFailureEventV1 {
  readonly phase: GradebookImportFailurePhaseV1;
  readonly code: GradebookImportFailureCodeV1;
  readonly operation: GradebookImportFailureOperationV1;
}
export interface GradebookImportFailureDiagnosticV1 {
  readonly version: 1;
  readonly events: readonly GradebookImportFailureEventV1[];
}

function member<T extends string>(value: unknown, values: readonly T[]): value is T {
  return typeof value === 'string' && values.includes(value as T);
}

/** Reject unknown fields, oversized data and arbitrary server-provided text. */
export function parseGradebookImportFailureDiagnosticV1(
  raw: string | null,
): GradebookImportFailureDiagnosticV1 | null {
  if (raw === null || raw.length > 2048) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const envelope = value as Record<string, unknown>;
    if (
      Object.keys(envelope).some((key) => key !== 'version' && key !== 'events') ||
      envelope.version !== 1 ||
      !Array.isArray(envelope.events) ||
      envelope.events.length < 1 ||
      envelope.events.length > 4
    )
      return null;
    const events: GradebookImportFailureEventV1[] = [];
    for (const candidate of envelope.events) {
      if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return null;
      const event = candidate as Record<string, unknown>;
      if (
        Object.keys(event).some((key) => !['phase', 'code', 'operation'].includes(key)) ||
        !member(event.phase, GRADEBOOK_IMPORT_FAILURE_PHASES_V1) ||
        !member(event.code, GRADEBOOK_IMPORT_FAILURE_CODES_V1) ||
        !member(event.operation, GRADEBOOK_IMPORT_FAILURE_OPERATIONS_V1)
      )
        return null;
      events.push({ phase: event.phase, code: event.code, operation: event.operation });
    }
    return { version: 1, events };
  } catch {
    return null;
  }
}
