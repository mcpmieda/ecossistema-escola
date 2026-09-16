import { z } from 'zod';
import {
  assessmentLabelV1,
  assessmentNamesSchemaV1,
} from '../../../shared/gradebook-contracts/settings/assessment-names-v1';
import {
  selfResponseV1,
  type SelfResponseV1,
} from '../../../shared/student-portal-contracts/self-v1';
import type {
  PublishedProjectionPortV1,
  PortalTransactionV1,
} from '../../../shared/student-portal-contracts/ports-v1';
import { revisionsV1, type RevisionsV1 } from '../../../shared/student-portal-contracts/core-v1';
import {
  StudentPortalPostgresPersistenceV1,
  type StudentPortalPostgresQueryV1,
  type StudentPortalPostgresSqlV1,
} from '../persistence/postgres-persistence-v1';
import { accountScopeV1, authNowV1, accountTransactionV1 } from '../auth/transaction-v1';
import { readPortalSnapshotV2 } from '../auth/read-snapshot-v2';
import { applyPublishedVisibilityV1, sessionExpiryV1 } from '../policies/calendar-v1';
import { PolicyServiceV1 } from '../policies/policy-service-v1';
import { AcademicEligibilityReaderPostgresV1 } from '../integration/lifecycle/academic-eligibility-v1';
import {
  dataVectorV1,
  parseDataVectorV1,
  PERIODS_V1,
  publicationDigestV1,
  publicationRowsV1,
} from './state-v1';
import { scopedSelfV2 } from './scoped-self-v2';

/** Fresh names/status come from the BN; the lifecycle snapshot proves the projection scope.
 * lockAccount=false is reserved for a caller-owned REPEATABLE READ READ ONLY transaction.
 */
export async function publicationContextV1(
  sql: StudentPortalPostgresSqlV1,
  tx: StudentPortalPostgresQueryV1,
  store: PortalTransactionV1,
  accountId: string,
  requireAccess = true,
  lockAccount = true,
) {
  if (lockAccount) await store.lockAccounts([accountId]);
  const account = await store.findAccount(accountId);
  if (
    !account?.link ||
    account.closedAt !== null ||
    account.blocked ||
    account.eligibility !== 'eligible'
  )
    return null;
  const eligibility = await new AcademicEligibilityReaderPostgresV1(tx).readInTransaction(
    tx,
    account.link,
  );
  if (eligibility.state !== 'eligible') return null;
  const policy = await new PolicyServiceV1(sql).readSnapshotInTransaction(
    tx,
    accountScopeV1(accountId),
  );
  const now = await authNowV1(tx);
  if (requireAccess && sessionExpiryV1(policy.settings.value, now, false) === null) return null;
  const context = { account, eligibility, policy, now };
  const rows = await tx.unsafe(
    `SELECT s.name,b.class_name,b.status,l.class_id AS observed_class,
    COALESCE(to_jsonb(y)->'assessment_names','{}'::jsonb) AS assessment_names,
    COALESCE((SELECT jsonb_agg(jsonb_build_object('id',i.assessment_id,'term',i.term,'slot',i.slot,'label',i.label))
      FROM student_portal.academic_offer_v1 o JOIN student_portal.academic_instrument_v1 i ON i.offer_id=o.offer_id
      WHERE o.academic_year=a.academic_year AND o.class_id=b.class_id AND i.slot IN (1,2)), '[]'::jsonb) AS assessments
    FROM student_portal.account a JOIN student_portal.academic_student_v1 s
      ON s.student_id=a.gradebook_student_id AND s.academic_year=a.academic_year
    JOIN student_portal.academic_binding_v1 b ON b.student_id=s.student_id AND b.academic_year=s.academic_year
    JOIN student_portal.academic_year_policy_v1 y ON y.academic_year=a.academic_year
    LEFT JOIN student_portal.lifecycle_snapshot l ON l.account_id=a.id
    WHERE a.id=$1::uuid AND b.status IS DISTINCT FROM 6`,
    [accountId],
  );
  const row = rows[0];
  if (rows.length !== 1 || !row || row.observed_class !== context.policy.classId) return null;
  const academicState =
    row.status === 2
      ? ('assisted' as const)
      : row.status === 1
        ? ('special' as const)
        : ('regular' as const);
  const profile = {
    accountId,
    link: context.account.link!,
    name: z.string().min(1).max(200).parse(row.name),
    classLabel: z.string().min(1).max(80).parse(row.class_name),
    academicState,
    result: academicState === 'assisted' ? ('not-applicable' as const) : ('in-progress' as const),
  };
  const names = assessmentNamesSchemaV1.parse(row.assessment_names ?? {});
  const assessments = z
    .array(
      z.object({
        id: z.number().int().positive(),
        term: z.number().int().min(1).max(3),
        slot: z.union([z.literal(1), z.literal(2)]),
        label: z.string().nullable(),
      }),
    )
    .max(600)
    .parse(row.assessments ?? []);
  const assessmentLabels = new Map(
    assessments.map((item) => [
      item.id,
      assessmentLabelV1(item.slot, item.term, names, item.label),
    ]),
  );
  return { ...context, profile, assessmentLabels };
}
export async function storedProjectionV1(
  tx: StudentPortalPostgresQueryV1,
  accountId: string,
): Promise<SelfResponseV1 | null> {
  const rows = await tx.unsafe(
    'SELECT payload_json FROM student_portal.published_projection WHERE account_id=$1::uuid AND academic_year=2026',
    [accountId],
  );
  if (rows.length === 0) return null;
  const projection = selfResponseV1.parse(rows[0]!.payload_json);
  if (projection.profile.accountId !== accountId)
    throw new Error('student-portal-publication-identity-conflict');
  parseDataVectorV1(projection.revisions.dataVersion);
  return projection;
}

