import { describe, expect, it } from 'vitest';
import type {
  AcademicYearId,
  AcademicYearV1,
  TeacherId,
  TeacherV1,
} from '../../../shared/gradebook-contracts/entities';
import type { GradebookImportPersistenceRequestV5 } from '../../../shared/gradebook-contracts/imports/import-persistence-transport-v5';
import type {
  AcademicEntityRepositoryV1,
  AcademicPersistenceContextV1,
} from '../../../src/gradebook-domain/ports/persistence/persistence-ports-v1';
import { planAcademicCatalogBootstrapV1 } from '../../../server/gradebook/application/import/academic-catalog-bootstrap-v1';

const academicYearId = 'academic-year:catalog-cache:2026' as AcademicYearId;
const teacherId = 'teacher:catalog-cache:001' as TeacherId;
const missing = { classification: 'missing-field' } as const;

function request(): GradebookImportPersistenceRequestV5 {
  const student = {
    sourceRow: 5,
    sourceStudent: { position: 1, label: 'Estudante Sintético' },
    assessmentValues: [],
    aggregates: {
      quantitativeTotal: missing,
      parallelAssessment: missing,
      qualitativeTotal: missing,
      officialTermGrade: missing,
      annualAccumulatedTotal: missing,
    },
  };
  return {
    transportVersion: 5,
    operation: 'persist-recognized-file',
    manifest: {
      fileName: 'fixture-catalog-cache.xlsb',
      extension: 'xlsb',
      reportedMimeType: null,
      sizeBytes: 128,
      lastModifiedAt: null,
      sha256: 'c'.repeat(64),
      sourceContractVersion: 2,
      parserVersion: 'synthetic',
      readAt: '2026-09-05T12:00:00.000Z',
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
      assessmentDefinitions: [],
      students: [student],
    })),
    diagnostics: [],
  };
}

function repository() {
  const year: AcademicYearV1 = {
    id: academicYearId,
    schoolId: 'school:catalog-cache' as AcademicYearV1['schoolId'],
    year: 2026,
    status: 'active',
    activeEvaluationProfileId: 'evaluation-profile:2026',
    configurationVersion: '1',
  };
  const teacher: TeacherV1 = {
    id: teacherId,
    displayName: 'Docente Sintético',
    sourceNames: ['Docente Sintético'],
    status: 'active',
  };
  let getCalls = 0;
  const value: AcademicEntityRepositoryV1 = {
    async get(_context, reference) {
      getCalls += 1;
      return reference.kind === 'academic-year' && reference.id === academicYearId
        ? {
            value: { kind: 'academic-year', value: year },
            version: 3,
            recordedAt: '2026-01-01T00:00:00.000Z',
          }
        : null;
    },
    async list(_context: AcademicPersistenceContextV1, kind) {
      return kind === 'teacher'
        ? {
            items: [
              {
                value: { kind: 'teacher' as const, value: teacher },
                version: 7,
                recordedAt: '2026-02-01T00:00:00.000Z',
              },
            ],
            nextCursor: null,
          }
        : { items: [], nextCursor: null };
    },
    async appendVersion() {
      throw new Error('not-used');
    },
  };
  return { value, getCalls: () => getCalls };
}

describe('academic catalog bootstrap loaded get cache', () => {
  it('reuses the year and listed catalog records before falling back to the base repository', async () => {
    const source = repository();
    const planned = await planAcademicCatalogBootstrapV1({
      request: request(),
      unitOfWork: { entities: source.value },
    });

    expect(planned.status).toBe('ready');
    if (planned.status !== 'ready') return;
    expect(source.getCalls()).toBe(1);
    expect(planned.records.some((record) => record.kind === 'teacher')).toBe(false);

    await expect(
      planned.repository.get(
        { academicYearId },
        { kind: 'academic-year', id: academicYearId },
      ),
    ).resolves.toMatchObject({ version: 3 });
    await expect(
      planned.repository.get({ academicYearId }, { kind: 'teacher', id: teacherId }),
    ).resolves.toMatchObject({ version: 7 });
    expect(source.getCalls()).toBe(1);

    await expect(
      planned.repository.get(
        { academicYearId },
        { kind: 'teacher', id: 'teacher:catalog-cache:missing' as TeacherId },
      ),
    ).resolves.toBeNull();
    expect(source.getCalls()).toBe(2);
  });
});
