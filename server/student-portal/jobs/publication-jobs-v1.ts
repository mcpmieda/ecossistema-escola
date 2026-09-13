import { selfResponseV1, type SelfResponseV1 } from '../../../shared/student-portal-contracts/self-v1';
import type { StudentPortalPostgresSqlV1 } from '../persistence/postgres-persistence-v1';
import { AcademicStudentReaderPostgresV1, academicToSelfV1 } from '../academic/academic-reader-v1';
import { accountScopeV1, authNowV1, authTransactionV1 } from '../auth/transaction-v1';
import { applyPublishedVisibilityV1, type PolicyValueV1 } from '../policies/calendar-v1';
import { publicationContextV1, storedProjectionV1 } from '../publication/self-projection-reader-v1';
import { currentRevisionV1, dataVectorV1, jobMaskV1, jobPolicyVersionV1, jobPublicationVersionV1, parseDataVectorV1,
  PERIODS_V1, publicationDigestV1, publicationKeyV1, publicationMaskV1, publicationRowsV1, type PeriodV1 } from '../publication/state-v1';
import { claimJobV1, failJobV1, finishJobV1, type ClaimedJobV1 } from './queue-v1';
import { compareSourceSubjectPresentationV1 } from '../../../shared/gradebook-contracts/source/subject-abbreviations-v1';

const SYSTEM_ACTOR = '00000000-0000-4000-8000-000000000712';
export function disclosureDueV1(policy: PolicyValueV1, periods: readonly PeriodV1[]): Date | null {
  const calendar = policy.calendar;
  if (!policy.accessEnabled || !calendar.yearStartsAt || !calendar.yearEndsAt) return null;
  let due = Date.parse(calendar.yearStartsAt);
  for (const period of periods) {
    if (!policy.allowedPeriods.includes(period)) return null;
    const start = period === 'T1' ? calendar.yearStartsAt : period === 'T2' ? calendar.t1EndsAt
      : period === 'T3' ? calendar.t2EndsAt : calendar.recoveriesStartAt;
    const disclosure = calendar.disclosure;
    if (disclosure.mode === 'single' && !disclosure.periods.includes(period)) return null;
    const at = disclosure.mode === 'single' ? disclosure.at : disclosure.at[period];
    if (!start || !at) return null;
    due = Math.max(due, Date.parse(start), Date.parse(at));
  }
  return due < Date.parse(calendar.yearEndsAt) ? new Date(due) : null;
}
function hasFacts(period: SelfResponseV1['subjects'][number]['periods'][number]): boolean {
  return period.final.kind !== 'absent' || Boolean(period.partials?.some((partial) => partial.mark.kind === 'score'));
}

export class PublicationJobsV1 {
  constructor(private readonly sql: StudentPortalPostgresSqlV1) {}
  async claim(): Promise<ClaimedJobV1 | null> {
    return authTransactionV1(this.sql, async (tx) => claimJobV1(tx, await authNowV1(tx)));
  }

