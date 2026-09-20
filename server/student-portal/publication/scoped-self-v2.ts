import { z } from 'zod';
import {
  selfResponseV1,
  type SelfResponseV1,
} from '../../../shared/student-portal-contracts/self-v1';
import { academicVersionSchemaV1 } from '../../../shared/gradebook-contracts/student-portal/academic-revision-v1';
import { compareSourceSubjectPresentationV1 } from '../../../shared/gradebook-contracts/source/subject-abbreviations-v1';
import { AcademicStudentReaderPostgresV1, academicToSelfV1 } from '../academic/academic-reader-v1';
import { applyPublishedVisibilityV1 } from '../policies/calendar-v1';
import type { StudentPortalPostgresQueryV1 } from '../persistence/postgres-persistence-v1';
import type { publicationContextV1 } from './self-projection-reader-v1';
import {
  dataVectorV1,
  parseDataVectorV1,
  PERIODS_V1,
  publicationDigestV1,
  type PublicationRowV1,
} from './state-v1';
import { readScopedSourcesV2 } from './scoped-source-v2';

type ContextV2 = NonNullable<Awaited<ReturnType<typeof publicationContextV1>>>;
type SubjectV2 = SelfResponseV1['subjects'][number];
type SourceV2 = NonNullable<ReturnType<AcademicStudentReaderPostgresV1['projectPreparedSourceV2']>>;
type ScopedRowV2 = Awaited<ReturnType<typeof readScopedSourcesV2>>[number];
type PeriodSelectionV2 = {
  available: readonly SubjectV2[];
  acceptedRevision: string | null;
  source?: SourceV2;
  usedLegacy: boolean;
  explicitWithdrawal: boolean;
};

const hasFacts = (period: SubjectV2['periods'][number]) =>
  period.final.kind !== 'absent' ||
  Boolean(
    period.partials?.some((partial) => partial.mark.kind === 'score' || partial.notDone === true),
  );

function sourceRevisionV2(source: SourceV2) {
  return BigInt(source.student.dataVersion.split(':')[1]!);
}

function newestSourceV2(current: SourceV2 | undefined, candidate: SourceV2 | undefined) {
  if (!candidate) return current;
  if (!current || sourceRevisionV2(candidate) > sourceRevisionV2(current)) return candidate;
  return current;
}

function preparedSourceV2(
  row: ScopedRowV2,
  revision: string,
  reader: AcademicStudentReaderPostgresV1,
  decoded: Map<string, SourceV2>,
  context: ContextV2,
) {
  const cached = decoded.get(revision);
  if (cached) return cached;
  const accountId = context.account.id;
  const source = reader.projectPreparedSourceV2(context.account.link!, revision, {
    ...z.record(z.string(), z.unknown()).parse(row.payload_json),
    account_id: accountId,
    data_version: revision,
  });
  if (!source || source.student.profile.classId !== context.policy.classId)
    throw new Error('student-portal-prepared-source-invalid');
  decoded.set(revision, source);
  return source;
}

function selectPeriodV2(
  row: ScopedRowV2,
  index: number,
  period: (typeof PERIODS_V1)[number],
  context: ContextV2,
  previous: SelfResponseV1 | null,
  legacy: readonly PublicationRowV1[],
  oldVector: readonly (string | null)[],
  reader: AcademicStudentReaderPostgresV1,
  decoded: Map<string, SourceV2>,
): PeriodSelectionV2 {
  const explicitWithdrawal = row.decision_version !== null && row.approved_revision === null;
  const revision = academicVersionSchemaV1.nullable().parse(row.target_revision);
  if (revision === null)
    return { available: [], acceptedRevision: null, usedLegacy: false, explicitWithdrawal };

  if (row.payload_json !== null && row.edition_class_id === context.policy.classId) {
    const source = preparedSourceV2(row, revision, reader, decoded, context);
    return {
      available: academicToSelfV1(source.student, context.account.id).subjects,
      acceptedRevision: revision,
      source,
      usedLegacy: false,
      explicitWithdrawal,
    };
  }

  const legacyMatches =
    row.payload_json === null &&
    previous !== null &&
    oldVector[index] === revision &&
    legacy.find((item) => item.period === period)?.publishedRevision === revision;
  return legacyMatches
    ? {
        available: previous.subjects,
        acceptedRevision: revision,
        usedLegacy: true,
        explicitWithdrawal,
      }
    : { available: [], acceptedRevision: null, usedLegacy: false, explicitWithdrawal };
}

function mergePeriodSubjectsV2(
  subjects: Map<number, SubjectV2>,
  available: readonly SubjectV2[],
  period: (typeof PERIODS_V1)[number],
) {
  for (const subject of available) {
    const selected = subject.periods.filter((item) => item.period === period && hasFacts(item));
    if (!selected.length) continue;
    const existing = subjects.get(subject.subjectId);
    subjects.set(subject.subjectId, {
      subjectId: subject.subjectId,
      label: subject.label,
      order: subject.order,
      periods: [...(existing?.periods ?? []), ...selected],
    });
  }
}

