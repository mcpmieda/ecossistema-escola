import {
  isGradebookImportPersistenceRequestV6,
  isGradebookImportPersistenceResponseV6,
  type GradebookImportCourseV6,
  type GradebookImportPersistenceRequestV6,
  type GradebookImportPersistenceResponseV6,
  type GradebookImportTermV6,
} from '../../../../shared/gradebook-contracts/imports/import-persistence-transport-v6';

const ENDPOINT = '/api/gradebook/import-staging';
const MAX_POSITIONS = 40;
const PREPARE_CONCURRENCY = 3;
const TIMEOUT_MS = 30_000;
const PREPARE_ALL_TIMEOUT_MS = 120_000;
let initializationPromise: Promise<void> | null = null;

export interface GradebookImportStageProgressV1 {
  readonly prepared: number;
  readonly total: number;
}

export interface GradebookImportStageTimingV1 {
  readonly version: 1;
  readonly mode: 'prepare-all' | 'legacy';
  readonly chunkCount: number;
  readonly initializeMs: number;
  readonly beginMs: number;
  readonly prepareMs: number;
  readonly prepareAttempts: number;
  readonly finalizeMs: number;
  readonly totalMs: number;
  readonly serverPrepareMs: number | null;
  readonly serverConcurrency: number | null;
  readonly serverChunks: readonly { readonly index: number; readonly ms: number }[];
}

function nowMs(): number {
  return typeof globalThis.performance?.now === 'function' ? globalThis.performance.now() : Date.now();
}

function elapsedMs(startedAt: number): number {
  return Math.round((nowMs() - startedAt) * 10) / 10;
}

function classKey(value: string): string {
  return value.trim().toUpperCase();
}

function coursePositions(course: GradebookImportCourseV6): readonly number[] {
  const first = course.terms[0].rows.map((row) => row[0]);
  const signature = JSON.stringify(first);
  if (
    first.length === 0 ||
    course.terms.some((term) => JSON.stringify(term.rows.map((row) => row[0])) !== signature)
  ) {
    throw new Error('As linhas trimestrais não possuem a mesma cobertura de alunos.');
  }
  const allowed = new Set(first);
  if (course.recovery?.rows.some((row) => !allowed.has(row[0]))) {
    throw new Error('A recuperação contém aluno fora da cobertura trimestral.');
  }
  return first;
}

function selectTerm(term: GradebookImportTermV6, selected: ReadonlySet<number>): GradebookImportTermV6 {
  return { ...term, rows: term.rows.filter((row) => selected.has(row[0])) };
}

export function splitCompactGradebookImportV6(
  request: GradebookImportPersistenceRequestV6,
): readonly GradebookImportPersistenceRequestV6[] {
  const chunks: GradebookImportPersistenceRequestV6[] = [];
  for (const course of request.courses) {
    const roster = request.rosters.find(
      (candidate) => classKey(candidate.classGroupLabel) === classKey(course.classGroupLabel),
    );
    if (!roster) throw new Error('Relação da turma não encontrada para o componente.');
    const positions = coursePositions(course);
    for (let offset = 0; offset < positions.length; offset += MAX_POSITIONS) {
      const selected = new Set(positions.slice(offset, offset + MAX_POSITIONS));
      const terms: GradebookImportCourseV6['terms'] = [
        selectTerm(course.terms[0], selected),
        selectTerm(course.terms[1], selected),
        selectTerm(course.terms[2], selected),
      ];
      const compactCourse: GradebookImportCourseV6 = {
        ...course,
        terms,
        recovery: course.recovery
          ? {
              ...course.recovery,
              rows: course.recovery.rows.filter((row) => selected.has(row[0])),
            }
          : null,
      };
      const chunk: GradebookImportPersistenceRequestV6 = {
        ...request,
        rosters: [roster],
        courses: [compactCourse],
      };
      if (!isGradebookImportPersistenceRequestV6(chunk)) {
        throw new Error('Um fragmento acadêmico não passou na validação local.');
      }
      chunks.push(chunk);
    }
  }
  if (chunks.length === 0) throw new Error('Nenhum fragmento acadêmico foi produzido.');
  return chunks;
}

