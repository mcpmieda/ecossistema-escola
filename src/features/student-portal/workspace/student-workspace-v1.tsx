import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Card,
  Chip,
  Description,
  Label,
  ListBox,
  Surface,
  Tabs,
} from '@heroui/react';
import {
  Atom,
  BookOpenCheck,
  BookOpenText,
  Calculator,
  Dumbbell,
  FlaskConical,
  Globe2,
  Landmark,
  Languages,
  LayoutDashboard,
  Monitor,
  MoveRight,
  Music2,
  Palette,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import type { SelfResponseV1 } from '../../../../shared/student-portal-contracts/self-v1';
import { StudentMarkV1 } from '../grades/student-mark-v1';
import { GranularStatusV1 } from '../../../shared/grades/granular-status-v1';
import './student-workspace-v1.css';

type SubjectV1 = SelfResponseV1['subjects'][number];
type PeriodV1 = SubjectV1['periods'][number];
type PeriodIdV1 = PeriodV1['period'];
type ScoreMarkV1 = Extract<PeriodV1['final'], { kind: 'score' }>;
type WorkspaceAreaV1 = 'summary' | 'subject';

const MAIN_PERIODS_V1: readonly PeriodIdV1[] = ['T1', 'T2', 'T3'];
const PERIOD_LABELS_V1: Record<PeriodIdV1, string> = {
  T1: '1º Tri',
  T2: '2º Tri',
  T3: '3º Tri',
  REC1: 'REC 1º',
  REC2: 'REC 2º',
  REC3: 'REC 3º',
};
const BULLETIN_PERIOD_LABELS_V1: Partial<Record<PeriodIdV1, string>> = {
  T1: 'I Trimestre',
  T2: 'II Trimestre',
  T3: 'III Trimestre',
};
const resultLabels = {
  approved: 'Aprovado',
  failed: 'Reprovado',
  'failed-attendance': 'Reprovado por falta',
} as const;
type ToneV1 = 'default' | 'success' | 'warning' | 'danger';
/** Official BN/Council wording; the coarse `result` is only a fallback for legacy payloads. */
const ANNUAL_SITUATION_LABELS_V1: Record<
  NonNullable<SelfResponseV1['profile']['annualSituation']>,
  { label: string; tone: ToneV1 }
> = {
  'in-recovery': { label: 'Em recuperação', tone: 'warning' },
  'awaiting-council': { label: 'Aguardando Conselho de Classe', tone: 'default' },
  'approved-direct': { label: 'Aprovado direto', tone: 'success' },
  'approved-after-recovery': { label: 'Aprovado pela recuperação', tone: 'success' },
  'approved-special': { label: 'Aprovado', tone: 'success' },
  'approved-by-council': { label: 'Aprovado pelo Conselho', tone: 'success' },
  'failed-after-recovery': { label: 'Reprovado após recuperação', tone: 'danger' },
  'failed-no-show': { label: 'Reprovado por não comparecimento', tone: 'danger' },
  'failed-repeat': { label: 'Reprovado', tone: 'danger' },
  'failed-by-council': { label: 'Reprovado pelo Conselho', tone: 'danger' },
  'failed-by-absence': { label: 'Reprovado por falta', tone: 'danger' },
};
const SUBJECT_SITUATION_LABELS_V1: Record<
  NonNullable<SubjectV1['annualSituation']>,
  { label: string; tone: ToneV1 }
> = {
  'recovery-pending': { label: 'Em recuperação', tone: 'warning' },
  'approved-direct': { label: 'Aprovado direto', tone: 'success' },
  'approved-after-recovery': { label: 'Aprovado pela recuperação', tone: 'success' },
  'not-approved': { label: 'Não aprovado', tone: 'danger' },
  'failed-no-show': { label: 'Reprovado por não comparecimento', tone: 'danger' },
  'failed-repeat': { label: 'Reprovado', tone: 'danger' },
};
const finalResultLabelsV1 = {
  approved: { label: 'Aprovado', tone: 'success' },
  failed: { label: 'Reprovado', tone: 'danger' },
  'failed-attendance': { label: 'Reprovado por falta', tone: 'danger' },
} as const;

function subjectSituationV1(subject: SubjectV1): { label: string; tone: ToneV1 } | null {
  if (subject.annualSituation) return SUBJECT_SITUATION_LABELS_V1[subject.annualSituation];
  if (subject.officialOutcome)
    return {
      label: resultLabels[subject.officialOutcome],
      tone: subject.officialOutcome === 'approved' ? 'success' : 'danger',
    };
  return null;
}
type SummaryKeyV1 = PeriodIdV1 | 'REC';
const number = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 20 });
const WORKSPACE_HISTORY_KEY_V1 = '__studentPortalWorkspaceV1';

