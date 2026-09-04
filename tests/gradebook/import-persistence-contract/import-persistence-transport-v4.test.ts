import { describe, expect, it } from 'vitest';
import type {
  AcademicYearId,
  EnrollmentId,
  StudentId,
  TeachingAssignmentId,
} from '../../../shared/gradebook-contracts/entities';
import type { GradebookImportAssessmentDefinitionV1 } from '../../../shared/gradebook-contracts/imports/import-persistence-transport-v1';
import {
  GRADEBOOK_IMPORT_PERSISTENCE_OPERATION_V4,
  GRADEBOOK_IMPORT_PERSISTENCE_TRANSPORT_VERSION_V4,
  GRADEBOOK_IMPORT_PERSISTENCE_TRANSPORT_V4,
  inspectGradebookImportPersistenceRequestV4,
  isGradebookImportPersistenceRequestV4,
  isGradebookImportPersistenceResponseV4,
  isGradebookImportResultCellObservationV4,
  type GradebookImportPersistenceRequestV4,
  type GradebookImportResultCellObservationV4,
} from '../../../shared/gradebook-contracts/imports/import-persistence-transport-v4';
import { inspectGradebookImportPersistenceRequestV3 } from '../../../shared/gradebook-contracts/imports/import-persistence-transport-v3';
import {
  SOURCE_QUALITATIVE_ACTIVITY_SLOTS_V2,
  SOURCE_QUANTITATIVE_ASSESSMENT_SLOTS_V2,
} from '../../../shared/gradebook-contracts/source/source-contract-v2';
import { materializeGradebookImportResultCellObservationV4 } from '../../../server/gradebook/application/import/result-cell-observation-v4';

const academicYearId = 'academic-year:synthetic-2026' as AcademicYearId;
const assignmentId = 'assignment:synthetic' as TeachingAssignmentId;
const studentId = 'student:synthetic' as StudentId;
const enrollmentId = 'enrollment:synthetic' as EnrollmentId;

const positive = (rawValue: number): GradebookImportResultCellObservationV4 => ({
  classification: 'manual-positive-number',
  rawValue,
});

function definitions(): GradebookImportAssessmentDefinitionV1[] {
  return [
    ...SOURCE_QUANTITATIVE_ASSESSMENT_SLOTS_V2.map((slot) => ({
      sourceSlot: slot.sourceSlot,
      maximumConfiguration: { state: 'numeric' as const, rawValue: slot.order + 4 },
    })),
    ...SOURCE_QUALITATIVE_ACTIVITY_SLOTS_V2.map((slot) => ({
      sourceSlot: slot.sourceSlot,
      maximumConfiguration: { state: 'numeric' as const, rawValue: 3 },
      name: { state: 'text' as const, rawValue: `Atividade sintética ${slot.order}` },
    })),
  ];
}

function request(): GradebookImportPersistenceRequestV4 {
  return {
    transportVersion: GRADEBOOK_IMPORT_PERSISTENCE_TRANSPORT_VERSION_V4,
    operation: GRADEBOOK_IMPORT_PERSISTENCE_OPERATION_V4,
    manifest: {
      fileName: 'fixture-sintetica-v4.xlsx',
      extension: 'xlsx',
      reportedMimeType: null,
      sizeBytes: 2048,
      lastModifiedAt: null,
      sha256: 'd'.repeat(64),
      sourceContractVersion: 2,
      parserVersion: 'synthetic-v4',
      readAt: '2026-01-10T12:01:00.000Z',
    },
    recognizedSuggestions: { academicYear: 2026, teacherName: 'Docente Sintético' },
    confirmedContext: { academicYearId },
    sourceResolution: { mode: 'resolve-or-create' },
    sheets: [
      {
        kind: 'term',
        sourceSheetName: 'TURMA-SINTETICA-1ºD1',
        term: 1,
        recognizedContext: {
          classGroupLabel: 'Turma Sintética',
          subjectLabel: 'Componente Sintético',
          disciplineIndex: 'D1',
        },
        teachingAssignmentId: assignmentId,
        assessmentDefinitions: definitions(),
        students: [
          {
            sourceRow: 5,
            confirmedStudent: { studentId, enrollmentId },
            assessmentValues: [
              { sourceSlot: 'R', value: { kind: 'manual', source: 4, value: 4 } },
              { sourceSlot: 'AA', value: { kind: 'official-zero', source: 0.1, value: 0 } },
            ],
            aggregates: {
              quantitativeTotal: positive(10),
              parallelAssessment: {
                classification: 'formula-zero',
                rawValue: 0,
                formula: '=0',
                cachedValue: 0,
              },
              qualitativeTotal: positive(12),
              officialTermGrade: positive(22),
              annualAccumulatedTotal: { classification: 'missing-field' },
            },
          },
        ],
      },
      {
        kind: 'recovery',
        sourceSheetName: 'TURMA-SINTETICA-REC-D1',
        recognizedContext: {
          classGroupLabel: 'Turma Sintética',
          subjectLabel: 'Componente Sintético',
          disciplineIndex: 'D1',
        },
        teachingAssignmentId: assignmentId,
        students: [
          {
            sourceRow: 5,
            confirmedStudent: { studentId, enrollmentId },
            recovery: {
              trimester1: positive(18),
              trimester2: { classification: 'empty', rawValue: '' },
              trimester3: { classification: 'manual-official-zero-marker', rawValue: 0.1 },
              totalAfterRecovery: positive(62),
              originalTrimester1: positive(15),
              originalTrimester2: positive(18),
              originalTrimester3: positive(20),
              originalAnnual: positive(53),
              applicabilityTrimester1: { classification: 'numeric', rawValue: 1 },
              applicabilityTrimester2: { classification: 'numeric', rawValue: 0 },
              applicabilityTrimester3: { classification: 'empty', rawValue: '' },
            },
          },
        ],
      },
    ],
    diagnostics: [],
  };
}

