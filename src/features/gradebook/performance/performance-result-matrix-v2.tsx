import { useState } from 'react';
import { Button, Chip, Surface } from '@heroui/react';
import { Search, Table2 } from 'lucide-react';
import type { PerformanceMatrixV2 } from '../../../../shared/gradebook-contracts/performance/relational-performance-v2';
import { GradeValue, subjectText } from './performance-display-v2';
import { PerformanceGridV2 } from './performance-grid-v2';

export function PerformanceResultMatrixV2({ value, open, allowedIds, focusOffer }: {
  readonly value: PerformanceMatrixV2;
  readonly open: (studentId: number, offerId?: number) => void;
  readonly allowedIds: ReadonlySet<number> | null;
  readonly focusOffer: (offerId: number) => void;
}) {
  const [investigation, setInvestigation] = useState<'all' | 'below' | 'incomplete'>('all');
  const [query, setQuery] = useState('');
  const normalizedQuery = query.trim().toLocaleLowerCase('pt-BR');
  const rows = value.rows.filter((row) => allowedIds === null || allowedIds.has(row.student.id)).filter((row) => investigation === 'all' || (row.student.indicatorEligible && row.cells.some((cell) =>
    investigation === 'below' ? cell.level === 'below' : cell.state !== 'complete' && cell.state !== 'no-show' && (value.mode === 'regular' || cell.recoveryApplicable === true))));
  const visibleRows = normalizedQuery ? rows.filter((row) => row.student.name.toLocaleLowerCase('pt-BR').includes(normalizedQuery) || String(row.student.number) === normalizedQuery) : rows;
  return <Surface variant="default" className="performance-widget grid min-w-0 gap-3">
    <header className="performance-widget__header">
      <span className="performance-widget__icon performance-widget__icon--accent"><Table2 size={18}/></span>
      <span><h3 className="text-sm font-semibold">Matriz de resultados</h3><p className="text-xs text-muted">Situação dos estudantes por componente curricular</p></span>
      <Chip size="sm" variant="soft" className="ml-auto">{visibleRows.length} estudantes</Chip>
    </header>
    <div role="group" aria-label="Filtros rápidos" className="flex flex-wrap items-center gap-2">
      <Button size="sm" variant={investigation === 'all' ? 'secondary' : 'ghost'} aria-pressed={investigation === 'all'} onPress={() => setInvestigation('all')}>Todos</Button>
      <Button size="sm" variant={investigation === 'below' ? 'secondary' : 'ghost'} aria-pressed={investigation === 'below'} onPress={() => setInvestigation('below')}>Abaixo do limite</Button>
      <Button size="sm" variant={investigation === 'incomplete' ? 'secondary' : 'ghost'} aria-pressed={investigation === 'incomplete'} onPress={() => setInvestigation('incomplete')}>Incompletos</Button>
      <label className="relative ml-auto min-w-48"><span className="sr-only">Buscar estudante</span><Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted"/><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar estudante" className="min-h-9 w-full rounded-xl border border-separator bg-surface pl-8 pr-3 text-xs outline-none focus-visible:ring-2 focus-visible:ring-focus"/></label>
    </div>
    <PerformanceGridV2 label="Matriz de Desempenho" columns={value.offers.map((offer) => ({ key: String(offer.id), label: subjectText(offer), title: offer.subject.label, offerId: offer.id }))}
      rows={visibleRows.map((row) => ({ student: row.student, values: row.cells.map((cell) => <GradeValue key={cell.offerId} cell={cell} partialAsMarker/>), annual: row.calculatedAnnual?.label }))}
      showAnnual={value.period === 'annual' || value.period === 3 || value.mode === 'recovery'} open={open} focusOffer={focusOffer}/>
    {investigation !== 'all' ? <Button size="sm" variant="ghost" className="justify-self-start" onPress={() => setInvestigation('all')}>Limpar filtro rápido</Button> : null}
  </Surface>;
}
