import {
  isGradebookImportPersistenceRequestV9,
  isGradebookImportPersistenceResponseV9,
  type GradebookImportPersistenceRequestV9,
  type GradebookImportPersistenceResponseV9,
} from '../../../../shared/gradebook-contracts/imports/import-persistence-transport-v9';

export async function persistGradebookCanonicalImportV9(
  request: GradebookImportPersistenceRequestV9,
): Promise<{ readonly response: GradebookImportPersistenceResponseV9; readonly serverMs: number | null }> {
  if (!isGradebookImportPersistenceRequestV9(request)) throw new Error('Pacote acadêmico canônico inválido.');
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
    if (response.status === 401 || response.status === 403) {
      return { response: { transportVersion: 9, state: 'not-authorized' }, serverMs: null };
    }
    let value: unknown;
    try {
      value = await response.json();
    } catch {
      throw new Error(`Gravação sem confirmação (HTTP ${response.status}; resposta não JSON).`);
    }
    if (!isGradebookImportPersistenceResponseV9(value)) {
      throw new Error(`Resposta incompatível do Banco de Notas (HTTP ${response.status}).`);
    }
    if (!response.ok && !['blocked', 'conflict', 'invalid-request', 'unavailable'].includes(value.state)) {
      throw new Error('Gravação sem confirmação válida.');
    }
    const raw = response.headers.get('X-Gradebook-Server-Ms');
    const parsed = raw === null ? NaN : Number(raw);
    return {
      response: value,
      serverMs: Number.isFinite(parsed) && parsed >= 0 ? parsed : null,
    };
  } finally {
    globalThis.clearTimeout(timer);
  }
}
