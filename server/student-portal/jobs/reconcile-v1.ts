import { z } from 'zod';
import type { StudentPortalPostgresSqlV1 } from '../persistence/postgres-persistence-v1';
import { authNowV1, accountTransactionV1 } from '../auth/transaction-v1';
import { AcademicStudentReaderPostgresV1 } from '../academic/academic-reader-v1';
import { publicationContextV1, storedProjectionV1 } from '../publication/self-projection-reader-v1';
import { currentRevisionV1, jobMaskV1, jobPolicyVersionV1, jobPublicationVersionV1, parseDataVectorV1,
  PERIODS_V1, publicationKeyV1, publicationMaskV1, publicationRowsV1 } from '../publication/state-v1';
import { enqueueJobsV1, type JobInputV1 } from './queue-v1';

/** Durable revision reconciliation: no in-memory cursor, time-based checkpoint or event deletion. */
export class PublicationReconcilerV1 {
  constructor(private readonly sql: StudentPortalPostgresSqlV1) {}
  async run(limit = 20) {
    z.number().int().min(1).max(100).parse(limit);
    const ids = await accountTransactionV1(this.sql, async (tx) => {
      const revision = await currentRevisionV1(tx);
      // revision_event is the transactional producer ledger; a full revision comparison also repairs a missed trigger/restart.
      const rows = await tx.unsafe(`SELECT a.id FROM student_portal.account a
        JOIN student_portal.lifecycle_snapshot l ON l.account_id=a.id
        JOIN LATERAL (SELECT min(class_id) AS class_id,count(*)::integer AS matches,
          bool_and(status IS NULL OR status IN (1,2,7)) AS eligible FROM student_portal.academic_binding_v1
          WHERE student_id=a.gradebook_student_id AND academic_year=2026 AND status IS DISTINCT FROM 6) b
          ON b.matches=1 AND b.eligible AND b.class_id=l.class_id
        CROSS JOIN (SELECT min(version)::text AS epoch,count(*)::integer AS fields FROM student_portal.setting WHERE scope_key='school:2026') s
        WHERE a.academic_year=2026 AND a.closed_at IS NULL AND a.eligibility='eligible' AND NOT a.blocked AND s.fields=7 AND (
          (SELECT count(*) FROM student_portal.publication p WHERE p.account_id=a.id)<6 OR
          EXISTS(SELECT 1 FROM student_portal.publication p WHERE p.account_id=a.id AND p.available_revision IS DISTINCT FROM $1) OR
          NOT EXISTS(SELECT 1 FROM student_portal.publication_job j WHERE j.account_id=a.id
            AND j.policy_version='epoch:'||s.epoch||':account:'||a.version::text) OR
          EXISTS(SELECT 1 FROM student_portal.revision_event e WHERE e.academic_year=2026 AND e.affects_academic AND e.data_version=$1
            AND (cardinality(e.student_ids)=0 OR a.gradebook_student_id=ANY(e.student_ids))
            AND NOT EXISTS(SELECT 1 FROM student_portal.publication p WHERE p.account_id=a.id AND p.available_revision=$1))
        ) ORDER BY a.id LIMIT $2`, [revision, limit]);
      return rows.map((row) => z.uuid().parse(row.id));
    });
    let reconciled = 0;
    let failed = 0;
    for (const accountId of ids) {
      try {
        await this.reconcileAccount(accountId);
        reconciled++;
      } catch { failed++; } // No source text or student data in telemetry.
    }
    return { inspected: ids.length, reconciled, failed };
  }

  private async reconcileAccount(accountId: string) {
    await accountTransactionV1(this.sql, async (tx, store) => {
      const context = await publicationContextV1(this.sql, tx, store, accountId, false);
      if (!context) return;
      const revision = await currentRevisionV1(tx);
      const before = await publicationRowsV1(tx, accountId);
      const previous = await storedProjectionV1(tx, accountId);
      const vector = previous ? parseDataVectorV1(previous.revisions.dataVersion) : PERIODS_V1.map(() => null);
      const policyVersion = await jobPolicyVersionV1(tx, accountId);
      const observed = await tx.unsafe('SELECT id FROM student_portal.publication_job WHERE account_id=$1::uuid AND policy_version=$2 LIMIT 1', [accountId, policyVersion]);
      let source = null;
      try { source = await new AcademicStudentReaderPostgresV1(tx).readOfficialInTransaction(tx, context.account.link!, revision); }
      catch { /* Malformed source cannot replace a valid published snapshot. */ }
      for (const period of PERIODS_V1) {
        const prior = before.find((row) => row.period === period)!;
        const delivered = previous && vector[PERIODS_V1.indexOf(period)] === prior.publishedRevision ? prior.publishedRevision : null;
        const available = Boolean(source?.subjects.some((subject) => subject.periods.some((item) => item.period === period
          && (item.final.kind !== 'absent' || item.partials?.some((partial) => partial.mark.kind === 'score')))));
        const state = delivered !== null ? delivered === revision ? 'published' : 'update-pending' : available ? 'available' : 'no-data';
        await tx.unsafe(`INSERT INTO student_portal.publication(scope_key,scope_kind,academic_year,account_id,period,state,
          available_revision,published_revision,version) VALUES ($1,'account',2026,$2::uuid,$3,$4,$5,$6,0)
          ON CONFLICT(scope_key,period) DO UPDATE SET state=EXCLUDED.state,available_revision=EXCLUDED.available_revision,
            published_revision=EXCLUDED.published_revision,updated_at=statement_timestamp()`,
        [publicationKeyV1(accountId), accountId, period, state, revision, delivered]);
      }
      const rows = await publicationRowsV1(tx, accountId);
      const mask = rows.reduce((bits, row) => bits | (row.publishedRevision !== null ? publicationMaskV1(row.period) : 0), 0);
      const jobs: JobInputV1[] = [];
      if (mask && (context.policy.settings.value.autoUpdate || (observed.length === 0 && rows.every((row) => row.publishedRevision === null || row.publishedRevision === revision)))) {
        jobs.push({ accountId, dataVersion: revision, policyVersion, publicationVersion: jobPublicationVersionV1(mask, rows) });
      }
      // Policy changes can renew an existing explicit approval only at the exact still-available source revision.
      const pending = await tx.unsafe(`SELECT data_version,policy_version,publication_version FROM student_portal.publication_job
        WHERE account_id=$1::uuid AND state IN ('queued','running','failed') AND policy_version<>$2 AND data_version=$3`, [accountId, policyVersion, revision]);
      for (const item of pending) {
        const pendingMask = jobMaskV1(String(item.publication_version));
        if (pendingMask && item.publication_version === jobPublicationVersionV1(pendingMask, rows))
          jobs.push({ accountId, dataVersion: revision, policyVersion, publicationVersion: jobPublicationVersionV1(pendingMask, rows) });
      }
      if (observed.length === 0 && jobs.length === 0) jobs.push({ accountId, dataVersion: revision, policyVersion, publicationVersion: jobPublicationVersionV1(0, rows) });
      await enqueueJobsV1(tx, jobs, await authNowV1(tx));
    });
  }
}
