import { useState, type ReactNode } from 'react';
import { Button } from '@heroui/react';
import { ANALYSIS_BUCKETS_V3, type AnalysisBucketV3, type AnalysisReadingV3, type PerformanceAnalysisV3 } from '../../../../shared/gradebook-contracts/performance/performance-analysis-v3';
import { gradeText, subjectText } from './performance-display-v2';
import { PerformanceGridV2 } from './performance-grid-v2';

const number = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
const percent = (value: number | null) => value === null ? '—' : `${number.format(value)}%`;
const BUCKET: Record<AnalysisBucketV3, string> = { above: 'No limite ou acima', below: 'Abaixo da referência', incomplete: 'Incompletos', 'no-show': 'N/C', unscaled: 'Sem máximo' };
const STATE: Record<AnalysisReadingV3['state'], string> = { complete: '', partial: 'Parcial', 'not-recorded': 'Sem nota', unavailable: 'Indisponível', 'not-applicable': 'Não se aplica', 'recovery-pending': 'Pendente', 'no-show': 'N/C' };
export function PerformanceAnalysisPanelV3({ value, open, renderResult, focusOffer, showChart = true }: {
  readonly value: PerformanceAnalysisV3;
  readonly open: (studentId: number, offerId?: number) => void;
  readonly renderResult: (ids: ReadonlySet<number> | null) => ReactNode;
  readonly focusOffer: (offerId: number) => void;
  readonly showChart?: boolean;
}) {
  const [bucket, setBucket] = useState<AnalysisBucketV3>('below');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [metric, setMetric] = useState<'below' | 'incomplete' | null>(null);
  const [expanded, setExpanded] = useState(false);
  const selected = value.columns.find((col) => col.key === selectedKey);
  const below = new Set(value.columns.flatMap((column) => column.summary.groups.below));
  const incomplete = new Set(value.columns.flatMap((column) => column.summary.groups.incomplete));
  const ids = selected ? new Set(selected.summary.groups[bucket]) : metric === 'below' ? below : metric === 'incomplete' ? incomplete : null;
  const rows = value.rows.filter((row) => ids === null || ids.has(row.studentId));
  const students = new Map(value.matrix.rows.map((row) => [row.student.id, row.student]));
  const offers = new Map(value.matrix.offers.map((offer) => [offer.id, offer]));
  const sorted = [...value.columns].filter((column) => column.summary.groups[bucket].length > 0).sort((a, b) =>
    b.summary.groups[bucket].length / Math.max(1, b.summary.considered) - a.summary.groups[bucket].length / Math.max(1, a.summary.considered));
  const attention = [...value.columns].filter((column) => column.summary.groups.below.length > 0).sort((a, b) => b.summary.groups.below.length - a.summary.groups.below.length).slice(0, 3);
  const choose = (key: string) => { setSelectedKey(key); setMetric(null); };
  return <>
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-4" aria-label="Resumo da turma">
      <Button variant="ghost" className="h-auto items-start rounded-xl border border-separator bg-surface p-3 text-left" onPress={() => { setSelectedKey(null); setMetric(null); }}><span className="grid gap-1"><strong className="text-2xl tabular-nums">{value.matrix.statistics.visibleRows}</strong><span className="text-xs text-muted">Alunos</span></span></Button>
      <Button variant="ghost" className="h-auto items-start rounded-xl border border-separator bg-surface p-3 text-left" onPress={() => { setSelectedKey(null); setMetric('below'); }}><span className="grid gap-1"><strong className="text-2xl tabular-nums">{below.size}</strong><span className="text-xs text-muted">Abaixo da referência</span></span></Button>
      <div className="grid gap-1 rounded-xl border border-separator bg-surface p-3"><strong className="text-2xl tabular-nums">{percent(value.matrix.statistics.consideredCells ? value.matrix.statistics.completeCells / value.matrix.statistics.consideredCells * 100 : null)}</strong><span className="text-xs text-muted">Notas completas</span></div>
      <Button variant="ghost" className="h-auto items-start rounded-xl border border-separator bg-surface p-3 text-left" onPress={() => { setSelectedKey(null); setMetric('incomplete'); }}><span className="grid gap-1"><strong className="text-2xl tabular-nums">{incomplete.size}</strong><span className="text-xs text-muted">Alunos com pendências</span></span></Button>
    </div>
    {value.lens !== 'result' && value.matrix.mode === 'recovery' ? <p role="status" className="text-xs text-muted">Composição regular dos alunos em recuperação. A nota de REC está em Resultado.</p> : null}
    {showChart ? <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(14rem,1fr)]">
      <section aria-label="Gráfico investigável da lente" className="min-w-0 rounded-xl border border-separator bg-surface p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold">Distribuição por {value.lens === 'assessments' ? 'avaliação' : 'componente'}</h3><Button size="sm" variant="ghost" onPress={() => setExpanded((old) => !old)} aria-expanded={expanded}>{expanded ? 'Ver menos' : 'Ver mais'}</Button></div>
        <label className="mb-3 flex items-center gap-2 text-xs">Faixa<select aria-label="Faixa do gráfico" className="rounded-lg border border-separator bg-surface px-2 py-1" value={bucket} onChange={(event) => { setBucket(event.target.value as AnalysisBucketV3); setSelectedKey(null); setMetric(null); }}>{ANALYSIS_BUCKETS_V3.map((key) => <option key={key} value={key}>{BUCKET[key]}</option>)}</select></label>
        <div className="grid min-w-0 gap-1 sm:grid-cols-2" role="list" aria-label={`Distribuição: ${BUCKET[bucket]}`}>
          {(expanded ? sorted : sorted.slice(0, 4)).map((column) => {
            const count = column.summary.groups[bucket].length;
            return <div role="listitem" key={column.key}><button type="button" aria-pressed={selectedKey === column.key} aria-label={`${column.label}: ${count} de ${column.summary.considered}, ${BUCKET[bucket]}`} onClick={() => choose(column.key)} className="grid w-full min-w-0 gap-1 rounded-lg p-2 text-left outline-none hover:bg-default/30 focus-visible:ring-2 focus-visible:ring-focus">
              <span className="flex justify-between gap-2 text-xs"><span className="break-words">{column.label}</span><span className="shrink-0 tabular-nums">{count}/{column.summary.considered}</span></span>
              <span aria-hidden="true" className="h-2 overflow-hidden rounded bg-default/50"><span className={`block h-full rounded ${bucket === 'below' ? 'bg-danger' : 'bg-accent'}`} style={{ width: `${count / column.summary.considered * 100}%` }}/></span>
            </button></div>;
          })}
          {!sorted.length ? <p className="py-3 text-xs text-muted">Nenhum aluno nesta faixa.</p> : null}
        </div>
      </section>
      <section aria-label="Pontos de atenção" className="min-w-0 rounded-xl border border-separator bg-surface p-4"><h3 className="mb-2 text-sm font-semibold">Pontos de atenção</h3>
        {attention.map((column) => <Button key={column.key} size="sm" variant="ghost" className="h-auto w-full justify-between whitespace-normal px-0 py-2 text-left text-xs" onPress={() => { setBucket('below'); choose(column.key); }}><span>{column.label}</span><span className="ml-2 shrink-0 tabular-nums">{column.summary.groups.below.length} alunos</span></Button>)}
        {!attention.length ? <p className="text-xs text-muted">Nenhum resultado completo abaixo da referência.</p> : null}
        {value.matrix.mode === 'recovery' && value.matrix.statistics.recoveryUnknownRows > 0 ? <p className="mt-2 text-xs text-muted">Recuperação ainda não definida para {value.matrix.statistics.recoveryUnknownRows} alunos.</p> : null}
      </section>
    </div> : null}
    {expanded && showChart ? <div className="overflow-x-auto"><table className="w-full text-left text-xs"><caption className="mb-2 text-left text-muted">Leituras completas com máximo conhecido.</caption><thead><tr><th className="p-2">Componente / avaliação</th><th className="p-2">População considerada</th><th className="p-2">Com percentual</th><th className="p-2">Média proporcional</th><th className="p-2">Mediana proporcional</th></tr></thead><tbody>{value.columns.map((col) => <tr key={col.key} className="border-t border-separator"><th className="p-2 font-normal">{col.label}</th><td className="p-2">{col.summary.considered}</td><td className="p-2">{col.summary.scaled}</td><td className="p-2">{percent(col.summary.meanPercent)}</td><td className="p-2">{percent(col.summary.medianPercent)}</td></tr>)}</tbody></table></div> : null}
    {ids ? <div className="flex flex-wrap items-center gap-2 text-sm" role="status">Investigando: {selected?.label ?? 'Turma'} · {metric ? BUCKET[metric] : BUCKET[bucket]} · {rows.length} aluno(s)<Button size="sm" variant="ghost" onPress={() => { setSelectedKey(null); setMetric(null); }}>Limpar investigação</Button></div> : null}
    {value.lens === 'result' ? renderResult(ids) : <PerformanceGridV2 label="Matriz da lente" open={open} focusOffer={focusOffer}
      columns={value.columns.map((column) => ({ key: column.key, label: value.lens === 'assessments' ? column.label : subjectText(offers.get(column.offerId)!), title: column.label, offerId: column.offerId }))}
      rows={rows.map((row) => ({ student: students.get(row.studentId)!, values: row.values.map((reading) => <span key={reading.key} className="inline-flex flex-col items-center gap-0.5">
        <span className={`font-semibold tabular-nums ${reading.bucket === 'below' ? 'text-danger' : reading.bucket === 'above' ? 'text-accent' : ''}`}>{reading.state === 'no-show' ? 'N/C' : gradeText(reading.valueMilli)}</span>
        {STATE[reading.state] ? <span className="text-[10px]">{STATE[reading.state]}</span> : null}
        {reading.percent !== null ? <span className="text-[10px] text-muted">{percent(reading.percent)}</span> : null}
      </span>) }))}/>}
  </>;
}
