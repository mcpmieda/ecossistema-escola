import type { ReactNode } from 'react';
import { Button, Chip, Table } from '@heroui/react';
import type { PerformanceRowV2 } from '../../../../shared/gradebook-contracts/performance/relational-performance-v2';

export interface PerformanceGridColumnV2 { readonly key: string; readonly label: string; readonly title: string; readonly offerId: number; }
export interface PerformanceGridRowV2 { readonly student: PerformanceRowV2['student']; readonly values: readonly ReactNode[]; readonly annual?: string | null; }
/** Shared table anatomy keeps all four lenses compact and keyboard-resizable. */
export function PerformanceGridV2({ columns, rows, open, focusOffer, showAnnual = false, label }: {
  readonly columns: readonly PerformanceGridColumnV2[];
  readonly rows: readonly PerformanceGridRowV2[];
  readonly open: (studentId: number, offerId?: number) => void;
  readonly focusOffer?: (offerId: number) => void;
  readonly showAnnual?: boolean;
  readonly label: string;
}) {
  const headers = [
    { id: 'number', label: 'Nº', width: 40 }, { id: 'status', label: 'Situação', width: 88 },
    { id: 'student', label: 'Aluno', width: 192 },
    ...columns.map((column) => ({ id: `value-${column.key}`, label: column.label, width: column.label.length > 5 ? 112 : 48 })),
    ...(showAnnual ? [{ id: 'annual', label: 'Resultado', width: 150 }] : []),
  ];
  return <Table className="min-w-0">
    <Table.ResizableContainer className="max-w-full overflow-x-auto rounded-xl border border-separator">
      <Table.Content aria-label={label} className="w-full text-xs" style={{ minWidth: headers.reduce((sum, col) => sum + col.width, 0) }}>
        <Table.Header columns={headers}>{(header) => {
          const column = columns.find((item) => `value-${item.key}` === header.id);
          return <Table.Column id={header.id} isRowHeader={header.id === 'student'} defaultWidth={header.id === 'student' ? '1fr' : header.width} minWidth={header.width} className="px-2 py-2">
            {column ? focusOffer
              ? <button type="button" title={column.title} aria-label={`Ver avaliações de ${column.title}`} onClick={() => focusOffer(column.offerId)} className="w-full whitespace-normal break-words text-center font-semibold outline-none focus-visible:ring-2 focus-visible:ring-focus">{column.label}</button>
              : <span title={column.title} className="block w-full whitespace-normal break-words text-center font-semibold">{column.label}</span>
              : header.label}
            <Table.ColumnResizer />
          </Table.Column>;
        }}</Table.Header>
        <Table.Body items={rows} renderEmptyState={() => 'Nenhum aluno neste recorte.'}>{(row) => <Table.Row id={row.student.id} columns={headers}>{(header) => {
          const index = headers.indexOf(header) - 3;
          return <Table.Cell className="px-2 py-2">
            {header.id === 'number' ? <span className="tabular-nums">{row.student.number}</span> :
              header.id === 'status' ? row.student.status === null ? <span title={row.student.statusLabel} aria-label={row.student.statusLabel}>—</span> : <Chip size="sm" variant="soft"><Chip.Label>{row.student.statusLabel}</Chip.Label></Chip> :
              header.id === 'student' ? <Button size="sm" variant="ghost" className="h-auto w-full justify-start whitespace-normal break-words px-0 text-left text-xs" onPress={() => open(row.student.id)}>{row.student.name}</Button> :
              header.id === 'annual' ? <span className="text-xs">{row.annual ?? '—'}</span> :
              <Button size="sm" variant="ghost" className="h-auto w-full min-w-0 px-0 py-1 text-xs" aria-label={`${row.student.name}, ${columns[index]!.title}`} onPress={() => open(row.student.id, columns[index]!.offerId)}>{row.values[index]}</Button>}
          </Table.Cell>;
        }}</Table.Row>}</Table.Body>
      </Table.Content>
    </Table.ResizableContainer>
  </Table>;
}
