import { useState, type ReactNode } from 'react';
import { Button } from '@heroui/react';
import { ANALYSIS_BUCKETS_V3, type AnalysisBucketV3, type AnalysisReadingV3, type PerformanceAnalysisV3 } from '../../../../shared/gradebook-contracts/performance/performance-analysis-v3';

const number = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });
const score = (value: number | null) => value === null ? '—' : number.format(value / 1000);
const percent = (value: number | null) => value === null ? 'Indisponível' : `${number.format(value)}%`;
const BUCKET: Record<AnalysisBucketV3, string> = { above: 'No limite ou acima', below: 'Abaixo da referência', incomplete: 'Leitura incompleta', 'no-show': 'N/C', unscaled: 'Sem máximo conhecido' };
const STATE: Record<AnalysisReadingV3['state'], string> = { complete: 'Leitura completa', partial: 'Leitura parcial', 'not-recorded': 'Sem lançamento', unavailable: 'Definição incompleta', 'not-applicable': 'Não aplicado', 'recovery-pending': 'Aguardando REC', 'no-show': 'N/C' };
export function PerformanceAnalysisPanelV3({ value, open, renderResult }: {
  readonly value: PerformanceAnalysisV3;
  readonly open: (studentId: number, offerId?: number) => void;
  readonly renderResult: (ids: ReadonlySet<number> | null) => ReactNode;
}) {
  const [bucket, setBucket] = useState<AnalysisBucketV3>('below');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const selected = value.columns.find((col) => col.key === selectedKey);
  const ids = selected ? new Set(selected.summary.groups[bucket]) : null;
  const rows = value.rows.filter((row) => ids === null || ids.has(row.studentId));
  const students = new Map(value.matrix.rows.map((row) => [row.student.id, row.student]));
  return <>
    {value.lens === 'qualitative' ? <p className="text-sm">Qualitativo: pontuação das atividades registradas. Não há conversão em conceito, personalidade ou comportamento.</p> : null}
    {value.lens === 'quantitative' ? <p className="text-sm">Quantitativo considerado pelo núcleo, incluindo a substituição pela paralela somente quando aplicável. A paralela não é somada novamente.</p> : null}
    {value.lens !== 'result' && value.matrix.mode === 'recovery' ? <p role="status" className="rounded-xl border border-separator p-3 text-sm">Composição das notas regulares dos alunos em recuperação. A nota de REC não é dividida em atividades; consulte a lente Resultado para ver REC e N/C.</p> : null}
    <section aria-label="Gráfico investigável da lente" className="grid min-w-0 gap-3 rounded-xl border border-separator p-4">
      <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">Distribuição por {value.lens === 'assessments' ? 'avaliação' : 'componente'}</h3><Button size="sm" variant="ghost" onPress={() => setExpanded((old) => !old)} aria-expanded={expanded}>{expanded ? 'Ver menos' : 'Ver mais'}</Button></div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Faixa do gráfico">{ANALYSIS_BUCKETS_V3.map((key) => <Button key={key} size="sm" variant={bucket === key ? 'secondary' : 'ghost'} aria-pressed={bucket === key} onPress={() => { setBucket(key); setSelectedKey(null); }}>{BUCKET[key]}</Button>)}</div>
      <p className="text-xs text-muted">Clique em uma barra para investigar a matriz. Cada barra usa a população elegível daquele componente; ausências não entram como zero nas médias. A referência proporcional não é uma decisão de aprovação.</p>
      <div className="grid max-h-64 min-w-0 gap-2 overflow-y-auto" role="list" aria-label={`Distribuição: ${BUCKET[bucket]}`}>
        {value.columns.map((column) => {
          const count = column.summary.groups[bucket].length;
          return <div role="listitem" key={column.key}><button type="button" disabled={count === 0} aria-pressed={selectedKey === column.key} aria-label={`${column.label}: ${count} de ${column.summary.considered}, ${BUCKET[bucket]}`} onClick={() => setSelectedKey(column.key)} className="grid w-full min-w-0 gap-1 rounded-lg p-2 text-left outline-none hover:bg-default/30 focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-60">
            <span className="flex flex-wrap justify-between gap-2 text-xs"><span className="break-words">{column.label}</span><span>{count} de {column.summary.considered}</span></span>
            <span aria-hidden="true" className="h-2 overflow-hidden rounded bg-default/50"><span className={`block h-full rounded ${bucket === 'below' ? 'bg-danger' : 'bg-accent'}`} style={{ width: `${column.summary.considered ? count / column.summary.considered * 100 : 0}%` }}/></span>
          </button></div>;
        })}
        {!value.columns.length ? <p className="text-sm">Não há instrumentos ou componentes disponíveis neste recorte.</p> : null}
      </div>
      {expanded ? <div className="overflow-x-auto"><table className="w-full text-left text-xs"><caption className="mb-2 text-left text-muted">Somente leituras completas com máximo conhecido. Percentuais acima de 100% são preservados. Não é comparação entre trimestres.</caption><thead><tr><th className="p-2">Componente / avaliação</th><th className="p-2">População considerada</th><th className="p-2">Com percentual</th><th className="p-2">Média proporcional</th><th className="p-2">Mediana proporcional</th></tr></thead><tbody>{value.columns.map((col) => <tr key={col.key} className="border-t border-separator"><th className="p-2 font-normal">{col.label}</th><td className="p-2">{col.summary.considered}</td><td className="p-2">{col.summary.scaled}</td><td className="p-2">{percent(col.summary.meanPercent)}</td><td className="p-2">{percent(col.summary.medianPercent)}</td></tr>)}</tbody></table></div> : null}
    </section>
    {selected ? <div className="flex flex-wrap items-center gap-2 text-sm" role="status">Investigando: {selected.label} · {BUCKET[bucket]} · {rows.length} aluno(s)<Button size="sm" variant="ghost" onPress={() => setSelectedKey(null)}>Limpar investigação</Button></div> : null}
    {value.lens === 'result' ? renderResult(ids) : <>
      <p className="text-sm">{value.matrix.statistics.visibleRows} alunos no recorte · {value.matrix.statistics.eligibleRows} na população de indicadores · {rows.length} exibidos nesta investigação.</p>
      <div role="region" aria-label="Matriz da lente; role horizontalmente quando necessário" tabIndex={0} className="max-w-full overflow-x-auto rounded-xl border border-separator focus-visible:ring-2 focus-visible:ring-focus"><table className="w-full text-left text-xs">
        <caption className="sr-only">Leituras da lente selecionada, consulta calculada em validação</caption>
        <thead className="bg-default/40"><tr><th className="p-2" scope="col">Nº</th><th className="p-2" scope="col">Situação</th><th className="p-2" scope="col">Aluno</th>{value.columns.map((col) => <th key={col.key} className="max-w-32 break-words p-2 text-center" scope="col" title={col.label}>{col.label}</th>)}</tr></thead>
        <tbody>{rows.map((row) => { const student = students.get(row.studentId)!; return <tr key={row.studentId} className="border-t border-separator"><td className="p-2 tabular-nums">{student.number}</td><td className="max-w-24 p-2 text-muted">{student.statusLabel}</td><th scope="row" className="p-1 font-normal"><Button size="sm" variant="ghost" className="h-auto whitespace-normal break-words text-left" onPress={() => open(student.id)}>{student.name}</Button></th>
          {row.values.map((reading, i) => <td key={reading.key} className="p-1 text-center"><Button size="sm" variant="ghost" className="h-auto min-w-8 flex-col whitespace-normal px-1 py-2 text-xs" onPress={() => open(student.id, value.columns[i]!.offerId)} aria-label={`${student.name}, ${value.columns[i]!.label}, ${STATE[reading.state]}`}>
            <span className={`font-semibold tabular-nums ${reading.bucket === 'below' ? 'text-danger' : reading.bucket === 'above' ? 'text-accent' : ''}`}>{reading.state === 'no-show' ? 'N/C' : score(reading.valueMilli)}</span>
            <span className="text-[10px]">{STATE[reading.state]}</span>
            {reading.percent !== null ? <span className="text-[10px] text-muted">{percent(reading.percent)}</span> : null}
            {reading.valueMilli === null && reading.recordedMilli !== null ? <span className="text-[10px] text-muted">Registrado: {score(reading.recordedMilli)}</span> : null}
          </Button></td>)}
        </tr>; })}</tbody></table>{!rows.length ? <p className="p-4">Nenhum aluno neste recorte.</p> : null}</div>
      <p className="text-xs text-muted">Leitura completa descreve os lançamentos desta dimensão, não um resultado final. Máximo desconhecido não recebe percentual. Consultado em {new Date(value.matrix.readAt).toLocaleString('pt-BR')}; atualização por consulta.</p>
    </>}
  </>;
}
