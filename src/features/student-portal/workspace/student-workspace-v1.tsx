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
  Music2,
  Palette,
} from 'lucide-react';
import type { SelfResponseV1 } from '../../../../shared/student-portal-contracts/self-v1';
import { StudentMarkV1 } from '../grades/student-mark-v1';
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
  'failed-attendance': 'Reprovado por frequência',
} as const;
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
}: {
  icon: ReactNode;
  eyebrow: string;
  title: string;
}) {
  return (
    <div className="pa-workspace-intro">
      <span aria-hidden="true">{icon}</span>
      <div>
        <p className="pa-workspace-eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
      </div>
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
  onOpenSubject: (subjectId: number) => void;
}) {
  const subjects = useMemo(() => [...data.subjects].sort((a, b) => a.order - b.order), [data.subjects]);
  const available = visibleMainPeriodsV1(subjects);
  const [selected, setSelected] = useState<PeriodIdV1>(available[0] ?? 'T1');
  const active = available.includes(selected) ? selected : (available[0] ?? 'T1');
  const published = subjects.filter((subject) => subjectPeriodV1(subject, active));

  return (
    <div className="pa-workspace-view">
      {profile}
      <section className="pa-boletim-section" aria-labelledby="pa-summary-title">
        {available.length ? (
          <Tabs
            className="pa-boletim-period-tabs"
            selectedKey={active}
            onSelectionChange={(key) => setSelected(String(key) as PeriodIdV1)}
          >
            <Tabs.ListContainer>
              <Tabs.List aria-label="Período das notas">
                {available.map((period) => (
                  <Tabs.Tab id={period} key={period}>
                    {BULLETIN_PERIOD_LABELS_V1[period] ?? PERIOD_LABELS_V1[period]}
                    <Tabs.Indicator />
                  </Tabs.Tab>
                ))}
              </Tabs.List>
            </Tabs.ListContainer>
          </Tabs>
        ) : null}

        <div className="pa-workspace-heading-row">
          <div>
            <p className="pa-workspace-eyebrow">Notas publicadas</p>
            <h2 id="pa-summary-title">Minhas notas</h2>
          </div>
          <Chip size="sm" color="accent" variant="soft">
            {published.length} {published.length === 1 ? 'disciplina' : 'disciplinas'}
          </Chip>
        </div>

        <ListBox
          aria-label="Disciplinas publicadas"
          selectionMode="none"
          onAction={(key) => onOpenSubject(Number(key))}
          className="pa-workspace-list"
        >
          {published.map((subject) => {
            const period = subjectPeriodV1(subject, active);
            return (
              <ListBox.Item
                id={String(subject.subjectId)}
                key={subject.subjectId}
                textValue={subject.label}
              >
                <SubjectIconV1 label={subject.label} />
                <div className="pa-workspace-list-copy">
                  <Label>{subject.label}</Label>
                </div>
                <strong><StudentMarkV1 mark={period?.final ?? { kind: 'absent' }} /></strong>
              </ListBox.Item>
            );
          })}
        </ListBox>
      </section>
    </div>
  );
}

function SubjectV1View({
  subject,
  subjects,
  onSubjectChange,
}: {
  subject: SubjectV1;
  subjects: readonly SubjectV1[];
  onSubjectChange: (id: number) => void;
}) {
  const available = subject.periods.map((period) => period.period);
  const [selected, setSelected] = useState<PeriodIdV1>(available[0] ?? 'T1');
  const active = available.includes(selected) ? selected : (available[0] ?? 'T1');
  const period = subjectPeriodV1(subject, active);
  const mark = scoreOfV1(period);
  const result = subject.officialOutcome ? resultLabels[subject.officialOutcome] : 'Em curso';

  return (
    <div className="pa-workspace-view">
      <PageIntroV1
        icon={<SubjectIconV1 label={subject.label} size={20} />}
        eyebrow="Disciplina"
        title={subject.label}
      />

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

      <Tabs selectedKey={active} onSelectionChange={(key) => setSelected(String(key) as PeriodIdV1)}>
        <Tabs.ListContainer>
          <Tabs.List aria-label={'Períodos de ' + subject.label}>
            {available.map((item) => (
              <Tabs.Tab id={item} key={item}>
                {PERIOD_LABELS_V1[item]}
                <Tabs.Indicator />
              </Tabs.Tab>
            ))}
          </Tabs.List>
        </Tabs.ListContainer>
        <Tabs.Panel id={active} key={active}>
          <div className="pa-workspace-grid pa-tab-motion pa-tab-motion--forward">
            <Card className={'pa-score-card pa-score-card--' + scoreToneV1(mark)}>
              <Card.Content className="pa-score-card-content">
                <div className="pa-score-card-copy">
                  <span className="pa-score-card-label">Sua nota</span>
                  <span className="pa-score-card-status">
                    {mark?.meetsMinimum === true
                      ? 'Parabéns'
                      : mark?.meetsMinimum === false
                        ? 'Abaixo do esperado'
                        : 'Nota em análise'}
                  </span>
                </div>
                <div className="pa-score-card-value" aria-label="Nota do período">
                  <strong>{mark ? number.format(mark.value) : '—'}</strong>
                  {mark?.maximum !== null && mark?.maximum !== undefined ? (
                    <span>/ {number.format(mark.maximum)}</span>
                  ) : null}
                </div>
              </Card.Content>
            </Card>

            <Card>
              <Card.Header>
                <Card.Title>Detalhe do trimestre</Card.Title>
              </Card.Header>
              <Card.Content>
                {period?.partials?.length ? (
                  <ListBox aria-label="Avaliações publicadas" selectionMode="none">
                    {period.partials.map((partial) => (
                      <ListBox.Item
                        id={String(partial.assessmentId)}
                        key={partial.assessmentId}
                        textValue={partial.label}
                      >
                        <div className="pa-workspace-list-copy">
                          <Label>{partial.label}</Label>
                        </div>
                        <strong>
                          {partial.notDone ? '—' : <StudentMarkV1 mark={partial.mark} showMaximum />}
                        </strong>
                      </ListBox.Item>
                    ))}
                  </ListBox>
                ) : (
                  <Description>Não há avaliações parciais publicadas neste período.</Description>
                )}
              </Card.Content>
              <Card.Footer className="pa-card-footer-between">
                <span>Nota do trimestre</span>
                <strong><StudentMarkV1 mark={period?.final ?? { kind: 'absent' }} /></strong>
              </Card.Footer>
            </Card>
          </div>
        </Tabs.Panel>
      </Tabs>

      <Card variant="secondary">
        <Card.Content className="pa-card-footer-between">
          <span>Resultado oficial</span>
          <strong>{result}</strong>
        </Card.Content>
      </Card>
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

  const openSubject = (subjectId: number) => {
    pushWorkspaceState('subject', subjectId);
  };

  const selectSubject = (subjectId: number) => {
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
            key={'subject-' + selectedSubject.subjectId}
            className={'pa-tab-motion pa-tab-motion--' + motionDirection}
          >
            <SubjectV1View
              subject={selectedSubject}
              subjects={subjects}
              onSubjectChange={selectSubject}
            />
          </div>
        ) : null}
      </Tabs.Panel>
    </Tabs>
  );
}
