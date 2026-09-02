import { useState } from 'react';
import { Button, Surface } from '@heroui/react';
import type {
  ClassPerformanceReadModelV1,
  PerformanceCellV1,
} from '../../../../shared/gradebook-contracts/performance/class-performance-read-model-v1';
import type { AcademicGradeValueV1 } from '../../../../shared/gradebook-contracts/results/results-contract-v1';

type PerformanceChartModeV1 = 'student-components' | 'component-students';

function officialValueLabel(value: AcademicGradeValueV1): string {
  switch (value.state) {
    case 'numeric':
      return String(value.value);
    case 'official-zero':
      return '0 · zero oficial';
    case 'legacy-zero':
      return '0 · zero legado';
    case 'not-applicable':
      return 'Não aplicável';
    case 'insufficient-data':
      return 'Dados insuficientes';
    case 'absent':
      return 'Ausente';
  }
}

function visualPercentage(value: AcademicGradeValueV1): number | null {
  if (value.state === 'numeric') return value.value;
  if (value.state === 'official-zero' || value.state === 'legacy-zero') return 0;
  return null;
}

function officialTermPercentage(cell: PerformanceCellV1): AcademicGradeValueV1 | null {
  if (cell.lens !== 'result' || cell.projection.source !== 'term-result') return null;
  return cell.projection.percentage.imported;
}

function OfficialPercentageMark({
  label,
  value,
}: {
  readonly label: string;
  readonly value: AcademicGradeValueV1;
}) {
  const visualValue = visualPercentage(value);
  const valueLabel = officialValueLabel(value);
  return (
    <li
      className="rounded-xl border border-border p-3"
      data-official-state={value.state}
      aria-label={`${label}: ${valueLabel}`}
    >
      <div className="flex items-start justify-between gap-3 text-sm">
        <span className="min-w-0 font-medium">{label}</span>
        <span className="shrink-0 text-xs text-muted">{valueLabel}</span>
      </div>
      {visualValue === null ? (
        <p className="mt-2 text-xs text-muted">Sem barra para estado oficial não numérico.</p>
      ) : (
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-default/50" aria-hidden="true">
          <div
            className="h-full max-w-full rounded-full bg-accent"
            style={{ width: `${visualValue}%` }}
          />
        </div>
      )}
    </li>
  );
}

export function PerformanceOfficialCharts({
  matrix,
}: {
  readonly matrix: ClassPerformanceReadModelV1;
}) {
  const [mode, setMode] = useState<PerformanceChartModeV1>('student-components');
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<string | null>(null);

  const firstRow = matrix.rows.items[0] ?? null;
  const firstCell = firstRow?.cells[0] ?? null;
  const chartSourceIsOfficialPercentage =
    firstCell?.lens === 'result' && firstCell.projection.source === 'term-result';

  if (!chartSourceIsOfficialPercentage) {
    return (
      <Surface variant="secondary" className="rounded-2xl p-4 sm:p-5" aria-label="Gráficos oficiais">
        <p className="text-sm font-semibold">Gráficos oficiais</p>
        <p className="mt-1 text-sm text-muted">
          Este contexto não fornece percentual oficial trimestral. Nenhum gráfico é derivado de nota,
          total anual, recuperação, qualitativo ou avaliações.
        </p>
      </Surface>
    );
  }

  const selectedRow =
    matrix.rows.items.find((row) => row.studentId === selectedStudentId) ?? firstRow;
  const selectedColumnIndexCandidate = matrix.columns.items.findIndex(
    (column) => column.teachingAssignmentId === selectedAssignmentId,
  );
  const selectedColumnIndex = selectedColumnIndexCandidate >= 0 ? selectedColumnIndexCandidate : 0;
  const selectedColumn = matrix.columns.items[selectedColumnIndex] ?? null;

  return (
    <Surface variant="secondary" className="rounded-2xl p-4 sm:p-5" aria-label="Gráficos oficiais">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold">Gráficos oficiais</p>
          <p className="mt-1 text-xs leading-5 text-muted">
            Cada barra projeta diretamente o percentual oficial já retornado para a célula pela fonte
            importada. Sem média, ranking, taxa derivada ou agregação.
          </p>
        </div>
        <div role="group" aria-label="Visão do gráfico" className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant={mode === 'student-components' ? 'primary' : 'outline'}
            aria-pressed={mode === 'student-components'}
            onPress={() => setMode('student-components')}
          >
            Componentes do aluno
          </Button>
          <Button
            size="sm"
            variant={mode === 'component-students' ? 'primary' : 'outline'}
            aria-pressed={mode === 'component-students'}
            onPress={() => setMode('component-students')}
          >
            Alunos no componente
          </Button>
        </div>
      </div>

      {mode === 'student-components' && selectedRow && (
        <div className="mt-4 grid gap-3">
          <label className="grid gap-1 text-sm font-medium">
            Aluno do gráfico
            <select
              className="h-10 rounded-xl border border-border bg-transparent px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-focus"
              value={selectedRow.studentId}
              onChange={(event) => setSelectedStudentId(event.currentTarget.value)}
            >
              {matrix.rows.items.map((row) => (
                <option key={row.studentId} value={row.studentId}>{row.displayName}</option>
              ))}
            </select>
          </label>
          <ul
            className="grid gap-2"
            aria-label={`Percentuais oficiais por componente de ${selectedRow.displayName}`}
          >
            {selectedRow.cells.map((cell, index) => {
              const value = officialTermPercentage(cell);
              if (value === null) return null;
              const column = matrix.columns.items[index];
              return (
                <OfficialPercentageMark
                  key={cell.teachingAssignmentId}
                  label={column?.displayName ?? column?.code ?? 'Componente'}
                  value={value}
                />
              );
            })}
          </ul>
        </div>
      )}

      {mode === 'component-students' && selectedColumn && (
        <div className="mt-4 grid gap-3">
          <label className="grid gap-1 text-sm font-medium">
            Componente do gráfico
            <select
              className="h-10 rounded-xl border border-border bg-transparent px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-focus"
              value={selectedColumn.teachingAssignmentId}
              onChange={(event) => setSelectedAssignmentId(event.currentTarget.value)}
            >
              {matrix.columns.items.map((column) => (
                <option key={column.teachingAssignmentId} value={column.teachingAssignmentId}>
                  {column.code} · {column.displayName}
                </option>
              ))}
            </select>
          </label>
          <ul
            className="grid gap-2"
            aria-label={`Percentuais oficiais de ${selectedColumn.displayName} por aluno`}
          >
            {matrix.rows.items.map((row) => {
              const cell = row.cells[selectedColumnIndex];
              if (cell === undefined) return null;
              const value = officialTermPercentage(cell);
              if (value === null) return null;
              return <OfficialPercentageMark key={row.studentId} label={row.displayName} value={value} />;
            })}
          </ul>
        </div>
      )}
    </Surface>
  );
}