function subjectPeriodV1(subject: SubjectV1, period: PeriodIdV1) {
  return subject.periods.find((item) => item.period === period);
}
function scoreOfV1(period?: PeriodV1): ScoreMarkV1 | null {
  return period?.final.kind === 'score' ? period.final : null;
}
function visibleMainPeriodsV1(subjects: readonly SubjectV1[]) {
  return MAIN_PERIODS_V1.filter((period) =>
    subjects.some((subject) => subject.periods.some((item) => item.period === period)),
  );
}
function scoreToneV1(mark: ScoreMarkV1 | null) {
  if (mark?.meetsMinimum === true) return 'positive' as const;
  if (mark?.meetsMinimum === false) return 'negative' as const;
  return 'neutral' as const;
}

/*
 * Descriptive trend against the previous trimester, following the gradebook term comparison
 * (docs/gradebook/TERM_COMPARISON_2026_V4.md): percentages via exact cross-multiplication in
 * milli units, so T3 (max 40) is fairly compared with T2 (max 30). Only two numeric marks with
 * a positive maximum are comparable; anything else shows no indicator.
 */
const TREND_REFERENCE_V1: Partial<Record<PeriodIdV1, PeriodIdV1>> = { T2: 'T1', T3: 'T2' };
const RECOVERY_OF_V1: Partial<Record<PeriodIdV1, string>> = {
  REC1: '1º trimestre',
  REC2: '2º trimestre',
  REC3: '3º trimestre',
};
const RECOVERY_PERIODS_V1: readonly PeriodIdV1[] = ['REC1', 'REC2', 'REC3'];
type TrendV1 = 'higher' | 'equal' | 'lower';
function trendV1(current: ScoreMarkV1 | null, reference: ScoreMarkV1 | null): TrendV1 | null {
  if (!current?.maximum || !reference?.maximum) return null;
  const milli = (value: number) => BigInt(Math.round(value * 1000));
  const left = milli(current.value) * milli(reference.maximum);
  const right = milli(reference.value) * milli(current.maximum);
  return left > right ? 'higher' : left < right ? 'lower' : 'equal';
}

function TrendIndicatorV1({ trend, reference }: { trend: TrendV1; reference: PeriodIdV1 }) {
  const Icon = trend === 'higher' ? TrendingUp : trend === 'lower' ? TrendingDown : MoveRight;
  const verb = trend === 'higher' ? 'Subiu' : trend === 'lower' ? 'Caiu' : 'Manteve';
  const label = `${verb} em relação ao ${PERIOD_LABELS_V1[reference]}`;
  return (
    <span className={'pa-trend pa-trend--' + trend} role="img" aria-label={label} title={label}>
      <Icon size={17} strokeWidth={2.4} aria-hidden="true" />
    </span>
  );
}

function SubjectIconV1({ label, size = 18 }: { label: string; size?: number }) {
  const normalized = label
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '')
    .toLocaleLowerCase('pt-BR');

  let Icon = BookOpenCheck;
  if (normalized.includes('matematica')) Icon = Calculator;
  else if (normalized.includes('portugues')) Icon = BookOpenText;
  else if (normalized.includes('historia')) Icon = Landmark;
  else if (normalized.includes('geografia')) Icon = Globe2;
  else if (normalized.includes('ingles')) Icon = Languages;
  else if (normalized.includes('educacao fisica')) Icon = Dumbbell;
  else if (normalized.includes('arte')) Icon = Palette;
  else if (normalized.includes('musica')) Icon = Music2;
  else if (normalized.includes('informatica') || normalized.includes('tecnologia')) Icon = Monitor;
  else if (normalized === 'fisica' || normalized.includes('fisica ')) Icon = Atom;
  else if (
    normalized.includes('ciencia') ||
    normalized.includes('quimica') ||
    normalized.includes('biologia')
  ) Icon = FlaskConical;

  return (
    <span className="pa-subject-icon" aria-hidden="true">
      <Icon size={size} strokeWidth={1.8} />
    </span>
  );
}