describe('GradebookImportPersistenceTransportV4', () => {
  it('preserves direct result-cell classifications without browser provenance', () => {
    const value = request();
    expect(inspectGradebookImportPersistenceRequestV4(value)).toBe('ready');
    expect(isGradebookImportPersistenceRequestV4(value)).toBe(true);
    expect(GRADEBOOK_IMPORT_PERSISTENCE_TRANSPORT_V4).toMatchObject({
      version: 4,
      directResultCells: {
        term: ['T', 'Z', 'AK', 'AM', 'AN'],
        recovery: ['R', 'S', 'T', 'U', 'X', 'Y', 'AA', 'AB'],
        provenance: 'server-reconstructed',
      },
    });
    expect(JSON.stringify(value)).not.toContain('provenance');
    expect(inspectGradebookImportPersistenceRequestV3(value)).not.toBe('ready');
  });

  it.each([
    { classification: 'manual-positive-number', rawValue: 7 },
    { classification: 'manual-negative-number', rawValue: -1 },
    { classification: 'manual-legacy-zero', rawValue: 0 },
    { classification: 'manual-official-zero-marker', rawValue: 0.1 },
    { classification: 'empty', rawValue: '' },
    { classification: 'missing-field' },
    { classification: 'formula-nonzero', rawValue: 7, formula: '=A1', cachedValue: 7 },
    { classification: 'formula-zero', rawValue: 0, formula: '=A1', cachedValue: 0 },
    {
      classification: 'formula-error-or-missing-cache',
      rawValue: '#VALUE!',
      formula: '=A1',
      cachedValue: null,
      sourceError: '#VALUE!',
    },
    { classification: 'invalid-text', rawValue: 'texto' },
  ] satisfies GradebookImportResultCellObservationV4[])(
    'validates result-cell observation %o',
    (observation) => {
      expect(isGradebookImportResultCellObservationV4(observation)).toBe(true);
    },
  );

  it('reconstructs provenance server-side and reuses source-cell semantics', () => {
    const provenance = {
      fileName: 'fixture-sintetica-v4.xlsx',
      fileSha256: 'e'.repeat(64),
      sheetName: 'TURMA-SINTETICA-1ºD1',
      cellAddress: 'Z5',
    } as const;
    const formulaZero = materializeGradebookImportResultCellObservationV4({
      observation: { classification: 'formula-zero', rawValue: 0, formula: '=0', cachedValue: 0 },
      provenance,
      maximumValue: 13.5,
    });
    expect(formulaZero).toMatchObject({
      status: 'ready',
      imported: { value: { state: 'absent' } },
      interpretation: { classification: 'formula-zero', valid: true },
    });
    if (formulaZero.status !== 'ready') return;
    expect(formulaZero.imported.evidence[0]?.provenance).toEqual(provenance);

    const formulaWithoutVisibleOrCachedValue = materializeGradebookImportResultCellObservationV4({
      observation: {
        classification: 'formula-error-or-missing-cache',
        rawValue: null,
        formula: '=SYNTHETIC_EMPTY()',
        cachedValue: null,
        sourceError: null,
      },
      provenance,
      maximumValue: 30,
    });
    expect(formulaWithoutVisibleOrCachedValue).toMatchObject({
      status: 'ready',
      imported: { value: { state: 'absent' } },
      interpretation: { valid: true, present: false },
    });

    const formulaWithVisibleError = materializeGradebookImportResultCellObservationV4({
      observation: {
        classification: 'formula-error-or-missing-cache',
        rawValue: '#VALUE!',
        formula: '=SYNTHETIC_ERROR()',
        cachedValue: null,
        sourceError: '#VALUE!',
      },
      provenance,
      maximumValue: 30,
    });
    expect(formulaWithVisibleError).toMatchObject({ status: 'review-required' });

    const invalid = materializeGradebookImportResultCellObservationV4({
      observation: { classification: 'invalid-text', rawValue: 'invalido' },
      provenance: { ...provenance, cellAddress: 'AM5' },
      maximumValue: 30,
    });
    expect(invalid).toMatchObject({
      status: 'review-required',
      interpretation: {
        semanticValue: { state: 'insufficient-data', reason: 'invalid-source-text' },
        valid: false,
      },
    });
  });

  it('keeps V4 responses versioned while preserving V3 response semantics', () => {
    expect(isGradebookImportPersistenceResponseV4({ transportVersion: 4, state: 'conflict' })).toBe(
      true,
    );
    expect(isGradebookImportPersistenceResponseV4({ transportVersion: 3, state: 'conflict' })).toBe(
      false,
    );
  });
});
