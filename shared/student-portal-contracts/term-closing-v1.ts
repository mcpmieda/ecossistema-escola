import { z } from 'zod';

/*
 * Fechamento do trimestre (#1132). Spec: docs/student-portal/TRIMESTER_CLOSING_SPEC.md.
 * The server emits only message codes and variant indices; this catalog is the single source of
 * wording for the student page and the admin preview. DRAFT pending school approval (D6): the
 * feature stays behind the `showTermClosing` policy, off by default, until the catalog is approved.
 * R1: phrases never carry numbers, ranges or activity names; only `{disciplina}`, `{lista}` and
 * `{trimestre}` placeholders are filled at render time.
 */
export const TERM_CLOSING_CATALOG_V1 = {
  'conclusion.good-with-point': [
    'Seu trimestre foi bom, mas há um ponto para cuidar.',
    'Você foi bem neste trimestre, e ainda dá para ajustar um detalhe.',
    'Bom trimestre! Só um ponto merece sua atenção.',
  ],
  'conclusion.attention': [
    'Esta disciplina pede sua atenção.',
    'Neste trimestre, esta disciplina precisa de mais cuidado.',
    'Vale dar uma atenção especial a esta disciplina.',
  ],
  'conclusion.recovery': [
    'Nesta disciplina, o próximo passo é a recuperação.',
    'Você vai fazer a recuperação nesta disciplina.',
    'Esta disciplina segue para a recuperação.',
  ],
  'weight.assessments': [
    'As avaliações foram o principal ponto de preocupação.',
    'O que mais pesou neste trimestre foram as avaliações.',
    'As avaliações foram a parte mais difícil deste trimestre.',
  ],
  'weight.not-done': [
    'Algumas atividades ficaram sem ser feitas, e isso pesou.',
    'Houve atividades não realizadas neste trimestre, e elas fizeram falta.',
    'Atividades que ficaram para trás pesaram no seu resultado.',
  ],
  'weight.activities': [
    'As atividades do dia a dia foram um desafio para você.',
    'As atividades ao longo do trimestre foram o principal ponto de atenção.',
    'O que mais pesou foram as atividades do dia a dia.',
  ],
  'strength.activities': [
    'Suas atividades ao longo do trimestre ajudaram seu resultado.',
    'Você foi bem nas atividades do dia a dia.',
    'As atividades do trimestre foram um ponto forte seu.',
  ],
  'strength.assessments': [
    'Você foi bem nas avaliações.',
    'As avaliações foram um ponto forte seu neste trimestre.',
    'Seu desempenho nas avaliações ajudou bastante.',
  ],
  'strength.all-done': [
    'Você fez todas as atividades do trimestre.',
    'Nenhuma atividade ficou para trás, e isso conta muito.',
    'Você manteve todas as atividades em dia.',
  ],
  'strength.parallel-done': [
    'Você fez a prova paralela e aproveitou a chance de recuperar.',
    'Você também fez a prova paralela deste trimestre.',
    'Você não deixou passar a prova paralela.',
  ],
  'action.catch-up': [
    'Agora: procure fazer todas as próximas atividades.',
    'Agora: não deixe nenhuma atividade para trás no próximo trimestre.',
    'Agora: mantenha todas as atividades em dia daqui para frente.',
  ],
  'action.assessments': [
    'Agora: prepare-se com antecedência para as próximas avaliações.',
    'Agora: dedique um tempo extra às próximas avaliações.',
    'Agora: foque nas próximas avaliações desta disciplina.',
  ],
  'action.keep': [
    'Agora: continue nesse ritmo.',
    'Agora: mantenha o que está dando certo.',
    'Agora: siga do mesmo jeito no próximo trimestre.',
  ],
  'action.recovery': [
    'Agora: prepare-se para a recuperação desta disciplina.',
    'Agora: use este tempo para se preparar para a recuperação.',
    'Agora: foque na recuperação. É a sua chance nesta disciplina.',
  ],
  'line.good': [
    'Você fechou bem este trimestre.',
    'Bom trimestre nesta disciplina. Continue assim.',
    'Tudo em ordem neste trimestre.',
    'Você foi bem neste trimestre.',
    'Belo trimestre nesta disciplina.',
    'Trimestre bem fechado. Siga assim.',
  ],
  'line.year-good': [
    'Você fechou bem o último trimestre desta disciplina.',
    'Bom fechamento de ano nesta disciplina.',
    'Você terminou bem o ano nesta disciplina.',
  ],
  'summary.all-good': [
    'Você fechou bem o {trimestre} em todas as disciplinas.',
    'Todas as suas disciplinas fecharam bem no {trimestre}.',
    'Ótimo {trimestre}: todas as disciplinas fecharam bem.',
  ],
  // `{pede}`/`{merece}` resolve singular/plural from the list size (never a number).
  'summary.few-attention': [
    'Você fechou bem o {trimestre} na maior parte das disciplinas. {lista} {pede} sua atenção.',
    'Bom {trimestre} na maioria das disciplinas. Vale cuidar de {lista}.',
    'A maior parte das suas disciplinas fechou bem no {trimestre}. {lista} {merece} mais atenção.',
  ],
  'summary.many-attention': [
    'Algumas disciplinas pedem sua atenção neste {trimestre}: {lista}.',
    'Neste {trimestre}, vale dar atenção especial a {lista}.',
    'Depois deste {trimestre}, vale cuidar melhor de {lista}.',
  ],
} as const satisfies Record<string, readonly string[]>;

