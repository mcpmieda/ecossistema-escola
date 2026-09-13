import { createHash } from 'node:crypto';
import { z } from 'zod';
import { versionV1, type FailureV1 } from '../../../shared/student-portal-contracts/core-v1';
import type { StudentPortalPostgresQueryV1, StudentPortalPostgresSqlV1 } from '../persistence/postgres-persistence-v1';

export const boundSqlV1 = (tx: StudentPortalPostgresQueryV1): StudentPortalPostgresSqlV1 => ({
  unsafe: (query, parameters) => tx.unsafe(query, parameters), begin: (operation) => operation(tx),
});
export const adminDigestV1 = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const adminInstantV1 = (value: unknown) => (value instanceof Date ? value : new Date(z.string().parse(value))).toISOString();
export async function accountsScopeVersionV1(tx: StudentPortalPostgresQueryV1): Promise<number> {
  const rows = await tx.unsafe(`SELECT (academic_counter+portal_link_counter+
    COALESCE((SELECT sum(version) FROM student_portal.account WHERE academic_year=2026),0))::text AS version
    FROM student_portal.academic_revision WHERE academic_year=2026`);
  if (rows.length !== 1) throw new Error('student-portal-admin-unavailable');
  return versionV1.parse(Number(rows[0]!.version));
}
export function adminFailureStateV1(error: unknown): FailureV1['state'] {
  if (!(error instanceof Error) || !error.message.startsWith('student-portal-')) return 'unavailable';
  if (error.message.endsWith('-conflict') || error.message.endsWith('-not-published') || error.message.endsWith('-regeneration-required')) return 'conflict';
  if (error.message.endsWith('-forbidden')) return 'forbidden';
  if (error.message.endsWith('-invalid-request')) return 'invalid-request';
  return 'unavailable';
}
