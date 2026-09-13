import { z } from 'zod';
import type { StudentPortalPostgresQueryV1 } from '../persistence/postgres-persistence-v1';

/** Bounded aggregates only. No IP, student identifier, payload or SQL error is returned. */
export async function portalMaintenanceHealthV1(tx: StudentPortalPostgresQueryV1) {
  const rows = await tx.unsafe(`SELECT
    (SELECT count(*)::integer FROM (SELECT 1 FROM student_portal.audit_event WHERE raw_ip IS NOT NULL
      AND (ip_expires_at<=statement_timestamp() OR occurred_at<=statement_timestamp()-interval '90 days') LIMIT 101) q) AS expired_ip,
    (SELECT count(*)::integer FROM (SELECT 1 FROM student_portal.audit_event
      WHERE occurred_at<=statement_timestamp()-interval '12 months' LIMIT 101) q) AS expired_audit,
    EXISTS(SELECT 1 FROM student_portal.audit_event WHERE raw_ip IS NOT NULL
      AND (ip_expires_at<=statement_timestamp()-interval '5 minutes' OR occurred_at<=statement_timestamp()-interval '90 days 5 minutes')) AS overdue_ip,
    EXISTS(SELECT 1 FROM student_portal.publication_job WHERE state='failed' AND attempts>=5) AS exhausted,
    EXISTS(SELECT 1 FROM student_portal.publication_job WHERE state IN ('queued','running')
      AND next_attempt_at<statement_timestamp()-interval '5 minutes' AND (lease_until IS NULL OR lease_until<statement_timestamp())) AS backlog,
    (SELECT count(*)::integer FROM pg_stat_activity WHERE usename=current_user AND application_name='student-portal-v1'
      AND wait_event_type='Lock') AS waiting_connections,
    (SELECT COALESCE(max(GREATEST(0,extract(epoch FROM statement_timestamp()-query_start)*1000)),0)::double precision
      FROM pg_stat_activity WHERE usename=current_user AND application_name='student-portal-v1' AND wait_event_type='Lock') AS oldest_waiting_query_ms`);
  const row = z.object({ expired_ip: z.number().int().min(0).max(101), expired_audit: z.number().int().min(0).max(101),
    overdue_ip: z.boolean(), exhausted: z.boolean(), backlog: z.boolean(), waiting_connections: z.number().int().nonnegative(),
    oldest_waiting_query_ms: z.number().finite().nonnegative() }).parse(rows[0]);
  return { status: row.overdue_ip || row.exhausted ? 'intervention' as const
    : row.expired_ip || row.expired_audit || row.backlog || row.oldest_waiting_query_ms >= 1000 ? 'attention' as const : 'normal' as const,
  expiredIp: row.expired_ip, expiredAudit: row.expired_audit, backlog: row.backlog, exhausted: row.exhausted,
  waitingConnections: row.waiting_connections, oldestWaitingQueryMs: row.oldest_waiting_query_ms };
}
