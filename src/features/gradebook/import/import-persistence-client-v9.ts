import { notifyLiveChangeV1 } from '../../../shared/live-data/live-refresh-v1';
import {
  isGradebookImportPersistenceRequestV9,
  isGradebookImportPersistenceResponseV9,
  type GradebookImportPersistenceRequestV9,
  type GradebookImportPersistenceResponseV9,
} from '../../../../shared/gradebook-contracts/imports/import-persistence-transport-v9';

export interface ImportPersistenceHttpTimingV1 {
  readonly serializationMs: number | null;
  readonly payloadBytes: number | null;
  readonly persistRequestMs: number | null;
  readonly outcome: GradebookImportPersistenceResponseV9['state'] | 'confirmation-required';
}

function nowMs(): number {
  return typeof globalThis.performance?.now === 'function'
    ? globalThis.performance.now()
    : Date.now();
}

export async function persistGradebookCanonicalImportV9(
  request: GradebookImportPersistenceRequestV9,
  onTiming?: (timing: ImportPersistenceHttpTimingV1) => void,
  onDispatch?: () => void,
): Promise<{
  readonly response: GradebookImportPersistenceResponseV9;
  readonly serverMs: number | null;
}> {
  if (!isGradebookImportPersistenceRequestV9(request))
    throw new Error('Pacote acadêmico canônico inválido.');
  const controller = new AbortController();
  const timer = globalThis.setTimeout(() => controller.abort(), 120_000);
  let serializationMs: number | null = null;
  let payloadBytes: number | null = null;
  let requestStartedAt: number | null = null;
  let outcome: ImportPersistenceHttpTimingV1['outcome'] = 'confirmation-required';
  try {
    const serializationStartedAt = nowMs();
    const body = JSON.stringify(request);
    serializationMs = nowMs() - serializationStartedAt;
    payloadBytes = new TextEncoder().encode(body).byteLength;
    requestStartedAt = nowMs();
    try {
      onDispatch?.();
    } catch {
      /* Timing has no authority over dispatch. */
    }
    const response = await fetch('/api/gradebook/import-persistence', {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    if (response.status === 401 || response.status === 403) {
      outcome = 'not-authorized';
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
    if (
      !response.ok &&
      !['blocked', 'conflict', 'invalid-request', 'unavailable'].includes(value.state)
    ) {
      throw new Error('Gravação sem confirmação válida.');
    }
    const raw = response.headers.get('X-Gradebook-Server-Ms');
    const parsed = raw === null || raw.trim() === '' ? NaN : Number(raw);
    outcome = value.state;
    if (value.state === 'applied' || value.state === 'no-changes') notifyLiveChangeV1('gradebook');
    return {
      response: value,
      serverMs: Number.isFinite(parsed) && parsed >= 0 ? parsed : null,
    };
  } finally {
    globalThis.clearTimeout(timer);
    if (onTiming) {
      try {
        onTiming({
          serializationMs,
          payloadBytes,
          persistRequestMs: requestStartedAt === null ? null : nowMs() - requestStartedAt,
          outcome,
        });
      } catch {
        /* Optional timing cannot change a confirmed or uncertain result. */
      }
    }
  }
}
