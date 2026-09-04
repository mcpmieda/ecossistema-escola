import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { SchoolId } from '../../../../shared/gradebook-contracts/entities';
import { createAcademicYearManagementV1 } from '../../../../server/gradebook/persistence/d1/operational-workspace/academic-year-management-v1';
import {
  instant,
  openMigratedDatabase,
  type SqliteD1Database,
} from '../d1-transaction/d1-write-test-support';

const schoolId = 'school:academic-year-management:synthetic' as SchoolId;
const otherSchoolId = 'school:academic-year-management:other' as SchoolId;

let database: SqliteD1Database;

beforeEach(async () => {
  database = await openMigratedDatabase();
});

afterEach(() => {
  database.raw.close();
});

describe('academic-year management D1 V1', () => {
  it('creates 2026 as active, remains idempotent, and keeps later years planned', async () => {
    const management = createAcademicYearManagementV1({
      database,
      schoolId,
      now: () => instant,
    });

    const created2026 = await management.create(2026);
    await expect(management.create(2026)).resolves.toEqual({
      ...created2026,
      state: 'already-present',
    });
    await expect(management.create(2027)).resolves.toMatchObject({
      managementVersion: 1,
      state: 'created',
      item: { year: 2027, status: 'planned' },
    });
    const otherSchool = createAcademicYearManagementV1({
      database,
      schoolId: otherSchoolId,
      now: () => instant,
    });
    await expect(otherSchool.create(2026)).resolves.toMatchObject({
      managementVersion: 1,
      state: 'created',
      item: { year: 2026, status: 'active' },
    });
    await expect(management.list()).resolves.toMatchObject({
      managementVersion: 1,
      state: 'ready',
      items: [
        { year: 2027, status: 'planned' },
        { year: 2026, status: 'active' },
      ],
    });

    expect(database.raw.prepare('SELECT COUNT(*) AS count FROM academic_years').get()).toEqual({
      count: 3,
    });
    expect(
      database.raw.prepare('SELECT COUNT(*) AS count FROM academic_year_versions').get(),
    ).toEqual({ count: 3 });
  });
});
