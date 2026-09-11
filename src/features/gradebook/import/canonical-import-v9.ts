import {
  isGradebookImportPersistenceRequestV9,
  type GradebookImportCellV9,
  type GradebookImportInstrumentV9,
  type GradebookImportOfferV9,
  type GradebookImportPersistenceRequestV9,
  type GradebookImportRecoveryCellV9,
  type GradebookImportTermV9,
} from '../../../../shared/gradebook-contracts/imports/import-persistence-transport-v9';
import { isGradebookAcademicYearV2 } from '../../../../shared/gradebook-contracts/academic-year-v2';
import {
  SOURCE_QUALITATIVE_ACTIVITY_SLOTS_V2,
  type SourceAssessmentDefinitionV2,
} from '../../../../shared/gradebook-contracts/source/source-contract-v2';
import type { GradebookImportResultCellObservationV4 } from '../../../../shared/gradebook-contracts/imports/import-persistence-transport-v4';
import type { BatchSuccess } from './import-batch';
import type {
  GradeSheetRecognition,
  NoteValue,
  StudentRecognition,
  WorkbookSummary,
} from './spreadsheet-recognizer';
import type { MasterRelationRecognitionV9 } from './master-relation-v9';

export type CanonicalImportProgressStageV9 = 'roster' | 'grades' | 'recovery' | 'compacting';
export interface CanonicalImportProgressV9 {
  readonly stage: CanonicalImportProgressStageV9;
  readonly current: number;
  readonly total: number;
}

export interface CanonicalImportWarningV9 {
  readonly code: 'above-maximum';
  readonly sheetName: string;
  readonly cellAddress: string;
  readonly value: number;
  readonly maximum: number;
}

export interface CanonicalImportRuntimeV9 {
  readonly onProgress?: (progress: CanonicalImportProgressV9) => void;
  readonly onWarning?: (warning: CanonicalImportWarningV9) => void;
}

type SummaryWithRelationV9 = WorkbookSummary & {
  readonly masterRelationV9?: MasterRelationRecognitionV9;
};

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '')
    .trim()
    .replace(/\s+/gu, ' ')
    .toUpperCase();
}

function parserVersion(value: string): string {
  return `${value.slice(0, 108)}:canonical-v9`;
}

function manifest(result: BatchSuccess) {
  return {
    fileName: result.manifest.fileName,
    sha256: result.manifest.sha256,
    parserVersion: parserVersion(result.manifest.parserVersion),
  } as const;
}

/** Converts a decimal spreadsheet number to exact academic thousandths. The tolerance only absorbs IEEE-754 representation noise. */
export function canonicalMilliV9(value: number): number {
  if (!Number.isFinite(value) || value < 0) throw new Error(`Valor numérico inválido: ${String(value)}.`);
  const scaled = value * 1000;
  const rounded = Math.round(scaled);
  if (!Number.isSafeInteger(rounded) || Math.abs(scaled - rounded) > 1e-7) {
    throw new Error(`Valor ${String(value)} exige mais de 3 casas decimais.`);
  }
  return rounded;
}

function snapshot(sheet: GradeSheetRecognition, address: string): unknown {
  return sheet.snapshotCellsV8?.[address];
}

function cellFromNote(
  sheet: GradeSheetRecognition,
  address: string,
  note: NoteValue | null,
): GradebookImportCellV9 {
  const raw = snapshot(sheet, address);
  if (Array.isArray(raw)) return ['u'];
  if (raw === undefined || raw === null || raw === '') return null;
  if (typeof raw === 'boolean') throw new Error(`Texto/valor inválido em ${sheet.name}!${address}.`);
  const numeric =
    typeof raw === 'number'
      ? raw
      : typeof raw === 'string' && /^[+-]?\d+(?:[.,]\d+)?$/u.test(raw.trim())
        ? Number(raw.trim().replace(',', '.'))
        : null;
  if (numeric === null || !Number.isFinite(numeric)) {
    throw new Error(`Texto inválido em ${sheet.name}!${address}.`);
  }
  if (numeric < 0 || note?.kind === 'negative') throw new Error(`Nota negativa em ${sheet.name}!${address}.`);
  if (numeric === 0.1 || note?.kind === 'official-zero') return 0;
  if (numeric === 0 || note?.kind === 'legacy-zero') return null;
  return canonicalMilliV9(note?.value ?? numeric);
}

