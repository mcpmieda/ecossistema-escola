import {
  GRADEBOOK_IMPORT_FAILURE_HEADER_V1,
  parseGradebookImportFailureDiagnosticV1,
  type GradebookImportFailureDiagnosticV1,
} from '../../../../shared/gradebook-import-diagnostics-v1';
import {
  GRADEBOOK_IMPORT_PERSISTENCE_OPERATION_V7,
  GRADEBOOK_IMPORT_PERSISTENCE_TRANSPORT_VERSION_V7,
  inspectGradebookImportPersistenceBatchRequestV7,
  isGradebookImportPersistenceBatchResponseV7,
  type GradebookImportPersistenceBatchRequestV7,
  type GradebookImportPersistenceBatchResponseV7,
} from '../../../../shared/gradebook-contracts/imports/import-persistence-transport-v7';
import type { GradebookImportPersistenceRequestV6 } from '../../../../shared/gradebook-contracts/imports/import-persistence-transport-v6';

const ENDPOINT = '/api/gradebook/import-persistence';
const TIMEOUT_MS = 120_000;

export type GradebookImportBatchResponseContentKindV7 =
  'json' | 'html' | 'text' | 'other' | 'missing';

function nowMs(): number {
  return typeof globalThis.performance?.now === 'function'
    ? globalThis.performance.now()
    : Date.now();
}

function elapsedMs(startedAt: number): number {
  return Math.round((nowMs() - startedAt) * 10) / 10;
}

function responseContentKind(response: Response): GradebookImportBatchResponseContentKindV7 {
  const raw = response.headers.get('Content-Type');
  if (!raw) return 'missing';
  const mediaType = raw.split(';', 1)[0]?.trim().toLowerCase() ?? '';
  if (mediaType === 'application/json' || mediaType.endsWith('+json')) return 'json';
  if (mediaType === 'text/html' || mediaType === 'application/xhtml+xml') return 'html';
  if (mediaType.startsWith('text/')) return 'text';
  return 'other';
}

export class GradebookImportBatchTransportErrorV7 extends Error {
  readonly status: number;
  readonly contentKind: GradebookImportBatchResponseContentKindV7;
  readonly totalMs: number;

  constructor(
    status: number,
    contentKind: GradebookImportBatchResponseContentKindV7,
    totalMs: number,
  ) {
    super(
      `Resposta inválida ao persistir o lote de planilhas (HTTP ${status}; conteúdo ${contentKind}).`,
    );
    this.name = 'GradebookImportBatchTransportErrorV7';
    this.status = status;
    this.contentKind = contentKind;
    this.totalMs = totalMs;
  }
}

function notAuthorized(): GradebookImportPersistenceBatchResponseV7 {
  return {
    transportVersion: GRADEBOOK_IMPORT_PERSISTENCE_TRANSPORT_VERSION_V7,
    state: 'not-authorized',
    items: [],
    pendingFromIndex: 0,
    totalMs: 0,
  };
}

export async function persistCompactGradebookBatchV7(
  requests: readonly GradebookImportPersistenceRequestV6[],
  signal?: AbortSignal,
  onFailureDiagnostic?: (value: GradebookImportFailureDiagnosticV1) => void,
): Promise<GradebookImportPersistenceBatchResponseV7> {
  const payload: GradebookImportPersistenceBatchRequestV7 = {
    transportVersion: GRADEBOOK_IMPORT_PERSISTENCE_TRANSPORT_VERSION_V7,
    operation: GRADEBOOK_IMPORT_PERSISTENCE_OPERATION_V7,
    requests,
  };
  const inspection = inspectGradebookImportPersistenceBatchRequestV7(payload);
  if (inspection !== 'ready') {
    throw new TypeError(`gradebook-import-batch-v7-${inspection}`);
  }

  if (signal?.aborted) throw signal.reason;
  const controller = new AbortController();
  const abort = () => controller.abort(signal?.reason);
  signal?.addEventListener('abort', abort, { once: true });
  const timeout = globalThis.setTimeout(() => controller.abort(), TIMEOUT_MS);
  const startedAt = nowMs();
  try {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (response.status === 401 || response.status === 403) return notAuthorized();

    let value: unknown;
    try {
      value = await response.json();
    } catch {
      throw new GradebookImportBatchTransportErrorV7(
        response.status,
        responseContentKind(response),
        elapsedMs(startedAt),
      );
    }
    if (!isGradebookImportPersistenceBatchResponseV7(value)) {
      throw new Error('Resposta incompatível ao persistir o lote de planilhas.');
    }
    if (!response.ok && value.state !== 'invalid-request' && value.state !== 'unavailable') {
      throw new Error('Persistência do lote indisponível.');
    }
    if ('items' in value) {
      if (
        value.items.length > requests.length ||
        (value.state !== 'not-authorized' && value.items.length !== requests.length)
      ) {
        throw new Error('Resposta incompleta ao confirmar as planilhas.');
      }
    }
    if (
      value.state === 'unavailable' ||
      ('items' in value && value.items.some((item) => item.response.state === 'unavailable'))
    ) {
      const diagnostic = parseGradebookImportFailureDiagnosticV1(
        response.headers.get(GRADEBOOK_IMPORT_FAILURE_HEADER_V1),
      );
      try {
        if (diagnostic) onFailureDiagnostic?.(diagnostic);
      } catch {
        /* Diagnostics never change the response. */
      }
    }
    return value;
  } finally {
    globalThis.clearTimeout(timeout);
    signal?.removeEventListener('abort', abort);
  }
}
