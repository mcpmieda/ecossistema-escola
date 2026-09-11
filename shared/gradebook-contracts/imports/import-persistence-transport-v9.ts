import type { GradebookImportPersistenceSummaryV2 } from './import-persistence-transport-v2';
import { isCurrentGradebookAcademicYearV1 } from '../current-academic-year-v1';

export const GRADEBOOK_IMPORT_PERSISTENCE_TRANSPORT_VERSION_V9 = 9 as const;
export const GRADEBOOK_IMPORT_PERSISTENCE_BODY_BYTES_V9 = 2_000_000;

export interface GradebookImportManifestV9 {
  readonly fileName: string;
  readonly sha256: string;
  readonly parserVersion: string;
}

/** number = canonical INTEGER x1000; null = explicit empty/clear; ['u'] = unreadable/unavailable, preserve prior value. */
export type GradebookImportCellV9 = number | null | readonly ['u'];
/** Recovery additionally accepts ['n'] for N/C. */
export type GradebookImportRecoveryCellV9 = GradebookImportCellV9 | readonly ['n'];

export type GradebookRelationStudentV9 = readonly [
  numero: number,
  nome: string,
  situacao: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7,
  turmaRelacionadaCodigo?: string,
];

export interface GradebookRelationClassV9 {
  readonly codigo: string;
  readonly nome: string;
  readonly etapa: number;
  readonly turno: string;
  readonly alunos: readonly GradebookRelationStudentV9[];
}

export interface GradebookRelationImportRequestV9 {
  readonly transportVersion: 9;
  readonly operation: 'persist-relacao';
  readonly manifest: GradebookImportManifestV9;
  readonly ano: number;
  readonly turmas: readonly GradebookRelationClassV9[];
}

export type GradebookImportInstrumentV9 = readonly [
  slot: 1 | 2 | 3 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20,
  maximo: number | null,
  descricao?: string,
];

export type GradebookImportTermStudentV9 = readonly [
  numero: number,
  valores: readonly GradebookImportCellV9[],
  amFonte: GradebookImportCellV9,
];

export interface GradebookImportTermV9 {
  readonly trimestre: 1 | 2 | 3;
  readonly instrumentos: readonly GradebookImportInstrumentV9[];
  readonly alunos: readonly GradebookImportTermStudentV9[];
}

export type GradebookImportRecoveryStudentV9 = readonly [
  numero: number,
  rec1: GradebookImportRecoveryCellV9,
  rec2: GradebookImportRecoveryCellV9,
  rec3: GradebookImportRecoveryCellV9,
  uFonte: GradebookImportCellV9,
];

export interface GradebookImportOfferV9 {
  readonly turmaCodigo: string;
  readonly disciplina: string;
  readonly trimestres: readonly [GradebookImportTermV9, GradebookImportTermV9, GradebookImportTermV9];
  readonly recuperacao: readonly GradebookImportRecoveryStudentV9[] | null;
}

export interface GradebookNotesImportRequestV9 {
  readonly transportVersion: 9;
  readonly operation: 'persist-notas';
  readonly manifest: GradebookImportManifestV9;
  readonly ano: number;
  readonly professor: string;
  readonly ofertas: readonly GradebookImportOfferV9[];
}

export type GradebookImportPersistenceRequestV9 =
  | GradebookRelationImportRequestV9
  | GradebookNotesImportRequestV9;

export type GradebookImportPersistenceResponseV9 =
  | {
      readonly transportVersion: 9;
      readonly state: 'applied' | 'no-changes';
      readonly summary: GradebookImportPersistenceSummaryV2;
    }
  | {
      readonly transportVersion: 9;
      readonly state: 'blocked' | 'conflict' | 'review-required';
      readonly reason: string;
    }
  | {
      readonly transportVersion: 9;
      readonly state: 'invalid-request';
      readonly reason: string;
    }
  | { readonly transportVersion: 9; readonly state: 'not-authorized' | 'unavailable' };

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function nonEmptyText(value: unknown, max = 256): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= max && !value.includes('\u0000');
}

function validManifest(value: unknown): value is GradebookImportManifestV9 {
  return (
    record(value) &&
    nonEmptyText(value.fileName, 512) &&
    typeof value.sha256 === 'string' &&
    /^[0-9a-f]{64}$/u.test(value.sha256) &&
    nonEmptyText(value.parserVersion, 128)
  );
}

function validCanonicalInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function validCell(value: unknown): value is GradebookImportCellV9 {
  return (
    value === null ||
    validCanonicalInteger(value) ||
    (Array.isArray(value) && value.length === 1 && value[0] === 'u')
  );
}

function validRecoveryCell(value: unknown): value is GradebookImportRecoveryCellV9 {
  return validCell(value) || (Array.isArray(value) && value.length === 1 && value[0] === 'n');
}

