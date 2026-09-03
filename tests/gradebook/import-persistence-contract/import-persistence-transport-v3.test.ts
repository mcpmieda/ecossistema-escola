import { describe, expect, it } from 'vitest';
import type {
  AcademicYearId,
  EnrollmentId,
  StudentId,
  TeachingAssignmentId,
} from '../../../shared/gradebook-contracts/entities';
import {
  GRADEBOOK_IMPORT_PERSISTENCE_OPERATION_V3,
  GRADEBOOK_IMPORT_PERSISTENCE_TRANSPORT_VERSION_V3,
  GRADEBOOK_IMPORT_PERSISTENCE_TRANSPORT_V3,
  inspectGradebookImportPersistenceRequestV3,
  isGradebookImportPersistenceRequestV3,
  isGradebookImportPersistenceResponseV3,
  resolveGradebookImportRecoveryApplicabilityV3,
  type GradebookImportPersistenceRequestV3,
  type GradebookImportRecoveryApplicabilityObservationV3,
} from '../../../shared/gradebook-contracts/imports/import-persistence-transport-v3';
import { inspectGradebookImportPersistenceRequestV1 } from '../../../shared/gradebook-contracts/imports/import-persistence-transport-v1';
import { inspectGradebookImportPersistenceRequestV2 } from '../../../shared/gradebook-contracts/imports/import-persistence-transport-v2';

function request(): GradebookImportPersistenceRequestV3 {
  return {
    transportVersion: GRADEBOOK_IMPORT_PERSISTENCE_TRANSPORT_VERSION_V3,
    operation: GRADEBOOK_IMPORT_PERSISTENCE_OPERATION_V3,
    manifest: {
      fileName: 'somente-fixture-sintetica.xlsx',
      extension: 'xlsx',
      reportedMimeType: null,
      sizeBytes: 1234,
      lastModifiedAt: null,
      sha256: 'a'.repeat(64),
      sourceContractVersion: 2,
      parserVersion: 'synthetic-v3',
      readAt: '2026-01-10T12:01:00.000Z',
    },
    recognizedSuggestions: { academicYear: 2026, teacherName: 'Docente Sintético' },
    confirmedContext: {
      academicYearId: 'academic-year:synthetic-2026' as AcademicYearId,
    },
    sourceResolution: { mode: 'resolve-or-create' },
    sheets: [
      {
        kind: 'recovery',
        sourceSheetName: 'TURMA-SINTETICA-REC',
        recognizedContext: {
          classGroupLabel: 'Turma Sintética',
          subjectLabel: 'Componente Sintético',
          disciplineIndex: 'D1',
        },
        teachingAssignmentId: 'assignment:synthetic' as TeachingAssignmentId,
        students: [
          {
            sourceRow: 5,
            confirmedStudent: {
              studentId: 'student:synthetic' as StudentId,
              enrollmentId: 'enrollment:synthetic' as EnrollmentId,
            },
            recovery: {
              trimester1: { kind: 'manual', source: 12, value: 12 },
              trimester2: null,
              trimester3: null,
              totalAfterRecovery: { kind: 'manual', source: 62, value: 62 },
              originalTrimester1: { kind: 'manual', source: 15, value: 15 },
              originalTrimester2: { kind: 'manual', source: 18, value: 18 },
              originalTrimester3: { kind: 'manual', source: 20, value: 20 },
              originalAnnual: { kind: 'manual', source: 53, value: 53 },
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

describe('GradebookImportPersistenceTransportV3', () => {
  it('preserves raw AC/AD/AE classifications while retaining all V2 bounds and trust rules', () => {
    const value = request();
    expect(inspectGradebookImportPersistenceRequestV3(value)).toBe('ready');
    expect(isGradebookImportPersistenceRequestV3(value)).toBe(true);
    expect(GRADEBOOK_IMPORT_PERSISTENCE_TRANSPORT_V3).toMatchObject({
      version: 3,
      unit: 'one-recognized-source-file-per-request',
      recoveryApplicability: {
        numericOne: 'applicable',
        numericZero: 'not-applicable',
        everythingElse: 'insufficient-data',
      },
    });
    expect(JSON.stringify(value)).not.toMatch(/logicalSourceId|workbook|worksheet|writes/u);
  });

  it.each([
    [{ classification: 'numeric', rawValue: 1 }, { state: 'applicable' }],
    [
      { classification: 'numeric', rawValue: 0 },
      { state: 'not-applicable', reason: 'source REC flag is explicitly numeric zero' },
    ],
    [
      { classification: 'empty', rawValue: '' },
      {
        state: 'insufficient-data',
        reason: 'source REC applicability is not an explicit numeric 1 or 0: empty',
      },
    ],
    [
      { classification: 'missing-field' },
      {
        state: 'insufficient-data',
        reason: 'source REC applicability is not an explicit numeric 1 or 0: missing-field',
      },
    ],
    [
      { classification: 'unrecognized', rawValue: false },
      {
        state: 'insufficient-data',
        reason: 'source REC applicability is not an explicit numeric 1 or 0: unrecognized',
      },
    ],
  ] satisfies readonly [GradebookImportRecoveryApplicabilityObservationV3, object][])(
    'resolves %o fail-closed without collapsing false to numeric zero',
    (observation, expected) => {
      expect(resolveGradebookImportRecoveryApplicabilityV3(observation)).toEqual(expected);
    },
  );

  it('rejects unknown applicability fields and preserves V1/V2 as separate historical versions', () => {
    const invalid = structuredClone(request()) as unknown as Record<string, unknown>;
    const sheets = invalid.sheets as Array<Record<string, unknown>>;
    const students = sheets[0]!.students as Array<Record<string, unknown>>;
    const recovery = students[0]!.recovery as Record<string, unknown>;
    recovery.eligibleTrimester1 = true;

    expect(inspectGradebookImportPersistenceRequestV3(invalid)).toBe('invalid-request');
    expect(inspectGradebookImportPersistenceRequestV1(request())).not.toBe('ready');
    expect(inspectGradebookImportPersistenceRequestV2(request())).not.toBe('ready');
  });

  it('validates sanitized V3 responses without changing V2 response semantics', () => {
    expect(isGradebookImportPersistenceResponseV3({ transportVersion: 3, state: 'conflict' })).toBe(
      true,
    );
    expect(isGradebookImportPersistenceResponseV3({ transportVersion: 2, state: 'conflict' })).toBe(
      false,
    );
  });
});
