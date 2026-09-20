import {
  selfResponseV1,
  type SelfResponseV1,
} from '../../../shared/student-portal-contracts/self-v1';
import type { StudentPortalPostgresSqlV1 } from '../persistence/postgres-persistence-v1';
import { AcademicStudentReaderPostgresV1, academicToSelfV1 } from '../academic/academic-reader-v1';
import { accountScopeV1, authNowV1, accountTransactionV1 } from '../auth/transaction-v1';
import { applyPublishedVisibilityV1, type PolicyValueV1 } from '../policies/calendar-v1';
import { publicationContextV1, storedProjectionV1 } from '../publication/self-projection-reader-v1';
import {
  currentRevisionV1,
  dataVectorV1,
  jobMaskV1,
  jobPolicyVersionV1,
  jobPublicationVersionV1,
  parseDataVectorV1,
  PERIODS_V1,
  publicationDigestV1,
  publicationKeyV1,
  publicationMaskV1,
  publicationRowsV1,
  type PeriodV1,
} from '../publication/state-v1';
import { claimJobV1, failJobV1, finishJobV1, type ClaimedJobV1 } from './queue-v1';
import { compareSourceSubjectPresentationV1 } from '../../../shared/gradebook-contracts/source/subject-abbreviations-v1';
import type { PortalTransactionV1 } from '../../../shared/student-portal-contracts/ports-v1';

const SYSTEM_ACTOR = '00000000-0000-4000-8000-000000000712';

function periodStartV1(policy: PolicyValueV1, period: PeriodV1) {
  const calendar = policy.calendar;
  if (period === 'T1') return calendar.yearStartsAt;
  if (period === 'T2') return calendar.t2StartsAt ?? calendar.t1EndsAt;
  if (period === 'T3') return calendar.t3StartsAt ?? calendar.t2EndsAt;
  return calendar.recoveriesStartAt;
}

function periodDisclosureV1(policy: PolicyValueV1, period: PeriodV1) {
  const disclosure = policy.calendar.disclosure;
  if (disclosure.mode === 'single')
    return disclosure.periods.includes(period) ? disclosure.at : undefined;
  return disclosure.at[period];
}

export function disclosureDueV1(policy: PolicyValueV1, periods: readonly PeriodV1[]): Date | null {
  const calendar = policy.calendar;
  if (!policy.accessEnabled || !calendar.yearStartsAt || !calendar.yearEndsAt) return null;
  let due = Date.parse(calendar.yearStartsAt);
  for (const period of periods) {
    if (!policy.allowedPeriods.includes(period)) return null;
    const start = periodStartV1(policy, period);
    const disclosure = periodDisclosureV1(policy, period);
    if (!start || disclosure === undefined) return null;
    due = Math.max(due, Date.parse(start), disclosure ? Date.parse(disclosure) : Date.parse(start));
  }
  return due < Date.parse(calendar.yearEndsAt) ? new Date(due) : null;
}
function hasFacts(period: SelfResponseV1['subjects'][number]['periods'][number]): boolean {
  return (
    period.final.kind !== 'absent' ||
    Boolean(
      period.partials?.some((partial) => partial.mark.kind === 'score' || partial.notDone === true),
    )
  );
}

type PublicationContextJobV1 = NonNullable<Awaited<ReturnType<typeof publicationContextV1>>>;
type PublicationRowsJobV1 = Awaited<ReturnType<typeof publicationRowsV1>>;
type PublicationSubjectV1 = SelfResponseV1['subjects'][number];

async function assertCurrentJobV1(
  tx: Parameters<typeof currentRevisionV1>[0],
  job: ClaimedJobV1,
  rows: PublicationRowsJobV1,
  mask: number,
) {
  if (jobPublicationVersionV1(mask, rows) !== job.publicationVersion)
    throw new Error('student-portal-publication-stale');
  if ((await jobPolicyVersionV1(tx, job.accountId)) !== job.policyVersion)
    throw new Error('student-portal-publication-stale');
  if (mask !== 0 && (await currentRevisionV1(tx)) !== job.dataVersion)
    throw new Error('student-portal-publication-stale');
}

