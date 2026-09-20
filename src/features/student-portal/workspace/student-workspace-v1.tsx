import { useMemo, useState, type ReactNode } from 'react';
import {
  Card,
  Chip,
  Description,
  Label,
  ListBox,
  ProgressBar,
  ProgressCircle,
  SearchField,
  Surface,
  Tabs,
} from '@heroui/react';
import { BarChart3, BookOpenCheck, GraduationCap, LayoutDashboard } from 'lucide-react';
import type { SelfResponseV1 } from '../../../../shared/student-portal-contracts/self-v1';
import { StudentMarkV1 } from '../grades/student-mark-v1';
import './student-workspace-v1.css';

type SubjectV1 = SelfResponseV1['subjects'][number];
type PeriodV1 = SubjectV1['periods'][number];
type PeriodIdV1 = PeriodV1['period'];
type ScoreMarkV1 = Extract<PeriodV1['final'], { kind: 'score' }>;
type WorkspaceAreaV1 = 'summary' | 'report' | 'subject' | 'evolution';

const MAIN_PERIODS_V1: readonly PeriodIdV1[] = ['T1', 'T2', 'T3'];
const PERIOD_LABELS_V1: Record<PeriodIdV1, string> = {
  T1: '1º Tri',
  T2: '2º Tri',
  T3: '3º Tri',
  REC1: 'REC 1º',
  REC2: 'REC 2º',
  REC3: 'REC 3º',
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
      <section aria-labelledby="pa-summary-title">
        <div className="pa-workspace-heading-row">
          <div>
            <p className="pa-workspace-eyebrow">Notas publicadas</p>
            <h2 id="pa-summary-title">Minhas notas</h2>
          </div>
          <Chip size="sm" color="accent" variant="soft">
            {published.length} {published.length === 1 ? 'disciplina' : 'disciplinas'}
          </Chip>
        </div>

        {available.length ? (
          <Tabs selectedKey={active} onSelectionChange={(key) => setSelected(String(key) as PeriodIdV1)}>
            <Tabs.ListContainer>
              <Tabs.List aria-label="Período das notas">
                {available.map((period) => (
                  <Tabs.Tab id={period} key={period}>
                    {PERIOD_LABELS_V1[period]}
                    <Tabs.Indicator />
                  </Tabs.Tab>
                ))}
              </Tabs.List>
            </Tabs.ListContainer>
          </Tabs>
        ) : null}

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
                  <Description>{PERIOD_LABELS_V1[active]}</Description>
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

function ReportV1({
  data,
  grades,
}: {
  data: SelfResponseV1;
  grades: (data: SelfResponseV1) => ReactNode;
}) {
  const [query, setQuery] = useState('');
  const normalizedQuery = query.trim().toLocaleLowerCase('pt-BR');
  const visible = useMemo(() => {
    if (!normalizedQuery) return data.subjects;
    return data.subjects.filter((subject) =>
      subject.label.toLocaleLowerCase('pt-BR').includes(normalizedQuery),
    );
  }, [data.subjects, normalizedQuery]);
  const filtered = useMemo(
    () => (normalizedQuery ? { ...data, subjects: visible } : data),
    [data, normalizedQuery, visible],
  );

  return (
    <div className="pa-workspace-view">
      <PageIntroV1
        icon={<GraduationCap size={22} />}
        eyebrow={'Ano letivo ' + data.profile.link.academicYear}
        title="Boletim"
      />
      <SearchField fullWidth value={query} onChange={setQuery} aria-label="Buscar disciplina">
        <SearchField.Group>
          <SearchField.SearchIcon />
          <SearchField.Input placeholder="Buscar disciplina..." />
          <SearchField.ClearButton />
        </SearchField.Group>
      </SearchField>
      {visible.length ? (
        grades(filtered)
      ) : (
        <Card>
          <Card.Content>Nenhuma disciplina corresponde à busca.</Card.Content>
        </Card>
      )}
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

function EvolutionV1({
  subjects,
  selectedSubjectId,
  onSubjectChange,
}: {
  subjects: readonly SubjectV1[];
  selectedSubjectId: number;
  onSubjectChange: (id: number) => void;
}) {
  const subject = subjects.find((item) => item.subjectId === selectedSubjectId) ?? subjects[0];
  if (!subject) return null;
  const points = MAIN_PERIODS_V1.flatMap((period) => {
    const source = subjectPeriodV1(subject, period);
    const mark = scoreOfV1(source);
    return mark ? [{ period, mark }] : [];
  });

  return (
    <div className="pa-workspace-view">
      <PageIntroV1 icon={<BarChart3 size={22} />} eyebrow="Histórico publicado" title="Evolução" />

      <Tabs
        selectedKey={String(subject.subjectId)}
        onSelectionChange={(key) => onSubjectChange(Number(key))}
      >
        <Tabs.ListContainer>
          <Tabs.List aria-label="Disciplina da evolução">
            {subjects.map((item) => (
              <Tabs.Tab id={String(item.subjectId)} key={item.subjectId}>
                {item.label}
                <Tabs.Indicator />
              </Tabs.Tab>
            ))}
          </Tabs.List>
        </Tabs.ListContainer>
      </Tabs>

      <Card>
        <Card.Header>
          <Card.Title>{subject.label}</Card.Title>
          <Card.Description>Notas numéricas publicadas por trimestre</Card.Description>
        </Card.Header>
        <Card.Content className="pa-evolution-bars">
          {points.length ? (
            points.map(({ period, mark }) => (
              <ProgressBar
                key={period}
                aria-label={PERIOD_LABELS_V1[period] + ': ' + number.format(mark.value)}
                value={mark.value}
                maxValue={progressMaxV1(mark)}
                color={progressColorV1(mark)}
              >
                <div className="pa-progress-label-row">
                  <Label>{PERIOD_LABELS_V1[period]}</Label>
                  <ProgressBar.Output />
                </div>
                <ProgressBar.Track>
                  <ProgressBar.Fill />
                </ProgressBar.Track>
              </ProgressBar>
            ))
          ) : (
            <Description>Não há notas numéricas publicadas para esta disciplina.</Description>
          )}
        </Card.Content>
      </Card>
    </div>
  );
}

export function StudentPortalWorkspaceV1({
  data,
  profile,
  grades,
}: {
  data: SelfResponseV1;
  profile: ReactNode;
  grades: (data: SelfResponseV1) => ReactNode;
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
              Resumo
              <Tabs.Indicator />
            </Tabs.Tab>
            <Tabs.Tab id="report">
              <GraduationCap size={17} aria-hidden="true" />
              Boletim
              <Tabs.Indicator />
            </Tabs.Tab>
            <Tabs.Tab id="subject" isDisabled={!selectedSubject}>
              <BookOpenCheck size={17} aria-hidden="true" />
              Disciplina
              <Tabs.Indicator />
            </Tabs.Tab>
            <Tabs.Tab id="evolution" isDisabled={!selectedSubject}>
              <BarChart3 size={17} aria-hidden="true" />
              Evolução
              <Tabs.Indicator />
            </Tabs.Tab>
          </Tabs.List>
        </Tabs.ListContainer>
      </Surface>

      <Tabs.Panel id="summary">
        <SummaryV1 data={data} profile={profile} onOpenSubject={openSubject} />
      </Tabs.Panel>
      <Tabs.Panel id="report">
        <ReportV1 data={data} grades={grades} />
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
      <Tabs.Panel id="evolution">
        <EvolutionV1
          subjects={subjects}
          selectedSubjectId={selectedSubjectId}
          onSubjectChange={setSelectedSubjectId}
        />
      </Tabs.Panel>
    </Tabs>
  );
}
