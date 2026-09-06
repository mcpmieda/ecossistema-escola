import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type {
  AcademicYearId,
  ClassGroupId,
  EnrollmentId,
  SchoolId,
  StudentId,
  StudentStatusEventId,
  SubjectId,
  TeacherId,
  TeachingAssignmentId,
} from '../../../shared/gradebook-contracts/entities';
import type { AssessmentComponentId } from '../../../shared/gradebook-contracts/results/results-contract-v1';
import { createGradebookD1PersistenceUnitOfWorkV2 } from '../../../server/gradebook/persistence/d1/composition/d1-persistence-unit-of-work-v1';
import { createGradebookD1ImportCatalogBootstrapReadV1 } from '../../../server/gradebook/persistence/d1/read/d1-import-catalog-bootstrap-read-v1';
import { ACADEMIC_CONTEXT_2026_IDENTITY_V1 } from '../../../src/gradebook-domain/context/academic-context-2026-v1';
import {
  academicYearId,
  instant,
  openMigratedDatabase,
  type SqliteD1Database,
} from '../persistence/d1-transaction/d1-write-test-support';

let database: SqliteD1Database;
const teacherId = 'teacher:catalog-bootstrap:001' as TeacherId;
const classGroupId = 'class-group:catalog-bootstrap:001' as ClassGroupId;
const subjectId = 'subject:catalog-bootstrap:001' as SubjectId;
const teachingAssignmentId = 'teaching-assignment:catalog-bootstrap:001' as TeachingAssignmentId;
const studentId = 'student:catalog-bootstrap:001' as StudentId;
const enrollmentId = 'enrollment:catalog-bootstrap:001' as EnrollmentId;
const assessmentComponentId =
  'assessment-component:v2:catalog-bootstrap:001' as AssessmentComponentId;
const studentStatusEventId = 'student-status-event:catalog-bootstrap:001' as StudentStatusEventId;

beforeEach(async () => {
  database = await openMigratedDatabase();
  const unit = createGradebookD1PersistenceUnitOfWorkV2(database, { now: () => instant });
  expect(
    (
      await unit.entities.appendVersion(
        { academicYearId },
        {
          kind: 'academic-year',
          value: {
            id: academicYearId as AcademicYearId,
            schoolId: 'school:catalog-bootstrap' as SchoolId,
            year: 2026,
            status: 'active',
            startsOn: '2026-02-01',
            endsOn: '2026-12-20',
            activeEvaluationProfileId: ACADEMIC_CONTEXT_2026_IDENTITY_V1.evaluationProfileId,
            configurationVersion: String(ACADEMIC_CONTEXT_2026_IDENTITY_V1.configurationVersion),
          },
        },
        { expectedVersion: null },
      )
    ).status,
  ).toBe('written');

  const catalog = [
    {
      kind: 'teacher' as const,
      value: {
        id: teacherId,
        displayName: 'Docente Sintético',
        sourceNames: ['Docente Sintético'],
        status: 'active' as const,
      },
    },
    {
      kind: 'class-group' as const,
      value: {
        id: classGroupId,
        academicYearId,
        code: '6S',
        grade: '6',
        section: 'S',
        shift: 'morning',
      },
    },
    {
      kind: 'subject' as const,
      value: {
        id: subjectId,
        code: 'SYN-BOOT',
        displayName: 'Componente Sintético Bootstrap',
        shortName: 'CSB',
        status: 'active' as const,
      },
    },
    {
      kind: 'teaching-assignment' as const,
      value: {
        id: teachingAssignmentId,
        academicYearId,
        teacherId,
        classGroupId,
        subjectId,
        sourceDisciplineIndex: 'D1',
        effectivePeriod: { startsOn: '2026-02-01', endsOn: '2026-12-20' },
        confirmationOrigin: 'imported-source' as const,
      },
    },
    {
      kind: 'student' as const,
      value: {
        id: studentId,
        displayName: 'Estudante Sintético',
        sourceNames: ['Estudante Sintético'],
        sourceIdentityMarks: ['synthetic-position:1'],
      },
    },
    {
      kind: 'enrollment' as const,
      value: {
        id: enrollmentId,
        academicYearId,
        studentId,
        classGroupId,
        effectivePeriod: { startsOn: '2026-02-01' },
        position: 'current' as const,
        sourcePosition: 1,
      },
    },
  ];
  for (const record of catalog) {
    expect(
      (await unit.entities.appendVersion({ academicYearId }, record, { expectedVersion: null }))
        .status,
    ).toBe('written');
  }

  expect(
    (
      await unit.entities.appendVersion(
        { academicYearId },
        {
          kind: 'assessment-component',
          value: {
            id: assessmentComponentId,
            academicYearId,
            teachingAssignmentId,
            term: 1,
            type: 'quantitative-assessment',
            name: 'Avaliação quantitativa sintética',
            maximum: { state: 'defined', value: 10 },
            order: 1,
            applicability: { state: 'applicable' },
          },
        },
        { expectedVersion: null },
      )
    ).status,
  ).toBe('written');
  expect(
    (
      await unit.entities.appendVersion(
        { academicYearId },
        {
          kind: 'student-status-event',
          value: {
            id: studentStatusEventId,
            academicYearId,
            enrollmentId,
            status: 'active',
            sourceText: 'ATIVO',
            sourceReference: 'RELACAO',
          },
        },
        { expectedVersion: null },
      )
    ).status,
  ).toBe('written');
});

