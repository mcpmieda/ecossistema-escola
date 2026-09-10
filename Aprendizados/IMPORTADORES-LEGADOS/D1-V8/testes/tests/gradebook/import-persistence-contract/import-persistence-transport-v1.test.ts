import { describe, expect, it } from 'vitest';
import type {
  AcademicYearId,
  EnrollmentId,
  StudentId,
  TeachingAssignmentId,
} from '../../../shared/gradebook-contracts/entities';
import {
  GRADEBOOK_IMPORT_PERSISTENCE_BOUNDS_V1,
  GRADEBOOK_IMPORT_PERSISTENCE_OPERATION_V1,
  GRADEBOOK_IMPORT_PERSISTENCE_TRANSPORT_VERSION_V1,
  GRADEBOOK_IMPORT_PERSISTENCE_TRANSPORT_V1,
  containsGradebookImportPersistenceForbiddenClientFieldV1,
  inspectGradebookImportPersistenceRequestV1,
  isGradebookImportPersistenceRequestV1,
  isGradebookImportPersistenceResponseV1,
  type GradebookImportAssessmentDefinitionV1,
  type GradebookImportLogicalSourceIdV1,
  type GradebookImportPersistenceRequestV1,
  type GradebookImportPersistenceSummaryV1,
} from '../../../shared/gradebook-contracts/imports/import-persistence-transport-v1';
import {
  SOURCE_QUALITATIVE_ACTIVITY_SLOTS_V2,
  SOURCE_QUANTITATIVE_ASSESSMENT_SLOTS_V2,
} from '../../../shared/gradebook-contracts/source/source-contract-v2';

const sha256 = 'a'.repeat(64);

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

function request(): GradebookImportPersistenceRequestV1 {
  return {
    transportVersion: GRADEBOOK_IMPORT_PERSISTENCE_TRANSPORT_VERSION_V1,
    operation: GRADEBOOK_IMPORT_PERSISTENCE_OPERATION_V1,
    manifest: {
      fileName: 'notas-sinteticas.xlsx',
      extension: 'xlsx',
      reportedMimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      sizeBytes: 12_345,
      lastModifiedAt: '2026-01-10T12:00:00.000Z',
      sha256,
      sourceContractVersion: 2,
      parserVersion: 'synthetic-sheetjs-v1',
      readAt: '2026-01-10T12:01:00.000Z',
    },
    recognizedSuggestions: {
      academicYear: 2026,
      teacherName: 'Docente Sintético',
    },
    confirmedContext: {
      academicYearId: 'academic-year:synthetic-2026' as AcademicYearId,
      logicalSourceId: 'logical-source:synthetic-a' as GradebookImportLogicalSourceIdV1,
    },
    sheets: [
      {
        kind: 'term',
        sourceSheetName: 'TURMA-SINTETICA-1º',
        recognizedContext: {
          classGroupLabel: 'Turma Sintética',
          subjectLabel: 'Componente Sintético',
          disciplineIndex: 'D1',
        },
        teachingAssignmentId: 'teaching-assignment:synthetic-a' as TeachingAssignmentId,
        term: 1,
        assessmentDefinitions: definitions(),
        students: [
          {
            sourceRow: 5,
            confirmedStudent: {
              studentId: 'student:synthetic-a' as StudentId,
              enrollmentId: 'enrollment:synthetic-a' as EnrollmentId,
            },
            assessmentValues: [
              { sourceSlot: 'R', value: { kind: 'manual', source: 4, value: 4 } },
              {
                sourceSlot: 'AA',
                value: { kind: 'official-zero', source: 0.1, value: 0 },
              },
            ],
            aggregates: {
              quantitativeTotal: { kind: 'manual', source: 8, value: 8 },
              parallelAssessment: null,
              qualitativeTotal: { kind: 'manual', source: 12, value: 12 },
              officialTermGrade: {
                kind: 'formula',
                source: 20,
                value: 20,
                formula: 'T5+AK5',
              },
              annualAccumulatedTotal: { kind: 'legacy-zero', source: 0, value: 0 },
            },
          },
        ],
      },
      {
        kind: 'recovery',
        sourceSheetName: 'TURMA-SINTETICA-REC',
        recognizedContext: {
          classGroupLabel: 'Turma Sintética',
          subjectLabel: 'Componente Sintético',
          disciplineIndex: 'D1',
        },
        teachingAssignmentId: 'teaching-assignment:synthetic-a' as TeachingAssignmentId,
        students: [
          {
            sourceRow: 5,
            confirmedStudent: {
              studentId: 'student:synthetic-a' as StudentId,
              enrollmentId: 'enrollment:synthetic-a' as EnrollmentId,
            },
            recovery: {
              trimester1: null,
              trimester2: null,
              trimester3: null,
              totalAfterRecovery: null,
              originalTrimester1: null,
              originalTrimester2: null,
              originalTrimester3: null,
              originalAnnual: null,
              eligibleTrimester1: false,
              eligibleTrimester2: false,
              eligibleTrimester3: false,
            },
          },
        ],
      },
    ],
    diagnostics: [{ severity: 'information', code: 'SYNTHETIC-RECOGNIZED', scope: 'file' }],
  };
}

