import { StrictMode, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { createRoot } from 'react-dom/client';
import { StudentPortalPageV1 } from '../features/student-portal/shell/student-shell-v1';
import { selfResponseV1, type SelfResponseV1 } from '../../shared/student-portal-contracts/self-v1';
import '../features/student-portal/shared/styles.css';

const previewPortrait = new URL('./assets/demo-student-boy.webp', import.meta.url).href;

/*
 * Invented preview data only. It mirrors the server rules so the UI shows realistic states:
 * - trimester maxima 30/30/40 (SIMPLIFIED_TERM_MAXIMUM_MILLI_V1);
 * - meetsMinimum = value / maximum >= 60% (resolveStudentMarkPresentationV1 with the
 *   synthetic minimum used in tests); no maximum → null (neutral);
 * - notDone only for an observed blank (mark absent); numeric 0 stays a score ("Tirou zero");
 * - generatedAt is in September, so T3 is in progress: some partials, final not yet released;
 * - REC exists only for terms below the minimum, pending or scored against the term maximum.
 */
const MINIMUM_PERCENT = 60;
const TERM_MAXIMUM = { T1: 30, T2: 30, T3: 40 } as const;

const score = (value: number, maximum: number) => ({
  kind: 'score' as const,
  value,
  maximum,
  meetsMinimum: value * 100 >= maximum * MINIMUM_PERCENT,
});
const absent = { kind: 'absent' as const };
let nextAssessmentId = 910000;
const partial = (label: string, value: number, maximum: number) => ({
  assessmentId: ++nextAssessmentId,
  label,
  mark: score(value, maximum),
});
const notDone = (label: string) => ({
  assessmentId: ++nextAssessmentId,
  label,
  mark: absent,
  notDone: true as const,
});
type PartialV1 = ReturnType<typeof partial> | ReturnType<typeof notDone>;
const term = (period: 'T1' | 'T2', final: number, partials: PartialV1[]) => ({
  period,
  final: score(final, TERM_MAXIMUM[period]),
  partials,
});
const ongoingT3 = (partials: PartialV1[]) => ({ period: 'T3' as const, final: absent, partials });
const recovery = (period: 'REC1' | 'REC2', value?: number) => ({
  period,
  final:
    value === undefined
      ? { kind: 'recovery-pending' as const }
      : score(value, TERM_MAXIMUM[period === 'REC1' ? 'T1' : 'T2']),
});

const previewData = selfResponseV1.parse({
  contractVersion: 1,
  requestId: '11111111-1111-4111-8111-111111111111',
  state: 'ready',
  profile: {
    accountId: '11111111-1111-4111-8111-111111111111',
    link: { academicYear: 2026, studentId: 900001 },
    name: 'Pedro Henrique Almeida',
    classLabel: '1ª Série do Ensino Médio',
    academicState: 'regular',
    result: 'in-progress',
  },
  revisions: {
    dataVersion: 'preview:academic:1',
    policyVersion: 'preview:policy:1',
    publicationVersion: 'preview:publication:1',
  },
  generatedAt: '2026-09-20T12:00:00-03:00',
  subjects: [
    {
      subjectId: 900001,
      label: 'Matemática',
      order: 1,
      periods: [
        term('T1', 16.5, [
          partial('Avaliação 1', 4.5, 10),
          partial('Avaliação 2', 5, 10),
          partial('Lista de exercícios: conjuntos numéricos', 2, 3),
          partial('Trabalho: porcentagem no dia a dia', 3.5, 4),
          partial('Participação em sala', 1.5, 3),
        ]),
        term('T2', 19.8, [
          partial('Avaliação 1', 7, 10),
          partial('Avaliação 2', 5.5, 10),
          partial('Atividade de resolução de problemas', 1.8, 2),
          partial('Lista de exercícios: funções do 1º grau', 1, 1),
          partial(
            // Near the contract maximum (120 characters): exercises long activity descriptions.
            'Projeto interdisciplinar: levantamento de dados sobre o consumo de água na escola, análise estatística e apresentação',
            2.5,
            3,
          ),
          partial('Participação em sala', 2, 3),
          partial('Quiz de revisão', 0, 1),
          notDone('Atividade de casa'),
        ]),
        ongoingT3([partial('Avaliação 1', 6, 15), partial('Lista de exercícios: função quadrática', 2, 3)]),
        recovery('REC1', 19),
      ],
    },
    {
      subjectId: 900002,
      label: 'Língua Portuguesa',
      order: 2,
      periods: [
        term('T1', 23, [
          partial('Avaliação 1', 8, 10),
          partial('Avaliação 2', 7.5, 10),
          partial('Redação: texto dissertativo', 3, 4),
          partial('Leitura dirigida', 2.5, 3),
          partial('Participação em sala', 2, 3),
        ]),
        term('T2', 14.5, [
          partial('Avaliação 1', 6, 10),
          partial('Avaliação 2', 4, 10),
          partial('Seminário: Modernismo brasileiro', 2, 4),
          notDone('Resenha crítica'),
          partial('Participação em sala', 2.5, 3),
        ]),
        ongoingT3([partial('Redação: artigo de opinião', 3, 4)]),
        recovery('REC2'),
      ],
    },
    {
      subjectId: 900003,
      label: 'Ciências',
      order: 3,
      periods: [
        term('T1', 27, [
          partial('Avaliação 1', 9, 10),
          partial('Avaliação 2', 8.5, 10),
          partial('Relatório de laboratório', 4, 4),
          partial('Maquete: célula animal', 2.5, 3),
          partial('Participação em sala', 3, 3),
        ]),
        term('T2', 17, [
          partial('Avaliação 1', 5.5, 10),
          partial('Avaliação 2', 6.5, 10),
          partial('Relatório de laboratório', 3, 4),
          partial('Quiz: tabela periódica', 0, 3),
          partial('Participação em sala', 2, 3),
        ]),
        ongoingT3([partial('Avaliação 1', 9, 15)]),
        recovery('REC2', 21),
      ],
    },
    {
      subjectId: 900004,
      label: 'História',
      order: 4,
      periods: [
        term('T1', 11.5, [
          partial('Avaliação 1', 3.5, 10),
          partial('Avaliação 2', 5, 10),
          partial('Linha do tempo: Brasil Colônia', 2, 4),
          notDone('Fichamento de texto'),
          partial('Participação em sala', 1, 3),
        ]),
        term('T2', 19, [
          partial('Avaliação 1', 6, 10),
          partial('Avaliação 2', 6, 10),
          partial('Pesquisa: Revolução Industrial', 3, 4),
          partial('Debate em sala', 2, 3),
          partial('Participação em sala', 2, 3),
        ]),
        ongoingT3([notDone('Atividade 1')]),
        recovery('REC1', 16),
      ],
    },
    {
      subjectId: 900005,
      label: 'Geografia',
      order: 5,
      periods: [
        term('T1', 20, [
          partial('Avaliação 1', 7, 10),
          partial('Avaliação 2', 6, 10),
          partial('Mapa: relevo brasileiro', 3, 4),
          partial('Estudo de caso', 2, 3),
          partial('Participação em sala', 2, 3),
        ]),
        term('T2', 10, [
          partial('Avaliação 1', 4, 10),
          partial('Avaliação 2', 3.5, 10),
          partial('Mapa temático', 1, 4),
          partial('Atividade de campo', 0, 3),
          partial('Participação em sala', 1.5, 3),
        ]),
        ongoingT3([partial('Avaliação 1', 12, 15)]),
        recovery('REC2'),
      ],
    },
    {
      subjectId: 900006,
      label: 'Inglês',
      order: 6,
      periods: [
        term('T1', 28, [
          partial('Avaliação 1', 9.5, 10),
          partial('Avaliação 2', 9, 10),
          partial('Listening', 3, 3),
          partial('Speaking', 3.5, 4),
          partial('Participação em sala', 3, 3),
        ]),
        term('T2', 24, [
          partial('Avaliação 1', 8, 10),
          partial('Avaliação 2', 8.5, 10),
          partial('Vocabulary quiz', 2, 3),
          partial('Writing', 3, 4),
          partial('Participação em sala', 2.5, 3),
        ]),
        ongoingT3([partial('Avaliação 1', 13, 15), partial('Listening', 2, 3)]),
      ],
    },
  ],
});

/*
 * Production-shaped scenario (checked against the scoped v2 editions served in 2026-09).
 * Marks and names are invented; only the structure and catalog mirror production:
 * - Fundamental II classes (6º–9º ANO) with the 12 real subjects, upper-case, in the real order;
 * - only T1 is published; term maximum 30 = AV1 8,5 + AV2 5 + JOGOS 3 + PARTICIPAÇÃO 4,5 + activities;
 * - T1 AV1/AV2 carry the school's configured names (1ª AVALIAÇÃO, SIMULADO);
 * - 6–9 activities per subject with the teachers' own upper-case, abbreviated labels;
 * - "Prova paralela" (no maximum) appears only when eligible (BN-DEC-035: AV1+AV2 and the total
 *   before it both below 60%) or already scored; a higher score replaces AV1+AV2 in the final;
 * - a few scores have no maximum (meetsMinimum null), and a few are zero.
 */
type RealActivityV1 = readonly [label: string, maximum: number | null, value: number | null];
const realSubject = (
  subjectId: number,
  label: string,
  order: number,
  activities: readonly RealActivityV1[],
) => {
  const partials = activities.map(([activity, maximum, value]) => ({
    assessmentId: ++nextAssessmentId,
    label: activity,
    mark:
      value === null
        ? absent
        : maximum === null
          ? { kind: 'score' as const, value, maximum: null, meetsMinimum: null }
          : score(value, maximum),
  }));
  const valueOf = (name: string) => activities.find(([activity]) => activity === name)?.[2] ?? null;
  const quantitative = (valueOf(AV1_LABEL) ?? 0) + (valueOf(AV2_LABEL) ?? 0);
  const parallel = valueOf(PARALLEL_LABEL);
  const beforeParallel = activities.reduce(
    (sum, [activity, , value]) => (activity === PARALLEL_LABEL ? sum : sum + (value ?? 0)),
    0,
  );
  const final = parallel !== null && parallel > quantitative ? beforeParallel - quantitative + parallel : beforeParallel;
  return { subjectId, label, order, periods: [{ period: 'T1' as const, final: score(final, 30), partials }] };
};
const AV1_LABEL = '1ª AVALIAÇÃO';
const AV2_LABEL = 'SIMULADO';
const PARALLEL_LABEL = 'Prova paralela';
const realPreviewData = selfResponseV1.parse({
  ...previewData,
  profile: { ...previewData.profile, classLabel: '7º ANO B' },
  subjects: [
    realSubject(910001, 'PORTUGUÊS', 0, [
      [AV1_LABEL, 8.5, 4],
      [AV2_LABEL, 5, 2.5],
      ['JOGOS', 3, 3],
      ['PARTICIPAÇÃO', 4.5, 3],
      ['1ª ATIVIDADE AVALIATIVA', 6, null],
      ['PRODUÇÃO DE TEXTO', 3, 1.5],
      [PARALLEL_LABEL, null, null],
    ]),
    realSubject(910002, 'MATEMÁTICA', 1, [
      [AV1_LABEL, 8.5, 7.5],
      [AV2_LABEL, 5, 4],
      ['JOGOS', 3, 3],
      ['PART', 4.5, 4.5],
      ['I ATIV', 6, 5],
      ['II ATIV', 3, 2.5],
    ]),
    realSubject(910003, 'HISTÓRIA', 2, [
      [AV1_LABEL, 8.5, 3],
      [AV2_LABEL, 5, 2],
      ['JOGOS', 3, 3],
      ['PARTICIPAÇÃO', 4.5, 2],
      ['1ª ATIVIDADE', 6, 3],
      ['2ª ATIVIDADE', 3, 0],
      [PARALLEL_LABEL, null, 7],
    ]),
    realSubject(910004, 'GEOGRAFIA', 3, [
      [AV1_LABEL, 8.5, 6],
      [AV2_LABEL, 5, 3.5],
      ['JOGOS', 3, 3],
      ['PARTI', 4.5, 4],
      ['CAED', 6, 4.5],
      ['MAPA-MENTAL', 3, 2],
    ]),
    realSubject(910005, 'CIÊNCIAS', 4, [
      [AV1_LABEL, 8.5, 8],
      [AV2_LABEL, 5, 4.5],
      ['JOGOS', 3, 3],
      ['PARTICIPAÇÃO', 4.5, 4],
      ['ATIVIDADE INVESTIGATIVA', 6, 5.5],
      ['LAPBOOK', 3, 3],
    ]),
    realSubject(910006, 'ARTE', 5, [
      [AV1_LABEL, 8.5, 5],
      [AV2_LABEL, 5, 3],
      ['JOGOS', 3, 3],
      ['PARTICIPAÇÃO', 4.5, 3.5],
      ['RELEITURA - ABAPORU (INDIVIDUAL)', 3, 2.5],
      ['CARTAZ (MPB, BOSSA NOVA E ROCK)', 3, 2],
      ['VÍDEO HOMENAGEM MEDEIROS NETO', 3, null],
      ['P.D.', null, 1],
    ]),
    realSubject(910007, 'RELIGIÃO', 6, [
      [AV1_LABEL, 8.5, 7],
      [AV2_LABEL, 5, 4],
      ['JOGOS', 3, 3],
      ['PRT', 4.5, 4],
      ['LÍDERES RELIGIOSOS', 3, 3],
      ['LIVROS SAGRADOS', 6, 5],
    ]),
    realSubject(910008, 'REDAÇÃO', 7, [
      [AV1_LABEL, 8.5, 6.5],
      [AV2_LABEL, 5, 3],
      ['JOGOS', 3, 3],
      ['PARTIC.', 4.5, 3.5],
      ['PRODUÇÃO DE TEXTO', 6, 4],
      ['2ª ATIVIDADE', 3, 2],
    ]),
    realSubject(910009, 'ED. FÍSICA', 8, [
      [AV1_LABEL, 8.5, 8.5],
      [AV2_LABEL, 5, 5],
      ['Jogos interclasse', 3, 3],
      ['PARTICIPAÇÃO', 4.5, 4.5],
      ['GINCANA', 6, 6],
      ['PESQUISA', 3, 2.5],
    ]),
    realSubject(910010, 'ÉTICA', 9, [
      [AV1_LABEL, 8.5, 7],
      [AV2_LABEL, 5, 4.5],
      ['JOGOS', 3, 3],
      ['PART', 4.5, 4],
      ['ÁRVORE DE VALORES', 6, 5],
      ['2ª PARTICIPAÇÃO', 3, 2.5],
    ]),
    realSubject(910011, 'INGLÊS', 10, [
      [AV1_LABEL, 8.5, 7.5],
      [AV2_LABEL, 5, 4],
      ['JOGOS', 3, 3],
      ['PARTICIPAÇÃO', 4.5, 4],
      ['1ª ATIV', 6, 5],
      ['2ª ATIV', 3, 3],
    ]),
    realSubject(910012, 'COMPUTAÇÃO', 11, [
      [AV1_LABEL, 8.5, 6],
      [AV2_LABEL, 5, 4],
      ['JOGOS', 3, 3],
      ['PARTICIPAÇÃO', 4.5, 4.5],
      ['A. COMP.', 6, 5],
      ['TRAB', 3, 3],
    ]),
  ],
});

/*
 * Admin simulator (preview only). The browser bundle may not import server code, so this
 * restates server/student-portal/policies/calendar-v1.ts#applyPublishedVisibilityV1 over the
 * invented data: unreleased periods are dropped, partials are removed when showPartials is off,
 * EM RECUPERAÇÃO follows the T3 release and every other situation/outcome waits for the final
 * disclosure. Keep both in sync if the rule changes.
 */
type PeriodIdV1 = SelfResponseV1['subjects'][number]['periods'][number]['period'];
type AnnualSituationV1 = NonNullable<SelfResponseV1['profile']['annualSituation']>;
type SubjectSituationV1 = NonNullable<SelfResponseV1['subjects'][number]['annualSituation']>;
interface AdminSimulationV1 {
  accessEnabled: boolean;
  showPartials: boolean;
  periods: readonly PeriodIdV1[];
  finalDisclosed: boolean;
  /** Approved background-free portrait exists (none in production yet). */
  hasPortrait: boolean;
  studentName: string;
  situation: AnnualSituationV1 | 'none';
  dataset: 'real' | 'example';
  academicState: SelfResponseV1['profile']['academicState'];
  /** Two real students have a single published subject. */
  singleSubject: boolean;
}
// Short (regular), long and extra-long names exercise the hero's type-size tiers. Production
// names are all upper-case, 20–39 characters, 3–6 words; the first one mirrors that.
const PREVIEW_NAMES_V1 = [
  'ANA CAROLINA DE JESUS SANTOS OLIVEIRA',
  'Pedro Henrique Almeida',
  'MARIA LUIZA FERREIRA XAVIER',
  'MARIA EDUARDA DOS SANTOS FERREIRA DA SILVA XAVIER',
  'ÂNGELA GONÇALVES DE ÁVILA JOÃO',
] as const;
const ALL_PERIODS_V1: readonly PeriodIdV1[] = ['T1', 'T2', 'T3', 'REC1', 'REC2', 'REC3'];
const SITUATION_OPTIONS_V1: readonly [AdminSimulationV1['situation'], string][] = [
  ['none', 'Em curso'],
  ['in-recovery', 'Em recuperação'],
  ['approved-direct', 'Aprovado direto'],
  ['approved-after-recovery', 'Aprovado pela recuperação'],
  ['approved-by-council', 'Aprovado pelo Conselho'],
  ['approved-special', 'Aprovado (especial)'],
  ['failed-after-recovery', 'Reprovado após recuperação'],
  ['failed-no-show', 'Reprovado por não comparecimento'],
  ['failed-repeat', 'Reprovado (R/R)'],
  ['failed-by-council', 'Reprovado pelo Conselho'],
  ['failed-by-absence', 'Reprovado por falta'],
];

// Invented per-subject classifications consistent with each annual situation. Língua
// Portuguesa and Geografia are the subjects that went to recovery in the sample data.
function subjectSituationFor(
  situation: AdminSimulationV1['situation'],
  label: string,
): SubjectSituationV1 | undefined {
  const key = label.normalize('NFD').replace(/[̀-ͯ]/gu, '').toLowerCase();
  const recovered = key.includes('portugues') || key === 'geografia';
  switch (situation) {
    case 'none':
    case 'approved-special':
      return undefined;
    case 'in-recovery':
      return recovered ? 'recovery-pending' : 'approved-direct';
    case 'approved-direct':
      return 'approved-direct';
    case 'approved-after-recovery':
      return recovered ? 'approved-after-recovery' : 'approved-direct';
    case 'failed-after-recovery':
      return recovered || key === 'historia' ? 'not-approved' : 'approved-direct';
    case 'failed-no-show':
      return key === 'geografia' ? 'failed-no-show' : recovered ? 'approved-after-recovery' : 'approved-direct';
    case 'failed-repeat':
      return key === 'geografia' ? 'failed-repeat' : recovered ? 'approved-after-recovery' : 'approved-direct';
    default: // Council cases: one subject failed within the Council limit.
      return key === 'geografia' ? 'not-approved' : recovered ? 'approved-after-recovery' : 'approved-direct';
  }
}
const coarseResultV1 = (situation: AdminSimulationV1['situation']): SelfResponseV1['profile']['result'] =>
  situation === 'none' || situation === 'in-recovery'
    ? 'in-progress'
    : situation === 'failed-by-absence'
      ? 'failed-attendance'
      : situation.startsWith('approved')
        ? 'approved'
        : 'failed';

function simulateAdminV1(data: SelfResponseV1, admin: AdminSimulationV1): SelfResponseV1 {
  const final = admin.finalDisclosed && admin.accessEnabled;
  const recoveryDisclosed = admin.accessEnabled && admin.periods.includes('T3');
  const visible = (value: string | undefined, early: string) =>
    value !== undefined && (final || (recoveryDisclosed && value === early));
  const assisted = admin.academicState === 'assisted';
  const situation = admin.situation === 'none' || assisted ? undefined : admin.situation;
  const subjects = admin.accessEnabled
    ? data.subjects
        .slice(0, admin.singleSubject ? 1 : undefined)
        .map((subject) => {
          const subjectSituation = subjectSituationFor(admin.situation, subject.label);
          const outcome =
            subjectSituation === 'approved-direct' || subjectSituation === 'approved-after-recovery'
              ? ('approved' as const)
              : subjectSituation && subjectSituation !== 'recovery-pending'
                ? ('failed' as const)
                : undefined;
          return {
            subjectId: subject.subjectId,
            label: subject.label,
            order: subject.order,
            ...(final && outcome ? { officialOutcome: outcome } : {}),
            ...(visible(subjectSituation, 'recovery-pending')
              ? { annualSituation: subjectSituation }
              : {}),
            periods: subject.periods
              .filter((period) => admin.periods.includes(period.period))
              .map(({ partials, ...period }) =>
                admin.showPartials && partials !== undefined ? { ...period, partials } : period,
              ),
          };
        })
        .filter((subject) => subject.periods.length > 0)
    : [];
  return selfResponseV1.parse({
    ...data,
    state: subjects.length > 0 ? 'ready' : 'no-publication',
    profile: {
      ...data.profile,
      name: admin.studentName,
      academicState: admin.academicState,
      result: assisted ? 'not-applicable' : final ? coarseResultV1(admin.situation) : 'in-progress',
      ...(visible(situation, 'in-recovery') ? { annualSituation: situation } : {}),
    },
    subjects,
  });
}

const panelStyle: CSSProperties = {
  position: 'fixed',
  bottom: 88,
  left: 8,
  zIndex: 200,
  maxWidth: 'calc(100vw - 16px)',
  padding: '8px 12px',
  borderRadius: 14,
  background: 'rgb(15 23 42 / 0.92)',
  color: 'white',
  font: '12px/1.4 system-ui, sans-serif',
  boxShadow: '0 10px 30px rgb(0 0 0 / 0.3)',
};
const rowStyle: CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: '4px 12px', margin: '6px 0' };

