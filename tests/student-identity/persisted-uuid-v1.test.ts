import { describe, expect, it } from 'vitest';
import { studentUidV1 } from '../../shared/student-identity/student-identity-v1';
import { resolveStudentIdentitiesV1 } from '../../server/student-identity/resolve-student-identity-v1';

describe('persisted PostgreSQL UUID compatibility', () => {
  it.each([
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000ABC',
    'FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF',
    '10000000-0000-4000-8000-000000000001',
  ])('accepts canonical persisted UUID %s without assuming its version bits', async (persisted) => {
    const normalized = persisted.toLowerCase();
    expect(studentUidV1.parse(persisted)).toBe(normalized);
    const rows = [{ account_id: normalized, academic_year: 2026, gradebook_student_id: null, student_uid: normalized }];
    const result = await resolveStudentIdentitiesV1(async () => rows, {
      source: 'portal', academicYear: 2026, accountIds: [persisted],
    });
    expect(result).toEqual([{
      source: 'portal', academicYear: 2026, accountId: normalized, gradebookStudentId: null, studentUid: normalized,
    }]);
  });

  it.each(['7', '00000000000000000000000000000001', '{00000000-0000-0000-0000-000000000001}',
    '00000000-0000-0000-0000-00000000000G', ' 00000000-0000-0000-0000-000000000001'])
  ('rejects non-canonical transport value %s', value => {
    expect(studentUidV1.safeParse(value).success).toBe(false);
  });
});
