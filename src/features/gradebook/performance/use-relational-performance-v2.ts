import type { PerformanceAnalysisV3, PerformanceLensV3 } from '../../../../shared/gradebook-contracts/performance/performance-analysis-v3';
import { dashboardAnalysisV5, dashboardComparisonV5, type PerformanceDashboardV5 } from '../../../../shared/gradebook-contracts/performance/performance-dashboard-v5';
import { requestPerformanceDashboardV5 } from './performance-dashboard-client-v5';
import type { PerformanceReferencePeriodV4, PerformanceTermComparisonV4 } from '../../../../shared/gradebook-contracts/performance/performance-term-comparison-v4';
import { useEffect, useState } from 'react';
import type {
  PerformanceRequestV2, PerformanceReadyV2, PerformanceMatrixV2, PerformanceFailureV2,
  PerformancePeriodV2, PerformanceModeV2, PerformanceStatusV2,
} from '../../../../shared/gradebook-contracts/performance/relational-performance-v2';
import { useGradebookYear } from '../../../platform/gradebook-year-context';
import { CURRENT_GRADEBOOK_ACADEMIC_YEAR_V1 } from '../../../../shared/gradebook-contracts/current-academic-year-v1';
import { createOperationalWorkspaceRequestGate } from '../operational-workspace/operational-workspace-request-gate';
import { requestRelationalPerformanceV2 } from './relational-performance-client-v2';

