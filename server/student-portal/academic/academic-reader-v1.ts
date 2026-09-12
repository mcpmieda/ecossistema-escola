import { z } from 'zod';
import { academicStudentSchemaV1, type AcademicStudentReaderV1, type AcademicStudentV1, type academicMarkSchemaV1 } from '../../../shared/gradebook-contracts/student-portal/academic-student-reader-v1';
import { academicVersionSchemaV1, portalAcademicLinkSchemaV1, type PortalAcademicLinkV1 } from '../../../shared/gradebook-contracts/student-portal/academic-revision-v1';
import { resolveEligibilityV1 } from '../../../shared/gradebook-contracts/student-portal/eligibility-v1';
import { compareSourceSubjectPresentationV1 } from '../../../shared/gradebook-contracts/source/subject-abbreviations-v1';
import type { AcademicStudentReaderPortV1 } from '../../../shared/student-portal-contracts/ports-v1';
import { selfResponseV1, type SelfResponseV1 } from '../../../shared/student-portal-contracts/self-v1';
import { resolveSimplifiedTermV1, resolveSimplifiedComponentRecoveryV1, SIMPLIFIED_TERM_MAXIMUM_MILLI_V1, type SimplifiedAcademicTermV1, type SimplifiedInstrumentSlotV1 } from '../../../src/gradebook-domain/calculations/simplified/resolve-simplified-academic-engine-v1';
import { resolveSimplifiedAnnualOutcomeV1 } from '../../../src/gradebook-domain/calculations/simplified/resolve-simplified-annual-outcome-v1';
import { ACTIVE_INSTRUMENT_PREDICATE_V1 } from '../../gradebook/persistence/postgres/active-instrument-predicate-v1';
import type { StudentPortalPostgresQueryV1 } from '../persistence/postgres-persistence-v1';

// Preserve the official predicate verbatim apart from its relation adapter. Evidence is
// instrument-wide, but only this student's value is ever selected into the snapshot.
const activeInstrument = ACTIVE_INSTRUMENT_PREDICATE_V1.replace('gradebook.nota evidence',
  '(SELECT assessment_id AS instrumento_id FROM student_portal.academic_mark_v1) evidence');

export const ACADEMIC_STUDENT_QUERY_V1 = `WITH context AS (
  SELECT a.id AS account_id,s.name,r.academic_generation||':'||r.academic_counter::text AS data_version,
    y.minimum_approval,y.max_council_components,
    COALESCE((SELECT jsonb_agg(jsonb_build_object('academicYear',b.academic_year,'studentId',b.student_id,
      'classId',b.class_id,'status',b.status,'classLabel',b.class_name)) FROM student_portal.academic_binding_v1 b
      WHERE b.academic_year=$1 AND b.student_id=$2 AND b.status IS DISTINCT FROM 6),'[]'::jsonb) AS bindings,
    (SELECT decision FROM student_portal.academic_council_decision_v1 WHERE academic_year=$1 AND student_id=$2) AS decision
  FROM student_portal.account a JOIN student_portal.academic_student_v1 s
    ON s.student_id=a.gradebook_student_id AND s.academic_year=a.academic_year
  JOIN student_portal.academic_revision r ON r.academic_year=a.academic_year
  JOIN student_portal.academic_year_policy_v1 y ON y.academic_year=a.academic_year
  WHERE a.academic_year=$1 AND a.gradebook_student_id=$2 AND a.closed_at IS NULL
), target AS (SELECT *,CASE WHEN jsonb_array_length(bindings)=1 THEN (bindings->0->>'classId')::integer ELSE NULL END AS class_id FROM context)
SELECT target.*,COALESCE((SELECT jsonb_agg(jsonb_build_object(
  'offerId',o.offer_id,'subjectId',o.subject_id,'label',o.subject_label,
  'instruments',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',i.id,'term',i.trimestre,'slot',i.slot,
      'maximum',i.maximo,'label',i.descricao,'value',n.value) ORDER BY i.trimestre,i.slot)
    FROM (SELECT assessment_id AS id,offer_id AS oferta_id,term AS trimestre,slot,maximum AS maximo,label AS descricao
      FROM student_portal.academic_instrument_v1) i
    LEFT JOIN student_portal.academic_mark_v1 n ON n.assessment_id=i.id AND n.student_id=$2
    WHERE i.oferta_id=o.offer_id AND ${activeInstrument}),'[]'::jsonb),
  'closure',(SELECT jsonb_build_object('am1',f.am1_fonte,'am2',f.am2_fonte,'am3',f.am3_fonte,
    'rec1',f.rec1,'rec2',f.rec2,'rec3',f.rec3,'nc',f.rec_nc_mask,'rr',f.rec_rr_mask,'annual',f.u_fonte)
    FROM student_portal.academic_closure_v1 f WHERE f.offer_id=o.offer_id AND f.student_id=$2)))
  FROM (SELECT * FROM student_portal.academic_offer_v1 WHERE academic_year=$1 AND class_id=target.class_id
    ORDER BY offer_id LIMIT 101) o),'[]'::jsonb) AS offers FROM target`;