function mutableRequest(): Record<string, unknown> {
  return structuredClone(request()) as unknown as Record<string, unknown>;
}

function summary(overrides: Partial<GradebookImportPersistenceSummaryV1> = {}) {
  return {
    assessmentDefinitions: { total: 12, resolved: 12, blocked: 0 },
    assessmentComponents: { unchanged: 0, new: 12, changed: 0, blocked: 0 },
    academicRecords: {
      unchanged: 0,
      new: 2,
      changed: 0,
      missingFromNewSource: 0,
      blocked: 0,
    },
    plannedVersionWrites: 28,
    committedVersionWrites: 28,
    ...overrides,
  } satisfies GradebookImportPersistenceSummaryV1;
}

describe('GradebookImportPersistenceTransportV1 request', () => {
  it('accepts one bounded synthetic recognized file without workbook bytes or a write plan', () => {
    const value = request();

    expect(inspectGradebookImportPersistenceRequestV1(value)).toBe('ready');
    expect(isGradebookImportPersistenceRequestV1(value)).toBe(true);
    expect(JSON.stringify(value)).not.toMatch(
      /arrayBuffer|authorityMode|expectedVersion|importChangePlan|native-engine|workbook|worksheet|writes/u,
    );
    expect(GRADEBOOK_IMPORT_PERSISTENCE_TRANSPORT_V1).toMatchObject({
      unit: 'one-recognized-source-file-per-request',
      bounds: { maxFilesSelectedInBrowser: 50, maxFilesPerRequest: 1 },
      security: {
        capability: 'gradebook.persistence.admin',
        requireAuth: true,
        officialOrigin: true,
        writeOrigin: true,
        cacheControl: 'no-store',
        productionGate: 'GRADEBOOK_PRODUCTION_ENABLED',
        browserPersistentAcademicStorage: 'forbidden',
      },
    });
  });

  it('rejects unknown and explicitly forbidden client fields fail-closed', () => {
    const unknown = mutableRequest();
    unknown.reactState = { selected: true };
    expect(inspectGradebookImportPersistenceRequestV1(unknown)).toBe('invalid-request');

    const forbidden = mutableRequest();
    forbidden.expectedVersion = 7;
    expect(containsGradebookImportPersistenceForbiddenClientFieldV1(forbidden)).toBe(true);
    expect(inspectGradebookImportPersistenceRequestV1(forbidden)).toBe('forbidden-client-payload');

    const disguisedAuthority = mutableRequest();
    const suggestions = disguisedAuthority.recognizedSuggestions as Record<string, unknown>;
    suggestions.nativeResult = 'native-engine';
    expect(inspectGradebookImportPersistenceRequestV1(disguisedAuthority)).toBe(
      'forbidden-client-payload',
    );
  });

  it('rejects invalid context and incompatible student/enrollment mappings', () => {
    const invalidContext = mutableRequest();
    invalidContext.confirmedContext = {
      academicYearId: '',
      logicalSourceId: 'logical-source:synthetic-a',
    };
    expect(inspectGradebookImportPersistenceRequestV1(invalidContext)).toBe('invalid-context');

    const incompatible = mutableRequest();
    const sheets = incompatible.sheets as Array<Record<string, unknown>>;
    const recoveryStudents = sheets[1]?.students as Array<Record<string, unknown>>;
    recoveryStudents[0]!.confirmedStudent = {
      studentId: 'student:synthetic-a',
      enrollmentId: 'enrollment:synthetic-other',
    };
    expect(inspectGradebookImportPersistenceRequestV1(incompatible)).toBe('invalid-context');
  });

  it('rejects non-bounded payloads without assuming 50 files cross one request', () => {
    const tooManySheets = mutableRequest();
    tooManySheets.sheets = Array.from(
      { length: GRADEBOOK_IMPORT_PERSISTENCE_BOUNDS_V1.maxSheetsPerRequest + 1 },
      () => (tooManySheets.sheets as unknown[])[0],
    );
    expect(inspectGradebookImportPersistenceRequestV1(tooManySheets)).toBe('payload-too-large');

    const tooManyBytes = mutableRequest();
    tooManyBytes.padding = 'x'.repeat(GRADEBOOK_IMPORT_PERSISTENCE_BOUNDS_V1.maxBodyBytes + 1);
    expect(inspectGradebookImportPersistenceRequestV1(tooManyBytes)).toBe('payload-too-large');
  });

  it('rejects duplicate technical scope, student identity, and assessment slot', () => {
    const duplicateSheet = mutableRequest();
    const sheets = duplicateSheet.sheets as unknown[];
    sheets.push(structuredClone(sheets[0]));
    expect(inspectGradebookImportPersistenceRequestV1(duplicateSheet)).toBe('duplicate-identity');

    const duplicateSlot = mutableRequest();
    const term = (duplicateSlot.sheets as Array<Record<string, unknown>>)[0]!;
    const termDefinitions = term.assessmentDefinitions as Array<Record<string, unknown>>;
    termDefinitions[1] = structuredClone(termDefinitions[0]!);
    expect(inspectGradebookImportPersistenceRequestV1(duplicateSlot)).toBe('duplicate-identity');
  });

  it('rejects blocked definitions, blocking diagnostics, and malformed academic notes', () => {
    const blockedDefinition = mutableRequest();
    const term = (blockedDefinition.sheets as Array<Record<string, unknown>>)[0]!;
    const termDefinitions = term.assessmentDefinitions as Array<Record<string, unknown>>;
    termDefinitions[0]!.maximumConfiguration = { state: 'ambiguous-marker', rawValue: '*' };
    expect(inspectGradebookImportPersistenceRequestV1(blockedDefinition)).toBe(
      'blocked-definition',
    );

    const blockedDiagnostic = mutableRequest();
    blockedDiagnostic.diagnostics = [
      { severity: 'blocking-error', code: 'SYNTHETIC-BLOCK', scope: 'file' },
    ];
    expect(inspectGradebookImportPersistenceRequestV1(blockedDiagnostic)).toBe(
      'blocking-diagnostic',
    );

    const invalidNote = mutableRequest();
    const invalidTerm = (invalidNote.sheets as Array<Record<string, unknown>>)[0]!;
    const students = invalidTerm.students as Array<Record<string, unknown>>;
    const assessmentValues = students[0]!.assessmentValues as Array<Record<string, unknown>>;
    assessmentValues[0]!.value = { kind: 'official-zero', source: 0, value: 0 };
    expect(inspectGradebookImportPersistenceRequestV1(invalidNote)).toBe('invalid-academic-shape');
  });
});