function validRelation(value: Record<string, unknown>): boolean {
  if (!isCurrentGradebookAcademicYearV1(value.ano)) return false;
  if (!Array.isArray(value.turmas) || value.turmas.length === 0 || value.turmas.length > 64) return false;
  const classCodes = new Set<string>();
  for (const turma of value.turmas) {
    if (!record(turma) || !nonEmptyText(turma.codigo, 32) || !nonEmptyText(turma.nome, 128)) return false;
    if (!Number.isSafeInteger(turma.etapa) || Number(turma.etapa) <= 0 || !nonEmptyText(turma.turno, 64)) return false;
    const classKey = turma.codigo.trim().toUpperCase();
    if (classCodes.has(classKey)) return false;
    classCodes.add(classKey);
    if (!Array.isArray(turma.alunos) || turma.alunos.length > 64) return false;
    const numbers = new Set<number>();
    for (const aluno of turma.alunos) {
      if (!Array.isArray(aluno) || (aluno.length !== 3 && aluno.length !== 4)) return false;
      if (!Number.isSafeInteger(aluno[0]) || aluno[0] <= 0 || numbers.has(aluno[0])) return false;
      numbers.add(aluno[0]);
      if (!nonEmptyText(aluno[1], 256) || !Number.isSafeInteger(aluno[2]) || aluno[2] < 0 || aluno[2] > 7) return false;
      const related = aluno[3];
      if (aluno[2] === 6 || aluno[2] === 7) {
        if (!nonEmptyText(related, 32)) return false;
      } else if (related !== undefined) return false;
    }
  }
  for (const turma of value.turmas as GradebookRelationClassV9[]) {
    for (const aluno of turma.alunos) {
      if ((aluno[2] === 6 || aluno[2] === 7) && !classCodes.has(aluno[3]!.trim().toUpperCase())) return false;
    }
  }
  return true;
}

const SLOTS = new Set([1, 2, 3, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);

function validNotes(value: Record<string, unknown>): boolean {
  if (!isCurrentGradebookAcademicYearV1(value.ano)) return false;
  if (!nonEmptyText(value.professor, 256) || !Array.isArray(value.ofertas) || value.ofertas.length === 0 || value.ofertas.length > 128) return false;
  const offers = new Set<string>();
  for (const oferta of value.ofertas) {
    if (!record(oferta) || !nonEmptyText(oferta.turmaCodigo, 32) || !nonEmptyText(oferta.disciplina, 256)) return false;
    const offerKey = JSON.stringify([oferta.turmaCodigo.trim().toUpperCase(), oferta.disciplina.trim().toLocaleLowerCase('pt-BR')]);
    if (offers.has(offerKey)) return false;
    offers.add(offerKey);
    if (!Array.isArray(oferta.trimestres) || oferta.trimestres.length !== 3) return false;
    for (const [termIndex, termo] of oferta.trimestres.entries()) {
      if (!record(termo) || termo.trimestre !== termIndex + 1 || !Array.isArray(termo.instrumentos) || !Array.isArray(termo.alunos)) return false;
      if (termo.instrumentos.length === 0 || termo.instrumentos.length > 13 || termo.alunos.length > 64) return false;
      const slots = new Set<number>();
      for (const instrumento of termo.instrumentos) {
        if (!Array.isArray(instrumento) || (instrumento.length !== 2 && instrumento.length !== 3)) return false;
        if (!Number.isSafeInteger(instrumento[0]) || !SLOTS.has(instrumento[0]) || slots.has(instrumento[0])) return false;
        slots.add(instrumento[0]);
        if (instrumento[1] !== null && (!validCanonicalInteger(instrumento[1]) || instrumento[1] <= 0)) return false;
        if (instrumento[2] !== undefined && !nonEmptyText(instrumento[2], 512)) return false;
      }
      const numbers = new Set<number>();
      for (const aluno of termo.alunos) {
        if (!Array.isArray(aluno) || aluno.length !== 3 || !Number.isSafeInteger(aluno[0]) || aluno[0] <= 0 || numbers.has(aluno[0])) return false;
        numbers.add(aluno[0]);
        if (!Array.isArray(aluno[1]) || aluno[1].length !== termo.instrumentos.length || !aluno[1].every(validCell) || !validCell(aluno[2])) return false;
      }
    }
    if (oferta.recuperacao !== null) {
      if (!Array.isArray(oferta.recuperacao) || oferta.recuperacao.length > 64) return false;
      const numbers = new Set<number>();
      for (const aluno of oferta.recuperacao) {
        if (!Array.isArray(aluno) || aluno.length !== 5 || !Number.isSafeInteger(aluno[0]) || aluno[0] <= 0 || numbers.has(aluno[0])) return false;
        numbers.add(aluno[0]);
        if (!validRecoveryCell(aluno[1]) || !validRecoveryCell(aluno[2]) || !validRecoveryCell(aluno[3]) || !validCell(aluno[4])) return false;
      }
    }
  }
  return true;
}

export function inspectGradebookImportPersistenceRequestV9(value: unknown): 'ready' | 'invalid-request' | 'payload-too-large' {
  try {
    if (!record(value) || value.transportVersion !== 9 || !validManifest(value.manifest)) return 'invalid-request';
    if (new TextEncoder().encode(JSON.stringify(value)).byteLength > GRADEBOOK_IMPORT_PERSISTENCE_BODY_BYTES_V9) return 'payload-too-large';
    if (value.operation === 'persist-relacao') return validRelation(value) ? 'ready' : 'invalid-request';
    if (value.operation === 'persist-notas') return validNotes(value) ? 'ready' : 'invalid-request';
    return 'invalid-request';
  } catch {
    return 'invalid-request';
  }
}

export function isGradebookImportPersistenceRequestV9(value: unknown): value is GradebookImportPersistenceRequestV9 {
  return inspectGradebookImportPersistenceRequestV9(value) === 'ready';
}

export function isGradebookImportPersistenceResponseV9(value: unknown): value is GradebookImportPersistenceResponseV9 {
  if (!record(value) || value.transportVersion !== 9 || typeof value.state !== 'string') return false;
  if (value.state === 'applied' || value.state === 'no-changes') return record(value.summary);
  if (value.state === 'blocked' || value.state === 'conflict' || value.state === 'review-required' || value.state === 'invalid-request') return nonEmptyText(value.reason, 512);
  return value.state === 'not-authorized' || value.state === 'unavailable';
}
