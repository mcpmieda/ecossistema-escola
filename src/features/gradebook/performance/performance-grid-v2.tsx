import type { ReactNode } from 'react';
import { Button, Chip, Table } from '@heroui/react';
import type { PerformanceRowV2 } from '../../../../shared/gradebook-contracts/performance/relational-performance-v2';

export interface PerformanceGridColumnV2 {
  readonly key: string;
  readonly label: string;
  readonly title: string;
  readonly offerId: number;
}
export interface PerformanceGridRowV2 {
  readonly student: PerformanceRowV2['student'];
  readonly values: readonly ReactNode[];
  readonly annual?: string | null;
}
const STATUS_SHORT: Record<Exclude<PerformanceRowV2['student']['status'], null>, string> = {
  1: 'Especial',
  2: 'Assistido',
  3: 'Desistente',
  4: 'Transferido',
  5: 'Falecido',
  7: 'Estava no',
};
const STATUS_TONE: Record<Exclude<PerformanceRowV2['student']['status'], null>, string> = {
  1: 'special',
  2: 'assisted',
  3: 'withdrawn',
  4: 'transferred',
  5: 'deceased',
  7: 'origin',
};
/** Shared table anatomy keeps all four lenses compact and keyboard-resizable. */
export function PerformanceGridV2({
  columns,
  rows,
  open,
  focusOffer,
  showAnnual = false,
  label,
}: {
  readonly columns: readonly PerformanceGridColumnV2[];
  readonly rows: readonly PerformanceGridRowV2[];
  readonly open: (studentId: number, offerId?: number) => void;
  readonly focusOffer?: (offerId: number) => void;
  readonly showAnnual?: boolean;
  readonly label: string;
}) {
  const headers = [
    { id: 'number', label: 'Nº', width: 40 },
    { id: 'status', label: 'Situação', width: 144 },
    { id: 'student', label: 'Aluno', width: 192 },
    ...columns.map((column) => ({
      id: `value-${column.key}`,
      label: column.label,
      width: column.label.length > 5 ? 112 : 48,
    })),
    ...(showAnnual ? [{ id: 'annual', label: 'Resultado', width: 150 }] : []),
  ];
  return (
    <Table className="min-w-0">
      <Table.ScrollContainer className="max-w-full overflow-x-auto rounded-xl border border-separator">
        <Table.Content
          aria-label={label}
          className="w-full text-xs"
          style={{ minWidth: headers.reduce((sum, col) => sum + col.width, 0) }}
        >
          <Table.Header columns={headers}>
            {(header) => {
              const column = columns.find((item) => `value-${item.key}` === header.id);
              return (
                <Table.Column
                  id={header.id}
                  isRowHeader={header.id === 'student'}
                  defaultWidth={header.id === 'student' ? '1fr' : header.width}
                  minWidth={header.width}
                  className="px-2 py-1"
                >
                  {column ? (
                    focusOffer ? (
                      <button
                        type="button"
                        title={column.title}
                        aria-label={`Ver avaliações de ${column.title}`}
                        onClick={() => focusOffer(column.offerId)}
                        className="w-full whitespace-normal break-words text-center font-semibold outline-none focus-visible:ring-2 focus-visible:ring-focus"
                      >
                        {column.label}
                      </button>
                    ) : (
                      <span
                        title={column.title}
                        className="block w-full whitespace-normal break-words text-center font-semibold"
                      >
                        {column.label}
                      </span>
                    )
                  ) : (
                    header.label
                  )}
                </Table.Column>
              );
            }}
          </Table.Header>
          <Table.Body items={rows} renderEmptyState={() => 'Nenhum aluno neste recorte.'}>
            {(row) => (
              <Table.Row id={row.student.id} columns={headers} className="performance-grid__row">
                {(header) => {
                  const index = headers.indexOf(header) - 3;
                  return (
                    <Table.Cell className="performance-grid__cell px-2 py-0.5">
                      {header.id === 'number' ? (
                        <span className="tabular-nums">{row.student.number}</span>
                      ) : header.id === 'status' ? (
                        <Chip
                          size="sm"
                          variant="soft"
                          title={row.student.statusLabel}
                          aria-label={row.student.statusLabel}
                          className={`performance-status-chip performance-status-chip--${row.student.status === null ? 'regular' : STATUS_TONE[row.student.status]}`}
                        >
                          <Chip.Label className="whitespace-nowrap">
                            {row.student.status === null
                              ? 'Em curso'
                              : row.student.status === 7
                                ? row.student.statusLabel
                                : STATUS_SHORT[row.student.status]}
                          </Chip.Label>
                        </Chip>
                      ) : header.id === 'student' ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="min-h-6 h-auto w-full justify-start whitespace-normal break-words px-0 py-0 text-left text-xs leading-4"
                          onPress={() => open(row.student.id)}
                        >
                          {row.student.name}
                        </Button>
                      ) : header.id === 'annual' ? (
                        <span className="text-xs">{row.annual ?? '—'}</span>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="min-h-6 h-auto w-full min-w-0 px-0 py-0 text-xs"
                          aria-label={`${row.student.name}, ${columns[index]!.title}`}
                          onPress={() => open(row.student.id, columns[index]!.offerId)}
                        >
                          {row.values[index]}
                        </Button>
                      )}
                    </Table.Cell>
                  );
                }}
              </Table.Row>
            )}
          </Table.Body>
        </Table.Content>
      </Table.ScrollContainer>
    </Table>
  );
}
