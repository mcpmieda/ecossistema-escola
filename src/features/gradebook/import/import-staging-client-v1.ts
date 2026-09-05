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
const TIMEOUT_MS = 30_000;
let initializationPromise: Promise<void> | null = null;

export interface GradebookImportStageProgressV1 {
  readonly prepared: number;
  readonly total: number;
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
): Promise<{ readonly response: Response; readonly payload: unknown }> {
  let lastFailure: unknown = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    const timeout = globalThis.setTimeout(() => controller.abort(), TIMEOUT_MS);
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
      if (payload !== null) return { response, payload };
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

export async function persistCompactGradebookFileStagedV1(
  request: GradebookImportPersistenceRequestV6,
  onProgress?: (progress: GradebookImportStageProgressV1) => void,
): Promise<GradebookImportPersistenceResponseV6> {
  await initializeStaging();
  const chunks = splitCompactGradebookImportV6(request);
  const begin = await fetchJson(`${ENDPOINT}?action=begin`, request);
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

  for (const [index, chunk] of chunks.entries()) {
    const prepared = await fetchJson(
      `${ENDPOINT}?action=prepare&session=${encodeURIComponent(sessionId)}&chunk=${index}`,
      chunk,
    );
    if (
      !prepared.response.ok ||
      !record(prepared.payload) ||
      (prepared.payload.state !== 'prepared' && prepared.payload.state !== 'already-prepared')
    ) {
      if (record(prepared.payload) && prepared.payload.state === 'rejected' && 'response' in prepared.payload) {
        const response = prepared.payload.response;
        if (isGradebookImportPersistenceResponseV6(response)) return response;
      }
      throw new Error(`Não foi possível preparar o fragmento ${index + 1} de ${chunks.length}.`);
    }
    onProgress?.({ prepared: index + 1, total: chunks.length });
  }

  const finalized = await fetchJson(
    `${ENDPOINT}?action=finalize&session=${encodeURIComponent(sessionId)}`,
  );
  if (!isGradebookImportPersistenceResponseV6(finalized.payload)) {
    throw new Error(
      `Resposta final de persistência incompatível (HTTP ${finalized.response.status}).`,
    );
  }
  return finalized.payload;
}