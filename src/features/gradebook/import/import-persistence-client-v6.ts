import {
  asGradebookImportPersistenceResponseV6,
  isGradebookImportPersistenceResponseV6,
  type GradebookImportPersistenceRequestV6,
  type GradebookImportPersistenceResponseV6,
} from '../../../../shared/gradebook-contracts/imports/import-persistence-transport-v6';
import { normalizeGradebookImportPersistenceResponseV5 } from './import-persistence-client-v2';

const ENDPOINT = '/api/gradebook/import-persistence';
const TIMEOUT_MS = 120_000;
const ATTEMPTS = 2;
const SERVER_MS_HEADER = 'x-gradebook-server-ms';

export interface GradebookImportPaidDirectTimingV1 {
  readonly version: 1;
  readonly mode: 'paid-direct';
  readonly requestMs: number;
  readonly serverMs: number | null;
  readonly attempts: number;
  readonly totalMs: number;
}

function compatibleResponse(value: unknown): GradebookImportPersistenceResponseV6 | null {
  if (isGradebookImportPersistenceResponseV6(value)) return value;
  const historical = normalizeGradebookImportPersistenceResponseV5(value);
  return historical ? asGradebookImportPersistenceResponseV6(historical) : null;
}

function incompatibleMessage(response: Response, jsonParsed: boolean): string {
  const contentType = response.headers.get('content-type') ?? '';
  const family = contentType.toLowerCase().includes('json') ? 'json' : contentType ? 'non-json' : 'missing';
  return `Resposta de persistência incompatível (HTTP ${response.status}; conteúdo ${family}; envelope ${jsonParsed ? 'wrong-transport' : 'non-json'}).`;
}

function nowMs(): number {
  return typeof globalThis.performance?.now === 'function' ? globalThis.performance.now() : Date.now();
}

function elapsed(startedAt: number): number {
  return Math.round((nowMs() - startedAt) * 10) / 10;
}

function serverMs(response: Response): number | null {
  const value = response.headers.get(SERVER_MS_HEADER);
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export async function persistCompactGradebookFileV6(
  request: GradebookImportPersistenceRequestV6,
  signal?: AbortSignal,
  onTiming?: (timing: GradebookImportPaidDirectTimingV1) => void,
): Promise<GradebookImportPersistenceResponseV6> {
  const body = JSON.stringify(request);
  let lastFailure: unknown = null;
  const totalStartedAt = nowMs();

  for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
    if (signal?.aborted) throw signal.reason;
    const controller = new AbortController();
    let timedOut = false;
    const abortFromCaller = () => controller.abort(signal?.reason);
    signal?.addEventListener('abort', abortFromCaller, { once: true });
    const timeout = globalThis.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, TIMEOUT_MS);
    const attemptStartedAt = nowMs();

    try {
      const response = await fetch(ENDPOINT, {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: controller.signal,
      });
      const requestMs = elapsed(attemptStartedAt);
      let jsonParsed = true;
      const payload: unknown = await response.json().catch(() => {
        jsonParsed = false;
        return null;
      });
      const compatible = compatibleResponse(payload);
      if (compatible) {
        onTiming?.({
          version: 1,
          mode: 'paid-direct',
          requestMs,
          serverMs: serverMs(response),
          attempts: attempt + 1,
          totalMs: elapsed(totalStartedAt),
        });
        return compatible;
      }
      throw new Error(incompatibleMessage(response, jsonParsed));
    } catch (cause) {
      lastFailure = cause;
      if (signal?.aborted) throw signal.reason;
      const retryable = timedOut || cause instanceof TypeError;
      if (!retryable || attempt + 1 === ATTEMPTS) break;
    } finally {
      globalThis.clearTimeout(timeout);
      signal?.removeEventListener('abort', abortFromCaller);
    }
  }

  if (
    lastFailure instanceof Error &&
    lastFailure.message.startsWith('Resposta de persistência incompatível (HTTP ')
  ) {
    throw lastFailure;
  }
  throw new Error(
    'A persistência não respondeu no tempo esperado após uma retomada segura. Recarregue a tela para consultar o estado oficial.',
  );
}
