import { describe, expect, it } from 'vitest';
import type { AcademicYearId, AcademicYearV1 } from '../../../shared/gradebook-contracts/entities';
import {
  GRADEBOOK_IMPORT_PERSISTENCE_BOUNDS_V5,
  inspectGradebookImportPersistenceRequestV5,
  isGradebookImportPersistenceRequestV5,
  type GradebookImportPersistenceRequestV5,
} from '../../../shared/gradebook-contracts/imports/import-persistence-transport-v5';
import type {
  AcademicEntityRepositoryV1,
  AcademicPersistenceContextV1,
} from '../../../src/gradebook-domain/ports/persistence/persistence-ports-v1';
import { planAcademicCatalogBootstrapV1 } from '../../../server/gradebook/application/import/academic-catalog-bootstrap-v1';
import {
  SOURCE_QUALITATIVE_ACTIVITY_SLOTS_V2,
  SOURCE_QUANTITATIVE_ASSESSMENT_SLOTS_V2,
} from '../../../shared/gradebook-contracts/source/source-contract-v2';

const academicYearId = 'academic-year:synthetic-2026' as AcademicYearId;
const missing = { classification: 'missing-field' } as const;

function request(): GradebookImportPersistenceRequestV5 {
  const definitions = [
    ...SOURCE_QUANTITATIVE_ASSESSMENT_SLOTS_V2.map((slot) => ({
      sourceSlot: slot.sourceSlot,
      maximumConfiguration: { state: 'numeric' as const, rawValue: 5 },
    })),
    ...SOURCE_QUALITATIVE_ACTIVITY_SLOTS_V2.map((slot) => ({
      sourceSlot: slot.sourceSlot,
      maximumConfiguration: { state: 'numeric' as const, rawValue: 3 },
      name: { state: 'text' as const, rawValue: `Atividade ${slot.order}` },
    })),
  ];
  const student = (label = 'Estudante Sintético') => ({
    sourceRow: 5,
    sourceStudent: { position: 1, label },
    assessmentValues: [],
    aggregates: {
      quantitativeTotal: missing,
      parallelAssessment: missing,
      qualitativeTotal: missing,
      officialTermGrade: missing,
      annualAccumulatedTotal: missing,
    },
  });
  return {
    transportVersion: 5,
    operation: 'persist-recognized-file',
    manifest: {
      fileName: 'fixture-sintetica.xlsb',
      extension: 'xlsb',
      reportedMimeType: null,
      sizeBytes: 128,
      lastModifiedAt: null,
      sha256: 'a'.repeat(64),
      sourceContractVersion: 2,
      parserVersion: 'synthetic',
      readAt: '2026-09-04T12:00:00.000Z',
    },
    recognizedSuggestions: { academicYear: 2026, teacherName: 'Docente Sintético' },
    confirmedContext: { academicYearId },
    sourceResolution: { mode: 'resolve-or-create' },
    sheets: [1, 2, 3].map((term) => ({
      kind: 'term' as const,
      sourceSheetName: `6A${term}ºD1`,
      term: term as 1 | 2 | 3,
      recognizedContext: {
        classGroupLabel: '6º ANO A',
        subjectLabel: 'Componente Sintético',
        disciplineIndex: 'D1' as const,
      },
      assessmentDefinitions: definitions,
      students: [student()],
    })),
    diagnostics: [],
  };
}

function repository(): AcademicEntityRepositoryV1 {
  const year: AcademicYearV1 = {
    id: academicYearId,
    schoolId: 'school:synthetic' as AcademicYearV1['schoolId'],
    year: 2026,
    status: 'active',
    activeEvaluationProfileId: 'evaluation-profile:2026',
    configurationVersion: '1',
  };
  return {
    async get(_context, reference) {
      return reference.kind === 'academic-year' && reference.id === academicYearId
        ? {
            value: { kind: 'academic-year', value: year },
            version: 1,
            recordedAt: '2026-01-01T00:00:00.000Z',
          }
        : null;
    },
    async list(_context: AcademicPersistenceContextV1) {
      return { items: [], nextCursor: null };
    },
    async appendVersion() {
      throw new Error('not-used');
    },
  };
}

function withQualitativeSemanticBlocker(): GradebookImportPersistenceRequestV5 {
  const value = request();
  return {
    ...value,
    sheets: value.sheets.map((sheet) =>
      sheet.kind === 'term'
        ? {
            ...sheet,
            assessmentDefinitions: sheet.assessmentDefinitions.map((definition) =>
              definition.sourceSlot === 'AA'
                ? {
                    ...definition,
                    maximumConfiguration: {
                      state: 'ambiguous-marker' as const,
                      rawValue: '*' as const,
                    },
                  }
                : definition,
            ),
          }
        : sheet,
    ),
  };
}

