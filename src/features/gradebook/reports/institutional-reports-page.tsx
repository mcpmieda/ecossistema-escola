import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Card, Chip, Label, SearchField, Spinner, Surface } from '@heroui/react';
import { FileText, Search } from 'lucide-react';
import {
  AUDIT_WORKSPACE_CONTRACT_VERSION_V1,
  AUDIT_WORKSPACE_ORDERS_V1,
  type AuditWorkspaceCollectionV1,
  type AuditWorkspaceFiltersV1,
  type AuditWorkspaceItemsPageV1,
  type AuditWorkspaceListRequestV1,
} from '../../../../shared/gradebook-contracts/audit-workspace/audit-workspace-contract-v1';
import {
  AUDIT_OCCURRENCE_STATES_V1,
  RECONCILIATION_STATUSES_V1,
} from '../../../../shared/gradebook-contracts/audit/audit-contract-v1';
import {
  BULLETIN_CONTRACT_VERSION_V1,
  type BulletinReprintRequestV1,
} from '../../../../shared/gradebook-contracts/bulletins/bulletin-contract-v1';
import type { BulletinSnapshotHistoryItemV1 } from '../../../../shared/gradebook-contracts/bulletins/bulletin-transport-v1';
import {
  COUNCIL_WORKSPACE_CONTRACT_VERSION_V1,
  type CouncilClassReferenceV1,
  type CouncilQueueItemsV1,
} from '../../../../shared/gradebook-contracts/council/council-workspace-contract-v1';
import type { AcademicYearId, ClassGroupId } from '../../../../shared/gradebook-contracts/entities';
import { IMPORT_BATCH_STATUSES_V1 } from '../../../../shared/gradebook-contracts/imports/import-contract-v1';
import {
  CLASS_PERFORMANCE_CONTRACT_VERSION_V1,
  PERFORMANCE_COLUMN_ORDER_V1,
  PERFORMANCE_ROW_ORDER_V1,
  type ClassPerformanceReadModelV1,
  type PerformanceCellV1,
  type PerformanceComparedGradeValueV1,
  type PerformanceLensV1,
  type PerformancePeriodV1,
} from '../../../../shared/gradebook-contracts/performance/class-performance-read-model-v1';
import {
  INSTITUTIONAL_REPORTS_CONTRACT_VERSION_V1,
  INSTITUTIONAL_REPORTS_MAX_LIST_ITEMS_V1,
  INSTITUTIONAL_REPORTS_MAX_PERFORMANCE_COLUMNS_V1,
  INSTITUTIONAL_REPORTS_MAX_PERFORMANCE_ROWS_V1,
  type InstitutionalReportFamilyV1,
  type InstitutionalReportRequestV1,
  type InstitutionalReportResponseV1,
} from '../../../../shared/gradebook-contracts/reports/institutional-reports-contract-v1';
import {
  GLOBAL_SEARCH_CONTRACT_VERSION_V1,
  GLOBAL_SEARCH_ORDER_V1,
  type GlobalSearchResultV1,
} from '../../../../shared/gradebook-contracts/search/global-search-contract-v1';
import type {
  AcademicGradeValueV1,
  AcademicTermV1,
} from '../../../../shared/gradebook-contracts/results/results-contract-v1';
import { requestBulletinWorkspaceV1 } from '../bulletins/bulletin-client';
import {
  BULLETIN_PDF_BATCH_LIMITS_V1,
  downloadHistoricalBulletinPdfBatchV1,
  type BulletinPdfBatchResultV1,
} from '../bulletins/pdf/bulletin-pdf-batch-actions-v1';
import { requestOperationalWorkspaceV1 } from '../operational-workspace/operational-workspace-client';
import {
  InstitutionalReportsClientErrorV1,
  requestInstitutionalReportV1,
} from './institutional-reports-client';

type LoadState = 'idle' | 'loading' | 'ready' | 'empty' | 'insufficient-data' | 'unavailable' | 'not-authorized';
type PeriodChoice = 'term-1' | 'term-2' | 'term-3' | 'annual';
type ComparisonChoice = 'none' | PeriodChoice;
type SelectedClass = { readonly id: ClassGroupId; readonly label: string };

const FAMILY_LABELS: Record<InstitutionalReportFamilyV1, string> = {
  'class-results': 'Resultados oficiais por turma',
  composition: 'Composição',
  recovery: 'Recuperação',
  council: 'Conselho',
  audit: 'Auditoria',
};

const LENS_LABELS: Record<PerformanceLensV1, string> = {
  result: 'Resultado',
  quantitative: 'Quantitativo',
  qualitative: 'Qualitativo',
  assessments: 'Avaliações',
};

