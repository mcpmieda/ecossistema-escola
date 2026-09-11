import { useState, type ReactNode } from 'react';
import { Button, Chip, Surface } from '@heroui/react';
import {
  ChartNoAxesColumnIncreasing,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleAlert,
  Clock3,
  PieChart,
  UsersRound,
} from 'lucide-react';
import type { PerformanceDashboardV5 } from '../../../../shared/gradebook-contracts/performance/performance-dashboard-v5';
import { dashboardAnalysisV5 } from '../../../../shared/gradebook-contracts/performance/performance-dashboard-v5';
import { subjectText } from './performance-display-v2';

export type PerformanceDashboardSelectionV5 =
  | { readonly kind: 'column'; readonly key: string; readonly bucket: 'above' | 'below' }
  | { readonly kind: 'group'; readonly group: 'allAtOrAbove' | 'withBelow' | 'pending' }
  | null;

const number = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });

function KpiCard({ icon, value, label, detail, tone, pressed, onPress }: {
  readonly icon: ReactNode;
  readonly value: string | number;
  readonly label: string;
  readonly detail: string;
  readonly tone: 'accent' | 'danger' | 'success' | 'warning';
  readonly pressed?: boolean;
  readonly onPress?: () => void;
}) {
  const content = <>
    <span className={`performance-kpi__icon performance-kpi__icon--${tone}`} aria-hidden="true">{icon}</span>
    <span className="min-w-0">
      <span className="flex items-baseline gap-2"><strong className="text-2xl font-semibold tabular-nums tracking-[-0.04em]">{value}</strong><span className="text-xs font-medium">{label}</span></span>
      <span className="mt-1 block truncate text-xs text-muted">{detail}</span>
    </span>
  </>;
  return <Surface variant="default" className={`performance-kpi ${pressed ? 'performance-kpi--pressed' : ''}`}>
    {onPress ? <button type="button" className="performance-kpi__button" aria-pressed={pressed} onClick={onPress}>{content}</button> : <div className="performance-kpi__button">{content}</div>}
  </Surface>;
}

function PerformanceKpisV5({ value, selection, onSelectionChange }: {
  readonly value: PerformanceDashboardV5;
  readonly selection: PerformanceDashboardSelectionV5;
  readonly onSelectionChange: (selection: PerformanceDashboardSelectionV5) => void;
}) {
  const analysis = dashboardAnalysisV5(value);
  const completePercent = analysis.matrix.statistics.consideredCells === 0 ? 0 :
    analysis.matrix.statistics.completeCells / analysis.matrix.statistics.consideredCells * 100;
  const selected = (group: 'withBelow' | 'pending') =>
    selection?.kind === 'group' && selection.group === group;
  return <div className="performance-kpi-group" aria-label="Resumo da turma">
    <KpiCard icon={<UsersRound size={20}/>} value={analysis.matrix.statistics.visibleRows} label="estudantes"
      detail={analysis.matrix.classGroup.name ?? analysis.matrix.classGroup.label} tone="accent"/>
    <KpiCard icon={<CircleAlert size={20}/>} value={value.overview.students.withBelow} label="abaixo do mínimo"
      detail="Com pelo menos um componente" tone="danger" pressed={selected('withBelow')}
      onPress={() => onSelectionChange(selected('withBelow') ? null : { kind: 'group', group: 'withBelow' })}/>
    <KpiCard icon={<CheckCircle2 size={20}/>} value={`${number.format(completePercent)}%`} label="completos"
      detail={`${analysis.matrix.statistics.completeCells} de ${analysis.matrix.statistics.consideredCells} leituras`} tone="success"/>
    <KpiCard icon={<Clock3 size={20}/>} value={value.overview.students.pending} label="com pendências"
      detail="Ainda sem classificação integral" tone="warning" pressed={selected('pending')}
      onPress={() => onSelectionChange(selected('pending') ? null : { kind: 'group', group: 'pending' })}/>
  </div>;
}

