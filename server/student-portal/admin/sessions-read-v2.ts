import { z } from 'zod';
import {
  adminReadResponseV2,
  type AdminReadQueryV2,
} from '../../../shared/student-portal-contracts/admin-read-v2';
import type { StudentPortalPostgresQueryV1 } from '../persistence/postgres-persistence-v1';
import { accountsScopeVersionV1, adminInstantV1 } from './common-v1';
import { ACCOUNT_JOIN_V1 } from './queries-v1';
import { ADMIN_ACCOUNT_FIELDS_V2, accountReadContextV2 } from './account-read-context-v2';
import type { AdminCursorV1 } from './cursor-v1';

/** One repeatable-read snapshot, <=100 sessions and <=100 distinct policy resolutions.
 * The membership predicate mirrors SessionServiceV1.revocationScope, including ambiguity.
 * No tokens, hashes, credentials, audit IP or birth data cross this boundary.
 */
export async function readSessionsV2(
  tx: StudentPortalPostgresQueryV1,
  query: AdminReadQueryV2,
  actor: string,
  requestId: string,
  now: Date,
  cursor: AdminCursorV1,
) {
  const after = await cursor.read(query, actor, now);
  if (after?.at) throw new Error('student-portal-cursor-invalid-request');
  const values: unknown[] = [];
  const bind = (value: unknown) => {
    values.push(value);
    return '$' + values.length;
  };
  const where = ['a.academic_year=2026'];
  if (query.scope.kind === 'account') where.push('a.id=' + bind(query.scope.accountId) + '::uuid');
  if (query.scope.kind === 'class')
    where.push(`EXISTS (SELECT 1 FROM student_portal.academic_binding_v1 bb
    WHERE bb.student_id=a.gradebook_student_id AND bb.academic_year=a.academic_year
      AND bb.class_id=${bind(query.scope.classId)} AND bb.status IS DISTINCT FROM 6)`);
  const predicate = where.join(' AND ');
  const totals = await tx.unsafe(
    `SELECT count(ss.id) FILTER (WHERE ss.revoked_at IS NULL)::integer AS revocable_count,
    COALESCE(max(a.version),0)::text AS account_version
    FROM student_portal.account a LEFT JOIN student_portal.session ss ON ss.account_id=a.id
    WHERE ${predicate}`,
    values,
  );
  const version =
    query.scope.kind === 'account'
      ? Number(totals[0]!.account_version)
      : await accountsScopeVersionV1(tx);
  const pageValues = [...values, after?.id ?? null, query.page.limit + 1];
  const rows = await tx.unsafe(
    `SELECT ss.id,ss.account_id,ss.security_version::text,
      ss.created_at,ss.expires_at,ss.revoked_at,ss.persistent
    FROM student_portal.account a JOIN student_portal.session ss ON ss.account_id=a.id
    WHERE ${predicate} AND ($${values.length + 1}::uuid IS NULL OR ss.id>$${values.length + 1}::uuid)
    ORDER BY ss.id LIMIT $${values.length + 2}`,
    pageValues,
  );
  const selected = rows.slice(0, query.page.limit);
  const ids = [...new Set(selected.map((row) => z.uuid().parse(row.account_id)))];
  const contexts = new Map<string, Awaited<ReturnType<typeof accountReadContextV2>>>();
  if (ids.length) {
    const accounts = await tx.unsafe(
      `SELECT ${ADMIN_ACCOUNT_FIELDS_V2} ${ACCOUNT_JOIN_V1}
      WHERE a.academic_year=2026 AND a.id=ANY($1::uuid[]) ORDER BY a.id`,
      [ids],
    );
    for (const account of accounts) {
      const context = await accountReadContextV2(account, now);
      contexts.set(context.item.accountId, context);
    }
  }
  const items = selected.map((row) => {
    const accountId = z.uuid().parse(row.account_id);
    const context = contexts.get(accountId);
    if (!context) throw new Error('student-portal-admin-scope-unavailable');
    const { item, policy, securityVersion } = context;
    const expiresAt = adminInstantV1(row.expires_at);
    const created = Date.parse(adminInstantV1(row.created_at));
    const persistent = z.boolean().parse(row.persistent);
    const end = policy?.settings.value.calendar.yearEndsAt;
    const effectiveExpiresAt =
      policy && end
        ? new Date(
            Math.min(
              Date.parse(expiresAt),
              Date.parse(end),
              created +
                (persistent
                  ? policy.settings.value.risk.persistentSeconds
                  : policy.settings.value.risk.shortSeconds) *
                  1000,
            ),
          ).toISOString()
        : null;
    const revokedAt = row.revoked_at === null ? null : adminInstantV1(row.revoked_at);
    const validity = revokedAt
      ? 'revoked'
      : Date.parse(effectiveExpiresAt ?? expiresAt) <= now.getTime()
        ? 'expired'
        : item.access.accessPermitted &&
            item.state === 'active' &&
            Number(row.security_version) === securityVersion &&
            created <= now.getTime()
          ? 'valid'
          : 'unavailable';
    return {
      sessionId: row.id,
      accountId,
      name: item.name,
      classLabel: item.classLabel,
      classId: item.classId,
      accountVersion: item.version,
      createdAt: adminInstantV1(row.created_at),
      expiresAt,
      effectiveExpiresAt,
      revokedAt,
      persistent,
      validity,
    };
  });
  return adminReadResponseV2.parse({
    contractVersion: 2,
    requestId,
    state: 'sessions-read',
    scope: query.scope,
    observedAt: now.toISOString(),
    version,
    revocableCount: totals[0]!.revocable_count,
    items,
    nextCursor:
      rows.length > query.page.limit
        ? await cursor.next(query, actor, now, z.uuid().parse(selected.at(-1)!.id))
        : null,
  });
}
