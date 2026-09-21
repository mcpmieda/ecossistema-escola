import { z } from 'zod';
import type { StudentPortalPostgresQueryV1 } from '../persistence/postgres-persistence-v1';

const liveOutboxPresenceV1 = z.object({ live_outbox: z.boolean() });
const healthRowV1 = z.object({
  expired_ip: z.number().int().min(0).max(101),
  expired_audit: z.number().int().min(0).max(101),
  overdue_ip: z.boolean(),
  exhausted: z.boolean(),
  backlog: z.boolean(),
  publication_due: z.number().int().min(0).max(1001),
  oldest_publication_due_ms: z.number().finite().nonnegative(),
  live_backlog: z.boolean(),
  live_pending: z.number().int().min(0).max(1001),
  live_retrying: z.number().int().min(0).max(1001),
  oldest_live_due_ms: z.number().finite().nonnegative(),
  waiting_connections: z.number().int().nonnegative(),
  oldest_waiting_query_ms: z.number().finite().nonnegative(),
});

type HealthRowV1 = z.infer<typeof healthRowV1>;

function maintenanceStatusV1(row: HealthRowV1) {
  if (row.overdue_ip || row.exhausted) return 'intervention' as const;
  if (
    row.expired_ip ||
    row.expired_audit ||
    row.backlog ||
    row.live_backlog ||
    row.oldest_waiting_query_ms >= 1000
  ) {
    return 'attention' as const;
  }
  return 'normal' as const;
}

async function hasLiveOutboxV1(tx: StudentPortalPostgresQueryV1): Promise<boolean> {
  const rows = await tx.unsafe(
    "SELECT to_regclass('student_portal.live_event_outbox_v1') IS NOT NULL AS live_outbox",
  );
  return liveOutboxPresenceV1.parse(rows[0]).live_outbox;
}

/** Bounded aggregates only. No IP, student identifier, payload or SQL error is returned. */
export async function portalMaintenanceHealthV1(tx: StudentPortalPostgresQueryV1) {
  // Some migration/recovery harnesses intentionally exercise pre-0011 Portal catalogs.
  // Resolve that capability before referencing the relation so those catalogs remain diagnosable.
  const liveOutbox = await hasLiveOutboxV1(tx);
  const liveColumns = liveOutbox
    ? `EXISTS(SELECT 1 FROM student_portal.live_event_outbox_v1
        WHERE delivered_at IS NULL AND next_attempt_at<statement_timestamp()-interval '5 minutes'
          AND (lease_until IS NULL OR lease_until<statement_timestamp())) AS live_backlog,
      (SELECT count(*)::integer FROM (SELECT 1 FROM student_portal.live_event_outbox_v1
        WHERE delivered_at IS NULL LIMIT 1001) q) AS live_pending,
      (SELECT count(*)::integer FROM (SELECT 1 FROM student_portal.live_event_outbox_v1
        WHERE delivered_at IS NULL AND attempts>0 LIMIT 1001) q) AS live_retrying,
      COALESCE((SELECT GREATEST(0,extract(epoch FROM statement_timestamp()-q.next_attempt_at)*1000)
        FROM (SELECT next_attempt_at FROM student_portal.live_event_outbox_v1
          WHERE delivered_at IS NULL AND next_attempt_at<=statement_timestamp()
            AND (lease_until IS NULL OR lease_until<statement_timestamp())
          ORDER BY next_attempt_at,id LIMIT 1) q),0)::double precision AS oldest_live_due_ms,`
    : `false AS live_backlog,
      0::integer AS live_pending,
      0::integer AS live_retrying,
      0::double precision AS oldest_live_due_ms,`;

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
    (SELECT count(*)::integer FROM (SELECT 1 FROM student_portal.publication_job
      WHERE state IN ('queued','running') AND next_attempt_at<=statement_timestamp()
        AND (lease_until IS NULL OR lease_until<statement_timestamp()) LIMIT 1001) q) AS publication_due,
    COALESCE((SELECT GREATEST(0,extract(epoch FROM statement_timestamp()-q.next_attempt_at)*1000)
      FROM (SELECT next_attempt_at FROM student_portal.publication_job
        WHERE state IN ('queued','running') AND next_attempt_at<=statement_timestamp()
          AND (lease_until IS NULL OR lease_until<statement_timestamp())
        ORDER BY next_attempt_at LIMIT 1) q),0)::double precision AS oldest_publication_due_ms,
    ${liveColumns}
    (SELECT count(*)::integer FROM pg_stat_activity WHERE usename=current_user AND application_name='student-portal-v1'
      AND wait_event_type='Lock') AS waiting_connections,
    (SELECT COALESCE(max(GREATEST(0,extract(epoch FROM statement_timestamp()-query_start)*1000)),0)::double precision
      FROM pg_stat_activity WHERE usename=current_user AND application_name='student-portal-v1' AND wait_event_type='Lock') AS oldest_waiting_query_ms`);

  const row = healthRowV1.parse(rows[0]);
  return {
    status: maintenanceStatusV1(row),
    liveOutboxAvailable: liveOutbox,
    expiredIp: row.expired_ip,
    expiredAudit: row.expired_audit,
    backlog: row.backlog,
    exhausted: row.exhausted,
    publicationDue: row.publication_due,
    oldestPublicationDueMs: row.oldest_publication_due_ms,
    liveBacklog: row.live_backlog,
    livePending: row.live_pending,
    liveRetrying: row.live_retrying,
    oldestLiveDueMs: row.oldest_live_due_ms,
    waitingConnections: row.waiting_connections,
    oldestWaitingQueryMs: row.oldest_waiting_query_ms,
  };
}
