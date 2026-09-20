import { useMemo, useState, type ReactNode } from 'react';
import { Button, Card, Chip, Input, Tabs } from '@heroui/react';
import {
  BarChart3,
  BookOpenCheck,
  ChevronRight,
  GraduationCap,
  LayoutDashboard,
  Search,
  Sparkles,
} from 'lucide-react';
import type { SelfResponseV1 } from '../../../../shared/student-portal-contracts/self-v1';
import { StudentMarkV1 } from '../grades/student-grades-v1';
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
const outcomeLabel = {
  'in-progress': 'Em curso',
  approved: 'Aprovado',
  failed: 'Reprovado',
  'failed-attendance': 'Reprovado por frequência',
  'not-applicable': 'Não se aplica',
} as const;
const markNumber = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 20 });

function scoreOfV1(period?: PeriodV1): ScoreMarkV1 | null {
  return period?.final.kind === 'score' ? period.final : null;
}

function subjectPeriodV1(subject: SubjectV1, period: PeriodIdV1) {
  return subject.periods.find((item) => item.period === period);
}

function safeRatioV1(mark: ScoreMarkV1 | null) {
  if (!mark || mark.maximum === null || mark.maximum <= 0) return null;
  return Math.max(0, Math.min(1, mark.value / mark.maximum));
}

function scoreClassV1(mark: ScoreMarkV1 | null) {
  if (!mark || mark.meetsMinimum === null) return 'neutral';
  return mark.meetsMinimum ? 'met' : 'below';
}

function visibleMainPeriodsV1(subjects: readonly SubjectV1[]) {
  return MAIN_PERIODS_V1.filter((period) =>
    subjects.some((subject) => subject.periods.some((item) => item.period === period)),
  );
}

function SubjectGlyphV1({ index }: { index: number }) {
  return (
    <span className={'pa-subject-glyph pa-subject-glyph-' + String((index % 4) + 1)} aria-hidden="true">
      <BookOpenCheck size={18} />
    </span>
  );
}

