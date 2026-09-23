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
}
// Short (regular), long and extra-long names exercise the hero's type-size tiers.
const PREVIEW_NAMES_V1 = [
  'Pedro Henrique Almeida',
  'MARIA LUIZA FERREIRA XAVIER',
  'MARIA EDUARDA DOS SANTOS FERREIRA DA SILVA XAVIER',
  'ÂNGELA GONÇALVES DE ÁVILA JOÃO',
] as const;
const ALL_PERIODS_V1: readonly PeriodIdV1[] = ['T1', 'T2', 'T3', 'REC1', 'REC2', 'REC3'];
const SITUATION_OPTIONS_V1: readonly [AdminSimulationV1['situation'], string][] = [
  ['none', 'Em curso'],
  ['in-recovery', 'Em recuperação'],
  ['awaiting-council', 'Aguardando Conselho'],
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
  const recovered = label === 'Língua Portuguesa' || label === 'Geografia';
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
      return recovered || label === 'História' ? 'not-approved' : 'approved-direct';
    case 'failed-no-show':
      return label === 'Geografia' ? 'failed-no-show' : recovered ? 'approved-after-recovery' : 'approved-direct';
    case 'failed-repeat':
      return label === 'Geografia' ? 'failed-repeat' : recovered ? 'approved-after-recovery' : 'approved-direct';
    default: // Council cases: one subject failed within the Council limit.
      return label === 'Geografia' ? 'not-approved' : recovered ? 'approved-after-recovery' : 'approved-direct';
  }
}
const coarseResultV1 = (situation: AdminSimulationV1['situation']): SelfResponseV1['profile']['result'] =>
  situation === 'none' || situation === 'in-recovery' || situation === 'awaiting-council'
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
  const situation = admin.situation === 'none' ? undefined : admin.situation;
  const subjects = admin.accessEnabled
    ? data.subjects
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
      result: final ? coarseResultV1(admin.situation) : 'in-progress',
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
  const toggle = (key: 'accessEnabled' | 'showPartials' | 'finalDisclosed' | 'hasPortrait') => (
    <input type="checkbox" checked={value[key]} onChange={() => onChange({ ...value, [key]: !value[key] })} />
  );
  return (
    <details style={panelStyle}>
      <summary style={{ cursor: 'pointer', fontWeight: 700 }}>Simular admin</summary>
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
  });
  const data = useMemo(() => simulateAdminV1(previewData, admin), [admin]);
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
