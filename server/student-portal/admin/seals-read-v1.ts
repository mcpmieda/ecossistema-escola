import { z } from 'zod';
import {
  adminReadResponseV2,
  type AdminReadQueryV2,
} from '../../../shared/student-portal-contracts/admin-read-v2';
import { brilliantSealCountV1 } from '../../../shared/student-portal-contracts/brilliant-seal-v1';
import {
  StudentPortalPostgresPersistenceV1,
  type StudentPortalPostgresQueryV1,
  type StudentPortalPostgresSqlV1,
} from '../persistence/postgres-persistence-v1';
import { publicationContextV1 } from '../publication/self-projection-reader-v1';
import { scopedSelfV2 } from '../publication/scoped-self-v2';
import { ACCOUNT_JOIN_V1, ENROLLED_ACCOUNT_SQL_V1 } from './queries-v1';

/**
 * Selos brilhantes in the ADM (owner request 29/09/2026): the count each student sees on the
 * Portal, from the same projection and the same shared rule, never a second rule. One record or
 * one class per read, inside the dispatcher's read-only snapshot; it writes nothing.
 */
export async function readSealsV1(
  tx: StudentPortalPostgresQueryV1,
  query: AdminReadQueryV2,
  requestId: string,
  now: Date,
) {
  if (query.scope.kind === 'school') throw new Error('student-portal-seals-invalid-request');
  const rows =
    query.scope.kind === 'account'
      ? [{ id: query.scope.accountId.toLowerCase() }]
      : await tx.unsafe(
          `SELECT a.id ${ACCOUNT_JOIN_V1} WHERE a.academic_year=2026 AND a.closed_at IS NULL
            AND ${ENROLLED_ACCOUNT_SQL_V1} AND b.class_id=$1 ORDER BY a.id LIMIT 201`,
          [query.scope.classId],
        );
  if (rows.length > 200) throw new Error('student-portal-admin-scope-unavailable');
  const sql: StudentPortalPostgresSqlV1 = {
    unsafe: (text, values) => tx.unsafe(text, values),
    begin: (run) => run(tx),
  };
  const items: { accountId: string; seals: number | null }[] = [];
  for (const row of rows) {
    const accountId = z.uuid().parse(row.id);
    items.push({ accountId, seals: await sealsOfV1(sql, tx, accountId, requestId) });
  }
  return adminReadResponseV2.parse({
    contractVersion: 2,
    requestId,
    observedAt: now.toISOString(),
    state: 'seals-read',
    items,
  });
}

async function sealsOfV1(
  sql: StudentPortalPostgresSqlV1,
  tx: StudentPortalPostgresQueryV1,
  accountId: string,
  requestId: string,
): Promise<number | null> {
  const context = await new StudentPortalPostgresPersistenceV1(sql).transaction((store) =>
    publicationContextV1(sql, tx, store, accountId, false, false),
  );
  if (!context) return null;
  try {
    const self = await scopedSelfV2(tx, context, requestId);
    return self.state === 'ready' ? brilliantSealCountV1(self.subjects, self.endedPeriods) : null;
  } catch {
    // A student whose publication is not prepared sees no marks, hence no seals.
    return null;
  }
}
