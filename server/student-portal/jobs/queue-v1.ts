import { z } from 'zod';
import type { StudentPortalPostgresQueryV1 } from '../persistence/postgres-persistence-v1';

export type JobInputV1 = { accountId: string; dataVersion: string; policyVersion: string; publicationVersion: string };
export type ClaimedJobV1 = JobInputV1 & { id: string; attempts: number; leaseUntil: string };
export async function enqueueJobsV1(tx: StudentPortalPostgresQueryV1, jobs: readonly JobInputV1[], now: Date): Promise<number> {
  if (jobs.length === 0) return 0;
  if (jobs.length > 7000) throw new Error('student-portal-job-batch-too-large');
  const rows = await tx.unsafe(`INSERT INTO student_portal.publication_job
    (id,account_id,data_version,policy_version,publication_version,state,attempts,next_attempt_at)
    SELECT id,account_id,data_version,policy_version,publication_version,'queued',0,$2::timestamptz
    FROM jsonb_to_recordset($1::text::jsonb) AS j(id uuid,account_id uuid,data_version text,policy_version text,publication_version text)
    ON CONFLICT (account_id,data_version,policy_version,publication_version) DO NOTHING RETURNING id`,
  [JSON.stringify(jobs.map((job) => ({ id: crypto.randomUUID(), account_id: job.accountId, data_version: job.dataVersion,
    policy_version: job.policyVersion, publication_version: job.publicationVersion }))), now.toISOString()]);
  return rows.length;
}
export async function claimJobV1(tx: StudentPortalPostgresQueryV1, now: Date): Promise<ClaimedJobV1 | null> {
  // A crash on the final attempt must not leave a permanently running job. Bound cleanup like claims.
  await tx.unsafe(`WITH exhausted AS (
    SELECT id FROM student_portal.publication_job WHERE attempts>=5
      AND (state='queued' OR (state='running' AND lease_until<=$1::timestamptz))
    ORDER BY updated_at,id FOR UPDATE SKIP LOCKED LIMIT 25)
    UPDATE student_portal.publication_job j SET state='failed',lease_until=NULL,updated_at=$1::timestamptz
      FROM exhausted e WHERE j.id=e.id`, [now.toISOString()]);
  // attempts is a fencing generation as well as a retry budget; never reset it on an expired lease.
  const rows = await tx.unsafe(`WITH candidate AS (
    SELECT id FROM student_portal.publication_job WHERE attempts<5 AND next_attempt_at<=$1::timestamptz
      AND (state='queued' OR (state='running' AND lease_until<=$1::timestamptz))
    ORDER BY next_attempt_at,id FOR UPDATE SKIP LOCKED LIMIT 1)
    UPDATE student_portal.publication_job j SET state='running',attempts=attempts+1,
      lease_until=$1::timestamptz+interval '60 seconds',updated_at=$1::timestamptz FROM candidate c WHERE j.id=c.id
    RETURNING j.id,j.account_id,j.data_version,j.policy_version,j.publication_version,j.attempts,j.lease_until`, [now.toISOString()]);
  const row = rows[0];
  if (!row) return null;
  return { id: z.uuid().parse(row.id), accountId: z.uuid().parse(row.account_id), dataVersion: z.string().parse(row.data_version),
    policyVersion: z.string().parse(row.policy_version), publicationVersion: z.string().parse(row.publication_version),
    attempts: z.number().int().min(1).max(5).parse(row.attempts),
    leaseUntil: (row.lease_until instanceof Date ? row.lease_until : new Date(z.string().parse(row.lease_until))).toISOString() };
}
export async function finishJobV1(tx: StudentPortalPostgresQueryV1, job: ClaimedJobV1, now: Date): Promise<boolean> {
  const rows = await tx.unsafe(`UPDATE student_portal.publication_job SET state='done',lease_until=NULL,updated_at=$4::timestamptz
    WHERE id=$1::uuid AND state='running' AND attempts=$2 AND lease_until=$3::timestamptz AND lease_until>$4::timestamptz RETURNING id`,
  [job.id, job.attempts, job.leaseUntil, now.toISOString()]);
  return rows.length === 1;
}
export async function failJobV1(tx: StudentPortalPostgresQueryV1, job: ClaimedJobV1, now: Date, terminal: boolean): Promise<void> {
  const final = terminal || job.attempts >= 5;
  await tx.unsafe(`UPDATE student_portal.publication_job SET state=$4,lease_until=NULL,
    next_attempt_at=$5::timestamptz,updated_at=$6::timestamptz
    WHERE id=$1::uuid AND state='running' AND attempts=$2 AND lease_until=$3::timestamptz`,
  [job.id, job.attempts, job.leaseUntil, final ? 'failed' : 'queued',
    new Date(now.getTime() + Math.min(900, 5 * 2 ** (job.attempts - 1)) * 1000).toISOString(), now.toISOString()]);
}
