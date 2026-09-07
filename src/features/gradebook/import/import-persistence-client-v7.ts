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

export type GradebookImportBatchResponseContentKindV7 =
  | 'json'
  | 'html'
  | 'text'
  | 'other'
  | 'missing';

function nowMs(): number {
  return typeof globalThis.performance?.now === 'function' ? globalThis.performance.now() : Date.now();
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

  const startedAt = nowMs();
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
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
  return value;
}
