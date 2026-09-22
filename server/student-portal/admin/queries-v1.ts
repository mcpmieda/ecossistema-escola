import { portalMaintenanceHealthV1 } from '../observability/maintenance-health-v1';
import { z } from 'zod';
import { auditEventV1, type AdminQueryV1 } from '../../../shared/student-portal-contracts/admin-v1';
import { versionV1 } from '../../../shared/student-portal-contracts/core-v1';
import type { StudentPortalPostgresQueryV1 } from '../persistence/postgres-persistence-v1';
import { accountsScopeVersionV1, adminInstantV1 } from './common-v1';
import type { AdminCursorV1 } from './cursor-v1';

export const ACCOUNT_JOIN_V1 = `FROM student_portal.account a
  LEFT JOIN student_portal.academic_student_v1 s ON s.student_id=a.gradebook_student_id AND s.academic_year=a.academic_year
  LEFT JOIN LATERAL (SELECT min(class_id) AS class_id,min(class_name) AS class_name,count(*)::integer AS matches
    FROM student_portal.academic_binding_v1 WHERE student_id=a.gradebook_student_id AND academic_year=a.academic_year
      AND status IS DISTINCT FROM 6) b ON b.matches=1`;
function accountFilter(query: AdminQueryV1, parameters: unknown[]): string {
  const bind = (value: unknown) => { parameters.push(value); return `$${parameters.length}`; };
  const predicates = ['a.academic_year=2026'];
  if (query.scope.kind === 'account') predicates.push(`a.id=${bind(query.scope.accountId)}::uuid`);
  if (query.scope.kind === 'class') predicates.push(`b.class_id=${bind(query.scope.classId)}`);
  if (query.accountState !== undefined) predicates.push(`a.auth_state=${bind(query.accountState)}`);
  if (query.blocked !== undefined) predicates.push(`a.blocked=${bind(query.blocked)}`);
  if (query.nameSearch !== undefined) predicates.push(`position(lower(${bind(query.nameSearch)}) in lower(COALESCE(s.name,'')))>0`);
  return predicates.join(' AND ');
}

export async function readAccountListV1(tx: StudentPortalPostgresQueryV1, query: AdminQueryV1,
  actor: string, now: Date, cursor: AdminCursorV1) {
  const after = await cursor.read(query, actor, now);
  if (after?.at) throw new Error('student-portal-cursor-invalid-request');
  const parameters: unknown[] = [];
  const filter = accountFilter(query, parameters);
  parameters.push(after?.id ?? null, query.page.limit + 1);
  const key = query.operation === 'sessions' ? 'ss.id' : 'a.id';
  const extraJoin = query.operation === 'birth-years' ? 'LEFT JOIN student_portal.account_access_data d ON d.account_id=a.id'
    : query.operation === 'sessions' ? 'JOIN student_portal.session ss ON ss.account_id=a.id' : '';
  const fields = query.operation === 'sessions' ? 'ss.id,ss.account_id,ss.expires_at,ss.revoked_at'
    : query.operation === 'birth-years' ? 'a.id,a.version::text AS account_version,d.birth_year,d.confirmation,COALESCE(d.version,0)::text AS birth_version'
      : `a.id,a.gradebook_student_id,a.auth_state,a.eligibility,a.blocked,a.version::text,
        COALESCE(s.name,'') AS name,COALESCE(b.class_name,'') AS class_name`;
  const rows = await tx.unsafe(`SELECT ${fields} ${ACCOUNT_JOIN_V1} ${extraJoin} WHERE ${filter}
    ${query.operation === 'birth-years' ? 'AND a.closed_at IS NULL' : ''}
    AND ($${parameters.length - 1}::uuid IS NULL OR ${key}>$${parameters.length - 1}::uuid)
    ORDER BY ${key} LIMIT $${parameters.length}`, parameters);
  const selected = rows.slice(0, query.page.limit);
  const nextCursor = rows.length > query.page.limit ? await cursor.next(query, actor, now, z.uuid().parse(selected.at(-1)!.id)) : null;
  if (query.operation === 'sessions') return { items: selected.map((row) => ({ sessionId: row.id, accountId: row.account_id,
    expiresAt: adminInstantV1(row.expires_at), revokedAt: row.revoked_at === null ? null : adminInstantV1(row.revoked_at) })), nextCursor };
  if (query.operation === 'birth-years') {
    const revision = await tx.unsafe('SELECT (academic_counter+portal_link_counter)::text AS version FROM student_portal.academic_revision WHERE academic_year=2026');
    if (revision.length !== 1) throw new Error('student-portal-admin-unavailable');
    return { scopeVersion: versionV1.parse(Number(revision[0]!.version)), items: selected.map((row) => ({ accountId: row.id,
      accountVersion: Number(row.account_version), year: row.birth_year === null ? null : String(row.birth_year),
      confirmation: row.confirmation, version: Number(row.birth_version) })), nextCursor };
  }
  return { scopeVersion: await accountsScopeVersionV1(tx), items: selected.map((row) => ({ accountId: row.id,
    link: row.gradebook_student_id === null ? null : { academicYear: 2026, studentId: row.gradebook_student_id },
    name: row.name, classLabel: row.class_name, state: row.auth_state, eligibility: row.eligibility, blocked: row.blocked,
    version: Number(row.version) })), nextCursor };
}