const AUDIT_COLLECTION_LABELS: Record<AuditWorkspaceCollectionV1, string> = {
  'import-batches': 'Lotes de importação',
  'audit-occurrences': 'Ocorrências',
  reconciliations: 'Reconciliações',
};

function gradeValueLabel(value: AcademicGradeValueV1): string {
  switch (value.state) {
    case 'numeric':
      return String(value.value);
    case 'official-zero':
      return '0 (zero oficial)';
    case 'legacy-zero':
      return '0 (zero legado)';
    case 'absent':
      return 'Ausente';
    case 'not-applicable':
      return value.reason ? `Não aplicável · ${value.reason}` : 'Não aplicável';
    case 'insufficient-data':
      return `Dados insuficientes · ${value.reason}`;
  }
}

function comparedGradeLabel(value: PerformanceComparedGradeValueV1): string {
  return `Fonte: ${gradeValueLabel(value.imported)} · Nativo: ${gradeValueLabel(value.calculated)}`;
}

function cellLabel(cell: PerformanceCellV1): string {
  if (cell.lens === 'result') {
    if (cell.projection.source === 'term-result') return comparedGradeLabel(cell.projection.officialGrade);
    if (cell.projection.source === 'final-recovery') return comparedGradeLabel(cell.projection.replacementTermGrade);
    return comparedGradeLabel(cell.projection.postRecoveryTotal);
  }
  if (cell.lens === 'quantitative') return comparedGradeLabel(cell.projection.considered);
  if (cell.lens === 'qualitative') return comparedGradeLabel(cell.projection.operational);
  if (cell.projection.items.length === 0) return 'Nenhuma avaliação projetada';
  return cell.projection.items
    .map((item) => `${item.name}: ${comparedGradeLabel(item.value)}`)
    .join(' · ');
}

function comparisonLabel(cell: PerformanceCellV1): string | null {
  if (cell.comparison === null) return null;
  return cell.comparison.state === 'not-comparable'
    ? `Comparação não disponível: ${cell.comparison.reason}`
    : 'Comparação oficial disponível; nenhum delta é recalculado nesta tela.';
}