function PageIntroV1({
  icon,
  eyebrow,
  title,
  aside,
}: {
  icon: ReactNode;
  eyebrow: string;
  title: string;
  aside?: ReactNode;
}) {
  return (
    <div className="pa-workspace-intro">
      <span aria-hidden="true">{icon}</span>
      <div>
        <p className="pa-workspace-eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
      </div>
      {aside ? <div className="pa-workspace-intro-aside">{aside}</div> : null}
    </div>
  );
}

function SummaryV1({
  data,
  profile,
  onOpenSubject,
}: {
  data: SelfResponseV1;
  profile: ReactNode;
  onOpenSubject: (subjectId: number, period?: PeriodIdV1) => void;
}) {
  const subjects = useMemo(() => [...data.subjects].sort((a, b) => a.order - b.order), [data.subjects]);
  // Only periods present in the payload get a tab: the server already dropped what the admin
  // has not released. Recoveries share one tab, shown only when any REC was released.
  const hasRecovery = subjects.some((subject) =>
    subject.periods.some((period) => RECOVERY_PERIODS_V1.includes(period.period)),
  );
  const available: SummaryKeyV1[] = [
    ...visibleMainPeriodsV1(subjects),
    ...(hasRecovery ? (['REC'] as const) : []),
  ];
  const [selected, setSelected] = useState<SummaryKeyV1>(available[0] ?? 'T1');
  const active = available.includes(selected) ? selected : (available[0] ?? 'T1');
  // Null until the first switch, so the list does not animate twice on mount.
  const [listMotion, setListMotion] = useState<'forward' | 'back' | null>(null);
  const recoveryPeriodsOf = (subject: SubjectV1) =>
    subject.periods.filter((period) => RECOVERY_PERIODS_V1.includes(period.period));
  const published = subjects.filter((subject) =>
    active === 'REC' ? recoveryPeriodsOf(subject).length > 0 : subjectPeriodV1(subject, active),
  );
  const situation = data.profile.annualSituation;
  const finalResult = situation
    ? ANNUAL_SITUATION_LABELS_V1[situation]
    : data.profile.result in finalResultLabelsV1
      ? finalResultLabelsV1[data.profile.result as keyof typeof finalResultLabelsV1]
      : null;
  const inRecovery = subjects.filter((subject) => subject.annualSituation === 'recovery-pending');

  return (
    <div className="pa-workspace-view">
      {profile}
      <section className="pa-boletim-section" aria-labelledby="pa-summary-title">
        {/* Present only when the server releases it: EM RECUPERAÇÃO with T3, every other
            situation with the final disclosure. Assisted students never receive one. */}
        {finalResult ? (
          <Card className={'pa-final-result pa-final-result--' + finalResult.tone}>
            <Card.Content className="pa-final-result-content">
              <div>
                <p className="pa-workspace-eyebrow">
                  {situation === 'in-recovery' ? 'Situação' : 'Resultado final'}{' '}
                  {data.profile.link.academicYear}
                </p>
                <p className="pa-final-result-label">{finalResult.label}</p>
                {situation === 'in-recovery' && inRecovery.length ? (
                  <p className="pa-final-result-detail">
                    Recuperação em {inRecovery.map((subject) => subject.label).join(', ')}
                  </p>
                ) : null}
              </div>
              <Chip size="sm" variant="soft" color={finalResult.tone}>
                Oficial
              </Chip>
            </Card.Content>
          </Card>
        ) : null}

        {available.length ? (
          <Tabs
            className="pa-boletim-period-tabs"
            selectedKey={active}
            onSelectionChange={(key) => {
              const next = String(key) as SummaryKeyV1;
              setListMotion(available.indexOf(next) < available.indexOf(active) ? 'back' : 'forward');
              setSelected(next);
            }}
          >
            <Tabs.ListContainer>
              <Tabs.List aria-label="Período das notas">
                {available.map((period) => (
                  <Tabs.Tab id={period} key={period}>
                    {period === 'REC'
                      ? 'Recuperação'
                      : (BULLETIN_PERIOD_LABELS_V1[period] ?? PERIOD_LABELS_V1[period])}
                    <Tabs.Indicator />
                  </Tabs.Tab>
                ))}
              </Tabs.List>
            </Tabs.ListContainer>
          </Tabs>
        ) : null}

        <div className="pa-workspace-heading-row">
          <div>
            <h2 id="pa-summary-title">Minhas notas</h2>
          </div>
          <Chip size="sm" color="accent" variant="soft">
            {published.length} {published.length === 1 ? 'disciplina' : 'disciplinas'}
          </Chip>
        </div>

        {/* Keyed by period so the list slides in from the side of the tab that was chosen. */}
        <div key={active} className={listMotion ? 'pa-tab-motion pa-tab-motion--' + listMotion : undefined}>
        <ListBox
          aria-label="Disciplinas publicadas"
          selectionMode="none"
          onAction={(key) => {
            // Open the discipline on the period being browsed (first recovery for the REC tab).
            const subject = published.find((item) => item.subjectId === Number(key));
            const period =
              active === 'REC' ? (subject && recoveryPeriodsOf(subject)[0]?.period) : active;
            onOpenSubject(Number(key), period);
          }}
          className="pa-workspace-list"
        >
          {published.map((subject) => {
            const outcome = subjectSituationV1(subject);
            return (
              <ListBox.Item
                id={String(subject.subjectId)}
                key={subject.subjectId}
                textValue={subject.label}
              >
                <SubjectIconV1 label={subject.label} />
                <div className="pa-workspace-list-copy">
                  <Label>{subject.label}</Label>
                  {outcome ? (
                    <Chip size="sm" variant="soft" color={outcome.tone} className="pa-list-outcome">
                      <span className="pa-visually-hidden">Resultado oficial: </span>
                      {outcome.label}
                    </Chip>
                  ) : null}
                </div>
                {active === 'REC' ? (
                  <span className="pa-recovery-marks">
                    {recoveryPeriodsOf(subject).map((period) => (
                      <span key={period.period} className="pa-recovery-mark">
                        <span className="pa-recovery-mark-label">
                          {PERIOD_LABELS_V1[period.period].replace('REC ', '')} tri
                        </span>
                        <strong><StudentMarkV1 mark={period.final} /></strong>
                      </span>
                    ))}
                  </span>
                ) : (
                  <strong>
                    <StudentMarkV1 mark={subjectPeriodV1(subject, active)?.final ?? { kind: 'absent' }} />
                  </strong>
                )}
              </ListBox.Item>
            );
          })}
        </ListBox>
        </div>
      </section>
    </div>
  );
}