function GradeRingV1({ mark }: { mark: ScoreMarkV1 | null }) {
  const ratio = safeRatioV1(mark);
  const progress = ratio === null ? 0 : Math.round(ratio * 100);
  return (
    <div className={'pa-grade-ring pa-grade-ring-' + scoreClassV1(mark)}>
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <circle className="pa-grade-ring-track" cx="60" cy="60" r="48" pathLength="100" />
        <circle
          className="pa-grade-ring-value"
          cx="60"
          cy="60"
          r="48"
          pathLength="100"
          strokeDasharray="100"
          strokeDashoffset={100 - progress}
        />
      </svg>
      <div className="pa-grade-ring-copy">
        <strong>{mark ? markNumber.format(mark.value) : '—'}</strong>
        {mark?.maximum !== null && mark?.maximum !== undefined ? (
          <span>de {markNumber.format(mark.maximum)}</span>
        ) : (
          <span>nota publicada</span>
        )}
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
    <div className="pa-workspace-view pa-summary-view">
      {profile}
      <section className="pa-summary-section" aria-labelledby="pa-summary-grades-title">
        <div className="pa-workspace-heading-row">
          <div>
            <p className="pa-workspace-eyebrow">Notas publicadas</p>
            <h2 id="pa-summary-grades-title">Minhas notas</h2>
          </div>
          <Chip size="sm" variant="soft" color="accent">
            {published.length} {published.length === 1 ? 'disciplina' : 'disciplinas'}
          </Chip>
        </div>
        {available.length ? (
          <Tabs
            className="pa-period-tabs"
            selectedKey={active}
            onSelectionChange={(key) => setSelected(String(key) as PeriodIdV1)}
          >
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
        <div className="pa-subject-card-list">
          {published.map((subject, index) => {
            const period = subjectPeriodV1(subject, active);
            return (
              <Button
                key={subject.subjectId}
                variant="ghost"
                className="pa-subject-card-action"
                onPress={() => onOpenSubject(subject.subjectId)}
              >
                <SubjectGlyphV1 index={index} />
                <span className="pa-subject-card-copy">
                  <strong>{subject.label}</strong>
                  <span>{PERIOD_LABELS_V1[active]}</span>
                </span>
                <span className="pa-subject-card-grade">
                  <StudentMarkV1 mark={period?.final ?? { kind: 'absent' }} />
                </span>
                <ChevronRight size={17} aria-hidden="true" />
              </Button>
            );
          })}
        </div>
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
  const visible = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('pt-BR');
    if (!normalized) return data.subjects;
    return data.subjects.filter((subject) =>
      subject.label.toLocaleLowerCase('pt-BR').includes(normalized),
    );
  }, [data.subjects, query]);
  const filtered = useMemo(() => ({ ...data, subjects: visible }), [data, visible]);
  return (
    <div className="pa-workspace-view">
      <section className="pa-view-hero" aria-labelledby="pa-report-title">
        <span className="pa-view-icon" aria-hidden="true"><GraduationCap size={22} /></span>
        <div>
          <p className="pa-workspace-eyebrow">Ano letivo {data.profile.link.academicYear}</p>
          <h2 id="pa-report-title">Boletim</h2>
        </div>
      </section>
      <div className="pa-report-search">
        <Search size={17} aria-hidden="true" />
        <Input
          aria-label="Buscar disciplina"
          type="search"
          placeholder="Buscar disciplina..."
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
        />
      </div>
      {visible.length ? (
        grades(filtered)
      ) : (
        <Card className="pa-search-empty">
          <Card.Content>Nenhuma disciplina corresponde à busca.</Card.Content>
        </Card>
      )}
    </div>
  );
}

function SubjectV1View({
  subject,
  onSubjectChange,
  subjects,
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
  const result = subject.officialOutcome
    ? { approved: 'Aprovado', failed: 'Reprovado', 'failed-attendance': 'Reprovado por frequência' }[subject.officialOutcome]
    : 'Em curso';
  return (
    <div className="pa-workspace-view">
      <section className="pa-subject-hero" aria-labelledby="pa-subject-title">
        <div className="pa-subject-hero-icon" aria-hidden="true"><BookOpenCheck size={24} /></div>
        <div className="pa-subject-hero-copy">
          <p className="pa-workspace-eyebrow">Disciplina</p>
          <h2 id="pa-subject-title">{subject.label}</h2>
        </div>
        <div className="pa-subject-switcher" aria-label="Trocar disciplina">
          {subjects.slice(0, 6).map((item) => (
            <Button
              size="sm"
              variant={item.subjectId === subject.subjectId ? 'secondary' : 'ghost'}
              key={item.subjectId}
              onPress={() => onSubjectChange(item.subjectId)}
            >
              {item.label}
            </Button>
          ))}
        </div>
      </section>
      <Tabs
        className="pa-period-tabs pa-subject-period-tabs"
        selectedKey={active}
        onSelectionChange={(key) => setSelected(String(key) as PeriodIdV1)}
      >
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
          <div className="pa-subject-grid">
            <Card className="pa-score-card">
              <Card.Content>
                <GradeRingV1 mark={mark} />
                <div className="pa-score-card-copy">
                  <p>Nota do período</p>
                  <Chip
                    size="sm"
                    variant="soft"
                    color={
                      mark?.meetsMinimum === true
                        ? 'success'
                        : mark?.meetsMinimum === false
                          ? 'danger'
                          : 'default'
                    }
                  >
                    {mark?.meetsMinimum === true
                      ? 'Atinge o mínimo'
                      : mark?.meetsMinimum === false
                        ? 'Abaixo do mínimo'
                        : 'Classificação indisponível'}
                  </Chip>
                </div>
              </Card.Content>
            </Card>
            <Card className="pa-detail-card">
              <Card.Header>
                <Card.Title>Avaliações publicadas</Card.Title>
              </Card.Header>
              <Card.Content>
                {period?.partials?.length ? (
                  <div className="pa-assessment-list">
                    {period.partials.map((partial) => (
                      <div className="pa-assessment-row" key={partial.assessmentId}>
                        <span>{partial.label}</span>
                        <strong>
                          {partial.notDone ? 'Não fez' : <StudentMarkV1 mark={partial.mark} showMaximum />}
                        </strong>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="pa-detail-empty">Não há avaliações parciais publicadas neste período.</p>
                )}
                <div className="pa-period-summary">
                  <span>Nota do período</span>
                  <strong><StudentMarkV1 mark={period?.final ?? { kind: 'absent' }} /></strong>
                </div>
              </Card.Content>
            </Card>
          </div>
        </Tabs.Panel>
      </Tabs>
      <Card className="pa-outcome-card">
        <Card.Content>
          <span>Resultado oficial</span>
          <strong>{result}</strong>
        </Card.Content>
      </Card>
    </div>
  );
}

function EvolutionChartV1({ subject }: { subject: SubjectV1 }) {
  const points = MAIN_PERIODS_V1.flatMap((period) => {
    const source = subjectPeriodV1(subject, period);
    const mark = scoreOfV1(source);
    if (!mark) return [];
    return [{ period, mark }];
  });
  if (points.length === 0)
    return (
      <Card className="pa-search-empty">
        <Card.Content>Não há notas numéricas publicadas para esta disciplina.</Card.Content>
      </Card>
    );
  const ratios = points.map(({ mark }) => safeRatioV1(mark));
  const fallbackMax = Math.max(...points.map(({ mark }) => mark.value), 1);
  const coords = points.map(({ mark }, index) => {
    const ratio = ratios[index] ?? Math.max(0, Math.min(1, mark.value / fallbackMax));
    const x = points.length === 1 ? 160 : 36 + index * (248 / (points.length - 1));
    const y = 122 - ratio * 82;
    return { x, y, mark };
  });
  const path = coords.map((point) => point.x + ',' + point.y).join(' ');
  return (
    <Card className="pa-evolution-card">
      <Card.Header>
        <div>
          <Card.Title>Evolução das notas</Card.Title>
          <Card.Description>Somente períodos publicados</Card.Description>
        </div>
      </Card.Header>
      <Card.Content>
        <svg className="pa-evolution-chart" viewBox="0 0 320 150" role="img" aria-label={'Evolução de ' + subject.label}>
          <line x1="36" y1="122" x2="284" y2="122" className="pa-chart-axis" />
          <line x1="36" y1="81" x2="284" y2="81" className="pa-chart-grid" />
          <line x1="36" y1="40" x2="284" y2="40" className="pa-chart-grid" />
          <polyline points={path} className="pa-chart-line" />
          {coords.map((point, index) => (
            <g key={points[index]!.period}>
              <circle cx={point.x} cy={point.y} r="5" className="pa-chart-point" />
              <text x={point.x} y={point.y - 12} textAnchor="middle" className="pa-chart-value">
                {markNumber.format(point.mark.value)}
              </text>
              <text x={point.x} y="143" textAnchor="middle" className="pa-chart-label">
                {PERIOD_LABELS_V1[points[index]!.period]}
              </text>
            </g>
          ))}
        </svg>
        <div className="pa-evolution-metrics">
          {points.map(({ period, mark }) => (
            <div className="pa-evolution-metric" key={period}>
              <span>{PERIOD_LABELS_V1[period]}</span>
              <strong>{markNumber.format(mark.value)}</strong>
              {mark.maximum !== null ? <small>de {markNumber.format(mark.maximum)}</small> : null}
            </div>
          ))}
        </div>
      </Card.Content>
    </Card>
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
  return (
    <div className="pa-workspace-view">
      <section className="pa-view-hero" aria-labelledby="pa-evolution-title">
        <span className="pa-view-icon" aria-hidden="true"><BarChart3 size={22} /></span>
        <div>
          <p className="pa-workspace-eyebrow">Histórico publicado</p>
          <h2 id="pa-evolution-title">Evolução</h2>
        </div>
      </section>
      <Tabs
        className="pa-subject-tabs"
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
      <EvolutionChartV1 subject={subject} />
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
      <Tabs.ListContainer className="pa-workspace-nav-shell">
        <Tabs.List aria-label="Áreas do Portal do Aluno" className="pa-workspace-nav">
          <Tabs.Tab id="summary">
            <LayoutDashboard size={18} aria-hidden="true" />
            <span>Resumo</span>
            <Tabs.Indicator />
          </Tabs.Tab>
          <Tabs.Tab id="report">
            <GraduationCap size={18} aria-hidden="true" />
            <span>Boletim</span>
            <Tabs.Indicator />
          </Tabs.Tab>
          <Tabs.Tab id="subject" isDisabled={!selectedSubject}>
            <BookOpenCheck size={18} aria-hidden="true" />
            <span>Disciplina</span>
            <Tabs.Indicator />
          </Tabs.Tab>
          <Tabs.Tab id="evolution" isDisabled={!selectedSubject}>
            <BarChart3 size={18} aria-hidden="true" />
            <span>Evolução</span>
            <Tabs.Indicator />
          </Tabs.Tab>
        </Tabs.List>
      </Tabs.ListContainer>

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

      <div className="pa-workspace-footnote" aria-hidden="true">
        <Sparkles size={15} />
        <span>Dados publicados pelo Banco de Notas</span>
      </div>
    </Tabs>
  );
}