describe('GradebookImportPersistenceTransportV1 response', () => {
  it('accepts the six required sanitized outcome families and explicit review', () => {
    expect(
      isGradebookImportPersistenceResponseV1({
        transportVersion: 1,
        state: 'applied',
        summary: summary(),
      }),
    ).toBe(true);
    expect(
      isGradebookImportPersistenceResponseV1({
        transportVersion: 1,
        state: 'no-changes',
        summary: summary({
          assessmentComponents: { unchanged: 12, new: 0, changed: 0, blocked: 0 },
          academicRecords: {
            unchanged: 2,
            new: 0,
            changed: 0,
            missingFromNewSource: 0,
            blocked: 0,
          },
          plannedVersionWrites: 0,
          committedVersionWrites: 0,
        }),
      }),
    ).toBe(true);
    expect(
      isGradebookImportPersistenceResponseV1({
        transportVersion: 1,
        state: 'review-required',
        summary: summary({ committedVersionWrites: 0 }),
        issues: [
          {
            code: 'missing-from-new-source',
            scope: 'student',
            sourceSheetName: 'TURMA-SINTETICA-1º',
            sourceRow: 5,
          },
        ],
      }),
    ).toBe(true);
    expect(
      isGradebookImportPersistenceResponseV1({
        transportVersion: 1,
        state: 'blocked',
        summary: summary({ committedVersionWrites: 0 }),
        issues: [{ code: 'planning-failed', scope: 'file' }],
      }),
    ).toBe(true);
    for (const state of ['conflict', 'not-authorized', 'unavailable'] as const) {
      expect(isGradebookImportPersistenceResponseV1({ transportVersion: 1, state })).toBe(true);
    }
  });

  it('rejects raw payloads, resource identifiers, SQL, unknown fields, and inconsistent counts', () => {
    expect(
      isGradebookImportPersistenceResponseV1({
        transportVersion: 1,
        state: 'conflict',
        expectedVersion: 2,
      }),
    ).toBe(false);
    expect(
      isGradebookImportPersistenceResponseV1({
        transportVersion: 1,
        state: 'unavailable',
        resourceId: 'd1:synthetic',
      }),
    ).toBe(false);
    expect(
      isGradebookImportPersistenceResponseV1({
        transportVersion: 1,
        state: 'applied',
        summary: summary({ committedVersionWrites: 27 }),
        sql: 'synthetic forbidden field',
      }),
    ).toBe(false);
    expect(
      isGradebookImportPersistenceResponseV1({
        transportVersion: 1,
        state: 'applied',
        summary: summary({
          assessmentDefinitions: { total: 12, resolved: 12, blocked: 1 },
        }),
      }),
    ).toBe(false);
  });
});
