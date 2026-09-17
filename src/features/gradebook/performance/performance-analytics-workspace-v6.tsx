import { PerformanceTeacherExportV6 } from './performance-teacher-export-v6';
import { PerformanceLearningOverviewV1 } from './performance-learning-overview-v1';
import { Alert, Avatar, Button, Chip, Label, ListBox, Select } from '@heroui/react';
import type { PerformanceAnalyticsV6 } from '../../../../shared/gradebook-contracts/performance/performance-analytics-v6';
import {
  AnalyticsBarsV6,
  AnalyticsCompositionV6,
  AnalyticsCoverageV6,
  AnalyticsDistributionV6,
  AnalyticsKpisV6,
  AnalyticsPanelV6,
  AnalyticsRecoveryV6,
  AnalyticsTimelineV6,
} from './performance-analytics-charts-v6';
import {
  analyticsStudentItemsV6,
  AnalyticsHeatmapV6,
  AnalyticsInstrumentsV6,
  AnalyticsStudentComponentsV6,
  AnalyticsStudentsTableV6,
} from './performance-analytics-tables-v6';
import { analyticsPercentV6 as percent } from './analytics-format-v6';

export type PerformancePerspectiveV6 =
  'overview' | 'notes' | 'classes' | 'students' | 'components' | 'teachers';