afterEach(() => database.raw.close());

describe('D1 import catalog bootstrap snapshot', () => {
  it('loads year, catalog, components and status through one physical D1 query', async () => {
    let prepareCalls = 0;
    const reader = createGradebookD1ImportCatalogBootstrapReadV1({
      prepare(query: string) {
        prepareCalls += 1;
        return database.prepare(query);
      },
    });

    const snapshot = await reader.getImportCatalogBootstrapSnapshot({ academicYearId });

    expect(prepareCalls).toBe(1);
    expect(snapshot.academicYear).toMatchObject({
      value: {
        kind: 'academic-year',
        value: { id: academicYearId, year: 2026, status: 'active' },
      },
    });
    expect(snapshot.catalog).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          value: {
            kind: 'teacher',
            value: expect.objectContaining({ id: teacherId, displayName: 'Docente Sintético' }),
          },
        }),
        expect.objectContaining({
          value: {
            kind: 'teaching-assignment',
            value: expect.objectContaining({ id: teachingAssignmentId }),
          },
        }),
        expect.objectContaining({
          value: {
            kind: 'enrollment',
            value: expect.objectContaining({ id: enrollmentId, studentId }),
          },
        }),
      ]),
    );
    expect(snapshot.assessmentComponents).toEqual([
      expect.objectContaining({
        value: {
          kind: 'assessment-component',
          value: expect.objectContaining({
            id: assessmentComponentId,
            teachingAssignmentId,
            maximum: { state: 'defined', value: 10 },
          }),
        },
      }),
    ]);
    expect(snapshot.studentStatusEvents).toEqual([
      expect.objectContaining({
        value: {
          kind: 'student-status-event',
          value: expect.objectContaining({
            id: studentStatusEventId,
            enrollmentId,
            status: 'active',
            sourceText: 'ATIVO',
          }),
        },
      }),
    ]);
  });

  it('returns null year without inventing bootstrap authority', async () => {
    database.raw.prepare('DELETE FROM academic_year_versions').run();
    database.raw.prepare('DELETE FROM academic_year_configuration_versions').run();
    database.raw.prepare('DELETE FROM academic_entity_versions').run();
    database.raw.prepare('DELETE FROM academic_entity_streams').run();
    database.raw.prepare('DELETE FROM academic_years').run();

    const reader = createGradebookD1ImportCatalogBootstrapReadV1(database);
    await expect(reader.getImportCatalogBootstrapSnapshot({ academicYearId })).resolves.toEqual({
      academicYear: null,
      catalog: [],
      assessmentComponents: [],
      studentStatusEvents: [],
    });
  });
});