async function swapAndFinishV1(
  tx: Parameters<typeof finishJobV1>[0],
  store: PortalTransactionV1,
  job: ClaimedJobV1,
  projection: SelfResponseV1,
) {
  if (!(await store.swapProjection(job.accountId, projection, projection.revisions)))
    throw new Error('student-portal-publication-stale');
  if (!(await finishJobV1(tx, job, await authNowV1(tx))))
    throw new Error('student-portal-publication-stale');
}

async function performPolicyOnlyV1(
  tx: Parameters<typeof finishJobV1>[0],
  store: PortalTransactionV1,
  job: ClaimedJobV1,
  rows: PublicationRowsJobV1,
  context: PublicationContextJobV1,
) {
  // Policy-only work cannot promote any academic fact, even when the source advanced with auto-update OFF.
  const previous = await storedProjectionV1(tx, job.accountId);
  const oldVector = previous
    ? parseDataVectorV1(previous.revisions.dataVersion)
    : PERIODS_V1.map(() => null);
  const vector = rows.map((row, index) =>
    oldVector[index] === row.publishedRevision ? row.publishedRevision : null,
  );
  const subjects = (previous?.subjects ?? [])
    .map((subject) => ({
      ...subject,
      periods: subject.periods.filter(
        (period) => vector[PERIODS_V1.indexOf(period.period)] !== null,
      ),
    }))
    .filter((subject) => subject.periods.length);
  const sameState = previous?.profile.academicState === context.profile.academicState;
  const projection = applyPublishedVisibilityV1(
    selfResponseV1.parse({
      contractVersion: 1,
      requestId: crypto.randomUUID(),
      state: subjects.length ? 'ready' : 'no-publication',
      profile: {
        ...context.profile,
        result: sameState ? previous!.profile.result : context.profile.result,
      },
      subjects,
      generatedAt: previous?.generatedAt ?? context.now.toISOString(),
      revisions: {
        dataVersion: dataVectorV1(vector),
        policyVersion: context.policy.policyVersion,
        publicationVersion: `pub:${publicationDigestV1(
          rows.map((row) => [row.period, row.publishedRevision]),
        )}`,
      },
    }),
    context.policy.settings.value,
    context.now,
    sameState && vector.some((revision) => revision !== null),
  );
  await swapAndFinishV1(tx, store, job, projection);
  return 'done' as const;
}

function authorizedFreshV1(
  source: NonNullable<
    Awaited<ReturnType<AcademicStudentReaderPostgresV1['readPublicationSourceInTransaction']>>
  >,
  accountId: string,
) {
  const fresh = academicToSelfV1(source.student, accountId);
  fresh.subjects = fresh.subjects.map(({ officialOutcome, ...subject }) => ({
    ...subject,
    ...(source.finalAuthority.subjectIds.includes(subject.subjectId) && officialOutcome !== undefined
      ? { officialOutcome }
      : {}),
  }));
  return fresh;
}

function nextDataVectorV1(
  previous: SelfResponseV1 | null,
  rows: PublicationRowsJobV1,
  selected: readonly PeriodV1[],
  revision: string,
) {
  const oldVector = previous
    ? parseDataVectorV1(previous.revisions.dataVersion)
    : PERIODS_V1.map(() => null);
  const nextVector = rows.map((row, index) =>
    oldVector[index] === row.publishedRevision ? row.publishedRevision : null,
  );
  for (const period of selected) nextVector[PERIODS_V1.indexOf(period)] = revision;
  return nextVector;
}

