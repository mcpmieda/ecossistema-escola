import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type {
  AcademicYearId,
  ClassGroupId,
  EnrollmentId,
  SchoolId,
  StudentId,
} from '../../../shared/gradebook-contracts/entities';
import { createGradebookD1PersistenceUnitOfWorkV2 } from '../../../server/gradebook/persistence/d1/composition/d1-persistence-unit-of-work-v1';
import { createGradebookD1ImportCatalogBulkReadV1 } from '../../../server/gradebook/persistence/d1/read/d1-import-catalog-bulk-read-v1';
import { ACADEMIC_CONTEXT_2026_IDENTITY_V1 } from '../../../src/gradebook-domain/context/academic-context-2026-v1';
import {
  academicYearId,
  openMigratedDatabase,
  type SqliteD1Database,
} from '../persistence/d1-transaction/d1-write-test-support';

const instant = new Date().toISOString();
const classGroupId = 'class-group:bulk-roster:9a' as ClassGroupId;
let database: SqliteD1Database;

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
            schoolId: 'school:bulk-roster' as SchoolId,
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
  expect(
    (
      await unit.entities.appendVersion(
        { academicYearId },
        {
          kind: 'class-group',
          value: {
            id: classGroupId,
            academicYearId,
            code: '9A',
            grade: '9',
            section: 'A',
          },
        },
        { expectedVersion: null },
      )
    ).status,
  ).toBe('written');

  for (const position of [1, 2]) {
    const studentId = `student:bulk-roster:${position}` as StudentId;
    const enrollmentId = `enrollment:bulk-roster:${position}` as EnrollmentId;
    expect(
      (
        await unit.entities.appendVersion(
          { academicYearId },
          {
            kind: 'student',
            value: {
              id: studentId,
              displayName: `Estudante Sintético ${position}`,
              sourceNames: [`Estudante Sintético ${position}`],
              sourceIdentityMarks: [`2026:9A:${position}`],
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
            kind: 'enrollment',
            value: {
              id: enrollmentId,
              academicYearId,
              studentId,
              classGroupId,
              effectivePeriod: {},
              position: 'current',
              sourcePosition: position,
            },
          },
          { expectedVersion: null },
        )
      ).status,
    ).toBe('written');
  }
});

afterEach(() => database.raw.close());

describe('D1 import catalog bounded roster lookup', () => {
  it('loads the import catalog snapshot with one D1 query', async () => {
    let prepareCalls = 0;
    const reader = createGradebookD1ImportCatalogBulkReadV1({
      prepare(query: string) {
        prepareCalls += 1;
        return database.prepare(query);
      },
    });

    const snapshot = await reader.getImportCatalogSnapshot({ academicYearId });

    expect(prepareCalls).toBe(1);
    expect(snapshot).not.toBeNull();
    expect(snapshot).toHaveLength(5);
    expect(
      snapshot?.reduce<Record<string, number>>((counts, entry) => {
        counts[entry.value.kind] = (counts[entry.value.kind] ?? 0) + 1;
        return counts;
      }, {}),
    ).toEqual({ 'class-group': 1, enrollment: 2, student: 2 });
  });

  it('keeps the historical 1000-record bound per catalog kind', async () => {
    const rows = Array.from({ length: 1_001 }, (_, index) => {
      const id = `teacher:bounded:${index + 1}`;
      const displayName = `Docente Sintético ${index + 1}`;
      return {
        academic_year_id: academicYearId,
        entity_kind: 'teacher',
        entity_id: id,
        current_version: 1,
        persisted_version: 1,
        teacher_ref_kind: null,
        teacher_id: null,
        class_group_ref_kind: null,
        class_group_id: null,
        subject_ref_kind: null,
        subject_id: null,
        student_ref_kind: null,
        student_id: null,
        enrollment_ref_kind: null,
        enrollment_id: null,
        teaching_assignment_ref_kind: null,
        teaching_assignment_id: null,
        term: null,
        display_code: displayName,
        lifecycle_state: 'active',
        payload_json: JSON.stringify({
          kind: 'teacher',
          value: { id, displayName, sourceNames: [displayName], status: 'active' },
        }),
        recorded_at: instant,
      };
    });
    const statement = {
      bind() {
        return statement;
      },
      async first() {
        return null;
      },
      async all() {
        return { results: rows };
      },
    };
    const reader = createGradebookD1ImportCatalogBulkReadV1({
      prepare() {
        return statement;
      },
    });

    await expect(reader.getImportCatalogSnapshot({ academicYearId })).resolves.toBeNull();
  });

  it('returns requested positions with one D1 query and preserves missing positions', async () => {
    let prepareCalls = 0;
    const reader = createGradebookD1ImportCatalogBulkReadV1({
      prepare(query: string) {
        prepareCalls += 1;
        return database.prepare(query);
      },
    });
    const matches = await reader.getImportRosterMany(
      { academicYearId },
      [
        { classGroupId, sourcePosition: 2 },
        { classGroupId, sourcePosition: 3 },
      ],
    );

    expect(prepareCalls).toBe(1);
    expect(matches).toHaveLength(2);
    expect(matches[0]).toMatchObject({
      state: 'ready',
      enrollment: { value: { kind: 'enrollment', value: { sourcePosition: 2 } } },
      student: { value: { kind: 'student', value: { displayName: 'Estudante Sintético 2' } } },
    });
    expect(matches[1]).toEqual({ state: 'missing' });
  });

  it('reports duplicate current enrollment positions as ambiguous instead of choosing one', async () => {
    const unit = createGradebookD1PersistenceUnitOfWorkV2(database, { now: () => instant });
    const studentId = 'student:bulk-roster:duplicate' as StudentId;
    expect(
      (
        await unit.entities.appendVersion(
          { academicYearId },
          {
            kind: 'student',
            value: {
              id: studentId,
              displayName: 'Estudante Sintético Duplicado',
              sourceNames: ['Estudante Sintético Duplicado'],
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
            kind: 'enrollment',
            value: {
              id: 'enrollment:bulk-roster:duplicate' as EnrollmentId,
              academicYearId,
              studentId,
              classGroupId,
              effectivePeriod: {},
              position: 'current',
              sourcePosition: 1,
            },
          },
          { expectedVersion: null },
        )
      ).status,
    ).toBe('written');

    const reader = createGradebookD1ImportCatalogBulkReadV1(database);
    const matches = await reader.getImportRosterMany(
      { academicYearId },
      [{ classGroupId, sourcePosition: 1 }],
    );
    expect(matches).toEqual([{ state: 'ambiguous' }]);
  });
});