function PerformanceReport({ report }: { report: ClassPerformanceReadModelV1 }) {
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Chip size="sm" variant="soft">{report.authorityMode}</Chip>
        <Chip size="sm" variant="soft">Cobertura {report.coverage.state}</Chip>
        <span className="text-muted">{LENS_LABELS[report.lens]}</span>
      </div>
      <div className="hidden md:block">
        <Surface variant="secondary" className="overflow-x-auto rounded-2xl p-1">
          <table className="w-full min-w-[760px] border-separate border-spacing-0 text-sm">
            <caption className="sr-only">Relatório oficial por aluno e componente</caption>
            <thead>
              <tr>
                <th scope="col" className="sticky left-0 bg-surface px-3 py-3 text-left">Aluno</th>
                {report.columns.items.map((column) => (
                  <th key={column.teachingAssignmentId} scope="col" className="px-3 py-3 text-left">
                    <span className="block font-medium">{column.code}</span>
                    <span className="block text-xs font-normal text-muted">{column.displayName}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {report.rows.items.map((row) => (
                <tr key={row.studentId}>
                  <th scope="row" className="sticky left-0 bg-surface px-3 py-3 text-left align-top">
                    <span className="font-medium">{row.displayName}</span>
                    <span className="mt-1 block text-xs font-normal text-muted">
                      {row.situation.state === 'absent' ? 'Situação ausente' : row.situation.value}
                    </span>
                  </th>
                  {row.cells.map((cell) => (
                    <td key={cell.teachingAssignmentId} className="min-w-52 px-3 py-3 align-top">
                      <p className="text-xs font-medium">{cellLabel(cell)}</p>
                      <p className="mt-1 text-xs text-muted">Cobertura: {cell.coverage.state}</p>
                      {comparisonLabel(cell) && <p className="mt-1 text-xs text-muted">{comparisonLabel(cell)}</p>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </Surface>
      </div>
      <div className="grid gap-3 md:hidden">
        {report.rows.items.map((row) => (
          <Card key={row.studentId}>
            <Card.Header>
              <Card.Title>{row.displayName}</Card.Title>
              <Card.Description>
                {row.situation.state === 'absent' ? 'Situação ausente' : row.situation.value}
              </Card.Description>
            </Card.Header>
            <Card.Content className="grid gap-2">
              {row.cells.map((cell, index) => (
                <Surface key={cell.teachingAssignmentId} variant="secondary" className="rounded-xl p-3">
                  <p className="text-xs font-semibold">
                    {report.columns.items[index]?.displayName ?? cell.teachingAssignmentId}
                  </p>
                  <p className="mt-1 text-xs">{cellLabel(cell)}</p>
                  <p className="mt-1 text-xs text-muted">Cobertura: {cell.coverage.state}</p>
                  {comparisonLabel(cell) && <p className="mt-1 text-xs text-muted">{comparisonLabel(cell)}</p>}
                </Surface>
              ))}
            </Card.Content>
          </Card>
        ))}
      </div>
    </div>
  );
}

function CouncilReport({ report }: { report: CouncilQueueItemsV1 }) {
  return (
    <div className="grid gap-2">
      {report.items.map((item) => (
        <Surface key={item.studentReference} variant="secondary" className="rounded-2xl p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="font-medium">{item.studentLabel}</p>
              <p className="mt-1 text-sm text-muted">{item.calculated.reason}</p>
            </div>
            <Chip size="sm" variant="soft">{item.calculated.queueState}</Chip>
          </div>
          <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
            <div><dt className="text-xs text-muted">Estado anual oficial</dt><dd>{item.calculated.officialAnnualState}</dd></div>
            <div><dt className="text-xs text-muted">Componentes não aprovados</dt><dd>{item.calculated.failedComponentCount ?? 'Dados insuficientes'}</dd></div>
            <div><dt className="text-xs text-muted">Cobertura</dt><dd>{item.calculated.coverage.state}</dd></div>
          </dl>
          <p className="mt-2 text-xs text-muted">Versão de decisão existente: {item.currentDecisionVersion}</p>
        </Surface>
      ))}
    </div>
  );
}

function AuditReport({ report }: { report: AuditWorkspaceItemsPageV1 }) {
  return (
    <div className="grid gap-2">
      {report.items.map((item) => (
        <Surface key={`${item.kind}:${item.reference.id}`} variant="secondary" className="rounded-2xl p-4">
          {item.kind === 'import-batch' ? (
            <>
              <p className="font-medium">Lote · {item.reference.id}</p>
              <p className="mt-1 text-sm text-muted">Estado oficial: {item.status}</p>
              <p className="mt-1 text-xs text-muted">Recebido: {item.receivedAt} · atualizado: {item.updatedAt}</p>
            </>
          ) : item.kind === 'audit-occurrence' ? (
            <>
              <p className="font-medium">Ocorrência · {item.category}</p>
              <p className="mt-1 text-sm text-muted">{item.severity} · {item.state}</p>
              <p className="mt-1 text-xs text-muted">Referência {item.reference.id} · {item.createdAt}</p>
            </>
          ) : (
            <>
              <p className="font-medium">Reconciliação · {item.target.kind}</p>
              <p className="mt-1 text-sm text-muted">{item.status} · regra {item.ruleVersion}</p>
              <p className="mt-1 break-all text-xs text-muted">Alvo {item.target.id} · {item.recordedAt}</p>
            </>
          )}
        </Surface>
      ))}
    </div>
  );
}

function ReportFailure({ state }: { state: Exclude<LoadState, 'idle' | 'loading' | 'ready'> }) {
  const title =
    state === 'not-authorized'
      ? 'Acesso não autorizado'
      : state === 'unavailable'
        ? 'Relatório indisponível'
        : state === 'insufficient-data'
          ? 'Dados oficiais insuficientes'
          : 'Nenhum item encontrado';
  return (
    <Alert status={state === 'unavailable' ? 'danger' : state === 'not-authorized' ? 'warning' : 'default'}>
      <Alert.Indicator />
      <Alert.Content>
        <Alert.Title>{title}</Alert.Title>
        <Alert.Description>Nenhum valor acadêmico substituto é calculado para preencher este estado.</Alert.Description>
      </Alert.Content>
    </Alert>
  );
}

function periodFromChoice(choice: PeriodChoice): PerformancePeriodV1 {
  return choice === 'annual'
    ? { kind: 'annual' }
    : { kind: 'term', term: Number(choice.slice(-1)) as AcademicTermV1 };
}

function comparisonFromChoice(choice: ComparisonChoice): PerformancePeriodV1 | null {
  return choice === 'none' ? null : periodFromChoice(choice);
}

function auditListRequest(
  academicYearId: AcademicYearId,
  collection: AuditWorkspaceCollectionV1,
  status: string,
): AuditWorkspaceListRequestV1 {
  const filters: AuditWorkspaceFiltersV1 =
    collection === 'import-batches'
      ? status
        ? { importBatchStatuses: [status as (typeof IMPORT_BATCH_STATUSES_V1)[number]] }
        : {}
      : collection === 'audit-occurrences'
        ? status
          ? { occurrenceStates: [status as (typeof AUDIT_OCCURRENCE_STATES_V1)[number]] }
          : {}
        : status
          ? { reconciliationStatuses: [status as (typeof RECONCILIATION_STATUSES_V1)[number]] }
          : {};
  const page = { limit: INSTITUTIONAL_REPORTS_MAX_LIST_ITEMS_V1, cursor: null };
  if (collection === 'import-batches') {
    return {
      contractVersion: AUDIT_WORKSPACE_CONTRACT_VERSION_V1,
      academicYearId,
      collection,
      filters,
      page,
      order: AUDIT_WORKSPACE_ORDERS_V1['import-batches'],
    };
  }
  if (collection === 'audit-occurrences') {
    return {
      contractVersion: AUDIT_WORKSPACE_CONTRACT_VERSION_V1,
      academicYearId,
      collection,
      filters,
      page,
      order: AUDIT_WORKSPACE_ORDERS_V1['audit-occurrences'],
    };
  }
  return {
    contractVersion: AUDIT_WORKSPACE_CONTRACT_VERSION_V1,
    academicYearId,
    collection,
    filters,
    page,
    order: AUDIT_WORKSPACE_ORDERS_V1.reconciliations,
  };
}

export function InstitutionalReportsPage() {
  const [bootstrapState, setBootstrapState] = useState<LoadState>('loading');
  const [academicYears, setAcademicYears] = useState<readonly { id: AcademicYearId; label: string }[]>([]);
  const [academicYearId, setAcademicYearId] = useState<AcademicYearId | null>(null);
  const [family, setFamily] = useState<InstitutionalReportFamilyV1>('class-results');
  const [classQuery, setClassQuery] = useState('');
  const [classSearchState, setClassSearchState] = useState<LoadState>('idle');
  const [classResults, setClassResults] = useState<readonly GlobalSearchResultV1[]>([]);
  const [selectedClass, setSelectedClass] = useState<SelectedClass | null>(null);
  const [periodChoice, setPeriodChoice] = useState<PeriodChoice>('term-1');
  const [comparisonChoice, setComparisonChoice] = useState<ComparisonChoice>('none');
  const [lens, setLens] = useState<PerformanceLensV1>('result');
  const [auditCollection, setAuditCollection] = useState<AuditWorkspaceCollectionV1>('import-batches');
  const [auditStatus, setAuditStatus] = useState('');
  const [reportState, setReportState] = useState<LoadState>('idle');
  const [reportResponse, setReportResponse] = useState<InstitutionalReportResponseV1 | null>(null);
  const [historyState, setHistoryState] = useState<LoadState>('idle');
  const [history, setHistory] = useState<readonly BulletinSnapshotHistoryItemV1[]>([]);
  const [selectedSnapshotKeys, setSelectedSnapshotKeys] = useState<readonly string[]>([]);
  const [batchState, setBatchState] = useState<LoadState>('idle');
  const [batchResult, setBatchResult] = useState<BulletinPdfBatchResultV1 | null>(null);
  const bootstrapController = useRef<AbortController | null>(null);
  const classController = useRef<AbortController | null>(null);
  const reportController = useRef<AbortController | null>(null);
  const reportSequence = useRef(0);
  const classSequence = useRef(0);
  const reportHeadingRef = useRef<HTMLHeadingElement>(null);
  const batchFeedbackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    bootstrapController.current = controller;
    void requestOperationalWorkspaceV1({ contractVersion: 1, operation: 'bootstrap' }, controller.signal)
      .then((response) => {
        if (controller.signal.aborted) return;
        if (response.state === 'not-authorized') return setBootstrapState('not-authorized');
        if (response.state === 'unavailable') return setBootstrapState('unavailable');
        if ('availableAcademicYears' in response) {
          setAcademicYears(response.availableAcademicYears);
          setBootstrapState(response.availableAcademicYears.length === 0 ? 'empty' : 'ready');
        } else {
          setBootstrapState('unavailable');
        }
      })
      .catch((cause: unknown) => {
        if (!(cause instanceof DOMException && cause.name === 'AbortError')) setBootstrapState('unavailable');
      });
    return () => {
      controller.abort();
      classController.current?.abort();
      reportController.current?.abort();
    };
  }, []);

  function resetOutput() {
    reportController.current?.abort();
    reportSequence.current += 1;
    setReportResponse(null);
    setReportState('idle');
    setBatchResult(null);
    setBatchState('idle');
  }

  async function searchClasses() {
    const query = classQuery.trim();
    if (!academicYearId || !query) return;
    classController.current?.abort();
    const controller = new AbortController();
    classController.current = controller;
    const sequence = ++classSequence.current;
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
        controller.signal,
      );
      if (sequence !== classSequence.current || controller.signal.aborted) return;
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
      if (sequence !== classSequence.current || (cause instanceof DOMException && cause.name === 'AbortError')) return;
      setClassResults([]);
      setClassSearchState('unavailable');
    }
  }

  function reportRequest(): InstitutionalReportRequestV1 | null {
    if (!academicYearId) return null;
    if (family === 'audit') {
      return {
        contractVersion: INSTITUTIONAL_REPORTS_CONTRACT_VERSION_V1,
        family: 'audit',
        request: auditListRequest(academicYearId, auditCollection, auditStatus),
      };
    }
    if (!selectedClass) return null;
    if (family === 'council') {
      return {
        contractVersion: INSTITUTIONAL_REPORTS_CONTRACT_VERSION_V1,
        family: 'council',
        request: {
          operation: 'queue',
          contractVersion: COUNCIL_WORKSPACE_CONTRACT_VERSION_V1,
          academicYearId,
          classReference: selectedClass.id as unknown as CouncilClassReferenceV1,
          page: { limit: INSTITUTIONAL_REPORTS_MAX_LIST_ITEMS_V1, cursor: null },
        },
      };
    }
    const effectiveLens: PerformanceLensV1 = family === 'class-results' ? 'result' : lens;
    return {
      contractVersion: INSTITUTIONAL_REPORTS_CONTRACT_VERSION_V1,
      family,
      request: {
        contractVersion: CLASS_PERFORMANCE_CONTRACT_VERSION_V1,
        academicYearId,
        classGroupId: selectedClass.id,
        period: periodFromChoice(periodChoice),
        mode: family === 'recovery' ? 'recovery' : 'regular',
        lens: effectiveLens,
        comparisonPeriod: comparisonFromChoice(comparisonChoice),
        rows: { limit: INSTITUTIONAL_REPORTS_MAX_PERFORMANCE_ROWS_V1, cursor: null },
        columns: { limit: INSTITUTIONAL_REPORTS_MAX_PERFORMANCE_COLUMNS_V1, cursor: null },
        order: { rows: PERFORMANCE_ROW_ORDER_V1, columns: PERFORMANCE_COLUMN_ORDER_V1 },
      },
    } as InstitutionalReportRequestV1;
  }

  async function generateReport() {
    const request = reportRequest();
    if (!request) return;
    reportController.current?.abort();
    const controller = new AbortController();
    reportController.current = controller;
    const sequence = ++reportSequence.current;
    setReportState('loading');
    setReportResponse(null);
    try {
      const response = await requestInstitutionalReportV1(request, controller.signal);
      if (sequence !== reportSequence.current || controller.signal.aborted) return;
      setReportResponse(response);
      setReportState(response.state === 'invalid-request' ? 'unavailable' : response.state);
      if (response.state === 'ready') window.requestAnimationFrame(() => reportHeadingRef.current?.focus());
    } catch (cause) {
      if (sequence !== reportSequence.current || (cause instanceof DOMException && cause.name === 'AbortError')) return;
      setReportState(
        cause instanceof InstitutionalReportsClientErrorV1 && cause.code === 'not-authorized'
          ? 'not-authorized'
          : 'unavailable',
      );
    }
  }

  async function loadHistory() {
    if (!academicYearId || !selectedClass) return;
    setHistoryState('loading');
    setHistory([]);
    setSelectedSnapshotKeys([]);
    try {
      const response = await requestBulletinWorkspaceV1({
        contractVersion: BULLETIN_CONTRACT_VERSION_V1,
        operation: 'history',
        academicYearId,
        classGroupId: selectedClass.id,
      });
      if (response.operation === 'history' && response.state === 'ready') {
        setHistory(response.items);
        setHistoryState(response.items.length === 0 ? 'empty' : 'ready');
      } else {
        setHistoryState(response.state === 'not-authorized' ? 'not-authorized' : response.state === 'unavailable' ? 'unavailable' : 'empty');
      }
    } catch {
      setHistoryState('unavailable');
    }
  }

  async function downloadHistoricalBatch() {
    const selected = history.filter((item) =>
      selectedSnapshotKeys.includes(`${item.snapshotId}:${item.snapshotVersion}`),
    );
    if (selected.length === 0) return;
    const requests: BulletinReprintRequestV1[] = selected.map((item) => ({
      contractVersion: BULLETIN_CONTRACT_VERSION_V1,
      snapshotId: item.snapshotId,
      snapshotVersion: item.snapshotVersion,
    }));
    setBatchState('loading');
    setBatchResult(null);
    try {
      const result = await downloadHistoricalBulletinPdfBatchV1(requests, async (request) => {
        const response = await requestBulletinWorkspaceV1({
          contractVersion: BULLETIN_CONTRACT_VERSION_V1,
          operation: 'reprint',
          request,
        });
        if (response.operation !== 'reprint' || response.state !== 'ready') {
          throw new Error('historical-snapshot-unavailable');
        }
        return response.reprint;
      });
      setBatchResult(result);
      setBatchState(result.ready.length > 0 ? 'ready' : 'unavailable');
    } catch {
      setBatchState('unavailable');
    } finally {
      window.requestAnimationFrame(() => batchFeedbackRef.current?.focus());
    }
  }

  const familyNeedsClass = family !== 'audit';
  const readyResponse = reportResponse?.state === 'ready' ? reportResponse : null;
  const auditStatusOptions =
    auditCollection === 'import-batches'
      ? IMPORT_BATCH_STATUSES_V1
      : auditCollection === 'audit-occurrences'
        ? AUDIT_OCCURRENCE_STATES_V1
        : RECONCILIATION_STATUSES_V1;

  return (
    <Surface
      className="rounded-3xl border border-border p-4 sm:p-6"
      aria-label="Relatórios institucionais"
      aria-busy={reportState === 'loading' || historyState === 'loading' || batchState === 'loading'}
    >
      <div className="max-w-3xl">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted">
          <FileText className="size-4" aria-hidden="true" /> Relatórios institucionais
        </div>
        <h2 className="mt-3 text-2xl font-semibold tracking-[-0.035em] sm:text-3xl">Dados oficiais, sem novo motor acadêmico</h2>
        <p className="mt-2 text-sm leading-6 text-muted">
          Cada relatório reapresenta read models oficiais já resolvidos. Média, taxa, ranking e outros indicadores derivados permanecem fechados enquanto não houver semântica oficial integrada.
        </p>
      </div>

      <div className="sr-only" role="status" aria-live="polite">
        Relatório: {reportState}; histórico: {historyState}; lote PDF: {batchState}.
      </div>

      <div className="mt-6">
        {bootstrapState === 'loading' && <div className="flex items-center gap-2 text-sm text-muted"><Spinner size="sm" />Carregando anos acadêmicos…</div>}
        {(bootstrapState === 'empty' || bootstrapState === 'unavailable' || bootstrapState === 'not-authorized') && <ReportFailure state={bootstrapState} />}
      </div>

      {bootstrapState === 'ready' && (
        <div className="mt-6 grid gap-5">
          <Card>
            <Card.Header><Card.Title>1. Contexto explícito</Card.Title></Card.Header>
            <Card.Content className="grid gap-4 lg:grid-cols-2">
              <div>
                <Label htmlFor="reports-year" className="mb-1.5 block text-sm font-medium">Ano acadêmico</Label>
                <select id="reports-year" className="h-10 w-full rounded-xl border border-border bg-transparent px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-focus" value={academicYearId ?? ''} onChange={(event) => {
                  classController.current?.abort();
                  classSequence.current += 1;
                  const value = event.currentTarget.value;
                  setAcademicYearId(value ? value as AcademicYearId : null);
                  setSelectedClass(null); setClassResults([]); setClassSearchState('idle'); setHistory([]); setHistoryState('idle'); setSelectedSnapshotKeys([]); resetOutput();
                }}>
                  <option value="">Selecione o ano</option>
                  {academicYears.map((year) => <option key={year.id} value={year.id}>{year.label}</option>)}
                </select>
                <p className="mt-1 text-xs text-muted">Nenhum ano é escolhido automaticamente.</p>
              </div>
              <div>
                <Label htmlFor="reports-family" className="mb-1.5 block text-sm font-medium">Família do relatório</Label>
                <select id="reports-family" className="h-10 w-full rounded-xl border border-border bg-transparent px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-focus" value={family} onChange={(event) => {
                  const next = event.currentTarget.value as InstitutionalReportFamilyV1;
                  setFamily(next);
                  setLens(next === 'composition' ? 'quantitative' : 'result');
                  resetOutput();
                }}>
                  {Object.entries(FAMILY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </div>

              <form className="lg:col-span-2" onSubmit={(event) => { event.preventDefault(); void searchClasses(); }}>
                <SearchField fullWidth value={classQuery} onChange={setClassQuery} onClear={() => setClassQuery('')} isDisabled={!academicYearId}>
                  <Label>Pesquisar turma {familyNeedsClass ? '(obrigatória para esta família)' : '(opcional para o lote)'}</Label>
                  <SearchField.Group>
                    <SearchField.SearchIcon />
                    <SearchField.Input placeholder={academicYearId ? 'Código da turma' : 'Selecione o ano primeiro'} />
                    <SearchField.ClearButton />
                    <Button type="submit" size="sm" variant="primary" isDisabled={!academicYearId || !classQuery.trim() || classSearchState === 'loading'}><Search className="size-4" />Buscar</Button>
                  </SearchField.Group>
                </SearchField>
                <div className="mt-2" aria-live="polite">
                  {classSearchState === 'loading' && <p className="text-sm text-muted">Pesquisando turmas…</p>}
                  {classSearchState === 'empty' && <p className="text-sm text-muted">Nenhuma turma encontrada.</p>}
                  {classSearchState === 'unavailable' && <p className="text-sm text-danger">Pesquisa de turmas indisponível.</p>}
                  {classSearchState === 'not-authorized' && <p className="text-sm text-warning">Pesquisa de turmas não autorizada.</p>}
                  {classResults.length > 0 && <div className="flex flex-wrap gap-2">{classResults.map((result) => result.kind === 'class-group' && <Button key={result.id} size="sm" variant={selectedClass?.id === result.id ? 'primary' : 'outline'} onPress={() => { setSelectedClass({ id: result.id, label: result.code }); setHistory([]); setHistoryState('idle'); setSelectedSnapshotKeys([]); resetOutput(); }}>{result.code}</Button>)}</div>}
                </div>
              </form>
            </Card.Content>
          </Card>

          {(family === 'class-results' || family === 'composition' || family === 'recovery') && (
            <Card>
              <Card.Header><Card.Title>2. Recorte oficial de Performance</Card.Title></Card.Header>
              <Card.Content className="grid gap-4 sm:grid-cols-3">
                <div>
                  <Label htmlFor="reports-period" className="mb-1.5 block text-sm font-medium">Período</Label>
                  <select id="reports-period" className="h-10 w-full rounded-xl border border-border bg-transparent px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-focus" value={periodChoice} onChange={(event) => { setPeriodChoice(event.currentTarget.value as PeriodChoice); resetOutput(); }}><option value="term-1">1º trimestre</option><option value="term-2">2º trimestre</option><option value="term-3">3º trimestre</option><option value="annual">Anual</option></select>
                </div>
                <div>
                  <Label htmlFor="reports-comparison" className="mb-1.5 block text-sm font-medium">Comparação oficial</Label>
                  <select id="reports-comparison" className="h-10 w-full rounded-xl border border-border bg-transparent px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-focus" value={comparisonChoice} onChange={(event) => { setComparisonChoice(event.currentTarget.value as ComparisonChoice); resetOutput(); }}><option value="none">Sem comparação</option><option value="term-1">1º trimestre</option><option value="term-2">2º trimestre</option><option value="term-3">3º trimestre</option><option value="annual">Anual</option></select>
                  <p className="mt-1 text-xs text-muted">Se o upstream responder “não comparável”, o relatório mantém exatamente esse estado.</p>
                </div>
                <div>
                  <Label htmlFor="reports-lens" className="mb-1.5 block text-sm font-medium">Lente</Label>
                  <select id="reports-lens" disabled={family === 'class-results'} className="h-10 w-full rounded-xl border border-border bg-transparent px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-60" value={family === 'class-results' ? 'result' : lens} onChange={(event) => { setLens(event.currentTarget.value as PerformanceLensV1); resetOutput(); }}>
                    {family === 'composition' ? <><option value="quantitative">Quantitativo</option><option value="qualitative">Qualitativo</option><option value="assessments">Avaliações</option></> : <><option value="result">Resultado</option><option value="quantitative">Quantitativo</option><option value="qualitative">Qualitativo</option><option value="assessments">Avaliações</option></>}
                  </select>
                </div>
              </Card.Content>
            </Card>
          )}

          {family === 'audit' && (
            <Card>
              <Card.Header><Card.Title>2. Recorte oficial de Auditoria</Card.Title></Card.Header>
              <Card.Content className="grid gap-4 sm:grid-cols-2">
                <div><Label htmlFor="reports-audit-collection" className="mb-1.5 block text-sm font-medium">Coleção</Label><select id="reports-audit-collection" className="h-10 w-full rounded-xl border border-border bg-transparent px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-focus" value={auditCollection} onChange={(event) => { setAuditCollection(event.currentTarget.value as AuditWorkspaceCollectionV1); setAuditStatus(''); resetOutput(); }}>{Object.entries(AUDIT_COLLECTION_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
                <div><Label htmlFor="reports-audit-status" className="mb-1.5 block text-sm font-medium">Filtro de estado oficial</Label><select id="reports-audit-status" className="h-10 w-full rounded-xl border border-border bg-transparent px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-focus" value={auditStatus} onChange={(event) => { setAuditStatus(event.currentTarget.value); resetOutput(); }}><option value="">Todos</option>{auditStatusOptions.map((value) => <option key={value} value={value}>{value}</option>)}</select></div>
              </Card.Content>
            </Card>
          )}

          <div className="flex flex-wrap gap-2">
            <Button variant="primary" isDisabled={!academicYearId || (familyNeedsClass && !selectedClass) || reportState === 'loading'} onPress={() => void generateReport()}>{reportState === 'loading' && <Spinner size="sm" />}Gerar relatório</Button>
          </div>

          <section aria-label="Saída do relatório" aria-live="polite">
            {reportState === 'loading' && <div className="flex items-center gap-2 text-sm text-muted"><Spinner size="sm" />Carregando projeção oficial…</div>}
            {(reportState === 'empty' || reportState === 'insufficient-data' || reportState === 'unavailable' || reportState === 'not-authorized') && <ReportFailure state={reportState} />}
            {readyResponse && (
              <div className="grid gap-4">
                <h3 ref={reportHeadingRef} tabIndex={-1} className="text-xl font-semibold outline-none focus-visible:ring-2 focus-visible:ring-focus">{FAMILY_LABELS[readyResponse.family]}</h3>
                {readyResponse.hardStop && <Alert status="warning"><Alert.Indicator /><Alert.Content><Alert.Title>Indicadores derivados mantidos fail-closed</Alert.Title><Alert.Description>Média, taxa e ranking não possuem semântica oficial integrada nesta frente; nenhum valor substituto é calculado.</Alert.Description></Alert.Content></Alert>}
                {readyResponse.family === 'council' ? <CouncilReport report={readyResponse.report} /> : readyResponse.family === 'audit' ? <AuditReport report={readyResponse.report} /> : <PerformanceReport report={readyResponse.report} />}
              </div>
            )}
          </section>

          <Card>
            <Card.Header><Card.Title>3. Reimpressão PDF em lote — somente snapshots históricos</Card.Title><Card.Description>Até {BULLETIN_PDF_BATCH_LIMITS_V1.maxDocuments} documentos, processados sequencialmente; no máximo {BULLETIN_PDF_BATCH_LIMITS_V1.maxTotalPages} páginas e {BULLETIN_PDF_BATCH_LIMITS_V1.maxTotalOutputBytes / (1024 * 1024)} MiB no lote.</Card.Description></Card.Header>
            <Card.Content className="grid gap-3">
              <div className="flex flex-wrap gap-2"><Button size="sm" variant="secondary" isDisabled={!academicYearId || !selectedClass || historyState === 'loading'} onPress={() => void loadHistory()}>{historyState === 'loading' && <Spinner size="sm" />}Carregar snapshots históricos</Button><Button size="sm" variant="primary" isDisabled={selectedSnapshotKeys.length === 0 || batchState === 'loading'} onPress={() => void downloadHistoricalBatch()}>{batchState === 'loading' && <Spinner size="sm" />}Baixar lote ({selectedSnapshotKeys.length})</Button></div>
              {historyState === 'empty' && <p className="text-sm text-muted">Nenhum snapshot histórico disponível para a turma selecionada.</p>}
              {historyState === 'unavailable' && <p className="text-sm text-danger">Histórico indisponível; nenhum PDF é reconstruído a partir de dados atuais.</p>}
              {historyState === 'not-authorized' && <p className="text-sm text-warning">Histórico não autorizado.</p>}
              {historyState === 'ready' && <div className="grid gap-2">{history.map((item) => {
                const key = `${item.snapshotId}:${item.snapshotVersion}`;
                const checked = selectedSnapshotKeys.includes(key);
                const limitReached = selectedSnapshotKeys.length >= BULLETIN_PDF_BATCH_LIMITS_V1.maxDocuments && !checked;
                return <label key={key} className="flex items-start gap-3 rounded-xl border border-border p-3 focus-within:ring-2 focus-within:ring-focus"><input type="checkbox" className="mt-1 size-4" checked={checked} disabled={limitReached} onChange={(event) => setSelectedSnapshotKeys(event.currentTarget.checked ? [...selectedSnapshotKeys, key] : selectedSnapshotKeys.filter((value) => value !== key))} /><span className="min-w-0"><strong className="block truncate">{item.studentDisplayName}</strong><span className="block text-xs text-muted">Snapshot {item.snapshotId} · v{item.snapshotVersion} · {item.emittedAt}</span></span></label>;
              })}</div>}
              <div ref={batchFeedbackRef} tabIndex={-1} className="outline-none focus-visible:ring-2 focus-visible:ring-focus" aria-live="polite">
                {batchState === 'ready' && batchResult && <p className="text-sm">Lote concluído: {batchResult.ready.length} pronto(s), {batchResult.failed.length} falha(s), {batchResult.totalPageCount} página(s), {batchResult.totalByteLength} byte(s). Falhas permanecem isoladas por item.</p>}
                {batchState === 'unavailable' && <Alert status="danger"><Alert.Indicator /><Alert.Content><Alert.Title>Lote PDF indisponível</Alert.Title><Alert.Description>Os snapshots históricos continuam listados e legíveis; não há fallback para dados atuais nem persistência no navegador.</Alert.Description></Alert.Content></Alert>}
              </div>
            </Card.Content>
          </Card>
        </div>
      )}
    </Surface>
  );
}

export const GradebookInstitutionalReportsPage = InstitutionalReportsPage;