/**
 * Activity descriptions reach 120 characters. Show two lines and offer "Ver tudo" only when the
 * text really overflows at the current width (measured, not guessed from its length), so a wide
 * screen that fits the whole description shows no toggle. Nothing is ever permanently hidden.
 */
function PartialLabelV1({ label }: { label: string }) {
  const text = useRef<HTMLSpanElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  useEffect(() => {
    const element = text.current;
    if (!element || expanded) return;
    const measure = () => setOverflowing(element.scrollHeight > element.clientHeight + 1);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [label, expanded]);
  return (
    <div className="pa-workspace-list-copy">
      <span ref={text} className={'pa-partial-label' + (expanded ? ' is-expanded' : '')}>
        {label}
      </span>
      {overflowing || expanded ? (
        <button
          type="button"
          className="pa-partial-more"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? 'Ver menos' : 'Ver tudo'}
        </button>
      ) : null}
    </div>
  );
}

/** Status copy only restates the server's mark kind/classification; it never infers a result. */
function periodStatusV1(period: PeriodV1 | undefined, recovery: boolean) {
  const final = period?.final;
  if (!final || final.kind === 'absent') return 'Ainda não lançada';
  if (final.kind === 'recovery-pending') return 'Aguardando nota';
  if (final.kind !== 'score' || final.meetsMinimum === null) return 'Nota em análise';
  if (final.meetsMinimum) return recovery ? 'Atingiu o mínimo' : 'Parabéns';
  return 'Abaixo do esperado';
}