const milli = z.number().int().safe().nonnegative();
const id = z.number().int().safe().positive();
const instrumentSchema = z.object({ id, term: z.union([z.literal(1), z.literal(2), z.literal(3)]), slot: id,
  maximum: milli.positive().nullable(), value: milli.nullable(), label: z.string().nullable() });
const closureSchema = z.object({ am1: milli.nullable(), am2: milli.nullable(), am3: milli.nullable(), rec1: milli.nullable(),
  rec2: milli.nullable(), rec3: milli.nullable(), nc: z.number().int().min(0).max(7), rr: z.number().int().min(0).max(7), annual: milli.nullable() });
const offerSchema = z.object({ offerId: id, subjectId: id, label: z.string().min(1).max(120), instruments: z.array(instrumentSchema).max(39), closure: closureSchema.nullable() });
type Mark = z.infer<typeof academicMarkSchemaV1>;

function mark(value: number | null, maximumMilli: number | null): Mark {
  return value === null ? { kind: 'absent' } : { kind: 'score', valueMilli: value, maximumMilli, meetsMinimum: null };
}

function instrumentLabel(slot: number, label: string | null): string {
  if (label?.trim()) return label.trim();
  return slot === 1 ? 'Avaliação 1' : slot === 2 ? 'Avaliação 2' : slot === 3 ? 'Recuperação paralela' : `Atividade qualitativa ${slot - 10}`;
}

/** Explicit projection: internal annual facts, class id and source metadata never spread to self. */
export function academicToSelfV1(student: AcademicStudentV1, accountId: string): Pick<SelfResponseV1, 'profile' | 'subjects'> {
  const source = academicStudentSchemaV1.parse(student);
  const convert = (value: Mark): SelfResponseV1['subjects'][number]['periods'][number]['final'] => value.kind === 'score'
    ? { kind: 'score', value: value.valueMilli / 1000, maximum: value.maximumMilli === null ? null : value.maximumMilli / 1000, meetsMinimum: value.meetsMinimum }
    : { kind: value.kind };
  const profile = selfResponseV1.shape.profile.parse({ accountId, link: source.link, name: source.profile.name,
    classLabel: source.profile.classLabel, academicState: source.profile.academicState, result: source.profile.result });
  const subjects = selfResponseV1.shape.subjects.parse(source.subjects.map((subject) => ({
    subjectId: subject.subjectId, label: subject.label, order: subject.order,
    ...(subject.officialOutcome === undefined ? {} : { officialOutcome: subject.officialOutcome }),
    periods: subject.periods.map((period) => ({ period: period.period, final: convert(period.final),
      ...(period.partials === undefined ? {} : { partials: period.partials.map((assessment) => ({ assessmentId: assessment.assessmentId,
        label: assessment.label, mark: convert(assessment.mark) })) }) })),
  })));
  return { profile, subjects };
}

export class AcademicStudentReaderPostgresV1 implements AcademicStudentReaderV1<StudentPortalPostgresQueryV1>, AcademicStudentReaderPortV1 {
  constructor(private readonly sql: StudentPortalPostgresQueryV1) {}

  async readOfficial(link: PortalAcademicLinkV1, expectedDataVersion: string) {
    const result = await this.snapshot(this.sql, link, expectedDataVersion);
    return result === null ? null : { dataVersion: result.student.dataVersion, ...academicToSelfV1(result.student, result.accountId) };
  }

  async readOfficialInTransaction(tx: StudentPortalPostgresQueryV1, link: PortalAcademicLinkV1, expectedDataVersion: string): Promise<AcademicStudentV1 | null> {
    return (await this.snapshot(tx, link, expectedDataVersion))?.student ?? null;
  }