function finalAuthorityV2(
  context: ContextV2,
  previous: SelfResponseV1 | null,
  finalSource: SourceV2 | undefined,
  usedLegacy: boolean,
  explicitWithdrawal: boolean,
  accepted: readonly (string | null)[],
) {
  const sameState = finalSource
    ? finalSource.student.profile.academicState === context.profile.academicState
    : previous?.profile.academicState === context.profile.academicState;
  const sourceAuthority =
    finalSource?.finalAuthority.global ||
    (!finalSource && usedLegacy && accepted.some((revision) => revision !== null));
  return !explicitWithdrawal && Boolean(sameState && sourceAuthority);
}

function orderedSubjectsV2(
  subjects: Map<number, SubjectV2>,
  finalSource: SourceV2 | undefined,
  previous: SelfResponseV1 | null,
  accountId: string,
  finalAuthority: boolean,
  usedLegacy: boolean,
) {
  const finalSubjects = finalSource
    ? academicToSelfV1(finalSource.student, accountId).subjects
    : (previous?.subjects ?? []);
  return [...subjects.values()]
    .sort(
      (a, b) => compareSourceSubjectPresentationV1(a.label, b.label) || a.subjectId - b.subjectId,
    )
    .map((subject, order) => {
      const outcome = finalSubjects.find(
        (item) => item.subjectId === subject.subjectId,
      )?.officialOutcome;
      const hasAuthority = finalSource
        ? finalSource.finalAuthority.subjectIds.includes(subject.subjectId)
        : usedLegacy;
      return {
        ...subject,
        order,
        periods: subject.periods.sort(
          (a, b) => PERIODS_V1.indexOf(a.period) - PERIODS_V1.indexOf(b.period),
        ),
        ...(finalAuthority && hasAuthority && outcome !== undefined
          ? { officialOutcome: outcome }
          : {}),
      };
    });
}

function profileResultV2(
  context: ContextV2,
  previous: SelfResponseV1 | null,
  finalSource: SourceV2 | undefined,
  finalAuthority: boolean,
) {
  if (!finalAuthority) return context.profile.result;
  return finalSource?.student.profile.result ?? previous!.profile.result;
}

/** Auth/session/current-link validation is owned by the caller. Only this student's prepared rows are loaded. */
export async function scopedSelfV2(
  tx: StudentPortalPostgresQueryV1,
  context: ContextV2,
  previous: SelfResponseV1 | null,
  legacy: readonly PublicationRowV1[],
  requestId: string,
): Promise<SelfResponseV1> {
  const accountId = context.account.id;
  const link = context.account.link!;
  const rows = await readScopedSourcesV2(tx, accountId, link.studentId, context.policy.classId!);
  if (rows.length !== PERIODS_V1.length) throw new Error('student-portal-preparation-unavailable');
  const oldVector = previous
    ? parseDataVectorV1(previous.revisions.dataVersion)
    : PERIODS_V1.map(() => null);
  const accepted: (string | null)[] = PERIODS_V1.map(() => null);
  const subjects = new Map<number, SubjectV2>();
  const reader = new AcademicStudentReaderPostgresV1(tx);
  const decoded = new Map<string, SourceV2>();
  let finalSource: SourceV2 | undefined;
  let usedLegacy = false;
  let explicitWithdrawal = false;

  for (const [index, period] of PERIODS_V1.entries()) {
    const row = rows.find((item) => item.period === period);
    if (!row) throw new Error('student-portal-preparation-unavailable');
    const selected = selectPeriodV2(
      row,
      index,
      period,
      context,
      previous,
      legacy,
      oldVector,
      reader,
      decoded,
    );
    accepted[index] = selected.acceptedRevision;
    finalSource = newestSourceV2(finalSource, selected.source);
    usedLegacy ||= selected.usedLegacy;
    explicitWithdrawal ||= selected.explicitWithdrawal;
    mergePeriodSubjectsV2(subjects, selected.available, period);
  }

  const finalAuthority = finalAuthorityV2(
    context,
    previous,
    finalSource,
    usedLegacy,
    explicitWithdrawal,
    accepted,
  );
  const ordered = orderedSubjectsV2(
    subjects,
    finalSource,
    previous,
    accountId,
    finalAuthority,
    usedLegacy,
  );
  const projection = selfResponseV1.parse({
    contractVersion: 1,
    requestId,
    state: ordered.length ? 'ready' : 'no-publication',
    profile: {
      ...context.profile,
      result: profileResultV2(context, previous, finalSource, finalAuthority),
    },
    subjects: ordered,
    generatedAt: context.now.toISOString(),
    revisions: {
      dataVersion: dataVectorV1(accepted),
      policyVersion: context.policy.policyVersion,
      publicationVersion: `pub:${publicationDigestV1(rows.map((row) => [row.period, row.target_revision, String(row.decision_version)]))}`,
    },
  });
  return applyPublishedVisibilityV1(
    projection,
    context.policy.settings.value,
    context.now,
    finalAuthority,
  );
}
