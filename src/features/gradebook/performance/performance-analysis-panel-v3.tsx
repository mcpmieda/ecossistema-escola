import { useState, type ReactNode } from 'react';
import { Button } from '@heroui/react';
import type { PerformanceAnalysisV3, AnalysisReadingV3 } from '../../../../shared/gradebook-contracts/performance/performance-analysis-v3';
import type { PerformanceDashboardV5 } from '../../../../shared/gradebook-contracts/performance/performance-dashboard-v5';
import { gradeText, subjectText } from './performance-display-v2';
import { PerformanceDashboardWidgetsV5, type PerformanceDashboardSelectionV5 } from './performance-dashboard-widgets-v5';
import { PerformanceGridV2 } from './performance-grid-v2';

const number = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
const percent = (value: number | null) => value === null ? '—' : `${number.format(value)}%`;
const STATE: Record<AnalysisReadingV3['state'], string> = { complete: '', partial: 'Parcial', 'not-recorded': 'Sem nota', unavailable: 'Indisponível', 'not-applicable': 'Não se aplica', 'recovery-pending': 'Pendente', 'no-show': 'N/C', 'repeat-failure': 'R/R' };

export function PerformanceAnalysisPanelV3({ value, dashboard, open, renderResult, focusOffer }: {
  readonly value: PerformanceAnalysisV3;
  readonly dashboard: PerformanceDashboardV5;
  readonly open: (studentId: number, offerId?: number) => void;
  readonly renderResult: (ids: ReadonlySet<number> | null) => ReactNode;
  readonly focusOffer: (offerId: number) => void;
}) {
  const [selection, setSelection] = useState<PerformanceDashboardSelectionV5>(null);
  const [expanded, setExpanded] = useState(false);
  const column = selection?.kind === 'column' ? value.columns.find((item) => item.key === selection.key) : null;
  const ids = selection?.kind === 'group' ? new Set(dashboard.overview.groups[selection.group]) : null;
  const rows = value.rows.filter((row) => ids === null || ids.has(row.studentId));
  const students = new Map(value.matrix.rows.map((row) => [row.student.id, row.student]));
  const offers = new Map(value.matrix.offers.map((offer) => [offer.id, offer]));
  const selectionLabel = selection?.kind === 'group' ? { allAtOrAbove: 'todos os componentes no mínimo ou acima', withBelow: 'algum componente abaixo do mínimo', pending: 'ainda sem classificação integral' }[selection.group] : null;
  return <>
    <PerformanceDashboardWidgetsV5 value={dashboard} selection={selection} onSelectionChange={setSelection} open={open}/>
    {value.lens !== 'result' && value.matrix.mode === 'recovery' ? <p role="status" className="text-xs text-muted">Composição regular dos alunos em recuperação. A nota de REC está em Resultado.</p> : null}
    <div className="flex min-h-9 flex-wrap items-center gap-2 text-sm" role="status">
      {selection?.kind === 'column' ? <>Detalhe de <strong>{column?.label ?? 'componente'}</strong> aberto no card; a matriz permanece completa.</> :
        selectionLabel ? <>Investigando: <strong>{selectionLabel}</strong> · {rows.length} estudante(s)<Button size="sm" variant="ghost" onPress={() => setSelection(null)}>Limpar filtro</Button></> :
        <span className="text-xs text-muted">Selecione uma barra para ver, dentro do gráfico, quem ficou abaixo do mínimo. Indicadores e faixas do panorama filtram a matriz.</span>}
      <Button size="sm" variant="ghost" className="ml-auto" onPress={() => setExpanded((current) => !current)} aria-expanded={expanded}>{expanded ? 'Ocultar estatísticas' : 'Ver estatísticas'}</Button>
    </div>
    {expanded ? <div className="overflow-x-auto rounded-xl border border-separator bg-surface p-2"><table className="w-full text-left text-xs"><caption className="mb-2 text-left text-muted">Leituras classificadas com máximo conhecido; Resultado admite soma numérica parcial.</caption><thead><tr><th className="p-2">Componente / avaliação</th><th className="p-2">População considerada</th><th className="p-2">Com percentual</th><th className="p-2">Média proporcional</th><th className="p-2">Mediana proporcional</th></tr></thead><tbody>{value.columns.map((item) => <tr key={item.key} className="border-t border-separator"><th className="p-2 font-normal">{item.label}</th><td className="p-2">{item.summary.considered}</td><td className="p-2">{item.summary.scaled}</td><td className="p-2">{percent(item.summary.meanPercent)}</td><td className="p-2">{percent(item.summary.medianPercent)}</td></tr>)}</tbody></table></div> : null}
    {value.lens === 'result' ? renderResult(ids) : <PerformanceGridV2 label="Matriz da lente" open={open} focusOffer={focusOffer}
      columns={value.columns.map((item) => ({ key: item.key, label: value.lens === 'assessments' ? item.label : subjectText(offers.get(item.offerId)!), title: item.label, offerId: item.offerId }))}
      rows={rows.map((row) => ({ student: students.get(row.studentId)!, values: row.values.map((reading) => <span key={reading.key} className="inline-flex flex-col items-center gap-0.5">
        <span className={`font-semibold tabular-nums ${reading.bucket === 'below' ? 'text-danger' : reading.bucket === 'above' ? 'text-accent' : ''}`}>{reading.state === 'no-show' ? 'N/C' : gradeText(reading.valueMilli)}</span>
        {STATE[reading.state] ? <span className="text-[10px]">{STATE[reading.state]}</span> : null}
        {reading.percent !== null ? <span className="text-[10px] text-muted">{percent(reading.percent)}</span> : null}
      </span>) }))}/>}
  </>;
}