function ncText(value: unknown): boolean {
  return typeof value === 'string' && value.trim().toUpperCase().replaceAll('/', '') === 'NC';
}

function rrText(value: unknown): boolean {
  return typeof value === 'string' && value.trim().toUpperCase().replaceAll('/', '') === 'RR';
}

function cellFromObservation(
  sheet: GradeSheetRecognition,
  address: string,
  observation: GradebookImportResultCellObservationV4,
  allowNc: boolean,
): GradebookImportCellV9 | GradebookImportRecoveryCellV9 {
  const rawSnapshot = snapshot(sheet, address);
  if (Array.isArray(rawSnapshot)) return ['u'];
  switch (observation.classification) {
    case 'missing-field':
    case 'empty':
    case 'manual-legacy-zero':
    case 'formula-zero':
      return null;
    case 'manual-official-zero-marker':
      return 0;
    case 'manual-negative-number':
      throw new Error(`Nota negativa em ${sheet.name}!${address}.`);
    case 'invalid-text':
      if (allowNc && ncText(observation.rawValue)) return ['n'];
      if (allowNc && rrText(observation.rawValue)) return ['r'];
      throw new Error(`Texto inválido em ${sheet.name}!${address}.`);
    case 'manual-positive-number': {
      if (observation.rawValue === 0.1) return 0;
      if (typeof observation.rawValue !== 'number') throw new Error(`Valor inválido em ${sheet.name}!${address}.`);
      return canonicalMilliV9(observation.rawValue);
    }
    case 'formula-nonzero': {
      if (observation.cachedValue === 0.1) return 0;
      return canonicalMilliV9(observation.cachedValue);
    }
    case 'formula-error-or-missing-cache':
      return ['u'];
  }
}

function maximum(definition: SourceAssessmentDefinitionV2 | undefined): number | null {
  if (!definition) return null;
  const configuration = definition.maximumConfiguration;
  if (configuration.state !== 'numeric') return null;
  if (!Number.isFinite(configuration.rawValue) || configuration.rawValue <= 0) return null;
  return canonicalMilliV9(configuration.rawValue);
}

function description(definition: SourceAssessmentDefinitionV2 | undefined): string | undefined {
  if (!definition || definition.kind !== 'qualitative-activity') return undefined;
  return definition.name.state === 'text' && definition.name.rawValue.trim().length > 0
    ? definition.name.rawValue.trim()
    : undefined;
}

const FIXED_SLOTS = [1, 2, 3, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20] as const;

function instruments(sheet: GradeSheetRecognition): readonly GradebookImportInstrumentV9[] {
  const bySource = new Map(sheet.assessmentDefinitions.map((definition) => [definition.sourceSlot, definition]));
  const av1 = maximum(bySource.get('R'));
  const av2 = maximum(bySource.get('S'));
  if (av1 === null || av2 === null) {
    throw new Error(`Máximo de AV1/AV2 ausente ou inválido em ${sheet.name}.`);
  }
  return FIXED_SLOTS.map((slot) => {
    if (slot === 1) return [1, av1] as const;
    if (slot === 2) return [2, av2] as const;
    if (slot === 3) return [3, null] as const;
    const index = slot - 11;
    const source = SOURCE_QUALITATIVE_ACTIVITY_SLOTS_V2[index]?.sourceSlot;
    const definition = source ? bySource.get(source) : undefined;
    const max = maximum(definition);
    const name = description(definition);
    return name === undefined ? ([slot, max] as const) : ([slot, max, name] as const);
  });
}

function noteForSlot(student: StudentRecognition, slot: GradebookImportInstrumentV9[0]): NoteValue | null {
  if (slot === 1) return student.quantitativeAssessments[0] ?? null;
  if (slot === 2) return student.quantitativeAssessments[1] ?? null;
  if (slot === 3) return student.parallel;
  return student.qualitative[slot - 11] ?? null;
}

