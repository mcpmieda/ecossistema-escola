import { z } from 'zod';
import {
  livePublishEventV1,
  type LivePublishEventV1,
} from '../../../shared/student-portal-contracts/live-v1';
import type { StudentPortalPostgresSqlV1 } from '../persistence/postgres-persistence-v1';
import { portalDatabaseV1 } from '../composition/database-v1';
import type { PortalCompositionEnvV1 } from '../composition/config-v1';
import { portalLiveStubV1 } from './live-connect-v1';

const rowV1 = z
  .object({
    security_relevant: z.boolean(),
    id: z.string().regex(/^[1-9][0-9]*$/u),
    audience: z.enum(['admin', 'student']),
    domain: z.enum(['gradebook', 'portal']),
    version: z.string(),
    account_id: z.uuid().nullable(),
    class_id: z.coerce.number().int().positive().safe().nullable(),
    student_ids: z.array(z.coerce.number().int().positive().safe()).max(1000),
    occurred_at: z
      .union([z.date(), z.string()])
      .transform((value) => new Date(value).toISOString()),
  })
  .strict();

async function claimLiveEventsV1(sql: StudentPortalPostgresSqlV1, token: string, limit: number) {
  return sql.begin(async (tx) =>
    tx.unsafe(
      `WITH pending AS (
      SELECT id FROM student_portal.live_event_outbox_v1
      WHERE delivered_at IS NULL AND next_attempt_at<=statement_timestamp()
        AND (lease_until IS NULL OR lease_until<statement_timestamp())
      ORDER BY security_relevant DESC,id LIMIT $1 FOR UPDATE SKIP LOCKED
    )
    UPDATE student_portal.live_event_outbox_v1 event SET lease_token=$2::uuid,
      lease_until=statement_timestamp()+interval '30 seconds',attempts=attempts+1
    FROM pending WHERE event.id=pending.id
    RETURNING event.id::text,event.audience,event.domain,event.version,event.account_id,
      event.class_id,event.security_relevant,to_json(event.student_ids) AS student_ids,event.occurred_at`,
      [limit, token],
    ),
  );
}

function eventFromRowV1(input: unknown): LivePublishEventV1 {
  const row = rowV1.parse(input);
  return livePublishEventV1.parse({
    securityRelevant: row.security_relevant,
    cursor: row.id.padStart(20, '0'),
    audience: row.audience,
    domain: row.domain,
    version: row.version,
    accountId: row.account_id,
    classId: row.class_id,
    studentIds: row.student_ids,
    occurredAt: row.occurred_at,
  });
}

/** Claims are short transactions. Use JSON at array boundaries because the production
 * postgres.js client deliberately disables dynamic type discovery (fetch_types:false).
 * JSON text is bound as text BEFORE casting, avoiding a second JSON serialization.
 * DO calls happen after releasing PostgreSQL; only the lease holder may acknowledge it.
 */
export async function dispatchPortalLiveEventsV1(
  env: PortalCompositionEnvV1,
  limit = 50,
): Promise<number> {
  if (!env.PORTAL_LIVE) return 0;
  const started = Date.now();
  const token = crypto.randomUUID();
  let claimed = 0,
    accepted = 0,
    acknowledged = 0,
    rejected = 0;
  let outcome: 'ok' | 'unavailable' = 'unavailable';
  try {
    const events = await portalDatabaseV1(env, 'live-drain', (sql) =>
      claimLiveEventsV1(sql, token, Math.max(1, Math.min(100, limit))),
    );
    claimed = events.length;
    if (!claimed) {
      outcome = 'ok';
      return 0;
    }
    const delivered: string[] = [];
    const failed: string[] = [];
    for (const input of events) {
      try {
        const event = eventFromRowV1(input);
        await portalLiveStubV1(env, event.audience).publish(event);
        delivered.push(input.id as string);
      } catch {
        failed.push(input.id as string);
      }
    }
    accepted = delivered.length;
    rejected = failed.length;
    await portalDatabaseV1(env, 'live-drain', async (sql) => {
      if (delivered.length) {
        const rows = await sql.unsafe(
          `UPDATE student_portal.live_event_outbox_v1
          SET delivered_at=statement_timestamp(),lease_token=NULL,lease_until=NULL
          WHERE lease_token=$1::uuid
            AND id IN (SELECT value::bigint FROM jsonb_array_elements_text($2::text::jsonb))
          RETURNING id::text`,
          [token, JSON.stringify(delivered)],
        );
        acknowledged = rows.length;
      }
      if (failed.length)
        await sql.unsafe(
          `UPDATE student_portal.live_event_outbox_v1
        SET lease_token=NULL,lease_until=NULL,next_attempt_at=statement_timestamp()+
          make_interval(secs=>LEAST(300,power(2,LEAST(attempts,8))::integer))
        WHERE lease_token=$1::uuid
          AND id IN (SELECT value::bigint FROM jsonb_array_elements_text($2::text::jsonb))`,
          [token, JSON.stringify(failed)],
        );
      await sql.unsafe(`WITH expired AS (SELECT id FROM student_portal.live_event_outbox_v1
        WHERE delivered_at<statement_timestamp()-interval '7 days' ORDER BY delivered_at,id LIMIT 100)
        DELETE FROM student_portal.live_event_outbox_v1 event USING expired WHERE event.id=expired.id`);
    });
    if (failed.length || acknowledged !== accepted)
      throw new Error('student-portal-live-delivery-unavailable');
    outcome = 'ok';
    return acknowledged;
  } finally {
    if (claimed || outcome === 'unavailable') {
      // Fixed aggregate diagnostic only: no routing identifiers, SQL, tokens or raw errors.
      console.info(
        JSON.stringify({
          event: 'student-portal-live-drain-v1',
          outcome,
          occurredAt: new Date().toISOString(),
          elapsedMs: Math.max(0, Date.now() - started),
          claimed,
          accepted,
          acknowledged,
          rejected,
        }),
      );
    }
  }
}