function SubjectV1View({
  subject,
  subjects,
  onSubjectChange,
  initialPeriod,
}: {
  subject: SubjectV1;
  subjects: readonly SubjectV1[];
  onSubjectChange: (id: number) => void;
  initialPeriod?: PeriodIdV1;
}) {
  const available = subject.periods.map((period) => period.period);
  const [selected, setSelected] = useState<PeriodIdV1>(
    initialPeriod && available.includes(initialPeriod) ? initialPeriod : (available[0] ?? 'T1'),
  );
  const active = available.includes(selected) ? selected : (available[0] ?? 'T1');
  // Direction follows tab order (3º → 1º slides back); null until the first switch, since the
  // whole view already slides in when it opens.
  const [periodMotion, setPeriodMotion] = useState<'forward' | 'back' | null>(null);
  // The view remounts per subject, resetting the horizontal scroller to its start; bring the
  // chosen subject back into view (inline only, so the page itself does not jump).
  const subjectTabs = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // On mount the panel is still being revealed (and HeroUI's scroll shadow measures after
    // paint), so an immediate scroll is dropped. Retry after paint and after the slide-in.
    // Horizontal only: moving the bar's own scroller never scrolls the page vertically.
    const reveal = () => {
      const tab = subjectTabs.current?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]');
      const scroller = tab?.closest<HTMLElement>('.scroll-shadow') ?? tab?.parentElement?.parentElement;
      if (!tab || !scroller) return;
      const offset = tab.offsetLeft - (scroller.clientWidth - tab.offsetWidth) / 2;
      scroller.scrollLeft = Math.max(0, Math.min(offset, scroller.scrollWidth - scroller.clientWidth));
    };
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(reveal);
    });
    const settled = setTimeout(reveal, 260);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(settled);
    };
  }, [subject.subjectId]);
  const period = subjectPeriodV1(subject, active);
  const mark = scoreOfV1(period);
  const recoveryOf = RECOVERY_OF_V1[active];
  const trendReference = TREND_REFERENCE_V1[active];
  const trend = trendReference
    ? trendV1(mark, scoreOfV1(subjectPeriodV1(subject, trendReference)))
    : null;
  const official = subjectSituationV1(subject);
  const result = official?.label ?? 'Em curso';
  const resultColor = official?.tone ?? 'default';

  return (
    <div className="pa-workspace-view">
      <PageIntroV1
        icon={<SubjectIconV1 label={subject.label} size={20} />}
        eyebrow="Disciplina"
        title={subject.label}
        aside={
          <Chip size="sm" variant="soft" color={resultColor}>
            <span className="pa-visually-hidden">Resultado oficial: </span>
            {result}
          </Chip>
        }
      />

      <div ref={subjectTabs}>
      <Tabs
        selectedKey={String(subject.subjectId)}
        onSelectionChange={(key) => onSubjectChange(Number(key))}
      >
        <Tabs.ListContainer>
          <Tabs.List aria-label="Trocar disciplina">
            {subjects.map((item) => (
              <Tabs.Tab id={String(item.subjectId)} key={item.subjectId}>
                {item.label}
                <Tabs.Indicator />
              </Tabs.Tab>
            ))}
          </Tabs.List>
        </Tabs.ListContainer>
      </Tabs>
      </div>

      <Tabs
        selectedKey={active}
        onSelectionChange={(key) => {
          const next = String(key) as PeriodIdV1;
          setPeriodMotion(available.indexOf(next) < available.indexOf(active) ? 'back' : 'forward');
          setSelected(next);
        }}
      >
        <Tabs.ListContainer>
          <Tabs.List aria-label={'Períodos de ' + subject.label}>
            {/* Each period tab carries its own final mark, so the evolution reads at a glance. */}
            {available.map((item) => (
              <Tabs.Tab id={item} key={item} className="pa-period-tab">
                <span className="pa-period-tab-label">{PERIOD_LABELS_V1[item]}</span>
                <span className="pa-period-tab-mark">
                  <StudentMarkV1 mark={subjectPeriodV1(subject, item)?.final ?? { kind: 'absent' }} />
                </span>
                <Tabs.Indicator />
              </Tabs.Tab>
            ))}
          </Tabs.List>
        </Tabs.ListContainer>
        <Tabs.Panel id={active} key={active}>
          {/* One card per trimester: the final mark heads it and partials follow, so it is never repeated. */}
          <Card
            className={
              'pa-score-card pa-score-card--' +
              scoreToneV1(mark) +
              (periodMotion ? ' pa-tab-motion pa-tab-motion--' + periodMotion : '')
            }
          >
            <Card.Content className="pa-score-card-content">
              <div className="pa-score-card-copy">
                <span className="pa-score-card-label">
                  {recoveryOf ? `Recuperação do ${recoveryOf}` : 'Nota do trimestre'}
                </span>
                <span className="pa-score-card-status">{periodStatusV1(period, Boolean(recoveryOf))}</span>
              </div>
              <div className="pa-score-card-value" aria-label="Nota do período">
                {mark ? (
                  <>
                    {trend && trendReference ? (
                      <TrendIndicatorV1 trend={trend} reference={trendReference} />
                    ) : null}
                    <strong>{number.format(mark.value)}</strong>
                    {mark.maximum !== null && mark.maximum !== undefined ? (
                      <span>/ {number.format(mark.maximum)}</span>
                    ) : null}
                  </>
                ) : (
                  <strong><StudentMarkV1 mark={period?.final ?? { kind: 'absent' }} /></strong>
                )}
              </div>
            </Card.Content>
            {/* No `partials` key means the admin did not release the breakdown (showPartials off):
                render nothing rather than claiming there are no activities. */}
            {period?.partials === undefined ? null : (
            <div className="pa-score-card-partials">
              {period.partials.length ? (
                <>
                  <p className="pa-score-card-partials-title">Detalhamento</p>
                  {/* A plain list: nothing here is selectable, and each row may hold a toggle. */}
                  <ul aria-label="Avaliações publicadas" className="pa-partials-list">
                    {period.partials.map((partial) => {
                      // Same rule as the bulletin table: observed blank → Não fez, numeric 0 → Tirou zero.
                      const zero = partial.mark.kind === 'score' && partial.mark.value === 0;
                      return (
                        <li key={partial.assessmentId}>
                          <PartialLabelV1 label={partial.label} />
                          <strong>
                            {partial.notDone || zero ? (
                              <GranularStatusV1 notDone={partial.notDone} zero={zero} />
                            ) : (
                              <StudentMarkV1 mark={partial.mark} showMaximum />
                            )}
                          </strong>
                        </li>
                      );
                    })}
                  </ul>
                </>
              ) : (
                <Description className="pa-score-card-empty">
                  Nenhuma avaliação parcial publicada.
                </Description>
              )}
            </div>
            )}
          </Card>
        </Tabs.Panel>
      </Tabs>
    </div>
  );
}