  private async snapshot(tx: StudentPortalPostgresQueryV1, input: PortalAcademicLinkV1, expectedDataVersion: string) {
    const link = portalAcademicLinkSchemaV1.parse(input);
    academicVersionSchemaV1.parse(expectedDataVersion);
    const rows = await tx.unsafe(ACADEMIC_STUDENT_QUERY_V1, [link.academicYear, link.studentId]);
    if (rows.length !== 1 || rows[0]!.data_version !== expectedDataVersion) return null;
    const row = rows[0]!;
    const bindings = z.array(z.object({ academicYear: z.literal(2026), studentId: id, classId: id,
      status: z.union([z.null(), z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5), z.literal(7)]), classLabel: z.string().min(1).max(80) })).parse(row.bindings);
    const eligibility = resolveEligibilityV1(link, expectedDataVersion, bindings.map(({ classLabel: _label, ...binding }) => binding));
    if (eligibility.state !== 'eligible' || eligibility.current === null) return null;
    const status = eligibility.current.status;
    const minimum = milli.positive().parse(row.minimum_approval);
    const maxCouncil = milli.parse(row.max_council_components);
    const decision = z.union([z.null(), z.literal(1), z.literal(2), z.literal(3)]).parse(row.decision);
    const offers = z.array(offerSchema).max(100).parse(row.offers)
      .sort((a, b) => compareSourceSubjectPresentationV1(a.label, b.label) || a.subjectId - b.subjectId || a.offerId - b.offerId);
    const projections = offers.map((offer, order) => {
      const terms = ([1, 2, 3] as const).map((term) => resolveSimplifiedTermV1({ term, instruments: offer.instruments
        .filter((item) => item.term === term).map((item) => ({ slot: item.slot as SimplifiedInstrumentSlotV1, maximumMilli: item.maximum, valueMilli: item.value })) })) as unknown as Parameters<typeof resolveSimplifiedComponentRecoveryV1>[0]['terms'];
      const recoveryValue = (term: SimplifiedAcademicTermV1) => {
        const closure = offer.closure;
        if (closure === null) return null;
        const bit = 1 << (term - 1);
        return (closure.rr & bit) !== 0 ? 'RR' as const : (closure.nc & bit) !== 0 ? 'NC' as const : closure[`rec${term}`];
      };
      const recovery = resolveSimplifiedComponentRecoveryV1({ terms, minimumApprovalMilli: minimum,
        recovery: { 1: recoveryValue(1), 2: recoveryValue(2), 3: recoveryValue(3) } });
      const periods: AcademicStudentV1['subjects'][number]['periods'] = ([1, 2, 3] as const).map((term) => ({
        period: `T${term}`, final: mark(offer.closure?.[`am${term}`] ?? null, SIMPLIFIED_TERM_MAXIMUM_MILLI_V1[term]),
        partials: offer.instruments.filter((item) => item.term === term).map((item) => ({
          assessmentId: item.id, label: instrumentLabel(item.slot, item.label), mark: mark(item.value, item.maximum) })),
      }));
      for (const term of [1, 2, 3] as const) {
        const rec = recovery.recoveryTerms[term];
        if (rec.applicable !== true) continue;
        periods.push({ period: `REC${term}`, final: rec.source === 'RR' ? { kind: 'rr' } : rec.source === 'NC' ? { kind: 'nc' }
          : rec.source === null ? { kind: 'recovery-pending' } : mark(rec.source, SIMPLIFIED_TERM_MAXIMUM_MILLI_V1[term]) });
      }
      const classification = recovery.classification;
      const officialOutcome = status === 2 ? undefined : classification === 'approved-direct' || classification === 'approved-after-recovery'
        ? 'approved' as const : ['not-approved', 'failed-no-show', 'failed-repeat'].includes(classification) ? 'failed' as const : undefined;
      return { recovery, subject: { subjectId: offer.subjectId, label: offer.label, order, periods,
        officialAnnual: mark(offer.closure?.annual ?? null, null), ...(officialOutcome === undefined ? {} : { officialOutcome }) } };
    });
    const annual = resolveSimplifiedAnnualOutcomeV1({ status, components: projections.map((item) => item.recovery), maxCouncilComponents: maxCouncil });
    const hasRepeat = projections.some((item) => item.recovery.classification === 'failed-repeat');
    const formal = (status === null || status === 7) && !hasRepeat ? decision : null;
    const result = status === 2 ? 'not-applicable' : formal === 1 ? 'approved' : formal === 2 ? 'failed' : formal === 3 ? 'failed-attendance'
      : annual.visibleResult?.startsWith('APROVADO') ? 'approved' : annual.visibleResult?.startsWith('REPROVADO') ? 'failed' : 'in-progress';
    const student = academicStudentSchemaV1.parse({ contractVersion: 1, link, dataVersion: expectedDataVersion,
      profile: { name: row.name, classId: eligibility.current.classId, classLabel: bindings[0]!.classLabel,
        academicState: status === 2 ? 'assisted' : status === 1 ? 'special' : 'regular', result },
      subjects: projections.map((item) => item.subject) });
    return { student, accountId: z.uuid().parse(row.account_id) };
  }
}