export type TermClosingCodeV1 = keyof typeof TERM_CLOSING_CATALOG_V1;
const codes = Object.keys(TERM_CLOSING_CATALOG_V1) as [TermClosingCodeV1, ...TermClosingCodeV1[]];
export const termClosingCodeV1 = z.enum(codes);
export const TERM_CLOSING_PERIODS_V1 = ['T1', 'T2', 'T3'] as const;
export type TermClosingPeriodV1 = (typeof TERM_CLOSING_PERIODS_V1)[number];

export const termClosingMessageV1 = z
  .object({ code: termClosingCodeV1, variant: z.number().int().nonnegative() })
  .strict()
  .refine((value) => value.variant < TERM_CLOSING_CATALOG_V1[value.code].length, 'Unknown variant');
export type TermClosingMessageV1 = z.infer<typeof termClosingMessageV1>;

const prefixed = (prefix: string) =>
  termClosingMessageV1.refine((value) => value.code.startsWith(prefix), 'Unexpected message kind');

/** One trimester reading of one subject. `good` carries only the recognition line (D5). */
export const termClosingV1 = z
  .object({
    period: z.enum(TERM_CLOSING_PERIODS_V1),
    level: z.enum(['attention', 'point', 'good']),
    conclusion: termClosingMessageV1.refine(
      (value) => value.code.startsWith('conclusion.') || value.code.startsWith('line.'),
      'Unexpected conclusion',
    ),
    weight: prefixed('weight.').optional(),
    strength: prefixed('strength.').optional(),
    action: prefixed('action.').optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.level === 'good'
        ? value.conclusion.code.startsWith('line.') && !value.weight && !value.strength && !value.action
        : value.conclusion.code.startsWith('conclusion.') && value.weight !== undefined,
    'Closing pieces do not match its level',
  );
export type TermClosingV1 = z.infer<typeof termClosingV1>;

/** Boletim summary of the most recent closed trimester (D4, D11). */
export const termClosingSummaryV1 = z
  .object({
    period: z.enum(TERM_CLOSING_PERIODS_V1),
    message: prefixed('summary.'),
    attentionSubjectIds: z.array(z.number().int().positive()).max(100),
  })
  .strict();
export type TermClosingSummaryV1 = z.infer<typeof termClosingSummaryV1>;

const ORDINAL_V1: Record<TermClosingPeriodV1, string> = { T1: '1º', T2: '2º', T3: '3º' };
/** "Fechamento do 1º trimestre" (D10). */
export const termClosingLabelV1 = (period: TermClosingPeriodV1) =>
  `Fechamento do ${ORDINAL_V1[period]} trimestre`;

/** Subject labels arrive upper-case from the BN; sentences use only the first letter capitalized. */
export function subjectSentenceLabelV1(label: string): string {
  return label
    .toLocaleLowerCase('pt-BR')
    .replace(/(^|[\s./-])(\p{L})/gu, (_match, lead: string, letter: string) => lead + letter.toLocaleUpperCase('pt-BR'));
}

function joinListV1(items: readonly string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} e ${items.at(-1)}`;
}

/** Renders one message; the only inputs are catalog text, the trimester and subject names. */
export function renderTermClosingMessageV1(
  message: TermClosingMessageV1,
  context: { period: TermClosingPeriodV1; subjects?: readonly string[] },
): string {
  const text: string = TERM_CLOSING_CATALOG_V1[message.code][message.variant] ?? '';
  const list = (context.subjects ?? []).map(subjectSentenceLabelV1);
  const plural = list.length > 1;
  return text
    .replaceAll('{trimestre}', `${ORDINAL_V1[context.period]} trimestre`)
    .replaceAll('{lista}', joinListV1(list))
    .replaceAll('{pede}', plural ? 'pedem' : 'pede')
    .replaceAll('{merece}', plural ? 'merecem' : 'merece')
    .replace(/^([a-zà-ú])/u, (letter) => letter.toLocaleUpperCase('pt-BR'));
}
