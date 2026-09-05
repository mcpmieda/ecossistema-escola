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
const BENCHMARK_HEADER = 'X-Gradebook-Benchmark';
const BENCHMARK_VALUE = 'paid-direct-v1';
const D1_BREAKDOWN_CATEGORIES = new Set<GradebookImportPaidDirectD1CategoryV1>([
  'catalog',
  'annual-results',
  'student-status',
  'assessment-components',
  'academic-records',
  'associations',
  'source',
  'academic-entities',
  'commit',
  'other',
]);

export type GradebookImportPaidDirectD1CategoryV1 =
  | 'catalog'
  | 'annual-results'
  | 'student-status'
  | 'assessment-components'
  | 'academic-records'
  | 'associations'
  | 'source'
  | 'academic-entities'
  | 'commit'
  | 'other';

export interface GradebookImportPaidDirectD1BreakdownV1 {
  readonly category: GradebookImportPaidDirectD1CategoryV1;
  readonly calls: number;
  readonly wallMs: number;
  readonly sqlMs: number | null;
}

export interface GradebookImportPaidDirectTimingV1 {
  readonly version: 1;
  readonly mode: 'paid-direct';
  readonly stringifyMs: number;
  readonly requestMs: number;
  readonly responseJsonMs: number;
  readonly serverPreServiceMs: number | null;
  readonly serverAuthMs: number | null;
  readonly serverBodyMs: number | null;
  readonly serverInspectMs: number | null;
  readonly serverMs: number | null;
  readonly attempts: number;
  readonly totalMs: number;
  readonly serverD1Calls: number | null;
  readonly serverD1FirstCalls: number | null;
  readonly serverD1AllCalls: number | null;
  readonly serverD1RunCalls: number | null;
  readonly serverD1BatchCalls: number | null;
  readonly serverD1ExecCalls: number | null;
  readonly serverCatalogSnapshotCalls: number | null;
  readonly serverD1WallMs: number | null;
  readonly serverD1MaxMs: number | null;
  readonly serverSqlMs: number | null;
  readonly serverD1Breakdown: readonly GradebookImportPaidDirectD1BreakdownV1[] | null;
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

function responseNumber(response: Response, header: string): number | null {
  const value = response.headers.get(header);
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function responseD1Breakdown(
  response: Response,
  expectedCalls: number | null,
): readonly GradebookImportPaidDirectD1BreakdownV1[] | null {
  const raw = response.headers.get('x-gradebook-d1-breakdown');
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length > D1_BREAKDOWN_CATEGORIES.size) return null;
    const seen = new Set<GradebookImportPaidDirectD1CategoryV1>();
    const result: GradebookImportPaidDirectD1BreakdownV1[] = [];
    for (const value of parsed) {
      if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
      const item = value as Record<string, unknown>;
      const category = item.category;
      const calls = item.calls;
      const wallMs = item.wallMs;
      const sqlMs = item.sqlMs;
      if (
        typeof category !== 'string' ||
        !D1_BREAKDOWN_CATEGORIES.has(category as GradebookImportPaidDirectD1CategoryV1) ||
        seen.has(category as GradebookImportPaidDirectD1CategoryV1) ||
        typeof calls !== 'number' ||
        !Number.isInteger(calls) ||
        calls < 1 ||
        typeof wallMs !== 'number' ||
        !Number.isFinite(wallMs) ||
        wallMs < 0 ||
        !(
          sqlMs === null ||
          (typeof sqlMs === 'number' && Number.isFinite(sqlMs) && sqlMs >= 0)
        )
      ) {
        return null;
      }
      const typedCategory = category as GradebookImportPaidDirectD1CategoryV1;
      seen.add(typedCategory);
      result.push({ category: typedCategory, calls, wallMs, sqlMs: sqlMs as number | null });
    }
    if (expectedCalls !== null && result.reduce((sum, item) => sum + item.calls, 0) !== expectedCalls) {
      return null;
    }
    return result;
  } catch {
    return null;
  }
}

export async function persistCompactGradebookFileV6(
  request: GradebookImportPersistenceRequestV6,
  signal?: AbortSignal,
  onTiming?: (timing: GradebookImportPaidDirectTimingV1) => void,
): Promise<GradebookImportPersistenceResponseV6> {
  const totalStartedAt = nowMs();
  const stringifyStartedAt = nowMs();
  const body = JSON.stringify(request);
  const stringifyMs = elapsed(stringifyStartedAt);
  let lastFailure: unknown = null;

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
        headers: {
          'Content-Type': 'application/json',
          [BENCHMARK_HEADER]: BENCHMARK_VALUE,
        },
        body,
        signal: controller.signal,
      });
      const requestMs = elapsed(attemptStartedAt);
      const responseJsonStartedAt = nowMs();
      let jsonParsed = true;
      const payload: unknown = await response.json().catch(() => {
        jsonParsed = false;
        return null;
      });
      const responseJsonMs = elapsed(responseJsonStartedAt);
      const compatible = compatibleResponse(payload);
      if (compatible) {
        const serverD1Calls = responseNumber(response, 'x-gradebook-d1-calls');
        onTiming?.({
          version: 1,
          mode: 'paid-direct',
          stringifyMs,
          requestMs,
          responseJsonMs,
          serverPreServiceMs: responseNumber(response, 'x-gradebook-pre-service-ms'),
          serverAuthMs: responseNumber(response, 'x-gradebook-auth-ms'),
          serverBodyMs: responseNumber(response, 'x-gradebook-body-ms'),
          serverInspectMs: responseNumber(response, 'x-gradebook-inspect-ms'),
          serverMs: responseNumber(response, SERVER_MS_HEADER),
          attempts: attempt + 1,
          totalMs: elapsed(totalStartedAt),
          serverD1Calls,
          serverD1FirstCalls: responseNumber(response, 'x-gradebook-d1-first-calls'),
          serverD1AllCalls: responseNumber(response, 'x-gradebook-d1-all-calls'),
          serverD1RunCalls: responseNumber(response, 'x-gradebook-d1-run-calls'),
          serverD1BatchCalls: responseNumber(response, 'x-gradebook-d1-batch-calls'),
          serverD1ExecCalls: responseNumber(response, 'x-gradebook-d1-exec-calls'),
          serverCatalogSnapshotCalls: responseNumber(
            response,
            'x-gradebook-d1-catalog-snapshot-calls',
          ),
          serverD1WallMs: responseNumber(response, 'x-gradebook-d1-wall-ms'),
          serverD1MaxMs: responseNumber(response, 'x-gradebook-d1-max-ms'),
          serverSqlMs: responseNumber(response, 'x-gradebook-d1-sql-ms'),
          serverD1Breakdown: responseD1Breakdown(response, serverD1Calls),
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
