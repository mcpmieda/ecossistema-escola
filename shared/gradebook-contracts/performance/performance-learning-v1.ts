import { z } from 'zod';

const count = z.number().int().nonnegative().max(100_000);
const id = z.number().int().positive().max(2_147_483_647);
const metric = z.number().finite().nullable();
const term = z.union([z.literal(1), z.literal(2), z.literal(3)]);
const participation = z.object({
  percent: metric,
  deltaPP: metric,
  components: count,
  comparedComponents: count,
  recorded: count,
  expected: count,
  unscaled: count,
}).strict();
export const performanceLearningSchemaV1 = z.object({
  version: z.literal(1),
  students: z.array(z.object({
    studentId: id,
    recurrenceAssessed: z.boolean(),
    recurring: z.array(z.object({
      offerId: id,
      instrumentTerms: z.array(term).max(3),
      consecutiveTerms: z.array(term).max(2),
    }).strict()).max(40),
    participation,
    parallelImprovements: count,
  }).strict()).max(150),
  participation: z.object({
    percent: metric,
    deltaPP: metric,
    students: count,
    comparedStudents: count,
    recorded: count,
    expected: count,
    unscaled: count,
  }).strict(),
  dimensions: z.object({
    quantitativePercent: metric,
    qualitativePercent: metric,
    gapPP: metric,
    students: count,
    components: count,
  }).strict(),
  parallel: z.object({ students: count, improvements: count, meanGainPP: metric }).strict(),
  activitiesToReview: z.array(z.string().regex(/^\d+:[123]:\d+$/u)).max(1000),
}).strict().superRefine((value, ctx) => {
  const invalid = value.students.some((student) => {
    const p = student.participation;
    return p.recorded > p.expected || p.unscaled > p.expected ||
      p.comparedComponents > p.components ||
      new Set(student.recurring.map((item) => item.offerId)).size !== student.recurring.length ||
      student.recurring.some((item) =>
        item.instrumentTerms.length + item.consecutiveTerms.length === 0 ||
        item.consecutiveTerms.includes(1));
  });
  if (invalid || new Set(value.students.map((item) => item.studentId)).size !== value.students.length ||
    new Set(value.activitiesToReview).size !== value.activitiesToReview.length ||
    value.participation.students > value.students.length ||
    value.participation.comparedStudents > value.participation.students ||
    value.dimensions.students > value.students.length || value.parallel.students > value.students.length)
    ctx.addIssue({ code: 'custom', message: 'inconsistent learning evidence' });
});
export type PerformanceLearningV1 = z.infer<typeof performanceLearningSchemaV1>;

/** Category recognition only. Identity remains offer/term/slot; never merge similarly named rows.
 * Keep the grammar anchored: "parte", "partido" and compound activity names are not participation.
 * Apply this only to qualitative slots. Unknown descriptions remain ordinary qualitative work. */
export function isParticipationLabelV1(label: string): boolean {
  const normalized = label.replace(/[ºª°]/gu, '').normalize('NFD')
    .replace(/\p{M}/gu, '').toLocaleLowerCase('pt-BR')
    .replace(/[._():-]/gu, ' ').replace(/\s+/gu, ' ').trim();
  const ordinal = '(?:0?[1-9]|1[0-9]|20|i|ii|iii|iv|v|vi|vii|viii|ix|x|xi|xii|xiii|xiv|xv|xvi|xvii|xviii|xix|xx)';
  const name = '(?:participacao|participacoes|particip|participac|partic|partc|part)';
  return new RegExp(`^(?:${name}|${ordinal}\\s*${name}|${name}\\s*${ordinal})$`, 'u').test(normalized);
}
