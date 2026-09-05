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
  it('returns only requested current roster positions and preserves missing positions', async () => {
    const reader = createGradebookD1ImportCatalogBulkReadV1(database);
    const matches = await reader.getImportRosterMany(
      { academicYearId },
      [
        { classGroupId, sourcePosition: 2 },
        { classGroupId, sourcePosition: 3 },
      ],
    );

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
