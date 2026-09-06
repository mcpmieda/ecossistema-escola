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
    throw new Error('Resposta inválida ao persistir o lote de planilhas.');
  }
  if (!isGradebookImportPersistenceBatchResponseV7(value)) {
    throw new Error('Resposta incompatível ao persistir o lote de planilhas.');
  }
  if (!response.ok && value.state !== 'invalid-request' && value.state !== 'unavailable') {
    throw new Error('Persistência do lote indisponível.');
  }
  return value;
}
