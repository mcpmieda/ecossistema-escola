import { describe, expect, it, vi } from 'vitest';
import { studentIdentityRequestV1 } from '../../shared/student-identity/student-identity-v1';
import { resolveStudentIdentitiesV1 } from '../../server/student-identity/resolve-student-identity-v1';

const uid = '10000000-0000-4000-8000-000000000001';
const account = '20000000-0000-4000-8000-000000000001';
const academicRow = { gradebook_student_id: 7, academic_year: 2026, student_uid: uid };

describe('canonical student identity contract', () => {
  it('does not accept names, UUIDs in numeric academic keys or unbounded requests', () => {
    for (const request of [
      { source: 'gradebook', academicYear: 2026, studentIds: [uid] },
      { source: 'gradebook', academicYear: 2026, studentIds: [7], name: 'SYNTHETIC' },
      { source: 'gradebook', academicYear: 2026, studentIds: [] },
      { source: 'gradebook', academicYear: 2026, studentIds: Array.from({ length: 501 }, (_, i) => i + 1) },
      { source: 'gradebook', academicYear: 2026, studentIds: [2_147_483_648] },
      { source: 'portal', academicYear: 2026, accountIds: ['7'] },
      { source: 'portal', academicYear: 2026, accountIds: ["'; DROP TABLE student_portal.account; --"] },
    ]) expect(studentIdentityRequestV1.safeParse(request).success).toBe(false);
  });

  it('validates before I/O', async () => {
    const query = vi.fn();
    await expect(resolveStudentIdentitiesV1(query, { source: 'portal' })).rejects.toThrow();
    expect(query).not.toHaveBeenCalled();
  });

  it('performs one parameterized query and deduplicates references', async () => {
    const query = vi.fn(async () => [academicRow]);
    expect(await resolveStudentIdentitiesV1(query, {
      source: 'gradebook', academicYear: 2026, studentIds: [7, 7, 8],
    })).toEqual([{ source: 'gradebook', studentUid: uid, academicYear: 2026, gradebookStudentId: 7 }]);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('FROM gradebook.aluno'), [2026, '[7,8]']);
  });

  it('resolves a different internal account ID to the same person UID', async () => {
    const query = vi.fn(async () => [{ ...academicRow, account_id: account }]);
    expect(await resolveStudentIdentitiesV1(query, {
      source: 'portal', academicYear: 2026, accountIds: [account],
    })).toEqual([{ source: 'portal', studentUid: uid, academicYear: 2026, gradebookStudentId: 7, accountId: account }]);
  });

  it('preserves identity for an authorized lookup of a closed account', async () => {
    const query = vi.fn(async () => [{ ...academicRow, account_id: account, gradebook_student_id: null }]);
    expect(await resolveStudentIdentitiesV1(query, {
      source: 'portal', academicYear: 2026, accountIds: [account],
    })).toEqual([{ source: 'portal', studentUid: uid, academicYear: 2026, gradebookStudentId: null, accountId: account }]);
  });

  it('omits missing references without allocating identity or doing fallback lookups', async () => {
    const query = vi.fn(async () => []);
    expect(await resolveStudentIdentitiesV1(query, {
      source: 'gradebook', academicYear: 2027, studentIds: [7],
    })).toEqual([]);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('does not mask schema or transport failures as a student without a photo', async () => {
    const query = vi.fn(async () => { throw new Error('synthetic-database-unavailable'); });
    await expect(resolveStudentIdentitiesV1(query, {
      source: 'gradebook', academicYear: 2026, studentIds: [7],
    })).rejects.toThrow('synthetic-database-unavailable');
  });

  it('rejects extra scope, duplicate references, duplicate identities and missing identity', async () => {
    for (const rows of [
      [{ ...academicRow, academic_year: 2027 }],
      [{ ...academicRow, gradebook_student_id: 9 }],
      [academicRow, academicRow],
      [academicRow, { ...academicRow, gradebook_student_id: 8 }],
      [{ ...academicRow, student_uid: null }],
    ]) {
      await expect(resolveStudentIdentitiesV1(async () => rows, {
        source: 'gradebook', academicYear: 2026, studentIds: [7, 8],
      })).rejects.toThrow();
    }
  });
});
