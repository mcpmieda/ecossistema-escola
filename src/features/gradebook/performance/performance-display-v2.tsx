import { Chip } from '@heroui/react';
import type { PerformanceCellV2, PerformanceOfferV2 } from '../../../../shared/gradebook-contracts/performance/relational-performance-v2';

const formatter = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 });
export const gradeText = (value: number | null) => value === null ? '—' : formatter.format(value / 1000);
export const stateText: Record<PerformanceCellV2['state'], string> = {
  complete: 'Completo', partial: 'Parcial', 'not-recorded': 'Sem nota', unavailable: 'Indisponível',
  'not-applicable': 'Não se aplica', 'recovery-pending': 'Pendente', 'no-show': 'N/C',
  'repeat-failure': 'Reprovado (R/R)',
};
export const subjectText = (offer: PerformanceOfferV2) => offer.subject.abbreviation || offer.subject.label;

export function GradeValue({ cell, prominent = false, partialAsMarker = false }: {
  readonly cell: PerformanceCellV2;
  readonly prominent?: boolean;
  readonly partialAsMarker?: boolean;
}) {
  const tone = cell.level === 'below' ? 'text-danger' : cell.level === 'at-or-above' ? 'text-accent' : 'text-foreground';
  return <span className={`inline-flex flex-col items-center ${prominent ? 'gap-0.5' : 'gap-0'} ${tone}`}>
    <span className={`font-semibold tabular-nums ${prominent ? 'text-4xl tracking-tight' : 'text-sm leading-4'}`}>
      {cell.state === 'no-show' ? 'N/C' : cell.state === 'repeat-failure' ? 'R/R' : cell.state === 'recovery-pending' ? 'REC' : gradeText(cell.valueMilli)}
    </span>
    {cell.state === 'complete' ? <span className="sr-only">{cell.level === 'below' ? 'Abaixo do limite' : 'No limite ou acima'}</span> : cell.state !== 'no-show' && cell.state !== 'repeat-failure' ?
      cell.state === 'partial' && partialAsMarker ? <span className="text-xs font-bold leading-3" title="Resultado parcial"><span aria-hidden="true">*</span><span className="sr-only">Resultado parcial</span></span> :
        prominent ? <Chip size="sm" color={cell.state === 'partial' ? 'warning' : 'default'} variant="soft"><Chip.Label>{stateText[cell.state]}</Chip.Label></Chip> :
        <span className="text-[10px] leading-tight">{stateText[cell.state]}</span> : null}
  </span>;
}