function addressForSlot(slot: GradebookImportInstrumentV9[0], row: number): string {
  if (slot === 1) return `R${row}`;
  if (slot === 2) return `S${row}`;
  if (slot === 3) return `Z${row}`;
  return `${SOURCE_QUALITATIVE_ACTIVITY_SLOTS_V2[slot - 11]!.sourceSlot}${row}`;
}

function studentNumber(student: StudentRecognition, sheet: GradeSheetRecognition): number {
  const number = Number(student.number.trim());
  if (!Number.isSafeInteger(number) || number <= 0) {
    throw new Error(`Número de aluno inválido em ${sheet.name}!J${student.row}.`);
  }
  return number;
}

function term(
  sheet: GradeSheetRecognition,
  trimester: 1 | 2 | 3,
  runtime: CanonicalImportRuntimeV9,
): GradebookImportTermV9 {
  const definitions = instruments(sheet);
  const seen = new Set<number>();
  const alunos = sheet.students
    .filter((student) => student.row >= 5 && student.row <= 50)
    .map((student) => {
      const numero = studentNumber(student, sheet);
      if (seen.has(numero)) throw new Error(`Número de aluno duplicado em ${sheet.name}: ${numero}.`);
      seen.add(numero);
      const valores = definitions.map(([slot, max]) => {
        const address = addressForSlot(slot, student.row);
        const value = cellFromNote(sheet, address, noteForSlot(student, slot));
        if (typeof value === 'number' && max !== null && value > max) {
          runtime.onWarning?.({
            code: 'above-maximum',
            sheetName: sheet.name,
            cellAddress: address,
            value,
            maximum: max,
          });
        }
        return value;
      });
      const observations = student.termResultObservations;
      if (!observations) throw new Error(`Resultado trimestral ausente em ${sheet.name}, aluno ${numero}.`);
      const am = cellFromObservation(sheet, `AM${student.row}`, observations.officialTermGrade, false) as GradebookImportCellV9;
      return [numero, valores, am] as const;
    });
  return { trimestre: trimester, instrumentos: definitions, alunos };
}

function sameNumbers(terms: readonly GradebookImportTermV9[]): boolean {
  const signature = (value: GradebookImportTermV9) => [...value.alunos.map((row) => row[0])].sort((a, b) => a - b).join(',');
  return terms.every((value) => signature(value) === signature(terms[0]!));
}

function groupKey(sheet: GradeSheetRecognition): string {
  return JSON.stringify([normalize(sheet.className), normalize(sheet.discipline), sheet.disciplineIndex.trim().toUpperCase()]);
}

function courseGroups(summary: WorkbookSummary): readonly GradeSheetRecognition[][] {
  const groups = new Map<string, GradeSheetRecognition[]>();
  for (const sheet of summary.gradeSheets) {
    if (sheet.stage === 'overview') continue;
    const key = groupKey(sheet);
    groups.set(key, [...(groups.get(key) ?? []), sheet]);
  }
  return [...groups.values()];
}

function offer(
  sheets: readonly GradeSheetRecognition[],
  runtime: CanonicalImportRuntimeV9,
): GradebookImportOfferV9 {
  const termSheets = new Map(
    sheets.filter((sheet) => sheet.stage.startsWith('trimester-')).map((sheet) => [Number(sheet.stage.at(-1)), sheet]),
  );
  if (termSheets.size !== 3) throw new Error('Conjunto de disciplina sem os três trimestres.');
  const first = termSheets.get(1);
  if (!first) throw new Error('1º trimestre ausente.');
  const trimestres = [
    term(termSheets.get(1)!, 1, runtime),
    term(termSheets.get(2)!, 2, runtime),
    term(termSheets.get(3)!, 3, runtime),
  ] as const;
  if (!sameNumbers(trimestres)) {
    throw new Error(`Os números dos alunos divergem entre trimestres em ${first.className} / ${first.discipline}.`);
  }

  const recovery = sheets.find((sheet) => sheet.stage === 'recovery') ?? null;
  const recuperacao = recovery
    ? recovery.students
        .filter((student) => student.row >= 5 && student.row <= 50 && student.recovery !== null)
        .map((student) => {
          const numero = studentNumber(student, recovery);
          const observations = student.recovery!.resultObservations;
          return [
            numero,
            cellFromObservation(recovery, `R${student.row}`, observations.trimester1, true) as GradebookImportRecoveryCellV9,
            cellFromObservation(recovery, `S${student.row}`, observations.trimester2, true) as GradebookImportRecoveryCellV9,
            cellFromObservation(recovery, `T${student.row}`, observations.trimester3, true) as GradebookImportRecoveryCellV9,
            cellFromObservation(recovery, `U${student.row}`, observations.totalAfterRecovery, false) as GradebookImportCellV9,
          ] as const;
        })
    : null;
  return {
    turmaCodigo: first.className.trim().toUpperCase(),
    disciplina: first.discipline.trim(),
    trimestres,
    recuperacao,
  };
}