async function fetchJson(
  url: string,
  body?: GradebookImportPersistenceRequestV6,
  timeoutMs = TIMEOUT_MS,
): Promise<{ readonly response: Response; readonly payload: unknown; readonly attempts: number }> {
  let lastFailure: unknown = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    const timeout = globalThis.setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
      const payload: unknown = await response.json().catch(() => null);
      if (payload !== null) return { response, payload, attempts: attempt + 1 };
      lastFailure = new Error(`Resposta de staging incompatível (HTTP ${response.status}; non-json).`);
      if (response.status < 500 || attempt === 1) throw lastFailure;
    } catch (cause) {
      lastFailure = cause;
      if (attempt === 1) throw cause;
    } finally {
      globalThis.clearTimeout(timeout);
    }
  }
  throw lastFailure instanceof Error ? lastFailure : new Error('Staging indisponível.');
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function numeric(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : 0;
}

function serverPrepareTiming(payload: unknown): {
  readonly totalMs: number;
  readonly concurrency: number;
  readonly chunks: readonly { readonly index: number; readonly ms: number }[];
} | null {
  if (!record(payload) || !record(payload.timing)) return null;
  const timing = payload.timing;
  if (
    typeof timing.totalMs !== 'number' ||
    !Number.isFinite(timing.totalMs) ||
    timing.totalMs < 0 ||
    typeof timing.concurrency !== 'number' ||
    !Number.isInteger(timing.concurrency) ||
    timing.concurrency < 1 ||
    !Array.isArray(timing.chunks)
  ) {
    return null;
  }
  const chunks: { index: number; ms: number }[] = [];
  for (const value of timing.chunks) {
    if (
      !record(value) ||
      typeof value.index !== 'number' ||
      !Number.isInteger(value.index) ||
      value.index < 0 ||
      typeof value.ms !== 'number' ||
      !Number.isFinite(value.ms) ||
      value.ms < 0
    ) {
      return null;
    }
    chunks.push({ index: value.index, ms: value.ms });
  }
  return { totalMs: timing.totalMs, concurrency: timing.concurrency, chunks };
}

function baselineReviewMessage(payload: Record<string, unknown>): string {
  const counts = record(payload.counts) ? payload.counts : {};
  return [
    'Importação pausada antes de preparar as notas: existem dados acadêmicos anteriores no D1 e o baseline precisa ser conferido.',
    'Nenhum dado desta tentativa foi gravado.',
    `Contagens sanitizadas — fontes: ${numeric(counts.logicalSources)}; arquivos: ${numeric(counts.sourceFiles)}; lotes: ${numeric(counts.importBatches)}; alunos: ${numeric(counts.students)}; matrículas: ${numeric(counts.enrollments)}; componentes: ${numeric(counts.assessmentComponents)}; notas: ${numeric(counts.gradeEntries)}; resultados trimestrais: ${numeric(counts.termResults)}; recuperações: ${numeric(counts.finalRecoveries)}; anuais: ${numeric(counts.annualResults)}; associações: ${numeric(counts.associations)}.`,
    'Envie somente essas contagens para revisão antes de tentar novamente.',
  ].join(' ');
}

function schemaReviewMessage(payload: Record<string, unknown>): string {
  const schema = record(payload.schema) ? payload.schema : {};
  return `O schema acadêmico exige revisão antes da importação (atual: ${numeric(schema.currentVersion)}; esperado: ${numeric(schema.latestVersion)}; pendências: ${numeric(schema.pendingCount)}). Nenhuma nota foi enviada.`;
}

function migrationApplyFailureMessage(payload: Record<string, unknown>): string {
  switch (payload.detail) {
    case 'cpu-limit':
      return 'O D1 informou limite de processamento durante a migration de staging. Nenhuma nota foi enviada.';
    case 'query-limit':
      return 'O D1 informou limite de consultas durante a migration de staging. Nenhuma nota foi enviada.';
    case 'permission':
      return 'O D1 recusou a migration de staging por autorização/permissão. Nenhuma nota foi enviada.';
    case 'schema-prerequisite':
      return 'A migration de staging encontrou uma estrutura anterior do D1 ausente ou incompatível. Nenhuma nota foi enviada.';
    case 'foreign-key':
      return 'A migration de staging foi recusada por uma regra de relacionamento do D1. Nenhuma nota foi enviada.';
    case 'sql-incompatible':
      return 'O D1 considerou incompatível uma instrução da migration de staging. Nenhuma nota foi enviada.';
    case 'database-busy':
      return 'O D1 estava ocupado ou bloqueado ao aplicar a migration de staging. Nenhuma nota foi enviada.';
    default:
      return 'A migration de staging falhou no D1 por um motivo ainda não classificado; nenhuma nota foi enviada.';
  }
}

