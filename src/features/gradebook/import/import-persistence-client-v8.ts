import {
  GRADEBOOK_IMPORT_FAILURE_HEADER_V1,
  parseGradebookImportFailureDiagnosticV1,
  type GradebookImportFailureDiagnosticV1,
} from '../../../../shared/gradebook-import-diagnostics-v1';
import {
  isGradebookImportPersistenceRequestV8,
  isGradebookImportPersistenceResponseV8,
  type GradebookImportPersistenceRequestV8,
} from '../../../../shared/gradebook-contracts/imports/import-persistence-transport-v8';
import type { GradebookImportPersistenceResponseV6 } from '../../../../shared/gradebook-contracts/imports/import-persistence-transport-v6';

/** One value snapshot, one confirmed file. No blind retry after a potentially committed request. */
export async function persistGradebookValuesSnapshotV8(
  request: GradebookImportPersistenceRequestV8,
  onDiagnostic?: (diagnostic: GradebookImportFailureDiagnosticV1) => void,
): Promise<{ response: GradebookImportPersistenceResponseV6; serverMs: number | null }> {
  if (!isGradebookImportPersistenceRequestV8(request))
    throw new Error('Snapshot de valores inválido.');
  const controller = new AbortController();
  const timer = globalThis.setTimeout(() => controller.abort(), 120_000);
  try {
    const response = await fetch('/api/gradebook/import-persistence', {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
    if (response.status === 401 || response.status === 403)
      return { response: { transportVersion: 6, state: 'not-authorized' }, serverMs: null };
    let value: unknown;
    try {
      value = await response.json();
    } catch {
      throw new Error(`Gravação sem confirmação (HTTP ${response.status}; resposta não JSON).`);
    }
    if (!isGradebookImportPersistenceResponseV8(value))
      throw new Error(`Resposta incompatível do snapshot de valores (HTTP ${response.status}).`);
    if (!response.ok && value.state !== 'unavailable' && value.state !== 'invalid-request')
      throw new Error('Gravação sem confirmação válida.');
    if (value.state === 'unavailable') {
      const diagnostic = parseGradebookImportFailureDiagnosticV1(
        response.headers.get(GRADEBOOK_IMPORT_FAILURE_HEADER_V1),
      );
      try {
        if (diagnostic) onDiagnostic?.(diagnostic);
      } catch {
        /* telemetry cannot change persistence */
      }
    }
    const raw = response.headers.get('X-Gradebook-Server-Ms');
    const ms = raw === null ? NaN : Number(raw);
    return {
      response: { ...value, transportVersion: 6 },
      serverMs: Number.isFinite(ms) && ms >= 0 ? ms : null,
    };
  } finally {
    globalThis.clearTimeout(timer);
  }
}
