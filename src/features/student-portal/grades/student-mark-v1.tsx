import { Chip } from '@heroui/react/chip';
import type { SelfResponseV1 } from '../../../../shared/student-portal-contracts/self-v1';
import './student-grades-v1.css';

type SubjectV1 = SelfResponseV1['subjects'][number];
type PeriodV1 = SubjectV1['periods'][number];
type MarkV1 = PeriodV1['final'];
const number = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 20 });

/** Text/colour mapping only. It never derives a threshold, average, result or new mark. */
export function StudentMarkV1({
  mark,
  showMaximum = false,
}: {
  mark: MarkV1;
  showMaximum?: boolean;
}) {
  if (mark.kind === 'recovery-pending')
    return (
      <Chip size="sm" color="danger" variant="soft" aria-label="Recuperação pendente de nota">
        REC
      </Chip>
    );
  if (mark.kind !== 'score') {
    const label = { absent: 'Ainda não lançado', nc: 'N/C', rr: 'R/R' }[mark.kind];
    return (
      <span className="pa-mark-neutral" aria-label={label}>
        {mark.kind === 'absent' ? '—' : label}
      </span>
    );
  }
  const classification =
    mark.meetsMinimum === true
      ? 'Atinge o mínimo institucional'
      : mark.meetsMinimum === false
        ? 'Abaixo do mínimo institucional'
        : 'Classificação indisponível';
  const value = number.format(mark.value);
  const total = showMaximum && mark.maximum !== null ? number.format(mark.maximum) : null;
  return (
    <span
      className="pa-mark"
      data-minimum={mark.meetsMinimum === null ? 'unknown' : mark.meetsMinimum ? 'met' : 'below'}
      aria-label={`${value}${total === null ? '' : ` de ${total}`}. ${classification}`}
    >
      <span className="pa-mark-value">{value}</span>
      {total === null ? null : <span className="pa-mark-maximum"> / {total}</span>}
    </span>
  );
}