export function gradebookImportStagingInitializationFailureMessageV1(
  status: number,
  payload: unknown,
): string | null {
  if (!record(payload)) {
    return `Resposta de inicialização do armazenamento incompatível (HTTP ${status}; JSON inesperado).`;
  }
  if (status >= 200 && status < 300 && payload.state === 'ready' && payload.schemaVersion === 6) {
    return null;
  }
  if (payload.state === 'baseline-review-required') return baselineReviewMessage(payload);
  if (payload.state === 'not-authorized') {
    return 'Sua sessão não está autorizada a inicializar a importação. Entre novamente com uma conta administradora autorizada.';
  }
  if (payload.state === 'runtime-review-required' && payload.reason === 'production-gate-disabled') {
    return 'A trava de produção do Banco de Notas está desativada. Reabra a janela autorizada antes de importar; nenhuma nota foi enviada.';
  }
  if (payload.state === 'schema-review-required') return schemaReviewMessage(payload);
  if (payload.state === 'invalid-request') {
    return 'A solicitação interna de inicialização foi rejeitada antes do envio das notas.';
  }
  if (payload.state === 'unavailable') {
    switch (payload.reason) {
      case 'storage-missing':
        return 'O binding do D1 acadêmico não está disponível para a importação.';
      case 'storage-incompatible':
        return 'O binding do D1 acadêmico está presente, mas o runtime o considerou incompatível.';
      case 'migration-catalog-incompatible':
        return 'O catálogo de migrations do Banco de Notas não corresponde ao schema esperado.';
      case 'migration-read-failed':
        return 'Não foi possível conferir a versão atual do schema acadêmico no D1.';
      case 'migration-apply-failed':
        return migrationApplyFailureMessage(payload);
      case 'migration-postcondition-failed':
        return 'A migration de staging terminou sem confirmar o schema 6 esperado; nenhuma nota foi enviada.';
      case 'initialize-failed':
        return 'A inicialização do staging falhou antes do envio das notas.';
      default:
        return `A inicialização do staging está indisponível (HTTP ${status}; motivo não classificado).`;
    }
  }
  const state = typeof payload.state === 'string' ? payload.state : 'desconhecido';
  return `A inicialização do staging retornou um estado inesperado (HTTP ${status}; estado ${state}).`;
}

async function initializeStaging(): Promise<void> {
  if (initializationPromise) return initializationPromise;
  initializationPromise = (async () => {
    const initialized = await fetchJson(`${ENDPOINT}?action=initialize`);
    const failure = gradebookImportStagingInitializationFailureMessageV1(
      initialized.response.status,
      initialized.payload,
    );
    if (failure) throw new Error(failure);
  })();
  try {
    await initializationPromise;
  } catch (cause) {
    initializationPromise = null;
    throw cause;
  }
}

function rejectedResponse(payload: unknown): GradebookImportPersistenceResponseV6 | null {
  if (!record(payload) || payload.state !== 'rejected' || !('response' in payload)) return null;
  return isGradebookImportPersistenceResponseV6(payload.response) ? payload.response : null;
}

async function prepareChunksLegacy(
  sessionId: string,
  chunks: readonly GradebookImportPersistenceRequestV6[],
  onProgress?: (progress: GradebookImportStageProgressV1) => void,
): Promise<{ readonly response: GradebookImportPersistenceResponseV6 | null; readonly attempts: number }> {
  let preparedCount = 0;
  let attempts = 0;
  for (let offset = 0; offset < chunks.length; offset += PREPARE_CONCURRENCY) {
    const batch = chunks.slice(offset, offset + PREPARE_CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map(async (chunk, batchIndex): Promise<GradebookImportPersistenceResponseV6 | null> => {
        const index = offset + batchIndex;
        const prepared = await fetchJson(
          `${ENDPOINT}?action=prepare&session=${encodeURIComponent(sessionId)}&chunk=${index}`,
          chunk,
        );
        attempts += prepared.attempts;
        if (
          !prepared.response.ok ||
          !record(prepared.payload) ||
          (prepared.payload.state !== 'prepared' && prepared.payload.state !== 'already-prepared')
        ) {
          const rejected = rejectedResponse(prepared.payload);
          if (rejected) return rejected;
          throw new Error(`Não foi possível preparar o fragmento ${index + 1} de ${chunks.length}.`);
        }
        preparedCount += 1;
        onProgress?.({ prepared: preparedCount, total: chunks.length });
        return null;
      }),
    );

    for (const result of results) {
      if (result.status === 'rejected') throw result.reason;
      if (result.value !== null) return { response: result.value, attempts };
    }
  }
  return { response: null, attempts };
}

