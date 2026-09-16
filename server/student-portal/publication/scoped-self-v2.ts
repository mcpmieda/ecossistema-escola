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
const hasFacts = (period: SubjectV2['periods'][number]) =>
  period.final.kind !== 'absent' ||
  Boolean(
    period.partials?.some((partial) => partial.mark.kind === 'score' || partial.notDone === true),
  );

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
    if (row.decision_version !== null && row.approved_revision === null) explicitWithdrawal = true;
    const revision = academicVersionSchemaV1.nullable().parse(row.target_revision);
    if (revision === null) continue;
    let available: readonly SubjectV2[] = [];
    if (row.payload_json !== null && row.edition_class_id === context.policy.classId) {
      let source = decoded.get(revision);
      if (!source) {
        const projected = reader.projectPreparedSourceV2(link, revision, {
          ...z.record(z.string(), z.unknown()).parse(row.payload_json),
          account_id: accountId,
          data_version: revision,
        });
        if (!projected || projected.student.profile.classId !== context.policy.classId)
          throw new Error('student-portal-prepared-source-invalid');
        source = projected;
        decoded.set(revision, source);
      }
      available = academicToSelfV1(source.student, accountId).subjects;
      if (
        !finalSource ||
        BigInt(source.student.dataVersion.split(':')[1]!) >
          BigInt(finalSource.student.dataVersion.split(':')[1]!)
      )
        finalSource = source;
      accepted[index] = revision;
    } else if (
      row.payload_json === null &&
      previous &&
      oldVector[index] === revision &&
      legacy.find((item) => item.period === period)?.publishedRevision === revision
    ) {
      // An older edition may predate the new source store. Keep its exact approved payload, never substitute current marks.
      available = previous.subjects;
      accepted[index] = revision;
      usedLegacy = true;
    }
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
  const sameState = finalSource
    ? finalSource.student.profile.academicState === context.profile.academicState
    : previous?.profile.academicState === context.profile.academicState;
  const finalAuthority =
    !explicitWithdrawal &&
    Boolean(
      sameState &&
      (finalSource?.finalAuthority.global ||
        (!finalSource && usedLegacy && accepted.some((revision) => revision !== null))),
    );
  const finalSubjects = finalSource
    ? academicToSelfV1(finalSource.student, accountId).subjects
    : (previous?.subjects ?? []);
  const ordered = [...subjects.values()]
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
  const projection = selfResponseV1.parse({
    contractVersion: 1,
    requestId,
    state: ordered.length ? 'ready' : 'no-publication',
    profile: {
      ...context.profile,
      result: finalAuthority
        ? (finalSource?.student.profile.result ?? previous!.profile.result)
        : context.profile.result,
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
