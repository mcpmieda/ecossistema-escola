import { z } from 'zod';
import { ADMIN_ACCOUNT_FIELDS_V2, accountReadContextV2 } from './account-read-context-v2';
import { readSessionsV2 } from './sessions-read-v2';
import {
  ADMIN_OVERVIEW_ACCOUNT_LIMIT_V2,
  adminAccountReadV2,
  adminReadResponseV2,
  type AdminReadQueryV2,
} from '../../../shared/student-portal-contracts/admin-read-v2';
import type { StudentPortalPostgresQueryV1 } from '../persistence/postgres-persistence-v1';
import { accountsScopeVersionV1 } from './common-v1';
import { ACCOUNT_JOIN_V1, readAdminHealthV1 } from './queries-v1';
import type { AdminCursorV1 } from './cursor-v1';

/** Fixed query count: one bounded account/policy batch, one session aggregate.
 * The caller owns a read-only repeatable-read transaction; no lock or per-account query.
 */
export async function readAdminV2(
  tx: StudentPortalPostgresQueryV1,
  query: AdminReadQueryV2,
  actor: string,
  requestId: string,
  now: Date,
  cursor: AdminCursorV1,
) {
  if (query.operation === 'sessions-read')
    return readSessionsV2(tx, query, actor, requestId, now, cursor);
  const after = await cursor.read(query, actor, now);
  if (after?.at) throw new Error('student-portal-cursor-invalid-request');
  const values: unknown[] = [];
  const bind = (value: unknown) => {
    values.push(value);
    return `$${values.length}`;
  };
  const where = ['a.academic_year=2026'];
  if (query.scope.kind === 'account') where.push(`a.id=${bind(query.scope.accountId)}::uuid`);
  if (query.scope.kind === 'class') where.push(`b.class_id=${bind(query.scope.classId)}`);
  if (query.accountState !== undefined) where.push(`a.auth_state=${bind(query.accountState)}`);
  if (query.blocked !== undefined) where.push(`a.blocked=${bind(query.blocked)}`);
  if (query.nameSearch !== undefined)
    where.push(`position(lower(${bind(query.nameSearch)}) in lower(COALESCE(s.name,'')))>0`);
  if (after) where.push(`a.id>${bind(after.id)}::uuid`);
  const clock = bind(now.toISOString());
  const limit = query.operation === 'overview' ? ADMIN_OVERVIEW_ACCOUNT_LIMIT_V2 : query.page.limit;
  const rows = await tx.unsafe(
    `SELECT ${ADMIN_ACCOUNT_FIELDS_V2},
    (SELECT max(e.occurred_at) FROM student_portal.audit_event e WHERE e.account_id=a.id
      AND e.kind IN ('login','activated') AND e.result='success'
      AND e.occurred_at>${clock}::timestamptz-interval '12 months'
      AND e.occurred_at<=${clock}::timestamptz) AS last_authentication
    ${ACCOUNT_JOIN_V1} WHERE ${where.join(' AND ')} ORDER BY a.id LIMIT ${bind(limit + 1)}`,
    values,
  );
  if (query.operation === 'overview' && rows.length > limit)
    throw new Error('student-portal-admin-scope-unavailable');
  const selected = rows.slice(0, limit);
  const sessionPolicies: {
    id: string;
    security: number;
    end: string;
    persistent: number;
    short: number;
  }[] = [];
  const items: z.infer<typeof adminAccountReadV2>[] = [];
  for (const row of selected) {
    const { item, policy, securityVersion } = await accountReadContextV2(row, now);
    items.push(item);
    if (item.access.accessPermitted && item.state === 'active' && policy)
      sessionPolicies.push({
        id: item.accountId,
        security: securityVersion,
        end: policy.settings.value.calendar.yearEndsAt!,
        persistent: policy.settings.value.risk.persistentSeconds,
        short: policy.settings.value.risk.shortSeconds,
      });
  }
  if (sessionPolicies.length > 0) {
    const sessions = await tx.unsafe(
      `SELECT s.account_id,count(*)::integer AS count
      FROM jsonb_to_recordset($1::text::jsonb) AS p(id uuid,security bigint,"end" timestamptz,persistent integer,short integer)
      JOIN student_portal.session s ON s.account_id=p.id
      WHERE s.revoked_at IS NULL AND s.security_version=p.security AND s.created_at<=$2::timestamptz
        AND LEAST(s.expires_at,p."end",s.created_at+make_interval(secs=>CASE WHEN s.persistent THEN p.persistent ELSE p.short END))>$2::timestamptz
      GROUP BY s.account_id`,
      [JSON.stringify(sessionPolicies), now.toISOString()],
    );
    const counts = new Map(
      sessions.map((row) => [
        z.uuid().parse(row.account_id),
        z.number().int().nonnegative().safe().parse(row.count),
      ]),
    );
    for (const item of items) item.validSessionCount = counts.get(item.accountId) ?? 0;
  }
  const base = {
    contractVersion: 2,
    requestId,
    observedAt: now.toISOString(),
    scopeVersion: await accountsScopeVersionV1(tx),
  };
  if (query.operation === 'accounts-read')
    return adminReadResponseV2.parse({
      ...base,
      state: 'accounts-read',
      items,
      nextCursor:
        rows.length > limit ? await cursor.next(query, actor, now, items.at(-1)!.accountId) : null,
      lastAuthenticationWindowMonths: 12,
    });
  const count = (predicate: (item: (typeof items)[number]) => boolean) =>
    items.filter(predicate).length;
  return adminReadResponseV2.parse({
    ...base,
    state: 'overview',
    counts: {
      accounts: items.length,
      active: count((item) => item.state === 'active'),
      pendingActivation: count((item) => item.state === 'pending-activation'),
      resetRequired: count((item) => item.state === 'reset-required'),
      blocked: count((item) => item.blocked),
      unresolved: count((item) => item.eligibility === 'unresolved'),
      unlinked: count((item) => item.eligibility === 'unlinked'),
      accessEnabled: count((item) => item.access.enabled === true),
      accessPermitted: count((item) => item.access.accessPermitted),
      validSessions: items.reduce((total, item) => total + item.validSessionCount, 0),
    },
    health: (await readAdminHealthV1(tx, { ...query, contractVersion: 1, operation: 'health' }))
      .status,
  });
}
