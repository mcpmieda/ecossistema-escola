import { useMemo, useState, type ReactNode } from 'react';
import {
  Card,
  Chip,
  Description,
  Label,
  ListBox,
  ProgressCircle,
  Surface,
  Tabs,
} from '@heroui/react';
import { BookOpenCheck, LayoutDashboard } from 'lucide-react';
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
function progressColorV1(mark: ScoreMarkV1 | null) {
  if (!mark || mark.meetsMinimum === null) return 'default' as const;
  return mark.meetsMinimum ? ('success' as const) : ('danger' as const);
}
function progressMaxV1(mark: ScoreMarkV1 | null) {
  if (!mark) return 100;
  if (mark.maximum !== null && mark.maximum > 0) return mark.maximum;
  return Math.max(mark.value, 1);
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
    <Surface variant="secondary" className="pa-workspace-intro">
      <span aria-hidden="true">{icon}</span>
      <div>
        <p className="pa-workspace-eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
      </div>
    </Surface>
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
                <BookOpenCheck size={18} aria-hidden="true" />
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
      <PageIntroV1 icon={<BookOpenCheck size={22} />} eyebrow="Disciplina" title={subject.label} />

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
        <Tabs.Panel id={active}>
          <div className="pa-workspace-grid">
            <Card variant="secondary">
              <Card.Header>
                <Card.Title>Nota do período</Card.Title>
                <Card.Description>{PERIOD_LABELS_V1[active]}</Card.Description>
              </Card.Header>
              <Card.Content className="pa-progress-card-content">
                <ProgressCircle
                  aria-label="Progresso da nota do período"
                  value={mark?.value ?? 0}
                  maxValue={progressMaxV1(mark)}
                  size="lg"
                  color={progressColorV1(mark)}
                >
                  <ProgressCircle.Track>
                    <ProgressCircle.TrackCircle />
                    <ProgressCircle.FillCircle />
                  </ProgressCircle.Track>
                </ProgressCircle>
                <div>
                  <strong className="pa-published-score">
                    {mark ? number.format(mark.value) : '—'}
                  </strong>
                  {mark?.maximum !== null && mark?.maximum !== undefined ? (
                    <Description>de {number.format(mark.maximum)}</Description>
                  ) : null}
                  <Chip size="sm" variant="soft" color={progressColorV1(mark)}>
                    {mark?.meetsMinimum === true
                      ? 'Atinge o mínimo'
                      : mark?.meetsMinimum === false
                        ? 'Abaixo do mínimo'
                        : 'Classificação indisponível'}
                  </Chip>
                </div>
              </Card.Content>
            </Card>

            <Card>
              <Card.Header>
                <Card.Title>Avaliações publicadas</Card.Title>
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
                          <Description>{partial.notDone ? 'Não fez' : 'Nota publicada'}</Description>
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
                <span>Nota do período</span>
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
  const [area, setArea] = useState<WorkspaceAreaV1>('summary');
  const [selectedSubjectId, setSelectedSubjectId] = useState(subjects[0]?.subjectId ?? 0);
  const selectedSubject =
    subjects.find((subject) => subject.subjectId === selectedSubjectId) ?? subjects[0];

  const openSubject = (subjectId: number) => {
    setSelectedSubjectId(subjectId);
    setArea('subject');
  };

  return (
    <Tabs
      className="pa-student-workspace"
      selectedKey={area}
      onSelectionChange={(key) => setArea(String(key) as WorkspaceAreaV1)}
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
        <SummaryV1 data={data} profile={profile} onOpenSubject={openSubject} />
      </Tabs.Panel>
      <Tabs.Panel id="subject">
        {selectedSubject ? (
          <SubjectV1View
            subject={selectedSubject}
            subjects={subjects}
            onSubjectChange={setSelectedSubjectId}
          />
        ) : null}
      </Tabs.Panel>
    </Tabs>
  );
}