type Filters = { classId: number | null; period: PerformancePeriodV2; mode: PerformanceModeV2; statuses: PerformanceStatusV2[]; lens: PerformanceLensV3; offerId: number | null; referencePeriod: PerformanceReferencePeriodV4 | null };
type Detail = Extract<PerformanceReadyV2, { operation: 'student-detail' | 'cell-detail' }>;
export function useRelationalPerformanceV2() {
  const shared = useGradebookYear();
  const year = shared?.year ?? CURRENT_GRADEBOOK_ACADEMIC_YEAR_V1;
  const clearAuthorization = shared?.clearAuthorization;
  const [gates] = useState(() => ({ classes: createOperationalWorkspaceRequestGate(), matrix: createOperationalWorkspaceRequestGate(), detail: createOperationalWorkspaceRequestGate() }));
  const [classes, setClasses] = useState<Extract<PerformanceReadyV2, { operation: 'classes' }> | null>(null);
  const [filters, setFilters] = useState<Filters>({ classId: null, period: 1, mode: 'regular', statuses: [null, 7], lens: 'result', offerId: null, referencePeriod: null });
  const [matrix, setMatrix] = useState<PerformanceMatrixV2 | null>(null);
  const [analysis, setAnalysis] = useState<PerformanceAnalysisV3 | null>(null);
  const [comparison, setComparison] = useState<PerformanceTermComparisonV4 | null>(null);
  const [dashboard, setDashboard] = useState<PerformanceDashboardV5 | null>(null);
  const [offers, setOffers] = useState<PerformanceMatrixV2['offers']>([]);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [failure, setFailure] = useState<PerformanceFailureV2 | null>(null);
  const [detailFailure, setDetailFailure] = useState<PerformanceFailureV2 | null>(null);
  const [busy, setBusy] = useState({ classes: year !== null, matrix: false, detail: false });
  useEffect(() => () => Object.values(gates).forEach((gate) => gate.invalidate()), [gates]);
  useEffect(() => {
    if (year === null) return;
    const request = { transportVersion: 2, operation: 'classes', year, offset: 0, limit: 100 } as const;
    const ticket = gates.classes.begin(JSON.stringify(request));
    if (!ticket) return;
    void requestRelationalPerformanceV2(request, ticket.signal).then((response) => {
      if (!ticket.isCurrent()) return;
      if (response.state === 'not-authorized') { clearAuthorization?.(); setFailure(response.state); }
      else if (response.state === 'ready' && response.operation === 'classes') setClasses(response);
      else if (response.state !== 'ready') setFailure(response.state);
    }).catch(() => { if (ticket.isCurrent()) setFailure('unavailable'); }).finally(() => {
      if (ticket.isCurrent()) setBusy((value) => ({ ...value, classes: false })); ticket.complete();
    });
    return () => gates.classes.invalidate();
  }, [year, gates, clearAuthorization]);
  async function run(request: PerformanceRequestV2, concern: keyof typeof gates, apply: (value: PerformanceReadyV2) => void) {
    const ticket = gates[concern].begin(JSON.stringify(request));
    if (!ticket) return;
    const error = concern === 'detail' ? setDetailFailure : setFailure;
    error(null); setBusy((value) => ({ ...value, [concern]: true }));
    try {
      const response = await requestRelationalPerformanceV2(request, ticket.signal);
      if (!ticket.isCurrent()) return;
      if (response.state === 'not-authorized') { clearAuthorization?.(); Object.values(gates).forEach((gate) => gate.invalidate()); setClasses(null); setMatrix(null); setAnalysis(null); setComparison(null); setDashboard(null); setOffers([]); setDetail(null); setDetailOpen(false); setBusy({ classes: false, matrix: false, detail: false }); }
      if (response.state !== 'ready') { error(response.state); return; }
      apply(response);
    } catch { if (ticket.isCurrent()) error('unavailable'); }
    finally { if (ticket.isCurrent()) setBusy((value) => ({ ...value, [concern]: false })); ticket.complete(); }
  }
  function closeDetail() { gates.detail.invalidate(); setDetail(null); setDetailOpen(false); setDetailFailure(null); setBusy((value) => ({ ...value, detail: false })); }
  async function loadClasses(offset = 0) {
    if (year === null) return;
    await run({ transportVersion: 2, operation: 'classes', year, offset, limit: 100 }, 'classes', (value) => {
      if (value.operation !== 'classes') return;
      setClasses((old) => offset === 0 || !old ? value : { ...value, classes: [...new Map([...old.classes, ...value.classes].map((item) => [item.id, item])).values()] });
    });
  }
  async function select(next: Partial<Filters>) {
    const selected = { ...filters, ...next };
    if ('classId' in next && next.classId !== filters.classId) { selected.lens = 'result'; selected.offerId = null; selected.referencePeriod = null; setOffers([]); }
    if (selected.lens !== 'assessments') selected.offerId = null; else selected.referencePeriod = null;
    if (selected.period === 'annual' || selected.period === 1 || (selected.referencePeriod !== null && selected.referencePeriod >= selected.period)) selected.referencePeriod = null;
    if (selected.statuses.length === 0) return;
    setFilters(selected); closeDetail(); gates.matrix.invalidate(); setMatrix(null); setAnalysis(null); setComparison(null); setDashboard(null); setFailure(null); setBusy((value) => ({ ...value, matrix: false }));
    if (year === null || selected.classId === null) return;
    if (selected.lens === 'assessments' && selected.offerId === null) return;
    const request = { transportVersion: 5, operation: 'dashboard', year, classId: selected.classId,
      period: selected.period, mode: selected.mode, statuses: selected.statuses, lens: selected.lens,
      offerId: selected.offerId, referencePeriod: selected.referencePeriod } as const;
    const ticket = gates.matrix.begin(JSON.stringify(request));
    if (!ticket) return;
    setBusy((value) => ({ ...value, matrix: true }));
    try {
      const response = await requestPerformanceDashboardV5(request, ticket.signal);
      if (!ticket.isCurrent()) return;
      if (response.state === 'not-authorized') {
        clearAuthorization?.(); Object.values(gates).forEach((gate) => gate.invalidate());
        setClasses(null); setOffers([]); setMatrix(null); setAnalysis(null); setComparison(null); setDashboard(null); closeDetail();
        setBusy({ classes: false, matrix: false, detail: false });
      }
      if (response.state !== 'ready') setFailure(response.state);
      else { const current = dashboardAnalysisV5(response); setDashboard(response); setMatrix(current.matrix); setAnalysis(current);
        setComparison(dashboardComparisonV5(response)); setOffers(current.matrix.offers); }
    } catch { if (ticket.isCurrent()) setFailure('unavailable'); }
    finally { if (ticket.isCurrent()) setBusy((value) => ({ ...value, matrix: false })); ticket.complete(); }
  }
  async function open(studentId: number, offerId?: number) {
    if (year === null || filters.classId === null || !matrix) return;
    setDetail(null); setDetailOpen(true);
    const scope = { transportVersion: 2, year, classId: filters.classId, period: filters.period, mode: filters.mode, studentId } as const;
    await run(offerId === undefined ? { ...scope, operation: 'student-detail' } : { ...scope, operation: 'cell-detail', offerId }, 'detail', (value) => {
      if (value.operation === 'student-detail' || value.operation === 'cell-detail') setDetail(value);
    });
  }
  return { year, classes, filters, matrix, analysis, comparison, dashboard, offers, detail, detailOpen, busy, failure, detailFailure, select, open, closeDetail, loadClasses, openStudent: shared?.openStudent };
}
