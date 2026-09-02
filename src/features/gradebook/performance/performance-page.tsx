import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Chip, Label, SearchField, Spinner, Surface } from '@heroui/react';
import { BarChart3, Search, UserRound, X } from 'lucide-react';
import type { AcademicYearId, ClassGroupId } from '../../../../shared/gradebook-contracts/entities';
import {
  GLOBAL_SEARCH_CONTRACT_VERSION_V1,
  GLOBAL_SEARCH_ORDER_V1,
  type GlobalSearchResultV1,
} from '../../../../shared/gradebook-contracts/search/global-search-contract-v1';
import {
  CLASS_PERFORMANCE_CONTRACT_VERSION_V1,
  PERFORMANCE_COLUMN_ORDER_V1,
  PERFORMANCE_LENSES_V1,
  PERFORMANCE_ROW_ORDER_V1,
  type ClassPerformanceReadModelV1,
  type PerformanceCellDetailRefV1,
  type PerformanceCellV1,
  type PerformanceColumnCursorV1,
  type PerformanceComparedGradeValueV1,
  type PerformanceLensV1,
  type PerformanceModeV1,
  type PerformancePeriodV1,
  type PerformanceRowCursorV1,
  type PerformanceStudentDetailRefV1,
} from '../../../../shared/gradebook-contracts/performance/class-performance-read-model-v1';
import type { PerformanceComparisonProjectionV2 } from '../../../../shared/gradebook-contracts/performance/performance-comparison-contract-v2';
import {
  PERFORMANCE_TRANSPORT_VERSION_V1,
  type PerformanceCellDetailTransportV1,
  type PerformanceStudentDetailTransportV1,
} from '../../../../shared/gradebook-contracts/performance/performance-transport-v1';
import type {
  AcademicGradeValueV1,
  AcademicTermV1,
} from '../../../../shared/gradebook-contracts/results/results-contract-v1';
import { requestOperationalWorkspaceV1 } from '../operational-workspace/operational-workspace-client';
import { requestPerformanceV1 } from './performance-client';
import { PerformanceComparisonConfigurationPanel } from './performance-comparison-configuration-panel';
import { PerformanceOfficialCharts } from './performance-official-charts';
import { createPerformanceRequestGateV1 } from './performance-request-gate';

type LoadState = 'idle' | 'loading' | 'ready' | 'empty' | 'unavailable' | 'not-authorized';
type SelectedClass = { readonly id: ClassGroupId; readonly label: string };
type DetailView =
  | { readonly kind: 'student'; readonly value: PerformanceStudentDetailTransportV1 }
  | { readonly kind: 'cell'; readonly value: PerformanceCellDetailTransportV1 };
type PerformanceCellWithComparisonV2 = PerformanceCellV1 & {
  readonly proportionalComparison?: PerformanceComparisonProjectionV2;
};

const LENS_LABELS: Record<PerformanceLensV1, string> = {
  result: 'Resultado',
  quantitative: 'Quantitativo',
  qualitative: 'Qualitativo',
  assessments: 'Avaliações',
};

function gradeValueLabel(value: AcademicGradeValueV1): string {
  switch (value.state) {
    case 'numeric':
      return String(value.value);
    case 'official-zero':
    case 'legacy-zero':
      return '0';
    case 'not-applicable':
      return 'N/A';
    case 'insufficient-data':
      return 'Dados insuficientes';
    case 'absent':
      return '—';
  }
}

function comparedGradeLabel(value: PerformanceComparedGradeValueV1): string {
  return `Fonte ${gradeValueLabel(value.imported)} · Nativo ${gradeValueLabel(value.calculated)}`;
}

function percentageLabel(value: AcademicGradeValueV1): string {
  const label = gradeValueLabel(value);
  return ['numeric', 'official-zero', 'legacy-zero'].includes(value.state) ? `${label}%` : label;
}

function coverageLabel(cell: PerformanceCellV1): string {
  switch (cell.coverage.state) {
    case 'complete':
      return 'Cobertura completa';
    case 'partial':
      return 'Cobertura parcial';
    case 'insufficient-data':
      return 'Dados insuficientes';
    case 'not-applicable':
      return 'Não aplicável';
  }
}

function cellPrimaryLabel(cell: PerformanceCellV1): string {
  if (cell.lens === 'result') {
    switch (cell.projection.source) {
      case 'term-result':
        return comparedGradeLabel(cell.projection.officialGrade);
      case 'final-recovery':
        return comparedGradeLabel(cell.projection.replacementTermGrade);
      case 'annual-result':
        return comparedGradeLabel(cell.projection.postRecoveryTotal);
    }
  }
  if (cell.lens === 'quantitative') return comparedGradeLabel(cell.projection.considered);
  if (cell.lens === 'qualitative') return comparedGradeLabel(cell.projection.operational);
  return cell.projection.items.length === 1
    ? '1 avaliação'
    : `${cell.projection.items.length} avaliações`;
}

function periodLabel(period: PerformancePeriodV1): string {
  return period.kind === 'annual' ? 'Anual' : `${period.term}º trimestre`;
}

function proportionalComparison(cell: PerformanceCellV1): PerformanceComparisonProjectionV2 | null {
  return (cell as PerformanceCellWithComparisonV2).proportionalComparison ?? null;
}