function emitTiming(
  timing: GradebookImportStageTimingV1,
  onTiming?: (timing: GradebookImportStageTimingV1) => void,
): void {
  console.info('[gradebook-import-client-timing]', JSON.stringify(timing));
  onTiming?.(timing);
}

export async function persistCompactGradebookFileStagedV1(
  request: GradebookImportPersistenceRequestV6,
  onProgress?: (progress: GradebookImportStageProgressV1) => void,
  onTiming?: (timing: GradebookImportStageTimingV1) => void,
): Promise<GradebookImportPersistenceResponseV6> {
  const totalStartedAt = nowMs();
  const initializeStartedAt = nowMs();
  await initializeStaging();
  const initializeMs = elapsedMs(initializeStartedAt);
  const chunks = splitCompactGradebookImportV6(request);

  const beginStartedAt = nowMs();
  const begin = await fetchJson(`${ENDPOINT}?action=begin`, request);
  const beginMs = elapsedMs(beginStartedAt);
  if (
    !begin.response.ok ||
    !record(begin.payload) ||
    begin.payload.state !== 'ready' ||
    typeof begin.payload.sessionId !== 'string' ||
    begin.payload.chunkCount !== chunks.length
  ) {
    throw new Error('Não foi possível iniciar a importação fatiada.');
  }
  const sessionId = begin.payload.sessionId;

  let mode: GradebookImportStageTimingV1['mode'] = 'prepare-all';
  let prepareAttempts = 0;
  let serverPrepareMs: number | null = null;
  let serverConcurrency: number | null = null;
  let serverChunks: readonly { readonly index: number; readonly ms: number }[] = [];
  const prepareStartedAt = nowMs();
  const preparedAll = await fetchJson(
    `${ENDPOINT}?action=prepare-all&session=${encodeURIComponent(sessionId)}`,
    request,
    PREPARE_ALL_TIMEOUT_MS,
  );
  prepareAttempts += preparedAll.attempts;
  const aggregateReady =
    preparedAll.response.ok &&
    record(preparedAll.payload) &&
    preparedAll.payload.state === 'prepared-all' &&
    preparedAll.payload.preparedCount === chunks.length &&
    preparedAll.payload.expectedChunkCount === chunks.length;

  if (aggregateReady) {
    const serverTiming = serverPrepareTiming(preparedAll.payload);
    serverPrepareMs = serverTiming?.totalMs ?? null;
    serverConcurrency = serverTiming?.concurrency ?? null;
    serverChunks = serverTiming?.chunks ?? [];
    onProgress?.({ prepared: chunks.length, total: chunks.length });
  } else {
    const rejected = rejectedResponse(preparedAll.payload);
    if (rejected) return rejected;
    const compatibilityFallback =
      preparedAll.response.status === 400 &&
      record(preparedAll.payload) &&
      preparedAll.payload.state === 'invalid-request';
    if (!compatibilityFallback) {
      throw new Error('Não foi possível preparar o arquivo inteiro no staging.');
    }
    mode = 'legacy';
    const legacy = await prepareChunksLegacy(sessionId, chunks, onProgress);
    prepareAttempts += legacy.attempts;
    if (legacy.response) return legacy.response;
  }
  const prepareMs = elapsedMs(prepareStartedAt);

  const finalizeStartedAt = nowMs();
  const finalized = await fetchJson(
    `${ENDPOINT}?action=finalize&session=${encodeURIComponent(sessionId)}`,
  );
  const finalizeMs = elapsedMs(finalizeStartedAt);
  if (!isGradebookImportPersistenceResponseV6(finalized.payload)) {
    throw new Error(
      `Resposta final de persistência incompatível (HTTP ${finalized.response.status}).`,
    );
  }

  emitTiming(
    {
      version: 1,
      mode,
      chunkCount: chunks.length,
      initializeMs,
      beginMs,
      prepareMs,
      prepareAttempts,
      finalizeMs,
      totalMs: elapsedMs(totalStartedAt),
      serverPrepareMs,
      serverConcurrency,
      serverChunks,
    },
    onTiming,
  );
  return finalized.payload;
}