export function StudentPortalWorkspaceV1({
  data,
  profile,
}: {
  data: SelfResponseV1;
  profile: ReactNode;
}) {
  const subjects = useMemo(() => [...data.subjects].sort((a, b) => a.order - b.order), [data.subjects]);
  const firstSubjectId = subjects[0]?.subjectId ?? 0;
  const [area, setArea] = useState<WorkspaceAreaV1>('summary');
  const [selectedSubjectId, setSelectedSubjectId] = useState(firstSubjectId);
  const [motionDirection, setMotionDirection] = useState<'forward' | 'back'>('forward');
  const [openPeriod, setOpenPeriod] = useState<PeriodIdV1 | undefined>();
  const previousArea = useRef<WorkspaceAreaV1>('summary');
  const selectedSubject =
    subjects.find((subject) => subject.subjectId === selectedSubjectId) ?? subjects[0];

  const applyWorkspaceState = (
    nextArea: WorkspaceAreaV1,
    subjectId = selectedSubjectId,
    direction?: 'forward' | 'back',
  ) => {
    const nextSubjectId = subjects.some((subject) => subject.subjectId === subjectId)
      ? subjectId
      : firstSubjectId;
    const resolvedDirection =
      direction ?? (previousArea.current === 'subject' && nextArea === 'summary' ? 'back' : 'forward');
    previousArea.current = nextArea;
    setMotionDirection(resolvedDirection);
    setSelectedSubjectId(nextSubjectId);
    setArea(nextArea);
  };

  const pushWorkspaceState = (nextArea: WorkspaceAreaV1, subjectId = selectedSubjectId) => {
    if (typeof window !== 'undefined') {
      const current = window.history.state && typeof window.history.state === 'object'
        ? window.history.state
        : {};
      window.history.pushState(
        {
          ...current,
          [WORKSPACE_HISTORY_KEY_V1]: { area: nextArea, subjectId },
        },
        '',
      );
    }
    applyWorkspaceState(nextArea, subjectId);
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const current = window.history.state && typeof window.history.state === 'object'
      ? window.history.state
      : {};
    const initial = current[WORKSPACE_HISTORY_KEY_V1];

    if (initial && (initial.area === 'summary' || initial.area === 'subject')) {
      const initialSubjectId = Number(initial.subjectId);
      const validSubjectId = subjects.some((subject) => subject.subjectId === initialSubjectId)
        ? initialSubjectId
        : firstSubjectId;
      previousArea.current = initial.area;
      setSelectedSubjectId(validSubjectId);
      setArea(initial.area);
    } else {
      window.history.replaceState(
        {
          ...current,
          [WORKSPACE_HISTORY_KEY_V1]: { area: 'summary', subjectId: firstSubjectId },
        },
        '',
      );
    }

    const restore = (event: PopStateEvent) => {
      const state =
        event.state && typeof event.state === 'object'
          ? event.state[WORKSPACE_HISTORY_KEY_V1]
          : undefined;
      if (!state || (state.area !== 'summary' && state.area !== 'subject')) return;
      const requestedSubjectId = Number(state.subjectId);
      const nextSubjectId = subjects.some((subject) => subject.subjectId === requestedSubjectId)
        ? requestedSubjectId
        : firstSubjectId;
      previousArea.current = state.area;
      setMotionDirection(state.area === 'summary' ? 'back' : 'forward');
      setSelectedSubjectId(nextSubjectId);
      setArea(state.area);
    };

    window.addEventListener('popstate', restore);
    return () => window.removeEventListener('popstate', restore);
  }, [firstSubjectId, subjects]);

  const openSubject = (subjectId: number, period?: PeriodIdV1) => {
    setOpenPeriod(period);
    pushWorkspaceState('subject', subjectId);
  };

  const selectSubject = (subjectId: number) => {
    setOpenPeriod(undefined);
    pushWorkspaceState('subject', subjectId);
  };

  return (
    <Tabs
      className="pa-student-workspace"
      selectedKey={area}
      onSelectionChange={(key) => {
        const nextArea = String(key) as WorkspaceAreaV1;
        if (nextArea !== area) pushWorkspaceState(nextArea, selectedSubject?.subjectId ?? firstSubjectId);
      }}
    >
      <Surface variant="default" className="pa-workspace-nav-surface">
        <Tabs.ListContainer>
          <Tabs.List aria-label="Áreas do Portal do Aluno">
            <Tabs.Tab id="summary">
              <LayoutDashboard size={17} aria-hidden="true" />
              Boletim
              <Tabs.Indicator />
            </Tabs.Tab>
            <Tabs.Tab id="subject" isDisabled={!selectedSubject}>
              <BookOpenCheck size={17} aria-hidden="true" />
              Disciplina
              <Tabs.Indicator />
            </Tabs.Tab>
          </Tabs.List>
        </Tabs.ListContainer>
      </Surface>

      <Tabs.Panel id="summary">
        <div
          key={'summary-' + area}
          className={'pa-tab-motion pa-tab-motion--' + motionDirection}
        >
          <SummaryV1 data={data} profile={profile} onOpenSubject={openSubject} />
        </div>
      </Tabs.Panel>
      <Tabs.Panel id="subject">
        {selectedSubject ? (
          <div
            key={'subject-' + selectedSubject.subjectId + '-' + (openPeriod ?? '')}
            className={'pa-tab-motion pa-tab-motion--' + motionDirection}
          >
            <SubjectV1View
              subject={selectedSubject}
              subjects={subjects}
              onSubjectChange={selectSubject}
              initialPeriod={openPeriod}
            />
          </div>
        ) : null}
      </Tabs.Panel>
    </Tabs>
  );
}