const COMPARISON_RELATION_LABELS = {
  'proportionally-higher': 'Maior',
  'proportionally-equal': 'Igual',
  'proportionally-lower': 'Menor',
} as const;

const NOT_COMPARABLE_LABELS: Record<string, string> = {
  'profile-semantics-not-declared-compatible':
    'Os perfis dos períodos não têm compatibilidade declarada.',
  'current-coverage-partial': 'O período em foco tem cobertura parcial.',
  'current-coverage-insufficient-data': 'O período em foco não tem cobertura suficiente.',
  'current-coverage-not-applicable': 'O período em foco não é aplicável.',
  'reference-coverage-partial': 'O período de referência tem cobertura parcial.',
  'reference-coverage-insufficient-data': 'O período de referência não tem cobertura suficiente.',
  'reference-coverage-not-applicable': 'O período de referência não é aplicável.',
  'current-percentage-absent': 'O percentual do período em foco está ausente.',
  'current-percentage-not-applicable': 'O percentual do período em foco não é aplicável.',
  'current-percentage-insufficient-data':
    'O percentual do período em foco tem dados insuficientes.',
  'current-percentage-invalid': 'O percentual do período em foco é inválido.',
  'reference-percentage-absent': 'O percentual do período de referência está ausente.',
  'reference-percentage-not-applicable': 'O percentual do período de referência não é aplicável.',
  'reference-percentage-insufficient-data':
    'O percentual do período de referência tem dados insuficientes.',
  'reference-percentage-invalid': 'O percentual do período de referência é inválido.',
};

function comparisonSummary(cell: PerformanceCellV1): string | null {
  const projection = proportionalComparison(cell);
  if (projection === null || projection.state === 'not-requested') return null;
  if (projection.state === 'disabled') return 'Comparação desativada pela instituição';
  if (projection.comparison.state === 'not-comparable') return 'Não comparável';
  return COMPARISON_RELATION_LABELS[projection.comparison.relation];
}

function ErrorState({
  state,
}: {
  state: Extract<LoadState, 'empty' | 'unavailable' | 'not-authorized'>;
}) {
  const title =
    state === 'not-authorized'
      ? 'Acesso não autorizado'
      : state === 'unavailable'
        ? 'Desempenho indisponível'
        : 'Nenhum dado encontrado';
  const description =
    state === 'not-authorized'
      ? 'Sua sessão não possui autorização para consultar Desempenho.'
      : state === 'unavailable'
        ? 'A consulta acadêmica não está disponível neste ambiente agora. Nenhum resultado antigo é reutilizado.'
        : 'Não há matriz disponível para o contexto selecionado.';
  return (
    <Alert
      status={
        state === 'unavailable' ? 'danger' : state === 'not-authorized' ? 'warning' : 'default'
      }
    >
      <Alert.Indicator />
      <Alert.Content>
        <Alert.Title>{title}</Alert.Title>
        <Alert.Description>{description}</Alert.Description>
      </Alert.Content>
    </Alert>
  );
}

function ComparisonNote({ cell }: { cell: PerformanceCellV1 }) {
  const projection = proportionalComparison(cell);
  if (projection === null || projection.state === 'not-requested') return null;
  if (projection.state === 'disabled') {
    return (
      <p className="mt-1 text-xs text-muted">
        Comparação desativada institucionalmente. Nenhum resultado acadêmico foi alterado.
      </p>
    );
  }
  const comparison = projection.comparison;
  if (comparison.state === 'not-comparable') {
    return (
      <p className="mt-1 text-xs text-muted">
        Não comparável: {NOT_COMPARABLE_LABELS[comparison.reason] ?? comparison.reason}
      </p>
    );
  }
  return (
    <p className="mt-1 text-xs text-muted">
      {COMPARISON_RELATION_LABELS[comparison.relation]} · Atual{' '}
      {percentageLabel(comparison.current.percentage)} · Referência{' '}
      {percentageLabel(comparison.reference.percentage)} · Base: percentual oficial.
    </p>
  );
}

function MatrixComparisonStatus({ matrix }: { matrix: ClassPerformanceReadModelV1 }) {
  const projection = matrix.rows.items
    .flatMap((row) => row.cells)
    .map(proportionalComparison)
    .find((value): value is PerformanceComparisonProjectionV2 => value !== null);
  if (projection === undefined) return null;
  return (
    <div className="grid gap-2">
      <PerformanceComparisonConfigurationPanel configuration={projection.configuration} />
      {projection.state !== 'not-requested' && (
        <p className="text-xs text-muted">
          Período em foco: {periodLabel(projection.selection.current)} · Referência escolhida:{' '}
          {periodLabel(projection.selection.reference)}.
        </p>
      )}
    </div>
  );
}

