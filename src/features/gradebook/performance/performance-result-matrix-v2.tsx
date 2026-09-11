import { useState } from 'react';
import { Button } from '@heroui/react';
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
  const rows = value.rows.filter((row) => allowedIds === null || allowedIds.has(row.student.id)).filter((row) => investigation === 'all' || (row.student.indicatorEligible && row.cells.some((cell) =>
    investigation === 'below' ? cell.level === 'below' : cell.state !== 'complete' && cell.state !== 'no-show' && (value.mode === 'regular' || cell.recoveryApplicable === true))));
  return <>
    <div role="group" aria-label="Filtros rápidos" className="flex flex-wrap items-center gap-2">
      <Button size="sm" variant={investigation === 'all' ? 'secondary' : 'ghost'} aria-pressed={investigation === 'all'} onPress={() => setInvestigation('all')}>Todos</Button>
      <Button size="sm" variant={investigation === 'below' ? 'secondary' : 'ghost'} aria-pressed={investigation === 'below'} onPress={() => setInvestigation('below')}>Abaixo do limite</Button>
      <Button size="sm" variant={investigation === 'incomplete' ? 'secondary' : 'ghost'} aria-pressed={investigation === 'incomplete'} onPress={() => setInvestigation('incomplete')}>Incompletos</Button>
      <span className="ml-auto text-xs text-muted">{rows.length} alunos</span>
    </div>
    <PerformanceGridV2 label="Matriz de Desempenho" columns={value.offers.map((offer) => ({ key: String(offer.id), label: subjectText(offer), title: offer.subject.label, offerId: offer.id }))}
      rows={rows.map((row) => ({ student: row.student, values: row.cells.map((cell) => <GradeValue key={cell.offerId} cell={cell}/>), annual: row.calculatedAnnual?.label }))}
      showAnnual={value.period === 'annual' || value.period === 3 || value.mode === 'recovery'} open={open} focusOffer={focusOffer}/>
    {investigation !== 'all' ? <Button size="sm" variant="ghost" className="justify-self-start" onPress={() => setInvestigation('all')}>Limpar filtro rápido</Button> : null}
  </>;
}