function AdminSimulatorPanelV1({
  value,
  onChange,
}: {
  value: AdminSimulationV1;
  onChange: (next: AdminSimulationV1) => void;
}) {
  const toggle = (key: 'accessEnabled' | 'showPartials' | 'finalDisclosed' | 'hasPortrait' | 'singleSubject') => (
    <input type="checkbox" checked={value[key]} onChange={() => onChange({ ...value, [key]: !value[key] })} />
  );
  return (
    <details style={panelStyle}>
      <summary style={{ cursor: 'pointer', fontWeight: 700 }}>Simular admin</summary>
      <div style={rowStyle}>
        <span style={{ opacity: 0.7 }}>Dados:</span>
        <select
          value={value.dataset}
          onChange={(event) => onChange({ ...value, dataset: event.target.value as AdminSimulationV1['dataset'] })}
        >
          <option value="real">Como na produção (7º ANO, só T1)</option>
          <option value="example">Exemplo completo (T1–T3 e REC)</option>
        </select>
        <label>{toggle('singleSubject')} Só 1 disciplina</label>
      </div>
      <div style={rowStyle}>
        <span style={{ opacity: 0.7 }}>Aluno:</span>
        <select
          value={value.academicState}
          onChange={(event) =>
            onChange({ ...value, academicState: event.target.value as AdminSimulationV1['academicState'] })
          }
        >
          <option value="regular">Regular</option>
          <option value="assisted">Assistido</option>
          <option value="special">Especial</option>
        </select>
      </div>
      <div style={rowStyle}>
        <label>{toggle('accessEnabled')} Acesso liberado</label>
        <label>{toggle('showPartials')} Mostrar detalhamento</label>
        <label>{toggle('hasPortrait')} Foto do aluno</label>
      </div>
      <div style={rowStyle}>
        <span style={{ opacity: 0.7 }}>Períodos liberados:</span>
        {ALL_PERIODS_V1.map((period) => (
          <label key={period}>
            <input
              type="checkbox"
              checked={value.periods.includes(period)}
              onChange={() =>
                onChange({
                  ...value,
                  periods: value.periods.includes(period)
                    ? value.periods.filter((item) => item !== period)
                    : [...value.periods, period],
                })
              }
            />{' '}
            {period}
          </label>
        ))}
      </div>
      <div style={rowStyle}>
        <span style={{ opacity: 0.7 }}>Nome:</span>
        <select
          value={value.studentName}
          onChange={(event) => onChange({ ...value, studentName: event.target.value })}
        >
          {PREVIEW_NAMES_V1.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </div>
      <div style={rowStyle}>
        <span style={{ opacity: 0.7 }}>Situação oficial no BN:</span>
        <select
          value={value.situation}
          onChange={(event) =>
            onChange({ ...value, situation: event.target.value as AdminSimulationV1['situation'] })
          }
        >
          {SITUATION_OPTIONS_V1.map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <div style={rowStyle}>
        <label>{toggle('finalDisclosed')} Divulgar resultado final</label>
        <span style={{ opacity: 0.7 }}>(Em recuperação aparece com T3 liberado)</span>
      </div>
    </details>
  );
}

/*
 * Optional real photo for local design checks: src/student-portal/assets/local-test/portrait.*
 * is git-ignored on the owner's machine (.git/info/exclude) and never committed. Without it the
 * invented demo portrait is used.
 */
const LOCAL_TEST_PORTRAIT_V1 = '/assets/local-test/portrait.jpg';
function useLocalTestPortraitV1() {
  const [src, setSrc] = useState<string | undefined>();
  useEffect(() => {
    let active = true;
    void fetch(LOCAL_TEST_PORTRAIT_V1, { method: 'HEAD' })
      .then((response) => {
        if (active && response.ok && response.headers.get('content-type')?.startsWith('image/'))
          setSrc(LOCAL_TEST_PORTRAIT_V1);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);
  return src;
}

function PreviewAppV1() {
  const localPortrait = useLocalTestPortraitV1();
  const [admin, setAdmin] = useState<AdminSimulationV1>({
    accessEnabled: true,
    showPartials: true,
    periods: ALL_PERIODS_V1,
    finalDisclosed: false,
    hasPortrait: true,
    studentName: PREVIEW_NAMES_V1[0]!,
    situation: 'none',
    dataset: 'real',
    academicState: 'regular',
    singleSubject: false,
  });
  const data = useMemo(
    () => simulateAdminV1(admin.dataset === 'real' ? realPreviewData : previewData, admin),
    [admin],
  );
  return (
    <>
      <AdminSimulatorPanelV1 value={admin} onChange={setAdmin} />
      <StudentPortalPageV1
        load={{ state: 'ready', data }}
        onLogout={() => undefined}
        portraitSrc={admin.hasPortrait ? (localPortrait ?? previewPortrait) : undefined}
      />
    </>
  );
}

const root = document.getElementById('root');
if (!root) throw new Error('Preview root missing');

createRoot(root).render(
  <StrictMode>
    <PreviewAppV1 />
  </StrictMode>,
);