  async perform(job: ClaimedJobV1): Promise<'done' | 'stale' | 'deferred' | 'failed'> {
    try {
      return await authTransactionV1(this.sql, async (tx, store) => {
        // Account precedes job row locks, matching mutations and reset/lifecycle producers.
        await store.lockAccounts([job.accountId]);
        const owned = await tx.unsafe(`SELECT id FROM student_portal.publication_job WHERE id=$1::uuid AND state='running'
          AND attempts=$2 AND lease_until=$3::timestamptz AND lease_until>statement_timestamp() FOR UPDATE`, [job.id, job.attempts, job.leaseUntil]);
        if (owned.length !== 1) return 'stale';
        const rows = await publicationRowsV1(tx, job.accountId);
        const mask = jobMaskV1(job.publicationVersion);
        if (jobPublicationVersionV1(mask, rows) !== job.publicationVersion
          || await jobPolicyVersionV1(tx, job.accountId) !== job.policyVersion
          || (mask !== 0 && await currentRevisionV1(tx) !== job.dataVersion)) throw new Error('student-portal-publication-stale');
        const context = await publicationContextV1(this.sql, tx, store, job.accountId, false);
        if (!context) throw new Error('student-portal-publication-stale');
        if (mask === 0) {
          // Policy-only work cannot promote any academic fact, even when the source advanced with auto-update OFF.
          const previous = await storedProjectionV1(tx, job.accountId);
          const oldVector = previous ? parseDataVectorV1(previous.revisions.dataVersion) : PERIODS_V1.map(() => null);
          const vector = rows.map((row, index) => oldVector[index] === row.publishedRevision ? row.publishedRevision : null);
          const subjects = (previous?.subjects ?? []).map((subject) => ({ ...subject,
            periods: subject.periods.filter((period) => vector[PERIODS_V1.indexOf(period.period)] !== null),
          })).filter((subject) => subject.periods.length);
          const sameState = previous?.profile.academicState === context.profile.academicState;
          const projection = applyPublishedVisibilityV1(selfResponseV1.parse({ contractVersion: 1, requestId: crypto.randomUUID(),
            state: subjects.length ? 'ready' : 'no-publication', profile: { ...context.profile,
              result: sameState ? previous!.profile.result : context.profile.result }, subjects,
            generatedAt: previous?.generatedAt ?? context.now.toISOString(), revisions: { dataVersion: dataVectorV1(vector),
              policyVersion: context.policy.policyVersion, publicationVersion: `pub:${publicationDigestV1(rows.map((row) => [row.period, row.publishedRevision]))}` },
          }), context.policy.settings.value, context.now, sameState && vector.some((revision) => revision !== null));
          if (!await store.swapProjection(job.accountId, projection, projection.revisions)
            || !await finishJobV1(tx, job, await authNowV1(tx))) throw new Error('student-portal-publication-stale');
          return 'done';
        }
        const selected = PERIODS_V1.filter((period) => (mask & publicationMaskV1(period)) !== 0);
        const due = disclosureDueV1(context.policy.settings.value, selected);
        if (!due || Date.parse(context.policy.settings.value.calendar.yearEndsAt!) <= context.now.getTime()) throw new Error('student-portal-publication-policy-unavailable');
        if (due.getTime() > context.now.getTime()) {
          await tx.unsafe(`UPDATE student_portal.publication_job SET state='queued',lease_until=NULL,next_attempt_at=$2::timestamptz,
            updated_at=statement_timestamp() WHERE id=$1::uuid`, [job.id, due.toISOString()]);
          return 'deferred';
        }
        const source = await new AcademicStudentReaderPostgresV1(tx).readPublicationSourceInTransaction(tx, context.account.link!, job.dataVersion);
        if (!source) throw new Error('student-portal-publication-stale');
        const fresh = academicToSelfV1(source.student, job.accountId);
        fresh.subjects = fresh.subjects.map(({ officialOutcome, ...subject }) => ({ ...subject,
          ...(source.finalAuthority.subjectIds.includes(subject.subjectId) && officialOutcome !== undefined ? { officialOutcome } : {}) }));
        const previous = await storedProjectionV1(tx, job.accountId);
        const oldVector = previous ? parseDataVectorV1(previous.revisions.dataVersion) : PERIODS_V1.map(() => null);
        const nextVector = rows.map((row, index) => oldVector[index] === row.publishedRevision ? row.publishedRevision : null);
        for (const period of selected) nextVector[PERIODS_V1.indexOf(period)] = job.dataVersion;
        const subjects = new Map<number, SelfResponseV1['subjects'][number]>();
        for (const subject of previous?.subjects ?? []) {
          const periods = subject.periods.filter((period) => !selected.includes(period.period)
            && nextVector[PERIODS_V1.indexOf(period.period)] !== null);
          if (periods.length) subjects.set(subject.subjectId, { ...subject, periods });
        }
        for (const subject of fresh.subjects) {
          const periods = subject.periods.filter((period) => selected.includes(period.period));
          if (!periods.length) continue;
          const previousSubject = subjects.get(subject.subjectId);
          subjects.set(subject.subjectId, { ...subject, periods: [...(previousSubject?.periods ?? []), ...periods]
            .sort((a, b) => PERIODS_V1.indexOf(a.period) - PERIODS_V1.indexOf(b.period)) });
        }
        const ordered = [...subjects.values()].sort((a, b) => compareSourceSubjectPresentationV1(a.label, b.label) || a.subjectId - b.subjectId)
          .map((subject, order) => ({ ...subject, order }));
        const now = await authNowV1(tx);
        let projection = applyPublishedVisibilityV1(selfResponseV1.parse({ contractVersion: 1, requestId: crypto.randomUUID(),
          state: ordered.length ? 'ready' : 'no-publication', profile: fresh.profile, subjects: ordered, generatedAt: now.toISOString(),
          revisions: { dataVersion: dataVectorV1(nextVector), policyVersion: context.policy.policyVersion,
            publicationVersion: `pub:${publicationDigestV1(rows.map((row) => [row.period, selected.includes(row.period) ? job.dataVersion : row.publishedRevision]))}` },
        }), context.policy.settings.value, now, source.finalAuthority.global);
        const visibleSubjects = projection.subjects.map((subject) => ({ ...subject, periods: subject.periods.filter(hasFacts) })).filter((subject) => subject.periods.length);
        projection = selfResponseV1.parse({ ...projection, state: visibleSubjects.length ? 'ready' : 'no-publication', subjects: visibleSubjects });
        // Both current source and authorization fencing are checked in the same physical transaction as the swap.
        if (await currentRevisionV1(tx) !== job.dataVersion || await jobPolicyVersionV1(tx, job.accountId) !== job.policyVersion)
          throw new Error('student-portal-publication-stale');
        for (const period of selected) await tx.unsafe(`UPDATE student_portal.publication SET published_revision=$3,
          state=CASE WHEN available_revision=$3 THEN 'published' ELSE 'update-pending' END,updated_at=$4::timestamptz
          WHERE scope_key=$1 AND period=$2`, [publicationKeyV1(job.accountId), period, job.dataVersion, now.toISOString()]);
        if (!await store.swapProjection(job.accountId, projection, projection.revisions)) throw new Error('student-portal-publication-stale');
        if (!await finishJobV1(tx, job, await authNowV1(tx))) throw new Error('student-portal-publication-stale');
        await store.appendAudit({ eventId: crypto.randomUUID(), at: now.toISOString(), actorId: SYSTEM_ACTOR, accountId: job.accountId,
          scope: accountScopeV1(job.accountId), kind: 'projection-updated', result: 'success', requestId: job.id,
          version: context.account.version, maskedIp: null });
        return 'done';
      });
    } catch (error) {
      const terminal = error instanceof Error && ['student-portal-publication-stale', 'student-portal-publication-policy-unavailable'].includes(error.message);
      await authTransactionV1(this.sql, async (tx, store) => {
        await store.lockAccounts([job.accountId]);
        await failJobV1(tx, job, await authNowV1(tx), terminal);
      });
      return terminal ? 'stale' : 'failed';
    }
  }

  /** scheduled invokes this bounded loop; a restart leaves every lease/target in PostgreSQL. */
  async run(limit = 10) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 25) throw new Error('student-portal-job-limit-invalid');
    const outcomes: string[] = [];
    for (let index = 0; index < limit; index++) {
      const job = await this.claim();
      if (!job) break;
      outcomes.push(await this.perform(job));
    }
    return { processed: outcomes.length, done: outcomes.filter((outcome) => outcome === 'done').length,
      deferred: outcomes.filter((outcome) => outcome === 'deferred').length, failed: outcomes.filter((outcome) => outcome === 'failed' || outcome === 'stale').length };
  }
}