function mergedSubjectsV1(
  previous: SelfResponseV1 | null,
  fresh: SelfResponseV1,
  selected: readonly PeriodV1[],
  nextVector: readonly (string | null)[],
) {
  const subjects = new Map<number, PublicationSubjectV1>();
  for (const subject of previous?.subjects ?? []) {
    const periods = subject.periods.filter(
      (period) =>
        !selected.includes(period.period) &&
        nextVector[PERIODS_V1.indexOf(period.period)] !== null,
    );
    if (periods.length) subjects.set(subject.subjectId, { ...subject, periods });
  }
  for (const subject of fresh.subjects) {
    const periods = subject.periods.filter((period) => selected.includes(period.period));
    if (!periods.length) continue;
    const previousSubject = subjects.get(subject.subjectId);
    subjects.set(subject.subjectId, {
      ...subject,
      periods: [...(previousSubject?.periods ?? []), ...periods].sort(
        (a, b) => PERIODS_V1.indexOf(a.period) - PERIODS_V1.indexOf(b.period),
      ),
    });
  }
  return [...subjects.values()]
    .sort(
      (a, b) =>
        compareSourceSubjectPresentationV1(a.label, b.label) || a.subjectId - b.subjectId,
    )
    .map((subject, order) => ({ ...subject, order }));
}

function filterVisibleFactsV1(projection: SelfResponseV1) {
  const subjects = projection.subjects
    .map((subject) => ({ ...subject, periods: subject.periods.filter(hasFacts) }))
    .filter((subject) => subject.periods.length);
  return selfResponseV1.parse({
    ...projection,
    state: subjects.length ? 'ready' : 'no-publication',
    subjects,
  });
}

async function buildAcademicProjectionV1(
  tx: Parameters<typeof currentRevisionV1>[0],
  job: ClaimedJobV1,
  rows: PublicationRowsJobV1,
  context: PublicationContextJobV1,
  selected: readonly PeriodV1[],
) {
  const source = await new AcademicStudentReaderPostgresV1(tx).readPublicationSourceInTransaction(
    tx,
    context.account.link!,
    job.dataVersion,
  );
  if (!source) throw new Error('student-portal-publication-stale');
  const fresh = authorizedFreshV1(source, job.accountId);
  const previous = await storedProjectionV1(tx, job.accountId);
  const nextVector = nextDataVectorV1(previous, rows, selected, job.dataVersion);
  const ordered = mergedSubjectsV1(previous, fresh, selected, nextVector);
  const now = await authNowV1(tx);
  const projection = applyPublishedVisibilityV1(
    selfResponseV1.parse({
      contractVersion: 1,
      requestId: crypto.randomUUID(),
      state: ordered.length ? 'ready' : 'no-publication',
      profile: fresh.profile,
      subjects: ordered,
      generatedAt: now.toISOString(),
      revisions: {
        dataVersion: dataVectorV1(nextVector),
        policyVersion: context.policy.policyVersion,
        publicationVersion: `pub:${publicationDigestV1(
          rows.map((row) => [
            row.period,
            selected.includes(row.period) ? job.dataVersion : row.publishedRevision,
          ]),
        )}`,
      },
    }),
    context.policy.settings.value,
    now,
    source.finalAuthority.global,
  );
  return { projection: filterVisibleFactsV1(projection), now };
}

async function deferJobV1(
  tx: Parameters<typeof finishJobV1>[0],
  job: ClaimedJobV1,
  due: Date,
) {
  await tx.unsafe(
    `UPDATE student_portal.publication_job SET state='queued',lease_until=NULL,next_attempt_at=$2::timestamptz,
    updated_at=statement_timestamp() WHERE id=$1::uuid`,
    [job.id, due.toISOString()],
  );
  return 'deferred' as const;
}