export function createGradebookCanonicalImportRequestV9(
  result: BatchSuccess,
  runtime: CanonicalImportRuntimeV9 = {},
): GradebookImportPersistenceRequestV9 {
  const summary = result.summary as SummaryWithRelationV9;
  if (summary.masterRelationV9) {
    if (!isGradebookAcademicYearV2(summary.masterRelationV9.ano)) throw new Error('Ano letivo inválido na Relação.');
    runtime.onProgress?.({ stage: 'roster', current: 0, total: summary.masterRelationV9.turmas.length });
    const request = {
      transportVersion: 9,
      operation: 'persist-relacao',
      manifest: manifest(result),
      ano: summary.masterRelationV9.ano,
      turmas: summary.masterRelationV9.turmas,
    } as const;
    runtime.onProgress?.({ stage: 'roster', current: summary.masterRelationV9.turmas.length, total: summary.masterRelationV9.turmas.length });
    runtime.onProgress?.({ stage: 'compacting', current: 1, total: 1 });
    if (!isGradebookImportPersistenceRequestV9(request)) throw new Error('Relação canônica não passou na validação local.');
    return request;
  }

  if (!isGradebookAcademicYearV2(summary.academicYear)) throw new Error('Ano letivo ausente ou inválido em CONFIGURAÇÃO!C2.');
  const professor = summary.teacherName?.trim();
  if (!professor) throw new Error('Professor não reconhecido em CONFIGURAÇÃO!A2.');
  const groups = courseGroups(summary);
  if (groups.length === 0) throw new Error('Nenhuma oferta acadêmica reconhecida.');
  runtime.onProgress?.({ stage: 'grades', current: 0, total: groups.length });
  const ofertas = groups.map((sheets, index) => {
    const value = offer(sheets, runtime);
    runtime.onProgress?.({ stage: 'grades', current: index + 1, total: groups.length });
    return value;
  });
  const logical = new Set<string>();
  for (const item of ofertas) {
    const key = JSON.stringify([item.turmaCodigo.trim().toUpperCase(), item.disciplina.trim().toLocaleLowerCase('pt-BR')]);
    if (logical.has(key)) {
      throw new Error(`Oferta lógica duplicada no arquivo: ${item.turmaCodigo} / ${item.disciplina}.`);
    }
    logical.add(key);
  }
  runtime.onProgress?.({ stage: 'recovery', current: groups.length, total: groups.length });
  runtime.onProgress?.({ stage: 'compacting', current: 1, total: 1 });
  const request = {
    transportVersion: 9,
    operation: 'persist-notas',
    manifest: manifest(result),
    ano: summary.academicYear as number,
    professor,
    ofertas,
  } as const;
  if (!isGradebookImportPersistenceRequestV9(request)) throw new Error('Pacote acadêmico canônico não passou na validação local.');
  return request;
}

export function unavailableCellsV9(request: GradebookImportPersistenceRequestV9): number {
  if (request.operation === 'persist-relacao') return 0;
  let total = 0;
  const unavailable = (value: unknown) => Array.isArray(value) && value[0] === 'u';
  for (const oferta of request.ofertas) {
    for (const term of oferta.trimestres) {
      for (const [, values, am] of term.alunos) {
        total += values.filter(unavailable).length;
        if (unavailable(am)) total++;
      }
    }
    for (const [, rec1, rec2, rec3, u] of oferta.recuperacao ?? []) {
      if (unavailable(rec1)) total++;
      if (unavailable(rec2)) total++;
      if (unavailable(rec3)) total++;
      if (unavailable(u)) total++;
    }
  }
  return total;
}