export class SelfProjectionReaderV1 implements PublishedProjectionPortV1 {
  constructor(
    private readonly sql: StudentPortalPostgresSqlV1,
    private readonly scopedPublication = false,
  ) {}
  async read(accountId: string, requestId: string): Promise<SelfResponseV1 | null> {
    z.uuid().parse(accountId);
    const transact = this.scopedPublication ? readPortalSnapshotV2 : accountTransactionV1;
    return transact(this.sql, (tx, store) =>
      this.authorized(tx, store, accountId, requestId, this.scopedPublication),
    );
  }
  async readInTransaction(
    tx: StudentPortalPostgresQueryV1,
    accountId: string,
    requestId: string,
    snapshot = false,
  ) {
    return new StudentPortalPostgresPersistenceV1({
      unsafe: (query, parameters) => tx.unsafe(query, parameters),
      begin: (operation) => operation(tx),
    }).transaction(async (store) => {
      if (!snapshot) await store.lockAcademicYear(2026, 'shared');
      return this.authorized(tx, store, accountId, requestId, snapshot);
    });
  }
  async readAuthorized(accountId: string, expected: RevisionsV1): Promise<SelfResponseV1 | null> {
    revisionsV1.parse(expected);
    const result = await this.read(accountId, crypto.randomUUID());
    return result &&
      (['dataVersion', 'policyVersion', 'publicationVersion'] as const).every(
        (key) => result.revisions[key] === expected[key],
      )
      ? result
      : null;
  }
  private async authorized(
    tx: StudentPortalPostgresQueryV1,
    store: PortalTransactionV1,
    accountId: string,
    requestId: string,
    snapshot = false,
  ): Promise<SelfResponseV1 | null> {
    const context = await publicationContextV1(this.sql, tx, store, accountId, true, !snapshot);
    if (!context || context.account.state !== 'active') return null;
    const previous = await storedProjectionV1(tx, accountId);
    if (
      previous &&
      (previous.profile.link.studentId !== context.account.link!.studentId ||
        previous.profile.link.academicYear !== 2026)
    )
      return null;
    const rows = await publicationRowsV1(tx, accountId);
    if (this.scopedPublication)
      return labelPublishedAssessmentsV1(
        await scopedSelfV2(tx, context, previous, rows, requestId),
        context.assessmentLabels,
      );
    const vector = previous
      ? parseDataVectorV1(previous.revisions.dataVersion)
      : PERIODS_V1.map(() => null);
    const accepted = rows.map((row, index) =>
      row.publishedRevision !== null && row.publishedRevision === vector[index]
        ? row.publishedRevision
        : null,
    );
    const sameState = previous?.profile.academicState === context.profile.academicState;
    const subjects = (previous?.subjects ?? [])
      .map((subject) => ({
        ...subject,
        periods: subject.periods.filter(
          (period) => accepted[PERIODS_V1.indexOf(period.period)] !== null,
        ),
      }))
      .filter((subject) => subject.periods.length > 0);
    const projection = selfResponseV1.parse({
      contractVersion: 1,
      requestId,
      state: subjects.length ? 'ready' : 'no-publication',
      profile: {
        ...context.profile,
        result: sameState ? previous!.profile.result : context.profile.result,
      },
      subjects,
      generatedAt: previous?.generatedAt ?? context.now.toISOString(),
      revisions: {
        dataVersion: dataVectorV1(accepted),
        policyVersion: context.policy.policyVersion,
        publicationVersion: `pub:${publicationDigestV1(rows.map((row) => [row.period, row.publishedRevision]))}`,
      },
    });
    return labelPublishedAssessmentsV1(
      applyPublishedVisibilityV1(
        projection,
        context.policy.settings.value,
        context.now,
        sameState && accepted.some((revision) => revision !== null),
      ),
      context.assessmentLabels,
    );
  }
}

/** Presentation-only overlay. Frozen marks, visibility, and publication revisions stay intact. */
export function labelPublishedAssessmentsV1(
  value: SelfResponseV1,
  labels: ReadonlyMap<number, string>,
): SelfResponseV1 {
  if (!labels.size || value.state !== 'ready') return value;
  return {
    ...value,
    subjects: value.subjects.map((subject) => ({
      ...subject,
      periods: subject.periods.map((period) =>
        period.partials
          ? {
              ...period,
              partials: period.partials.map((partial) => ({
                ...partial,
                label: labels.get(partial.assessmentId) ?? partial.label,
              })),
            }
          : period,
      ),
    })),
  };
}