function CellDetailBody({ detail }: { detail: PerformanceCellDetailTransportV1 }) {
  const cell = detail.cell;
  return (
    <div className="grid gap-4">
      <Surface variant="secondary" className="rounded-2xl p-4">
        <p className="text-sm font-medium">{LENS_LABELS[cell.lens]}</p>
        <p className="mt-1 text-sm">{cellPrimaryLabel(cell)}</p>
        <p className="mt-1 text-xs text-muted">{coverageLabel(cell)}</p>
        <ComparisonNote cell={cell} />
      </Surface>
      {cell.lens === 'result' && cell.projection.source === 'final-recovery' && (
        <div className="grid gap-2 text-sm">
          <p>Original: {comparedGradeLabel(cell.projection.originalTermGrade)}</p>
          <p>Recuperação: {comparedGradeLabel(cell.projection.recoveryGrade)}</p>
          <p>Substituição oficial: {comparedGradeLabel(cell.projection.replacementTermGrade)}</p>
        </div>
      )}
      {cell.lens === 'result' && cell.projection.source === 'term-result' && (
        <div className="grid gap-2 text-sm">
          <p>Resultado oficial: {comparedGradeLabel(cell.projection.officialGrade)}</p>
          <p>Percentual oficial: {comparedGradeLabel(cell.projection.percentage)}</p>
        </div>
      )}
      {cell.lens === 'result' && cell.projection.source === 'annual-result' && (
        <div className="grid gap-2 text-sm">
          <p>Total original: {comparedGradeLabel(cell.projection.originalTotal)}</p>
          <p>Total pós-recuperação: {comparedGradeLabel(cell.projection.postRecoveryTotal)}</p>
          <p>Situação importada: {cell.projection.academicState.imported}</p>
          <p>Situação nativa: {cell.projection.academicState.calculated}</p>
        </div>
      )}
      {cell.lens === 'quantitative' && (
        <div className="grid gap-2 text-sm">
          <p>Original: {comparedGradeLabel(cell.projection.original)}</p>
          <p>Recuperação paralela: {comparedGradeLabel(cell.projection.parallelRecovery)}</p>
          <p>Considerado oficial: {comparedGradeLabel(cell.projection.considered)}</p>
        </div>
      )}
      {cell.lens === 'qualitative' && (
        <p className="text-sm">Operacional: {comparedGradeLabel(cell.projection.operational)}</p>
      )}
      {cell.lens === 'assessments' && (
        <ul className="grid gap-2" aria-label="Avaliações desta célula">
          {cell.projection.items.map((item) => (
            <li
              key={item.assessmentComponentId}
              className="rounded-xl border border-border p-3 text-sm"
            >
              <p className="font-medium">{item.name}</p>
              <p className="text-xs text-muted">Máximo oficial: {String(item.maximum)}</p>
              <p>{comparedGradeLabel(item.value)}</p>
            </li>
          ))}
        </ul>
      )}
      {cell.signals.length > 0 && (
        <ul className="grid gap-2 text-sm" aria-label="Sinais explicativos">
          {cell.signals.map((signal) => (
            <li
              key={`${signal.code}:${signal.explanation}`}
              className="rounded-xl border border-border p-3"
            >
              <span className="font-medium">{signal.code}</span> — {signal.explanation}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StudentDetailBody({ detail }: { detail: PerformanceStudentDetailTransportV1 }) {
  return (
    <div className="grid gap-4 text-sm">
      <Surface variant="secondary" className="rounded-2xl p-4">
        <p className="text-xs uppercase tracking-[0.12em] text-muted">Aluno</p>
        <p className="mt-1 font-medium">
          {detail.student?.displayName ?? 'Cadastro não disponível'}
        </p>
        <p className="mt-2 text-xs text-muted">
          Matrícula {detail.enrollment.position === 'current' ? 'vigente' : 'histórica'}
          {detail.enrollment.sourcePosition ? ` · posição ${detail.enrollment.sourcePosition}` : ''}
        </p>
      </Surface>
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
          Histórico de situação
        </p>
        {detail.statusHistory.length === 0 ? (
          <p className="mt-2 text-muted">Sem eventos de situação.</p>
        ) : (
          <ul className="mt-2 flex flex-wrap gap-2">
            {detail.statusHistory.map((event) => (
              <li key={event.id}>
                <Chip size="sm" variant="soft">
                  {event.status}
                  {event.occurredOn ? ` · ${event.occurredOn}` : ''}
                </Chip>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export function PerformancePage() {
  const [bootstrapState, setBootstrapState] = useState<LoadState>('loading');
  const [academicYears, setAcademicYears] = useState<
    readonly { id: AcademicYearId; label: string }[]
  >([]);
  const [academicYearId, setAcademicYearId] = useState<AcademicYearId | null>(null);
  const [classQuery, setClassQuery] = useState('');
  const [classSearchState, setClassSearchState] = useState<LoadState>('idle');
  const [classResults, setClassResults] = useState<readonly GlobalSearchResultV1[]>([]);
  const [selectedClass, setSelectedClass] = useState<SelectedClass | null>(null);
  const [lens, setLens] = useState<PerformanceLensV1>('result');
  const [mode, setMode] = useState<PerformanceModeV1>('regular');
  const [periodKind, setPeriodKind] = useState<'term' | 'annual'>('term');
  const [term, setTerm] = useState<AcademicTermV1>(1);
  const [comparisonChoice, setComparisonChoice] = useState<
    'none' | 'term-1' | 'term-2' | 'term-3' | 'annual'
  >('none');
  const [matrixState, setMatrixState] = useState<LoadState>('idle');
  const [matrix, setMatrix] = useState<ClassPerformanceReadModelV1 | null>(null);
  const [rowHistory, setRowHistory] = useState<readonly (PerformanceRowCursorV1 | null)[]>([null]);
  const [rowPage, setRowPage] = useState(0);
  const [columnHistory, setColumnHistory] = useState<readonly (PerformanceColumnCursorV1 | null)[]>(
    [null],
  );
  const [columnPage, setColumnPage] = useState(0);
  const [detailState, setDetailState] = useState<LoadState>('idle');
  const [detail, setDetail] = useState<DetailView | null>(null);

  const bootstrapGate = useRef(createPerformanceRequestGateV1());
  const classSearchGate = useRef(createPerformanceRequestGateV1());
  const matrixGate = useRef(createPerformanceRequestGateV1());
  const detailGate = useRef(createPerformanceRequestGateV1());
  const detailHeadingRef = useRef<HTMLHeadingElement>(null);
  const lastDetailTriggerRef = useRef<HTMLElement | null>(null);

  function resetMatrixContext() {
    matrixGate.current.invalidate();
    detailGate.current.invalidate();
    setMatrix(null);
    setMatrixState('idle');
    setDetail(null);
    setDetailState('idle');
    setRowHistory([null]);
    setRowPage(0);
    setColumnHistory([null]);
    setColumnPage(0);
  }

  useEffect(() => {
    const ticket = bootstrapGate.current.begin('performance-context-bootstrap');
    if (ticket === null) return;
    void requestOperationalWorkspaceV1(
      { contractVersion: 1, operation: 'bootstrap' },
      ticket.signal,
    )
      .then((response) => {
        if (!ticket.isCurrent()) return;
        if (response.state === 'not-authorized') return setBootstrapState('not-authorized');
        if (response.state === 'unavailable') return setBootstrapState('unavailable');
        if ('availableAcademicYears' in response) {
          setAcademicYears(response.availableAcademicYears);
          setBootstrapState(response.availableAcademicYears.length === 0 ? 'empty' : 'ready');
          return;
        }
        setBootstrapState('unavailable');
      })
      .catch((cause: unknown) => {
        if (!ticket.isCurrent() || (cause instanceof DOMException && cause.name === 'AbortError'))
          return;
        setBootstrapState('unavailable');
      })
      .finally(() => ticket.complete());
    return () => bootstrapGate.current.invalidate();
  }, []);

  useEffect(
    () => () => {
      classSearchGate.current.invalidate();
      matrixGate.current.invalidate();
      detailGate.current.invalidate();
    },
    [],
  );

  async function searchClasses() {
    const query = classQuery.trim();
    if (!academicYearId || !query) return;
    const ticket = classSearchGate.current.begin(JSON.stringify({ academicYearId, query }));
    if (ticket === null) return;
    setClassSearchState('loading');
    try {
      const response = await requestOperationalWorkspaceV1(
        {
          contractVersion: 1,
          operation: 'search',
          request: {
            contractVersion: GLOBAL_SEARCH_CONTRACT_VERSION_V1,
            academicYearId,
            query,
            scope: { kinds: ['class-group'] },
            page: { limit: 20, cursor: null },
            order: GLOBAL_SEARCH_ORDER_V1,
          },
        },
        ticket.signal,
      );
      if (!ticket.isCurrent()) return;
      if (response.state === 'not-authorized') {
        setClassResults([]);
        setClassSearchState('not-authorized');
      } else if (response.state === 'unavailable') {
        setClassResults([]);
        setClassSearchState('unavailable');
      } else if ('search' in response && response.search.outcome === 'results') {
        const items = response.search.items.filter((item) => item.kind === 'class-group');
        setClassResults(items);
        setClassSearchState(items.length === 0 ? 'empty' : 'ready');
      } else {
        setClassResults([]);
        setClassSearchState('empty');
      }
    } catch (cause) {
      if (!ticket.isCurrent() || (cause instanceof DOMException && cause.name === 'AbortError'))
        return;
      setClassResults([]);
      setClassSearchState('unavailable');
    } finally {
      ticket.complete();
    }
  }

  function currentPeriod(): PerformancePeriodV1 {
    return periodKind === 'annual' ? { kind: 'annual' } : { kind: 'term', term };
  }

  function comparisonPeriod(): PerformancePeriodV1 | null {
    if (comparisonChoice === 'none') return null;
    if (comparisonChoice === 'annual') return { kind: 'annual' };
    return { kind: 'term', term: Number(comparisonChoice.slice(-1)) as AcademicTermV1 };
  }

  async function loadMatrix(
    rowCursor: PerformanceRowCursorV1 | null,
    columnCursor: PerformanceColumnCursorV1 | null,
  ) {
    if (!academicYearId || !selectedClass) return;
    const request = {
      contractVersion: CLASS_PERFORMANCE_CONTRACT_VERSION_V1,
      academicYearId,
      classGroupId: selectedClass.id,
      period: currentPeriod(),
      mode,
      lens,
      comparisonPeriod: comparisonPeriod(),
      rows: { limit: 18, cursor: rowCursor },
      columns: { limit: 6, cursor: columnCursor },
      order: { rows: PERFORMANCE_ROW_ORDER_V1, columns: PERFORMANCE_COLUMN_ORDER_V1 },
    } as const;
    const ticket = matrixGate.current.begin(JSON.stringify(request));
    if (ticket === null) return;
    setMatrixState('loading');
    try {
      const response = await requestPerformanceV1(
        { transportVersion: PERFORMANCE_TRANSPORT_VERSION_V1, operation: 'matrix', request },
        ticket.signal,
      );
      if (!ticket.isCurrent()) return;
      if (response.state === 'not-authorized') {
        setMatrix(null);
        setMatrixState('not-authorized');
      } else if (response.state === 'unavailable' || response.state === 'invalid-request') {
        setMatrix(null);
        setMatrixState('unavailable');
      } else if (response.state === 'empty') {
        setMatrix(null);
        setMatrixState('empty');
      } else if (response.operation === 'matrix') {
        setMatrix(response.matrix);
        setMatrixState(
          response.matrix.rows.items.length === 0 || response.matrix.columns.items.length === 0
            ? 'empty'
            : 'ready',
        );
      }
    } catch (cause) {
      if (!ticket.isCurrent() || (cause instanceof DOMException && cause.name === 'AbortError'))
        return;
      setMatrix(null);
      setMatrixState('unavailable');
    } finally {
      ticket.complete();
    }
  }

  function loadFirstMatrixPage() {
    setRowHistory([null]);
    setRowPage(0);
    setColumnHistory([null]);
    setColumnPage(0);
    void loadMatrix(null, null);
  }

  function moveRows(direction: 'previous' | 'next') {
    if (!matrix) return;
    const target = direction === 'next' ? rowPage + 1 : rowPage - 1;
    let history = rowHistory;
    if (direction === 'next') {
      if (matrix.rows.nextCursor === null) return;
      history = [...rowHistory.slice(0, rowPage + 1), matrix.rows.nextCursor];
      setRowHistory(history);
    }
    const cursor = history[target];
    if (target < 0 || cursor === undefined) return;
    setRowPage(target);
    void loadMatrix(cursor, columnHistory[columnPage] ?? null);
  }

  function moveColumns(direction: 'previous' | 'next') {
    if (!matrix) return;
    const target = direction === 'next' ? columnPage + 1 : columnPage - 1;
    let history = columnHistory;
    if (direction === 'next') {
      if (matrix.columns.nextCursor === null) return;
      history = [...columnHistory.slice(0, columnPage + 1), matrix.columns.nextCursor];
      setColumnHistory(history);
    }
    const cursor = history[target];
    if (target < 0 || cursor === undefined) return;
    setColumnPage(target);
    void loadMatrix(rowHistory[rowPage] ?? null, cursor);
  }

  function focusDetail() {
    queueMicrotask(() => detailHeadingRef.current?.focus());
  }

  async function openStudentDetail(detailRef: PerformanceStudentDetailRefV1) {
    lastDetailTriggerRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const ticket = detailGate.current.begin(`student:${detailRef}`);
    if (ticket === null) return;
    setDetail(null);
    setDetailState('loading');
    try {
      const response = await requestPerformanceV1(
        {
          transportVersion: PERFORMANCE_TRANSPORT_VERSION_V1,
          operation: 'student-detail',
          detailRef,
        },
        ticket.signal,
      );
      if (!ticket.isCurrent()) return;
      if (response.state === 'not-authorized') setDetailState('not-authorized');
      else if (response.state === 'unavailable' || response.state === 'invalid-request')
        setDetailState('unavailable');
      else if (response.state === 'empty') setDetailState('empty');
      else if (response.operation === 'student-detail') {
        setDetail({ kind: 'student', value: response.detail });
        setDetailState('ready');
        focusDetail();
      }
    } catch (cause) {
      if (!ticket.isCurrent() || (cause instanceof DOMException && cause.name === 'AbortError'))
        return;
      setDetailState('unavailable');
    } finally {
      ticket.complete();
    }
  }

  async function openCellDetail(detailRef: PerformanceCellDetailRefV1) {
    lastDetailTriggerRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const ticket = detailGate.current.begin(`cell:${detailRef}`);
    if (ticket === null) return;
    setDetail(null);
    setDetailState('loading');
    try {
      const response = await requestPerformanceV1(
        { transportVersion: PERFORMANCE_TRANSPORT_VERSION_V1, operation: 'cell-detail', detailRef },
        ticket.signal,
      );
      if (!ticket.isCurrent()) return;
      if (response.state === 'not-authorized') setDetailState('not-authorized');
      else if (response.state === 'unavailable' || response.state === 'invalid-request')
        setDetailState('unavailable');
      else if (response.state === 'empty') setDetailState('empty');
      else if (response.operation === 'cell-detail') {
        setDetail({ kind: 'cell', value: response.detail });
        setDetailState('ready');
        focusDetail();
      }
    } catch (cause) {
      if (!ticket.isCurrent() || (cause instanceof DOMException && cause.name === 'AbortError'))
        return;
      setDetailState('unavailable');
    } finally {
      ticket.complete();
    }
  }

  function closeDetail() {
    detailGate.current.invalidate();
    setDetail(null);
    setDetailState('idle');
    queueMicrotask(() => lastDetailTriggerRef.current?.focus());
  }

  return (
    <Surface
      className="rounded-3xl border border-border p-4 sm:p-6"
      aria-label="Desempenho da turma"
    >
      <div className="max-w-2xl">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted">
          <BarChart3 className="size-4" aria-hidden="true" /> Desempenho
        </div>
        <h2 className="mt-3 text-2xl font-semibold tracking-[-0.035em] sm:text-3xl">
          Matriz da turma
        </h2>
        <p className="mt-2 text-sm leading-6 text-muted">
          Escolha ano, turma, período, modo e lente explicitamente. A tela apenas apresenta
          resultados oficiais; não recalcula notas.
        </p>
      </div>

      <div className="mt-6" aria-live="polite" aria-busy={bootstrapState === 'loading'}>
        {bootstrapState === 'loading' && (
          <div className="flex items-center gap-2 text-sm text-muted" role="status">
            <Spinner size="sm" color="accent" /> Carregando anos acadêmicos…
          </div>
        )}
        {(bootstrapState === 'empty' ||
          bootstrapState === 'unavailable' ||
          bootstrapState === 'not-authorized') && <ErrorState state={bootstrapState} />}
      </div>

      {bootstrapState === 'ready' && (
        <div className="mt-6 grid gap-5">
          <Surface variant="secondary" className="rounded-2xl p-4 sm:p-5">
            <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)] lg:items-end">
              <div>
                <Label
                  htmlFor="performance-academic-year"
                  className="mb-1.5 block text-sm font-medium"
                >
                  Ano acadêmico
                </Label>
                <select
                  id="performance-academic-year"
                  className="h-10 w-full rounded-xl border border-border bg-transparent px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-focus"
                  value={academicYearId ?? ''}
                  onChange={(event) => {
                    classSearchGate.current.invalidate();
                    setAcademicYearId(
                      event.currentTarget.value
                        ? (event.currentTarget.value as AcademicYearId)
                        : null,
                    );
                    setSelectedClass(null);
                    setClassResults([]);
                    setClassSearchState('idle');
                    resetMatrixContext();
                  }}
                >
                  <option value="">Selecione o ano</option>
                  {academicYears.map((year) => (
                    <option key={year.id} value={year.id}>
                      {year.label}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-muted">
                  O sistema não escolhe o ano automaticamente.
                </p>
              </div>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void searchClasses();
                }}
              >
                <SearchField
                  fullWidth
                  value={classQuery}
                  onChange={setClassQuery}
                  onClear={() => setClassQuery('')}
                  isDisabled={!academicYearId}
                >
                  <Label>Pesquisar turma</Label>
                  <SearchField.Group>
                    <SearchField.SearchIcon />
                    <SearchField.Input
                      placeholder={academicYearId ? 'Código da turma' : 'Selecione o ano primeiro'}
                    />
                    <SearchField.ClearButton />
                    <Button
                      type="submit"
                      size="sm"
                      variant="primary"
                      isDisabled={
                        !academicYearId || !classQuery.trim() || classSearchState === 'loading'
                      }
                    >
                      <Search className="size-4" aria-hidden="true" /> Buscar
                    </Button>
                  </SearchField.Group>
                </SearchField>
              </form>
            </div>
            <div className="mt-3" aria-live="polite" aria-busy={classSearchState === 'loading'}>
              {classSearchState === 'loading' && (
                <p role="status" className="text-sm text-muted">
                  Pesquisando turmas…
                </p>
              )}
              {classSearchState === 'empty' && (
                <p className="text-sm text-muted">Nenhuma turma encontrada.</p>
              )}
              {classSearchState === 'unavailable' && (
                <p className="text-sm text-danger">A pesquisa de turmas está indisponível.</p>
              )}
              {classSearchState === 'not-authorized' && (
                <p className="text-sm text-warning">A pesquisa de turmas não foi autorizada.</p>
              )}
              {classResults.length > 0 && (
                <div className="flex flex-wrap gap-2" role="list" aria-label="Turmas encontradas">
                  {classResults.map(
                    (result) =>
                      result.kind === 'class-group' && (
                        <Button
                          key={result.id}
                          size="sm"
                          variant={selectedClass?.id === result.id ? 'primary' : 'outline'}
                          onPress={() => {
                            setSelectedClass({ id: result.id, label: result.code });
                            resetMatrixContext();
                          }}
                        >
                          {result.code}
                        </Button>
                      ),
                  )}
                </div>
              )}
            </div>
          </Surface>

          <Surface variant="secondary" className="rounded-2xl p-4 sm:p-5">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <div>
                <Label htmlFor="performance-period" className="mb-1.5 block text-sm font-medium">
                  Período
                </Label>
                <select
                  id="performance-period"
                  className="h-10 w-full rounded-xl border border-border bg-transparent px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-focus"
                  value={periodKind === 'annual' ? 'annual' : `term-${term}`}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    if (value === 'annual') setPeriodKind('annual');
                    else {
                      setPeriodKind('term');
                      setTerm(Number(value.slice(-1)) as AcademicTermV1);
                    }
                    resetMatrixContext();
                  }}
                >
                  <option value="term-1">1º trimestre</option>
                  <option value="term-2">2º trimestre</option>
                  <option value="term-3">3º trimestre</option>
                  <option value="annual">Anual</option>
                </select>
              </div>
              <div>
                <Label htmlFor="performance-mode" className="mb-1.5 block text-sm font-medium">
                  Modo
                </Label>
                <select
                  id="performance-mode"
                  className="h-10 w-full rounded-xl border border-border bg-transparent px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-focus"
                  value={mode}
                  onChange={(event) => {
                    setMode(event.currentTarget.value as PerformanceModeV1);
                    resetMatrixContext();
                  }}
                >
                  <option value="regular">Regular</option>
                  <option value="recovery">Recuperação</option>
                </select>
              </div>
              <div>
                <Label
                  htmlFor="performance-comparison"
                  className="mb-1.5 block text-sm font-medium"
                >
                  Comparação
                </Label>
                <select
                  id="performance-comparison"
                  className="h-10 w-full rounded-xl border border-border bg-transparent px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-focus"
                  value={comparisonChoice}
                  onChange={(event) => {
                    setComparisonChoice(event.currentTarget.value as typeof comparisonChoice);
                    resetMatrixContext();
                  }}
                >
                  <option value="none">Sem comparação</option>
                  <option value="term-1">1º trimestre</option>
                  <option value="term-2">2º trimestre</option>
                  <option value="term-3">3º trimestre</option>
                  <option value="annual">Anual</option>
                </select>
                <p className="mt-1 text-xs text-muted">
                  A referência é sempre escolhida explicitamente; o servidor aplica a configuração
                  institucional.
                </p>
              </div>
              <div className="flex items-end">
                <Button
                  fullWidth
                  variant="primary"
                  isDisabled={!academicYearId || !selectedClass || matrixState === 'loading'}
                  onPress={loadFirstMatrixPage}
                >
                  Carregar matriz
                </Button>
              </div>
            </div>
          </Surface>

          <div role="group" aria-label="Lente de Desempenho" className="flex flex-wrap gap-2">
            {PERFORMANCE_LENSES_V1.map((value) => (
              <Button
                key={value}
                size="sm"
                variant={lens === value ? 'primary' : 'secondary'}
                aria-pressed={lens === value}
                onPress={() => {
                  setLens(value);
                  resetMatrixContext();
                }}
              >
                {LENS_LABELS[value]}
              </Button>
            ))}
          </div>

          <section
            aria-label="Matriz de Desempenho"
            aria-live="polite"
            aria-busy={matrixState === 'loading'}
          >
            {matrixState === 'idle' && (
              <Surface variant="secondary" className="rounded-2xl p-6 text-center">
                <p className="font-medium">Selecione uma turma e carregue a matriz.</p>
                <p className="mt-1 text-sm text-muted">
                  Linhas e colunas são paginadas independentemente.
                </p>
              </Surface>
            )}
            {matrixState === 'loading' && (
              <div className="flex items-center gap-2 text-sm text-muted" role="status">
                <Spinner size="sm" color="accent" /> Carregando matriz…
              </div>
            )}
            {(matrixState === 'empty' ||
              matrixState === 'unavailable' ||
              matrixState === 'not-authorized') && <ErrorState state={matrixState} />}
            {matrixState === 'ready' && matrix && (
              <div className="grid gap-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-medium">
                      {selectedClass?.label} · {periodLabel(matrix.period)} ·{' '}
                      {LENS_LABELS[matrix.lens]}
                    </p>
                    <p className="text-xs text-muted">
                      Autoridade: fonte importada · alunos {rowPage + 1} · componentes{' '}
                      {columnPage + 1}
                    </p>
                  </div>
                  <Chip size="sm" variant="soft">
                    {matrix.coverage.state}
                  </Chip>
                </div>

                <PerformanceOfficialCharts matrix={matrix} />

                <MatrixComparisonStatus matrix={matrix} />

                <div className="hidden md:block">
                  <Surface variant="secondary" className="overflow-x-auto rounded-2xl p-1">
                    <table className="w-full min-w-[760px] border-separate border-spacing-0 text-sm">
                      <caption className="sr-only">
                        Matriz de Desempenho por aluno e componente
                      </caption>
                      <thead>
                        <tr>
                          <th
                            scope="col"
                            className="sticky left-0 z-10 bg-surface px-3 py-3 text-left"
                          >
                            Aluno
                          </th>
                          {matrix.columns.items.map((column) => (
                            <th
                              key={column.teachingAssignmentId}
                              scope="col"
                              className="px-3 py-3 text-left"
                            >
                              <span className="block font-medium">{column.code}</span>
                              <span className="block text-xs font-normal text-muted">
                                {column.displayName}
                              </span>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {matrix.rows.items.map((row) => (
                          <tr key={row.studentId}>
                            <th
                              scope="row"
                              className="sticky left-0 z-10 bg-surface px-2 py-2 text-left align-top"
                            >
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-auto justify-start text-left"
                                onPress={() => void openStudentDetail(row.detailRef)}
                              >
                                <UserRound className="size-4 shrink-0" aria-hidden="true" />{' '}
                                {row.displayName}
                              </Button>
                            </th>
                            {row.cells.map((cell, index) => (
                              <td
                                key={cell.teachingAssignmentId}
                                className="min-w-44 px-2 py-2 align-top"
                              >
                                <Button
                                  variant="ghost"
                                  className="h-auto w-full justify-start rounded-xl p-2 text-left"
                                  aria-label={`Abrir detalhe de ${row.displayName} em ${matrix.columns.items[index]?.displayName ?? 'componente'}`}
                                  onPress={() => void openCellDetail(cell.detailRef)}
                                >
                                  <span className="block">
                                    <span className="block text-xs font-medium">
                                      {cellPrimaryLabel(cell)}
                                    </span>
                                    <span className="mt-1 block text-xs text-muted">
                                      {coverageLabel(cell)}
                                    </span>
                                    {comparisonSummary(cell) && (
                                      <span className="mt-1 block text-xs font-medium">
                                        Comparação: {comparisonSummary(cell)}
                                      </span>
                                    )}
                                  </span>
                                </Button>
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </Surface>
                </div>

                <div className="grid gap-3 md:hidden">
                  {matrix.rows.items.map((row) => (
                    <Surface key={row.studentId} variant="secondary" className="rounded-2xl p-3">
                      <Button
                        variant="ghost"
                        fullWidth
                        className="h-auto justify-start px-2 py-2 text-left"
                        onPress={() => void openStudentDetail(row.detailRef)}
                      >
                        <UserRound className="size-4 shrink-0" aria-hidden="true" />{' '}
                        {row.displayName}
                      </Button>
                      <div className="mt-2 grid gap-2">
                        {row.cells.map((cell, index) => (
                          <Button
                            key={cell.teachingAssignmentId}
                            variant="outline"
                            fullWidth
                            className="h-auto justify-between gap-3 p-3 text-left"
                            onPress={() => void openCellDetail(cell.detailRef)}
                          >
                            <span className="min-w-0">
                              <span className="block text-xs font-medium">
                                {matrix.columns.items[index]?.displayName ?? 'Componente'}
                              </span>
                              <span className="mt-1 block text-xs text-muted">
                                {coverageLabel(cell)}
                              </span>
                              {comparisonSummary(cell) && (
                                <span className="mt-1 block text-xs font-medium">
                                  Comparação: {comparisonSummary(cell)}
                                </span>
                              )}
                            </span>
                            <span className="shrink-0 text-xs">{cellPrimaryLabel(cell)}</span>
                          </Button>
                        ))}
                      </div>
                    </Surface>
                  ))}
                </div>

                <div
                  className="grid gap-3 lg:grid-cols-2"
                  aria-label="Paginação independente da matriz"
                >
                  <Surface
                    variant="secondary"
                    className="flex items-center justify-between gap-3 rounded-2xl p-3"
                  >
                    <span className="text-xs text-muted">Alunos · página {rowPage + 1}</span>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        isDisabled={rowPage === 0}
                        onPress={() => moveRows('previous')}
                      >
                        Anteriores
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        isDisabled={matrix.rows.nextCursor === null}
                        onPress={() => moveRows('next')}
                      >
                        Próximos
                      </Button>
                    </div>
                  </Surface>
                  <Surface
                    variant="secondary"
                    className="flex items-center justify-between gap-3 rounded-2xl p-3"
                  >
                    <span className="text-xs text-muted">
                      Componentes · página {columnPage + 1}
                    </span>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        isDisabled={columnPage === 0}
                        onPress={() => moveColumns('previous')}
                      >
                        Anteriores
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        isDisabled={matrix.columns.nextCursor === null}
                        onPress={() => moveColumns('next')}
                      >
                        Próximos
                      </Button>
                    </div>
                  </Surface>
                </div>
              </div>
            )}
          </section>
        </div>
      )}

      {detailState !== 'idle' && (
        <div
          className="fixed inset-0 z-40 flex items-end justify-end bg-black/20 p-2 sm:p-4"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) closeDetail();
          }}
        >
          <Surface
            role="dialog"
            aria-modal="false"
            aria-labelledby="performance-detail-heading"
            className="max-h-[85vh] w-full overflow-y-auto rounded-3xl border border-border p-4 shadow-xl sm:max-w-xl sm:p-6"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                  Detalhe sob demanda
                </p>
                <h3
                  id="performance-detail-heading"
                  ref={detailHeadingRef}
                  tabIndex={-1}
                  className="mt-1 text-xl font-semibold outline-none focus-visible:ring-2 focus-visible:ring-focus"
                >
                  {detail?.kind === 'student'
                    ? 'Aluno'
                    : detail?.kind === 'cell'
                      ? 'Célula da matriz'
                      : 'Carregando detalhe'}
                </h3>
              </div>
              <Button size="sm" variant="ghost" aria-label="Fechar detalhe" onPress={closeDetail}>
                <X className="size-4" aria-hidden="true" />
              </Button>
            </div>
            <div className="mt-5" aria-live="polite" aria-busy={detailState === 'loading'}>
              {detailState === 'loading' && (
                <div className="flex items-center gap-2 text-sm text-muted" role="status">
                  <Spinner size="sm" color="accent" /> Carregando detalhe…
                </div>
              )}
              {(detailState === 'empty' ||
                detailState === 'unavailable' ||
                detailState === 'not-authorized') && <ErrorState state={detailState} />}
              {detailState === 'ready' && detail?.kind === 'student' && (
                <StudentDetailBody detail={detail.value} />
              )}
              {detailState === 'ready' && detail?.kind === 'cell' && (
                <CellDetailBody detail={detail.value} />
              )}
            </div>
          </Surface>
        </div>
      )}
    </Surface>
  );
}

export const GradebookPerformancePage = PerformancePage;