async function commitAcademicJobV1(
  tx: Parameters<typeof finishJobV1>[0],
  store: PortalTransactionV1,
  job: ClaimedJobV1,
  rows: PublicationRowsJobV1,
  context: PublicationContextJobV1,
  selected: readonly PeriodV1[],
) {
  const due = disclosureDueV1(context.policy.settings.value, selected);
  if (!due || Date.parse(context.policy.settings.value.calendar.yearEndsAt!) <= context.now.getTime())
    throw new Error('student-portal-publication-policy-unavailable');
  if (due.getTime() > context.now.getTime()) return deferJobV1(tx, job, due);

  const { projection, now } = await buildAcademicProjectionV1(tx, job, rows, context, selected);
  // Both current source and authorization fencing are checked in the same physical transaction as the swap.
  if ((await currentRevisionV1(tx)) !== job.dataVersion)
    throw new Error('student-portal-publication-stale');
  if ((await jobPolicyVersionV1(tx, job.accountId)) !== job.policyVersion)
    throw new Error('student-portal-publication-stale');

  for (const period of selected)
    await tx.unsafe(
      `UPDATE student_portal.publication SET published_revision=$3,
      state=CASE WHEN available_revision=$3 THEN 'published' ELSE 'update-pending' END,updated_at=$4::timestamptz
      WHERE scope_key=$1 AND period=$2`,
      [publicationKeyV1(job.accountId), period, job.dataVersion, now.toISOString()],
    );
  await swapAndFinishV1(tx, store, job, projection);
  await store.appendAudit({
    eventId: crypto.randomUUID(),
    at: now.toISOString(),
    actorId: SYSTEM_ACTOR,
    accountId: job.accountId,
    scope: accountScopeV1(job.accountId),
    kind: 'projection-updated',
    result: 'success',
    requestId: job.id,
    version: context.account.version,
    maskedIp: null,
  });
  return 'done' as const;
}

async function failPublicationJobV1(
  sql: StudentPortalPostgresSqlV1,
  job: ClaimedJobV1,
  error: unknown,
) {
  const terminal =
    error instanceof Error &&
    [
      'student-portal-publication-stale',
      'student-portal-publication-policy-unavailable',
    ].includes(error.message);
  await accountTransactionV1(sql, async (tx, store) => {
    await store.lockAccounts([job.accountId]);
    await failJobV1(tx, job, await authNowV1(tx), terminal);
  });
  return terminal ? ('stale' as const) : ('failed' as const);
}

export class PublicationJobsV1 {
  constructor(private readonly sql: StudentPortalPostgresSqlV1) {}
  async claim(): Promise<ClaimedJobV1 | null> {
    return accountTransactionV1(this.sql, async (tx) => claimJobV1(tx, await authNowV1(tx)));
  }

  async perform(job: ClaimedJobV1): Promise<'done' | 'stale' | 'deferred' | 'failed'> {
    try {
      return await accountTransactionV1(this.sql, async (tx, store) => {
        // Account precedes job row locks, matching mutations and reset/lifecycle producers.
        await store.lockAccounts([job.accountId]);
        const owned = await tx.unsafe(
          `SELECT id FROM student_portal.publication_job WHERE id=$1::uuid AND state='running'
          AND attempts=$2 AND lease_until=$3::timestamptz AND lease_until>statement_timestamp() FOR UPDATE`,
          [job.id, job.attempts, job.leaseUntil],
        );
        if (owned.length !== 1) return 'stale';

        const rows = await publicationRowsV1(tx, job.accountId);
        const mask = jobMaskV1(job.publicationVersion);
        await assertCurrentJobV1(tx, job, rows, mask);
        const context = await publicationContextV1(this.sql, tx, store, job.accountId, false);
        if (!context) throw new Error('student-portal-publication-stale');
        if (mask === 0) return performPolicyOnlyV1(tx, store, job, rows, context);

        const selected = PERIODS_V1.filter(
          (period) => (mask & publicationMaskV1(period)) !== 0,
        );
        return commitAcademicJobV1(tx, store, job, rows, context, selected);
      });
    } catch (error) {
      return failPublicationJobV1(this.sql, job, error);
    }
  }

  /** scheduled invokes this bounded loop; a restart leaves every lease/target in PostgreSQL. */
  async run(limit = 10) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 25)
      throw new Error('student-portal-job-limit-invalid');
    const outcomes: string[] = [];
    for (let index = 0; index < limit; index++) {
      const job = await this.claim();
      if (!job) break;
      outcomes.push(await this.perform(job));
    }
    return {
      processed: outcomes.length,
      done: outcomes.filter((outcome) => outcome === 'done').length,
      deferred: outcomes.filter((outcome) => outcome === 'deferred').length,
      failed: outcomes.filter((outcome) => outcome === 'failed' || outcome === 'stale').length,
      unavailable: outcomes.filter((outcome) => outcome === 'failed').length,
    };
  }
}