describe('GradebookImportPersistenceTransportV5', () => {
  it('accepts source roster labels while excluding browser-owned catalog IDs', () => {
    const value = request();
    expect(inspectGradebookImportPersistenceRequestV5(value)).toBe('ready');
    expect(isGradebookImportPersistenceRequestV5(value)).toBe(true);
    const serialized = JSON.stringify(value);
    expect(serialized).not.toMatch(/teachingAssignmentId|studentId|enrollmentId/u);
    expect(serialized).toContain('sourceStudent');
  });

  it('creates one canonical student/enrollment reused by all trimester sheets', async () => {
    const planned = await planAcademicCatalogBootstrapV1({
      request: request(),
      unitOfWork: { entities: repository() },
    });
    expect(planned.status).toBe('ready');
    if (planned.status !== 'ready') return;
    expect(planned.records.map((record) => record.kind)).toEqual([
      'teacher',
      'class-group',
      'student',
      'enrollment',
      'subject',
      'teaching-assignment',
    ]);
    const references = planned.request.sheets.map((sheet) => sheet.students[0]!.confirmedStudent);
    expect(new Set(references.map((value) => value.studentId)).size).toBe(1);
    expect(new Set(references.map((value) => value.enrollmentId)).size).toBe(1);
    expect(new Set(planned.request.sheets.map((sheet) => sheet.teachingAssignmentId)).size).toBe(1);
  });

  it('fails closed when trimester rosters diverge', async () => {
    const value = request();
    const sheets = [...value.sheets];
    const second = sheets[1]!;
    if (second.kind !== 'term') throw new Error('invalid-fixture');
    sheets[1] = {
      ...second,
      students: [
        { ...second.students[0]!, sourceStudent: { position: 1, label: 'Outro estudante' } },
      ],
    };
    const planned = await planAcademicCatalogBootstrapV1({
      request: { ...value, sheets },
      unitOfWork: { entities: repository() },
    });
    expect(planned).toEqual({ status: 'review-required', reason: 'divergent-trimester-roster' });
  });

  it('accepts V3 qualitative evidence without changing the V4 wire shape', () => {
    const value = withQualitativeSemanticBlocker();
    const sheets = value.sheets.map((sheet) => {
      if (sheet.kind !== 'term') return sheet;
      return {
        ...sheet,
        assessmentDefinitions: sheet.assessmentDefinitions.map((definition) =>
          definition.sourceSlot === 'AA'
            ? {
                ...definition,
                name: { state: 'unrecognized' as const, rawValue: 17 },
              }
            : definition,
        ),
      };
    });

    const candidate = { ...value, sheets };
    expect(inspectGradebookImportPersistenceRequestV5(candidate)).toBe('ready');
    expect(isGradebookImportPersistenceRequestV5(candidate)).toBe(true);
    expect(candidate.manifest.sourceContractVersion).toBe(2);
    expect(candidate.transportVersion).toBe(5);
  });

  it('does not let the V3 semantic pass mask unknown definition fields', () => {
    const candidate = structuredClone(withQualitativeSemanticBlocker()) as unknown as {
      sheets: Array<{ assessmentDefinitions: Array<Record<string, unknown>> }>;
    };
    candidate.sheets[0]!.assessmentDefinitions[0]!.unexpected = true;

    expect(inspectGradebookImportPersistenceRequestV5(candidate)).toBe('invalid-academic-shape');
  });

  it('does not let the V3 semantic pass mask a malformed qualitative maximum', () => {
    const candidate = structuredClone(withQualitativeSemanticBlocker()) as unknown as {
      sheets: Array<{ assessmentDefinitions: Array<Record<string, unknown>> }>;
    };
    candidate.sheets[0]!.assessmentDefinitions[3]!.maximumConfiguration = {
      state: 'numeric',
      rawValue: '3',
    };

    expect(inspectGradebookImportPersistenceRequestV5(candidate)).toBe('invalid-academic-shape');
  });

  it('does not let the V3 semantic pass mask invalid or duplicate definition slots', () => {
    const invalidSlot = structuredClone(withQualitativeSemanticBlocker()) as unknown as {
      sheets: Array<{ assessmentDefinitions: Array<Record<string, unknown>> }>;
    };
    invalidSlot.sheets[0]!.assessmentDefinitions[3]!.sourceSlot = 'ZZ';
    expect(inspectGradebookImportPersistenceRequestV5(invalidSlot)).toBe('invalid-academic-shape');

    const duplicateSlot = structuredClone(withQualitativeSemanticBlocker()) as unknown as {
      sheets: Array<{ assessmentDefinitions: Array<Record<string, unknown>> }>;
    };
    duplicateSlot.sheets[0]!.assessmentDefinitions[3]!.sourceSlot = 'AA';
    expect(inspectGradebookImportPersistenceRequestV5(duplicateSlot)).toBe('duplicate-identity');
  });

  it('does not let the V3 semantic pass mask malformed or duplicate student values', () => {
    const malformed = structuredClone(withQualitativeSemanticBlocker()) as unknown as {
      sheets: Array<{ students: Array<Record<string, unknown>> }>;
    };
    malformed.sheets[0]!.students[0]!.assessmentValues = [
      { sourceSlot: 'AA', value: { kind: 'manual', source: 1, value: 1 }, unexpected: true },
    ];
    expect(inspectGradebookImportPersistenceRequestV5(malformed)).toBe('invalid-academic-shape');

    const duplicate = structuredClone(withQualitativeSemanticBlocker()) as unknown as {
      sheets: Array<{ students: Array<Record<string, unknown>> }>;
    };
    duplicate.sheets[0]!.students[0]!.assessmentValues = [
      { sourceSlot: 'AA', value: { kind: 'manual', source: 1, value: 1 } },
      { sourceSlot: 'AA', value: { kind: 'manual', source: 2, value: 2 } },
    ];
    expect(inspectGradebookImportPersistenceRequestV5(duplicate)).toBe('invalid-academic-shape');
  });

  it('does not let the V3 semantic pass mask an unknown student field', () => {
    const candidate = structuredClone(withQualitativeSemanticBlocker()) as unknown as {
      sheets: Array<{ students: Array<Record<string, unknown>> }>;
    };
    candidate.sheets[0]!.students[0]!.unexpected = true;

    expect(inspectGradebookImportPersistenceRequestV5(candidate)).toBe('invalid-academic-shape');
  });

  it('rejects invalid source students and duplicate source rows before semantic adaptation', () => {
    const invalidStudent = structuredClone(withQualitativeSemanticBlocker()) as unknown as {
      sheets: Array<{ students: Array<Record<string, unknown>> }>;
    };
    invalidStudent.sheets[0]!.students[0]!.sourceStudent = { position: 0, label: '' };
    expect(inspectGradebookImportPersistenceRequestV5(invalidStudent)).toBe('invalid-request');

    const duplicateRow = structuredClone(withQualitativeSemanticBlocker()) as unknown as {
      sheets: Array<{ students: Array<Record<string, unknown>> }>;
    };
    duplicateRow.sheets[0]!.students.push({
      ...structuredClone(duplicateRow.sheets[0]!.students[0]!),
      sourceStudent: { position: 2, label: 'Outro estudante sintético' },
    });
    expect(inspectGradebookImportPersistenceRequestV5(duplicateRow)).toBe('duplicate-identity');
  });

  it('preserves V4 bounds before applying the V3 semantic pass', () => {
    const candidate = structuredClone(withQualitativeSemanticBlocker()) as unknown as {
      sheets: Array<{ students: Array<Record<string, unknown>> }>;
    };
    const template = candidate.sheets[0]!.students[0]!;
    candidate.sheets[0]!.students = Array.from(
      { length: GRADEBOOK_IMPORT_PERSISTENCE_BOUNDS_V5.maxStudentsPerSheet + 1 },
      (_, index) => ({
        ...structuredClone(template),
        sourceRow: index + 5,
        sourceStudent: { position: index + 1, label: `Estudante sintético ${index + 1}` },
      }),
    );

    expect(inspectGradebookImportPersistenceRequestV5(candidate)).toBe('payload-too-large');
  });

  it('keeps nonnumeric R/S fail-closed under their historical rule', () => {
    const value = request();
    const sheets = value.sheets.map((sheet) => {
      if (sheet.kind !== 'term') return sheet;
      return {
        ...sheet,
        assessmentDefinitions: sheet.assessmentDefinitions.map((definition) =>
          definition.sourceSlot === 'R'
            ? {
                ...definition,
                maximumConfiguration: {
                  state: 'ambiguous-marker' as const,
                  rawValue: '*' as const,
                },
              }
            : definition,
        ),
      };
    });

    expect(inspectGradebookImportPersistenceRequestV5({ ...value, sheets })).toBe(
      'blocked-definition',
    );
  });
});
