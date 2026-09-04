import { describe, expect, it } from 'vitest';
import type { AcademicYearId, AcademicYearV1 } from '../../../shared/gradebook-contracts/entities';
import {
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
});
