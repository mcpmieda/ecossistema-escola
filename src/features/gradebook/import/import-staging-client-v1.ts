import {
  isGradebookImportPersistenceRequestV6,
  isGradebookImportPersistenceResponseV6,
  type GradebookImportCourseV6,
  type GradebookImportPersistenceRequestV6,
  type GradebookImportPersistenceResponseV6,
} from '../../../../shared/gradebook-contracts/imports/import-persistence-transport-v6';

const ENDPOINT = '/api/gradebook/import-staging';
const MAX_POSITIONS = 8;
const TIMEOUT_MS = 30_000;

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
      const compactCourse: GradebookImportCourseV6 = {
        ...course,
        terms: course.terms.map((term) => ({
          ...term,
          rows: term.rows.filter((row) => selected.has(row[0])),
        })) as GradebookImportCourseV6['terms'],
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

export async function persistCompactGradebookFileStagedV1(
  request: GradebookImportPersistenceRequestV6,
  onProgress?: (progress: GradebookImportStageProgressV1) => void,
): Promise<GradebookImportPersistenceResponseV6> {
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
