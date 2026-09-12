import { useState } from 'react';
import { Button, Chip, Label, Surface, Tag, TagGroup } from '@heroui/react';
import { Search, Table2 } from 'lucide-react';
import type { PerformanceMatrixV2, PerformanceStatusV2 } from '../../../../shared/gradebook-contracts/performance/relational-performance-v2';
import { GradeValue, subjectText } from './performance-display-v2';
import { PerformanceGridV2 } from './performance-grid-v2';

const statusKey = (status: PerformanceStatusV2) => status === null ? 'status-current' : `status-${status}`;

export function PerformanceResultMatrixV2({ value, open, allowedIds, focusOffer, statusOptions, statuses, onStatusesChange }: {
  readonly value: PerformanceMatrixV2;
  readonly open: (studentId: number, offerId?: number) => void;
  readonly allowedIds: ReadonlySet<number> | null;
  readonly focusOffer: (offerId: number) => void;
  readonly statusOptions: readonly { readonly value: PerformanceStatusV2; readonly label: string }[];
  readonly statuses: readonly PerformanceStatusV2[];
  readonly onStatusesChange: (statuses: PerformanceStatusV2[]) => void;
}) {
  const [investigation, setInvestigation] = useState<'all' | 'below' | 'incomplete'>('all');
  const [query, setQuery] = useState('');
  const normalizedQuery = query.trim().toLocaleLowerCase('pt-BR');
  const rows = value.rows.filter((row) => allowedIds === null || allowedIds.has(row.student.id)).filter((row) => investigation === 'all' || (row.student.indicatorEligible && row.cells.some((cell) =>
    investigation === 'below' ? cell.level === 'below' : cell.state !== 'complete' && cell.state !== 'no-show' && cell.state !== 'repeat-failure' && (value.mode === 'regular' || cell.recoveryApplicable === true))));
  const visibleRows = normalizedQuery ? rows.filter((row) => row.student.name.toLocaleLowerCase('pt-BR').includes(normalizedQuery) || String(row.student.number) === normalizedQuery) : rows;
  return <Surface variant="default" className="performance-widget grid min-w-0 gap-3">
    <header className="performance-widget__header performance-matrix-header">
      <span className="performance-widget__icon performance-widget__icon--accent"><Table2 size={18}/></span>
      <span className="flex shrink-0 items-center gap-2"><h3 className="text-sm font-semibold">Matriz de resultados</h3><Chip size="sm" variant="soft">{visibleRows.length}</Chip></span>
      <TagGroup
        aria-label="Situações exibidas"
        className="performance-status-filter"
        size="sm"
        variant="default"
        selectionMode="multiple"
        disallowEmptySelection
        selectedKeys={new Set(statuses.map(statusKey))}
        onSelectionChange={(keys) => {
          const selected = keys === 'all'
            ? statusOptions.map((option) => option.value)
            : statusOptions.filter((option) => keys.has(statusKey(option.value))).map((option) => option.value);
          if (selected.length > 0) onStatusesChange(selected);
        }}
      >
        <Label className="whitespace-nowrap text-[11px] font-medium text-muted">Situações exibidas</Label>
        <TagGroup.List className="justify-end">
          {statusOptions.map((option) => <Tag key={statusKey(option.value)} id={statusKey(option.value)}>{option.label}</Tag>)}
        </TagGroup.List>
      </TagGroup>
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