function ComponentBarsV5({ value, selection, onSelectionChange, open }: {
  readonly value: PerformanceDashboardV5;
  readonly selection: PerformanceDashboardSelectionV5;
  readonly onSelectionChange: (selection: PerformanceDashboardSelectionV5) => void;
  readonly open: (studentId: number, offerId?: number) => void;
}) {
  const analysis = dashboardAnalysisV5(value);
  const offers = new Map(analysis.matrix.offers.map((offer) => [offer.id, offer]));
  const students = new Map(analysis.matrix.rows.map((row) => [row.student.id, row.student]));
  const selectedColumn = selection?.kind === 'column' ? analysis.columns.find((column) => column.key === selection.key) : undefined;
  const maximum = Math.max(1, ...value.overview.columns.flatMap((column) => [column.atOrAbove, column.below]));
  const choose = (key: string, bucket: 'above' | 'below') => {
    const active = selection?.kind === 'column' && selection.key === key && selection.bucket === bucket;
    onSelectionChange(active ? null : { kind: 'column', key, bucket });
  };
  return <Surface variant="default" className="performance-widget min-w-0">
    <header className="performance-widget__header">
      <span className="performance-widget__icon performance-widget__icon--accent"><ChartNoAxesColumnIncreasing size={18}/></span>
      <span className="min-w-0"><h3 className="text-sm font-semibold">Situação por componente</h3><p className="text-xs text-muted">Quantidade de estudantes por faixa oficial</p></span>
      <span className="ml-auto hidden flex-wrap gap-3 text-[11px] text-muted sm:flex" aria-label="Legenda">
        <span className="flex items-center gap-1.5"><i className="performance-legend performance-legend--above"/>No mínimo ou acima</span>
        <span className="flex items-center gap-1.5"><i className="performance-legend performance-legend--below"/>Abaixo do mínimo</span>
      </span>
    </header>
    <div className="performance-bars" role="group" aria-label="Barras por componente curricular">
      {value.overview.columns.map((column) => {
        const offer = offers.get(column.offerId);
        const label = offer ? subjectText(offer) : column.label;
        const title = offer?.subject.label ?? column.label;
        return <div className="performance-bars__column" key={column.key}>
          <div className="performance-bars__plot">
            {(['above', 'below'] as const).map((bucket) => {
              const count = bucket === 'above' ? column.atOrAbove : column.below;
              const active = selection?.kind === 'column' && selection.key === column.key && selection.bucket === bucket;
              return <button key={bucket} type="button" className={`performance-bar performance-bar--${bucket} ${active ? 'performance-bar--selected' : ''}`}
                style={{ height: `${Math.max(count === 0 ? 1.5 : 8, count / maximum * 100)}%` }} aria-pressed={active}
                aria-label={`${title}: ${count} estudante(s) ${bucket === 'above' ? 'no mínimo ou acima' : 'abaixo do mínimo'}`}
                onClick={() => choose(column.key, bucket)}><span>{count}</span></button>;
            })}
          </div>
          <span className="performance-bars__label" title={title}>{label}</span>
          {column.incomplete + column.noShow + column.unscaled > 0 ? <span className="performance-bars__pending" title="Leituras ainda não classificadas">+{column.incomplete + column.noShow + column.unscaled}</span> : null}
        </div>;
      })}
    </div>
    {selectedColumn ? <section className="performance-bars__detail" aria-label={`Estudantes por situação em ${selectedColumn.label}`} aria-live="polite">
      <header className="performance-bars__detail-header"><span><span className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted">Componente selecionado</span><h4 className="text-sm font-semibold">{selectedColumn.label}</h4></span><Button size="sm" variant="ghost" onPress={() => onSelectionChange(null)}>Fechar</Button></header>
      <div className="performance-bars__student-groups">{([
        { bucket: 'above', label: 'Notas azuis', detail: 'No mínimo ou acima', tone: 'above' },
        { bucket: 'below', label: 'Notas vermelhas', detail: 'Abaixo do mínimo', tone: 'below' },
      ] as const).map((group) => {
        const members = selectedColumn.summary.groups[group.bucket].map((id) => students.get(id)).filter((student) => student !== undefined);
        return <section className={`performance-bars__student-group performance-bars__student-group--${group.tone}`} key={group.bucket} aria-label={`${group.label}: ${members.length} estudante(s)`}>
          <header><span><strong>{group.label}</strong><small>{group.detail}</small></span><Chip size="sm" variant="soft">{members.length}</Chip></header>
          {members.length > 0 ? <ul>{members.map((student) => <li key={student.id}><button type="button" onClick={() => open(student.id, selectedColumn.offerId)}><span className="truncate">{student.name}</span><small>Nº {student.number}</small></button></li>)}</ul> : <p>Nenhum estudante nesta faixa.</p>}
        </section>;
      })}</div>
    </section> : null}
    <p className="mt-3 text-[11px] leading-5 text-muted">Na lente Resultado, toda soma numérica é comparada a 60% do máximo do recorte (18, 18 ou 24 nos trimestres). Ausência, N/C e leituras sem máximo não viram zero e aparecem ao lado da sigla.</p>
  </Surface>;
}

