import {
  GRADEBOOK_IMPORT_FAILURE_CODES_V1,
  type GradebookImportFailureCodeV1,
  type GradebookImportFailureDiagnosticV1,
  type GradebookImportFailureEventV1,
  type GradebookImportFailureOperationV1,
  type GradebookImportFailurePhaseV1,
} from '../../../../shared/gradebook-import-diagnostics-v1';
import { isGradebookD1RetryableTransientErrorV1 } from '../../persistence/d1/transaction/d1-transient-observation-v1';

export type GradebookImportFailureReporterV1 = (
  phase: GradebookImportFailurePhaseV1,
  cause: unknown,
) => void;

// Inspect messages transiently for a closed category. Never retain or serialize them.
function errorText(cause: unknown, depth = 0): string {
  if (depth > 2) return '';
  if (typeof cause === 'string') return cause.slice(0, 8192);
  if (!(cause instanceof Error)) return '';
  return `${cause.message.slice(0, 8192)} ${errorText(cause.cause, depth + 1)}`;
}

export function classifyGradebookImportFailureV1(
  cause: unknown,
  d1 = false,
): GradebookImportFailureCodeV1 {
  const message = errorText(cause);
  if (/too many (?:subrequests|api requests)|query limit exceeded/iu.test(message))
    return 'd1-subrequest-limit';
  if (/too many (?:sql variables|bound parameters)|maximum.*bound parameters/iu.test(message))
    return 'd1-parameter-limit';
  if (
    /SQLITE_TOOBIG|string or blob too big|statement too long|(?:request|payload|body).*too large/iu.test(
      message,
    )
  )
    return 'd1-size-limit';
  if (/query.*(?:timeout|timed out)|D1.*(?:timeout|timed out)/iu.test(message)) return 'd1-timeout';
  if (/overloaded/iu.test(message)) return 'd1-overloaded';
  if (/out of memory|memory limit/iu.test(message)) return 'd1-memory';
  if (/foreign key constraint failed/iu.test(message)) return 'd1-foreign-key';
  if (/unique constraint failed/iu.test(message)) return 'd1-unique';
  if (/check constraint failed/iu.test(message)) return 'd1-check';
  if (/not null constraint failed/iu.test(message)) return 'd1-not-null';
  if (/no such (?:table|column)|no column named|syntax error/iu.test(message)) return 'd1-schema';
  if (/gradebook_atomic_batch_guard_failure/iu.test(message)) return 'd1-cas';
  if (/malformed json/iu.test(message)) return 'invalid-json';
  if (isGradebookD1RetryableTransientErrorV1(cause)) return 'd1-transient';
  const code = cause instanceof Error && 'code' in cause ? cause.code : cause;
  if (
    typeof code === 'string' &&
    GRADEBOOK_IMPORT_FAILURE_CODES_V1.includes(code as GradebookImportFailureCodeV1)
  ) {
    return code as GradebookImportFailureCodeV1;
  }
  if (
    /^(?:status-roster-reference-(?:conflict|missing)|status-bulk-read-incompatible|annual-assignment-cache-missing|academic-catalog-version-conflict)$/u.test(
      message.trim(),
    )
  ) {
    return 'catalog-reference-failed';
  }
  return d1 ? 'd1-other' : 'unexpected-error';
}

export function reportGradebookImportFailureV1(
  report: GradebookImportFailureReporterV1 | undefined,
  phase: GradebookImportFailurePhaseV1,
  cause: unknown,
): void {
  try {
    report?.(phase, cause);
  } catch {
    /* Diagnostics must never change persistence. */
  }
}

export function createGradebookImportFailureCollectorV1() {
  const events: GradebookImportFailureEventV1[] = [];
  const record = (
    phase: GradebookImportFailurePhaseV1,
    cause: unknown,
    operation: GradebookImportFailureOperationV1 = 'none',
  ) => {
    const event = {
      phase,
      code: classifyGradebookImportFailureV1(cause, phase === 'd1'),
      operation,
    };
    const previous = events.at(-1);
    if (
      previous?.phase === event.phase &&
      previous.code === event.code &&
      previous.operation === event.operation
    )
      return;
    if (events.length === 4) events.shift();
    events.push(event);
  };
  return {
    report: (phase: GradebookImportFailurePhaseV1, cause: unknown) => record(phase, cause),
    d1: (operation: Exclude<GradebookImportFailureOperationV1, 'none'>, cause: unknown) =>
      record('d1', cause, operation),
    merge(snapshot: GradebookImportFailureDiagnosticV1): void {
      for (const event of snapshot.events) record(event.phase, event.code, event.operation);
    },
    snapshot(): GradebookImportFailureDiagnosticV1 {
      return { version: 1, events: events.map((event) => ({ ...event })) };
    },
  };
}