export async function readAuditV1(tx: StudentPortalPostgresQueryV1, query: AdminQueryV1,
  actor: string, now: Date, cursor: AdminCursorV1) {
  const after = await cursor.read(query, actor, now);
  if (after && !after.at) throw new Error('student-portal-cursor-invalid-request');
  const parameters: unknown[] = [];
  const bind = (value: unknown) => { parameters.push(value); return `$${parameters.length}`; };
  const predicates = ["e.scope_json->>'academicYear'='2026'", "e.occurred_at>statement_timestamp()-interval '12 months'"];
  if (query.scope.kind === 'account') predicates.push(`e.account_id=${bind(query.scope.accountId)}::uuid`);
  if (query.scope.kind === 'class') {
    const classParam = bind(query.scope.classId);
    predicates.push(`((e.scope_json->>'kind'='class' AND e.scope_json->>'classId'=${classParam}::text)
      OR ${query.includeEntities ? `e.subject_class_id=${classParam}::integer` : `EXISTS(SELECT 1 ${ACCOUNT_JOIN_V1} WHERE a.id=e.account_id AND b.class_id=${classParam}::integer)`})`);
  }
  if (query.from) predicates.push(`e.occurred_at>=${bind(query.from)}::text::timestamptz`);
  if (query.until) predicates.push(`e.occurred_at<=${bind(query.until)}::text::timestamptz`);
  if (query.event) predicates.push(`e.kind=${bind(query.event)}`);
  if (query.result) predicates.push(`e.result=${bind(query.result)}`);
  if (query.eventId) predicates.push(`e.event_id=${bind(query.eventId)}::uuid`);
  // Keep microseconds as text through postgres.js; its timestamp serializer otherwise truncates to JS milliseconds.
  if (after) predicates.push(`(e.occurred_at,e.event_id)<(${bind(after.at)}::text::timestamptz,${bind(after.id)}::uuid)`);
  const rows = await tx.unsafe(`SELECT e.event_id,e.occurred_at,to_char(e.occurred_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_at,e.actor_id,e.account_id,e.scope_json,e.kind,e.result,
    e.request_id,e.version::text,e.masked_ip ${query.includeEntities ? ',e.actor_name,e.subject_name,e.subject_class_id,e.subject_class_label' : ''} ${query.operation === 'audit-detail' ? `,
    CASE WHEN e.ip_expires_at>statement_timestamp() AND e.occurred_at>statement_timestamp()-interval '90 days' THEN host(e.raw_ip) ELSE NULL END AS ip,
    CASE WHEN e.ip_expires_at>statement_timestamp() AND e.occurred_at>statement_timestamp()-interval '90 days'
      THEN LEAST(e.ip_expires_at,e.occurred_at+interval '90 days') ELSE NULL END AS ip_expires_at` : ''}
    FROM student_portal.audit_event e WHERE ${predicates.join(' AND ')} ORDER BY e.occurred_at DESC,e.event_id DESC
    LIMIT ${bind(query.operation === 'audit-detail' ? 1 : query.page.limit + 1)}`, parameters);
  const event = (row: Record<string, unknown>) => auditEventV1.parse({ eventId: row.event_id, at: adminInstantV1(row.occurred_at),
    actorId: row.actor_id, accountId: row.account_id, scope: row.scope_json, kind: row.kind, result: row.result,
    requestId: row.request_id, version: Number(row.version), maskedIp: row.masked_ip, ...(query.includeEntities ? { entities: { actorName: row.actor_name, subjectName: row.subject_name, classId: row.subject_class_id, classLabel: row.subject_class_label } } : {}) });
  if (query.operation === 'audit-detail') {
    if (rows.length !== 1) throw new Error('student-portal-audit-forbidden');
    return { event: event(rows[0]!), ip: rows[0]!.ip,
      ipExpiresAt: rows[0]!.ip_expires_at === null ? null : adminInstantV1(rows[0]!.ip_expires_at) };
  }
  const selected = rows.slice(0, query.page.limit);
  const last = selected.at(-1);
  return { items: selected.map(event), nextCursor: rows.length > query.page.limit
    ? await cursor.next(query, actor, now, z.uuid().parse(last!.event_id), z.string().parse(last!.cursor_at)) : null };
}

export async function readAdminHealthV1(tx: StudentPortalPostgresQueryV1, query: AdminQueryV1) {
  const parameters: unknown[] = [];
  const filter = accountFilter(query, parameters);
  const rows = await tx.unsafe(`SELECT
    COALESCE(bool_or(j.state='failed' AND j.attempts>=5),false) AS intervention,
    COALESCE(bool_or(j.state IN ('queued','running') AND j.next_attempt_at<statement_timestamp()-interval '5 minutes'
      AND (j.lease_until IS NULL OR j.lease_until<statement_timestamp())),false) AS attention
    ${ACCOUNT_JOIN_V1} JOIN student_portal.publication_job j ON j.account_id=a.id WHERE ${filter}`, parameters);
  const maintenance = await portalMaintenanceHealthV1(tx);
  return { status: rows[0]?.intervention || maintenance.status === 'intervention' ? 'intervention' as const
    : rows[0]?.attention || maintenance.status === 'attention' ? 'attention' as const : 'normal' as const };
}