function ClassPanoramaV5({ value, selection, onSelectionChange, open }: {
  readonly value: PerformanceDashboardV5;
  readonly selection: PerformanceDashboardSelectionV5;
  readonly onSelectionChange: (selection: PerformanceDashboardSelectionV5) => void;
  readonly open: (studentId: number, offerId?: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const analysis = dashboardAnalysisV5(value);
  const stats = value.overview.students;
  const denominator = Math.max(1, stats.eligible);
  const good = stats.allAtOrAbove / denominator * 100;
  const below = stats.withBelow / denominator * 100;
  const pending = stats.pending / denominator * 100;
  const pendingLabel = analysis.lens === 'result' ? 'Sem nota numérica para classificar' : 'Ainda sem classificação';
  const students = new Map(analysis.matrix.rows.map((row) => [row.student.id, row.student]));
  const attention = value.overview.groups.withBelow.map((id) => students.get(id)).filter((item) => item !== undefined);
  const choose = (group: 'allAtOrAbove' | 'withBelow' | 'pending') => {
    const active = selection?.kind === 'group' && selection.group === group;
    onSelectionChange(active ? null : { kind: 'group', group });
  };
  return <Surface variant="default" className="performance-widget min-w-0">
    <header className="performance-widget__header">
      <span className="performance-widget__icon performance-widget__icon--accent"><PieChart size={18}/></span>
      <span><h3 className="text-sm font-semibold">Panorama da turma</h3><p className="text-xs text-muted">Todos os componentes do recorte atual</p></span>
    </header>
    <div className="performance-panorama">
      <div className="performance-donut" role="img" aria-label={`${stats.allAtOrAbove} estudantes com todos os componentes no mínimo ou acima, ${stats.withBelow} com pelo menos um abaixo e ${stats.pending} sem leitura classificada`}
        style={{ background: `conic-gradient(var(--performance-above) 0 ${good}%, var(--performance-below) ${good}% ${good + below}%, var(--performance-pending) ${good + below}% ${good + below + pending}%)` }}>
        <div className="performance-donut__center"><strong>{number.format(good)}%</strong><span>{stats.allAtOrAbove} de {stats.eligible}</span></div>
      </div>
      <div className="grid min-w-0 gap-2">
        <button type="button" className="performance-panorama__item" aria-pressed={selection?.kind === 'group' && selection.group === 'allAtOrAbove'} onClick={() => choose('allAtOrAbove')}>
          <i className="performance-legend performance-legend--above"/><span>Todos no mínimo ou acima</span><strong>{stats.allAtOrAbove}</strong>
        </button>
        <button type="button" className="performance-panorama__item" aria-pressed={selection?.kind === 'group' && selection.group === 'withBelow'} onClick={() => choose('withBelow')}>
          <i className="performance-legend performance-legend--below"/><span>Algum abaixo do mínimo</span><strong>{stats.withBelow}</strong>
        </button>
        <button type="button" className="performance-panorama__item" aria-pressed={selection?.kind === 'group' && selection.group === 'pending'} onClick={() => choose('pending')}>
          <i className="performance-legend performance-legend--pending"/><span>{pendingLabel}</span><strong>{stats.pending}</strong>
        </button>
      </div>
    </div>
    {attention.length > 0 ? <div className="mt-4 border-t border-separator pt-3">
      <Button size="sm" variant="ghost" className="w-full justify-between" onPress={() => setExpanded((current) => !current)} aria-expanded={expanded}>
        <span className="flex items-center gap-2"><CircleAlert size={15}/>{attention.length} estudante(s) requerem atenção</span>{expanded ? <ChevronUp size={15}/> : <ChevronDown size={15}/>}
      </Button>
      {expanded ? <ul className="mt-2 grid gap-1" aria-label="Estudantes com componente abaixo do mínimo">{attention.slice(0, 8).map((student) =>
        <li key={student.id}><button type="button" className="performance-attention-row" onClick={() => open(student.id)}><span className="truncate">{student.name}</span><Chip size="sm" variant="soft" color="danger">Atenção</Chip></button></li>)}</ul> : null}
    </div> : null}
  </Surface>;
}

export function PerformanceDashboardWidgetsV5({ value, selection, onSelectionChange, open }: {
  readonly value: PerformanceDashboardV5;
  readonly selection: PerformanceDashboardSelectionV5;
  readonly onSelectionChange: (selection: PerformanceDashboardSelectionV5) => void;
  readonly open: (studentId: number, offerId?: number) => void;
}) {
  return <div className="grid min-w-0 gap-4">
    <PerformanceKpisV5 value={value} selection={selection} onSelectionChange={onSelectionChange}/>
    <div className="performance-dashboard-grid">
      <ComponentBarsV5 value={value} selection={selection} onSelectionChange={onSelectionChange} open={open}/>
      <ClassPanoramaV5 value={value} selection={selection} onSelectionChange={onSelectionChange} open={open}/>
    </div>
  </div>;
}