export type PerformanceSelectionV6 = {
  studentId: number | null;
  offerId: number | null;
  teacherId: number | null;
};
export const PERFORMANCE_PERSPECTIVES_V6: readonly {
  id: PerformancePerspectiveV6;
  label: string;
}[] = [
  { id: 'overview', label: 'Visão geral' },
  { id: 'notes', label: 'Notas' },
  { id: 'classes', label: 'Turmas' },
  { id: 'students', label: 'Alunos' },
  { id: 'components', label: 'Componentes' },
  { id: 'teachers', label: 'Professores' },
];
function EntitySelect({ label, value, items, onChange }: {
  label: string;
  value: number | undefined;
  items: readonly { id: number; label: string }[];
  onChange: (id: number) => void;
}) {
  return <Select className="w-full max-w-md" selectedKey={value === undefined ? null : String(value)} onSelectionChange={(key) => { if (key !== null) onChange(Number(key)); }}><Label>{label}</Label><Select.Trigger><Select.Value /><Select.Indicator /></Select.Trigger><Select.Popover isNonModal><ListBox>{items.map((item) => <ListBox.Item key={item.id} id={String(item.id)} textValue={item.label}>{item.label}<ListBox.ItemIndicator /></ListBox.Item>)}</ListBox></Select.Popover></Select>;
}
export function PerformanceAnalyticsWorkspaceV6({ value, tab, selection, onSelection, onNavigate, onPeriod, onCell, onNotes }: {
  value: PerformanceAnalyticsV6;
  tab: Exclude<PerformancePerspectiveV6, 'notes'>;
  selection: PerformanceSelectionV6;
  onSelection: (selection: Partial<PerformanceSelectionV6>) => void;
  onNavigate: (tab: PerformancePerspectiveV6) => void;
  onPeriod: (period: 1 | 2 | 3) => void;
  onCell: (studentId: number, offerId?: number) => void;
  onNotes: (offerId: number) => void;
}) {
  const student = value.students.find((item) => item.student.id === selection.studentId) ?? value.students[0];
  const component = value.components.find((item) => item.offer.id === selection.offerId) ?? value.components[0];
  const teacher = value.teachers.find((item) => item.id === selection.teacherId) ?? value.teachers[0];
  const openStudent = (id: number) => { onSelection({ studentId: id }); onNavigate('students'); };
  const openComponent = (id: number) => { onSelection({ offerId: id }); onNavigate('components'); };
  if (tab === 'overview') return <div data-testid="performance-analytics-v6" className="min-w-0">
    <PerformanceLearningOverviewV1
      key={`${value.context.year}:${value.classGroup.id}:${value.period}`}
      value={value} onStudent={onCell} onComponent={openComponent} onPeriod={onPeriod} onNotes={onNotes}
    />
  </div>;
  const selectedSummary = tab === 'students' && student ? student.summary : tab === 'components' && component ? component.summary : tab === 'teachers' && teacher ? teacher.summary : value.summary;
  const components = tab === 'teachers' && teacher ? value.components.filter((item) => teacher.offerIds.includes(item.offer.id)) : value.components;
  const allStudents = analyticsStudentItemsV6(value);
  const componentBars = <AnalyticsBarsV6 items={components.map((item) => ({
    id: item.offer.id, label: item.offer.subject.label, value: item.summary.result.mean,
    below: item.summary.result.mean !== null && item.summary.result.mean < value.minimumPercent,
    secondary: `${item.summary.complete}/${item.summary.readings} completos · ${item.summary.below} abaixo`,
  }))} onSelect={openComponent} />;
  if ((tab === 'students' && !student) || (tab === 'components' && !component) || (tab === 'teachers' && !teacher))
    return <Alert><Alert.Content><Alert.Title>Nenhum registro neste recorte.</Alert.Title></Alert.Content></Alert>;
  return <div className="grid min-w-0 gap-4" data-testid="performance-analytics-v6">
    {tab === 'students' && student ? <div className="flex flex-wrap items-end gap-4"><Avatar size="lg"><Avatar.Fallback>{student.student.name.split(/\s+/u).map((word) => word[0]).slice(0, 2).join('')}</Avatar.Fallback></Avatar><EntitySelect label="Aluno" value={student.student.id} items={value.students.map((item) => ({ id: item.student.id, label: `${item.student.number}. ${item.student.name}` }))} onChange={(studentId) => onSelection({ studentId })} /><Chip size="sm" variant="soft">{value.classGroup.label}</Chip><Button variant="ghost" size="sm" onPress={() => onCell(student.student.id)}>Detalhe completo</Button></div> : null}
    {tab === 'components' && component ? <div className="flex flex-wrap items-end gap-3"><EntitySelect label="Componente" value={component.offer.id} items={value.components.map((item) => ({ id: item.offer.id, label: item.offer.subject.label }))} onChange={(offerId) => onSelection({ offerId })} /><span className="pb-2 text-xs text-muted">{component.offer.teacher.label}</span></div> : null}
    {tab === 'teachers' && teacher ? <div className="flex flex-wrap items-end gap-3"><EntitySelect label="Professor" value={teacher.id} items={value.teachers} onChange={(teacherId) => onSelection({ teacherId })} /><span className="pb-2 text-xs text-muted">{value.classGroup.label} · {teacher.offerIds.length} componentes</span><div className="ml-auto"><PerformanceTeacherExportV6 value={value} teacherId={teacher.id} /></div></div> : null}
    <AnalyticsKpisV6 summary={selectedSummary} individual={tab === 'students'} />
    {tab === 'classes' ? <>
      <AnalyticsHeatmapV6 value={value} onStudent={openStudent} onComponent={openComponent} onCell={onCell} />
      <div className="grid gap-4 xl:grid-cols-2"><AnalyticsPanelV6 title="Componentes">{componentBars}</AnalyticsPanelV6><AnalyticsDistributionV6 summary={value.summary} /></div>
      <AnalyticsStudentsTableV6 title="Acompanhamento da turma" items={allStudents.filter((item) => item.below > 0 || item.partial > 0 || item.complete === 0)} onSelect={openStudent} />
    </> : <>
      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]"><AnalyticsTimelineV6 summary={selectedSummary} onPeriod={onPeriod} /><AnalyticsCompositionV6 summary={selectedSummary} /></div>
      {tab === 'students' && student ? <><AnalyticsStudentComponentsV6 value={value} studentId={student.student.id} onCell={onCell} />{value.period === 'annual' ? <div className="flex flex-wrap gap-2"><Chip variant="soft">Resultado calculado: {student.annualResult?.label ?? 'Indisponível'}</Chip>{student.councilDecision ? <Chip variant="soft">Conselho: {student.councilDecision.label}</Chip> : null}</div> : null}</> : null}
      {tab === 'components' && component ? <><AnalyticsInstrumentsV6 component={component} onNotes={onNotes} /><AnalyticsStudentsTableV6 title="Alunos neste componente" items={value.students.map((item) => {
        const cell = item.cells.find((entry) => entry.offerId === component.offer.id)!;
        return { id: item.student.id, number: item.student.number, name: item.student.name,
          meanPercent: cell.result.state === 'complete' ? cell.percent : null,
          below: cell.result.state === 'complete' && cell.result.level === 'below' ? 1 : 0,
          complete: cell.result.state === 'complete' ? 1 : 0,
          partial: cell.result.state === 'partial' ? 1 : 0, deltaPP: cell.deltaPP };
      })} onSelect={(id) => onCell(id, component.offer.id)} /></> : null}
      {tab === 'teachers' && teacher ? <><AnalyticsPanelV6 title="Componentes nesta turma">{componentBars}</AnalyticsPanelV6><AnalyticsStudentsTableV6 title="Acompanhamento do professor" items={analyticsStudentItemsV6(value, teacher.id)} onSelect={openStudent} /></> : null}
    </>}
    <div className="grid gap-4 xl:grid-cols-2"><AnalyticsRecoveryV6 summary={selectedSummary} /><AnalyticsCoverageV6 summary={selectedSummary} /></div>
    <footer className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted"><span>Limite: {percent(value.minimumPercent)}</span><span>{value.summary.students}/{value.classStudents} alunos considerados</span><span>Estatísticas: leituras completas</span><span className="ml-auto">Leitura {new Date(value.readAt).toLocaleTimeString('pt-BR')}</span></footer>
  </div>;
}
