import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Chip,
  Label,
  ListBox,
  Select,
  Spinner,
  Surface,
} from '@heroui/react';
import {
  AlertTriangle,
  ArchiveRestore,
  BarChart3,
  CheckCircle2,
  ClipboardList,
  FileDown,
  FileText,
  History,
  Scale,
  ShieldCheck,
  Users,
} from 'lucide-react';
import {
  GRADEBOOK_IMPORT_DIAGNOSTIC_CODES_V1,
  GRADEBOOK_IMPORT_DIAGNOSTIC_SEVERITIES_V1,
} from '../../../../shared/gradebook-contracts/imports/import-diagnostics-v1';
import type { PerformanceAnalysisV3 } from '../../../../shared/gradebook-contracts/performance/performance-analysis-v3';
import type { PerformanceTermComparisonV4 } from '../../../../shared/gradebook-contracts/performance/performance-term-comparison-v4';
import {
  RELATIONAL_INSTITUTIONAL_REPORTS_CONTRACT_VERSION_V2,
  RELATIONAL_INSTITUTIONAL_REPORTS_YEAR_V2,
  type RelationalInstitutionalDiagnosticV2,
  type RelationalInstitutionalReportFamilyV2,
  type RelationalInstitutionalReportRequestV2,
  type RelationalInstitutionalReportResponseV2,
} from '../../../../shared/gradebook-contracts/reports/relational-institutional-reports-v2';
import type { RelationalBulletinHistoryItemV2 } from '../../../../shared/gradebook-contracts/bulletins/relational-bulletin-v2';
import { useGradebookYear } from '../../../platform/gradebook-year-context';
import { runRelationalBulletinPdfActionV2 } from '../bulletins/pdf/bulletin-pdf-actions-v2';
import {
  RelationalInstitutionalReportsClientErrorV2,
  requestRelationalInstitutionalReportV2,
} from './relational-institutional-reports-client-v2';

type LoadState = 'idle' | 'loading' | 'ready' | 'empty' | 'not-authorized' | 'not-found' | 'scope-too-large' | 'unavailable';
type ClassItem = { readonly id: number; readonly code: string; readonly name: string };
type Period = 1 | 2 | 3 | 'annual';
type Lens = 'result' | 'quantitative' | 'qualitative';
type PerformanceReady = Extract<RelationalInstitutionalReportResponseV2, { operation: 'performance'; state: 'ready' }>;
type CouncilReady = Extract<RelationalInstitutionalReportResponseV2, { operation: 'council'; state: 'ready' }>;

const ALL_STATUSES = [null, 1, 2, 3, 4, 5, 7] as const;
const FAMILY_OPTIONS: readonly { id: RelationalInstitutionalReportFamilyV2; label: string; description: string }[] = [
  { id: 'class-results', label: 'Resultados', description: 'Resultados por aluno e componente' },
  { id: 'composition', label: 'Composição', description: 'Quantitativo e qualitativo' },
  { id: 'recovery', label: 'Recuperação', description: 'Leitura da recuperação final' },
  { id: 'council', label: 'Conselho', description: 'Decisões e sessão da turma' },
  { id: 'audit', label: 'Auditoria', description: 'Erros e avisos de importação' },
];
const LENS_OPTIONS: readonly { id: Lens; label: string }[] = [
  { id: 'result', label: 'Resultado' },
  { id: 'quantitative', label: 'Quantitativo' },
  { id: 'qualitative', label: 'Qualitativo' },
];
const PERIOD_OPTIONS: readonly { id: string; label: string }[] = [
  { id: '1', label: '1º trimestre' },
  { id: '2', label: '2º trimestre' },
  { id: '3', label: '3º trimestre' },
  { id: 'annual', label: 'Anual' },
];
const DIAGNOSTIC_LABELS: Record<string, string> = {
  'invalid-text': 'Texto em campo de nota',
  'negative-grade': 'Nota negativa',
  'invalid-precision': 'Precisão inválida',
  'invalid-maximum': 'Máximo inválido',
  'duplicate-student-number': 'Número duplicado',
  'source-unavailable': 'Origem indisponível',
  'above-maximum': 'Acima do máximo',
};

function SelectControl({
  label,
  value,
  items,
  disabled = false,
  onChange,
}: {
  readonly label: string;
  readonly value: string;
  readonly items: readonly { readonly id: string; readonly label: string; readonly description?: string }[];
  readonly disabled?: boolean;
  readonly onChange: (value: string) => void;
}) {
  return (
    <Select
      selectedKey={value}
      isDisabled={disabled}
      onSelectionChange={(key) => { if (key !== null) onChange(String(key)); }}
    >
      <Label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">{label}</Label>
      <Select.Trigger className="min-h-11 w-full"><Select.Value /><Select.Indicator /></Select.Trigger>
      <Select.Popover>
        <ListBox>
          {items.map((item) => (
            <ListBox.Item key={item.id} id={item.id} textValue={item.label}>
              <div className="min-w-0">
                <span className="block font-medium">{item.label}</span>
                {item.description && <span className="block text-xs text-muted">{item.description}</span>}
              </div>
              <ListBox.ItemIndicator />
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
    </Select>
  );
}

function formatMilli(value: number | null): string {
  if (value === null) return '—';
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 }).format(value / 1_000);
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

function StateAlert({ state }: { readonly state: Exclude<LoadState, 'idle' | 'loading' | 'ready'> }) {
  const content = state === 'not-authorized'
    ? ['Acesso não autorizado', 'Seu perfil não possui acesso a estes relatórios.']
    : state === 'not-found' || state === 'empty'
      ? ['Nenhum dado encontrado', 'O recorte selecionado ainda não possui registros.']
      : state === 'scope-too-large'
        ? ['Recorte amplo demais', 'Reduza o escopo para manter a leitura segura e previsível.']
        : ['Relatório indisponível', 'A fonte relacional não respondeu. Nenhum valor substituto foi criado.'];
  return (
    <Alert status={state === 'unavailable' ? 'danger' : 'warning'}>
      <Alert.Indicator />
      <Alert.Content><Alert.Title>{content[0]}</Alert.Title><Alert.Description>{content[1]}</Alert.Description></Alert.Content>
    </Alert>
  );
}

function Kpi({
  label,
  value,
  hint,
  tone,
  icon,
}: {
  readonly label: string;
  readonly value: number | string;
  readonly hint: string;
  readonly tone: 'blue' | 'emerald' | 'amber' | 'rose';
  readonly icon: React.ReactNode;
}) {
  const tones = {
    blue: 'border-sky-200/70 bg-sky-50/70 text-sky-700 dark:border-sky-900/70 dark:bg-sky-950/25 dark:text-sky-300',
    emerald: 'border-emerald-200/70 bg-emerald-50/70 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/25 dark:text-emerald-300',
    amber: 'border-amber-200/70 bg-amber-50/70 text-amber-700 dark:border-amber-900/70 dark:bg-amber-950/25 dark:text-amber-300',
    rose: 'border-rose-200/70 bg-rose-50/70 text-rose-700 dark:border-rose-900/70 dark:bg-rose-950/25 dark:text-rose-300',
  } as const;
  return (
    <Card className={`border ${tones[tone]}`}>
      <Card.Content className="flex items-start justify-between gap-3 p-4">
        <div><p className="text-xs font-semibold uppercase tracking-[0.12em] opacity-80">{label}</p><p className="mt-2 text-3xl font-semibold tracking-tight">{value}</p><p className="mt-1 text-xs opacity-75">{hint}</p></div>
        <span className="rounded-xl bg-white/60 p-2 shadow-sm dark:bg-black/20">{icon}</span>
      </Card.Content>
    </Card>
  );
}

function PerformanceReport({ response }: { readonly response: PerformanceReady }) {
  const comparison: PerformanceTermComparisonV4 | null = response.report.operation === 'term-comparison'
    ? response.report
    : null;
  const analysis: PerformanceAnalysisV3 = response.report.operation === 'term-comparison'
    ? response.report.analysis
    : response.report;
  const { matrix } = analysis;
  const above = analysis.columns.reduce((total, item) => total + item.summary.groups.above.length, 0);
  const below = analysis.columns.reduce((total, item) => total + item.summary.groups.below.length, 0);
  const incomplete = analysis.columns.reduce((total, item) => total + item.summary.groups.incomplete.length + item.summary.groups['no-show'].length, 0);
  return (
    <div className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Alunos" value={matrix.rows.length} hint="linhas visíveis" tone="blue" icon={<Users className="size-5" />} />
        <Kpi label="Acima" value={above} hint="leituras no patamar" tone="emerald" icon={<CheckCircle2 className="size-5" />} />
        <Kpi label="Abaixo" value={below} hint="leituras abaixo do patamar" tone="rose" icon={<AlertTriangle className="size-5" />} />
        <Kpi label="Incompletas" value={incomplete} hint="sem classificação inventada" tone="amber" icon={<ClipboardList className="size-5" />} />
      </div>
      {comparison && (
        <Alert status="default"><Alert.Indicator /><Alert.Content><Alert.Title>Comparação descritiva entre trimestres de 2026</Alert.Title><Alert.Description>Variação em pontos percentuais do máximo oficial; não altera nota, resultado ou decisão.</Alert.Description></Alert.Content></Alert>
      )}
      <Surface variant="secondary" className="overflow-x-auto rounded-2xl p-1">
        <table className="w-full min-w-[820px] border-separate border-spacing-0 text-sm">
          <caption className="sr-only">Relatório relacional por aluno e disciplina</caption>
          <thead><tr><th scope="col" className="sticky left-0 z-10 bg-surface px-3 py-3 text-left">Aluno</th>{analysis.columns.map((column) => <th key={column.key} scope="col" className="min-w-32 px-3 py-3 text-left"><span className="block font-semibold">{column.label}</span><span className="block text-xs font-normal text-muted">{column.summary.groups.above.length} acima · {column.summary.groups.below.length} abaixo</span></th>)}</tr></thead>
          <tbody>{matrix.rows.map((row, rowIndex) => (
            <tr key={row.student.id} className="border-t border-border">
              <th scope="row" className="sticky left-0 z-10 bg-surface px-3 py-3 text-left align-top"><span className="block font-medium">{row.student.number}. {row.student.name}</span><span className="mt-1 block text-xs font-normal text-muted">{row.student.statusLabel}</span></th>
              {analysis.rows[rowIndex]?.values.map((reading, columnIndex) => {
                const compared = comparison?.rows[rowIndex]?.values[columnIndex];
                return <td key={reading.key} className="px-3 py-3 align-top">
                  {compared?.state === 'comparable' ? <><span className={`font-semibold ${compared.relation === 'higher' ? 'text-success' : compared.relation === 'lower' ? 'text-danger' : ''}`}>{compared.deltaPercentagePoints > 0 ? '+' : ''}{compared.deltaPercentagePoints.toFixed(1)} pp</span><span className="mt-1 block text-xs text-muted">{compared.referencePercent.toFixed(1)}% → {compared.currentPercent.toFixed(1)}%</span></> : compared ? <span className="text-xs text-muted">Sem comparação</span> : <><span className="font-semibold">{formatMilli(reading.valueMilli)}</span><span className="mt-1 block text-xs text-muted">{reading.percent === null ? reading.state : `${reading.percent.toFixed(1)}% do máximo`}</span></>}
                </td>;
              })}
            </tr>
          ))}</tbody>
        </table>
      </Surface>
    </div>
  );
}

function CouncilReport({ response }: { readonly response: CouncilReady }) {
  const workspace = response.report.workspace;
  const actionLabels = { opened: 'Sessão aberta', 'decision-recorded': 'Decisão registrada', 'vote-recorded': 'Votação registrada', closed: 'Sessão fechada', reopened: 'Sessão reaberta' } as const;
  return (
    <div className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Alunos" value={workspace.summary.total} hint="na turma" tone="blue" icon={<Users className="size-5" />} />
        <Kpi label="Elegíveis" value={workspace.summary.eligible} hint="após recuperação" tone="amber" icon={<Scale className="size-5" />} />
        <Kpi label="Decididos" value={workspace.summary.decided} hint="decisão humana" tone="emerald" icon={<ShieldCheck className="size-5" />} />
        <Kpi label="Pendentes" value={workspace.summary.pending} hint="aguardam reunião" tone="rose" icon={<ClipboardList className="size-5" />} />
      </div>
      <Alert status="default"><Alert.Indicator /><Alert.Content><Alert.Title>Decisão colegiada preservada</Alert.Title><Alert.Description>O sistema registra apenas votos favoráveis e contrários. Eventual desempate do diretor ocorre fora do sistema.</Alert.Description></Alert.Content></Alert>
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <Card><Card.Header><Card.Title>Situação dos alunos</Card.Title><Card.Description>{workspace.classGroup.name}</Card.Description></Card.Header><Card.Content className="grid gap-2">{workspace.students.map((student) => (
          <Surface key={student.id} variant="secondary" className="rounded-2xl p-4"><div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div><p className="font-medium">{student.number}. {student.name}</p><p className="mt-1 text-xs text-muted">{student.eligibility.label}</p></div><Chip size="sm" variant="soft">{student.decision?.label ?? (student.eligibility.eligible ? 'AGUARDANDO CONSELHO' : 'NÃO ELEGÍVEL')}</Chip></div>{student.vote && <p className="mt-3 text-xs text-muted">Votos: {student.vote.favoraveis} favoráveis · {student.vote.contrarios} contrários · {student.vote.presentes} presentes</p>}</Surface>
        ))}</Card.Content></Card>
        <Card><Card.Header><Card.Title>Linha do tempo</Card.Title><Card.Description>Registro imutável da sessão</Card.Description></Card.Header><Card.Content>{workspace.timeline.length === 0 ? <p className="text-sm text-muted">Nenhum evento registrado.</p> : <ol className="relative ml-2 border-l border-border pl-5">{workspace.timeline.map((event) => <li key={event.id} className="pb-5 last:pb-0"><span className="absolute -left-1.5 mt-1 size-3 rounded-full border-2 border-surface bg-accent" /><p className="text-sm font-medium">{actionLabels[event.action]}</p><p className="mt-1 text-xs text-muted">{event.studentLabel ?? 'Turma'} · {formatDate(event.occurredAt)}</p><p className="mt-1 text-xs text-muted">{event.justification}</p></li>)}</ol>}</Card.Content></Card>
      </div>
    </div>
  );
}

function AuditReport({ items }: { readonly items: readonly RelationalInstitutionalDiagnosticV2[] }) {
  return (
    <div className="grid gap-4">
      <Alert status="default"><Alert.Indicator /><Alert.Content><Alert.Title>Achados atuais, sem correção automática</Alert.Title><Alert.Description>Quando a fonte for corrigida, o item sai das pendências atuais. A trilha mínima de tratamento humano será preservada separadamente.</Alert.Description></Alert.Content></Alert>
      {items.length === 0 ? <p className="text-sm text-muted">Nenhum erro ou aviso encontrado neste recorte.</p> : <ol className="relative ml-3 border-l border-border pl-6">{items.map((item) => (
        <li key={item.id} className="pb-5 last:pb-0"><span className={`absolute -left-2 mt-1 grid size-4 place-items-center rounded-full ring-4 ring-surface ${item.severity === 'blocking-error' ? 'bg-danger' : 'bg-warning'}`} /><div className="flex flex-wrap items-center gap-2"><p className="font-medium">{DIAGNOSTIC_LABELS[item.code] ?? item.code}</p><Chip size="sm" variant="soft">{item.severity === 'blocking-error' ? 'Bloqueante' : 'Aviso'}</Chip><Chip size="sm" variant="soft">{item.observations} observação(ões)</Chip></div><p className="mt-1 text-sm text-muted">{item.studentName ? `${item.studentNumber ?? '—'}. ${item.studentName}` : 'Sem aluno associado'}{item.classCode ? ` · ${item.classCode}` : ''}{item.subject ? ` · ${item.subject}` : ''}{item.period ? ` · ${item.period}` : ''}</p><p className="mt-2 text-sm">{item.message}</p><p className="mt-1 text-xs text-muted">Ação sugerida: {item.recommendedAction}</p><p className="mt-1 text-xs text-muted">Última observação: {formatDate(item.lastObservedAt)}</p></li>
      ))}</ol>}
    </div>
  );
}

function toLoadState(cause: unknown): LoadState {
  if (cause instanceof RelationalInstitutionalReportsClientErrorV2) {
    return cause.code === 'invalid-request' ? 'unavailable' : cause.code;
  }
  return 'unavailable';
}

export function RelationalInstitutionalReportsPageV2() {
  const year = useGradebookYear()?.year ?? null;
  const [catalogState, setCatalogState] = useState<LoadState>('loading');
  const [classes, setClasses] = useState<readonly ClassItem[]>([]);
  const [family, setFamily] = useState<RelationalInstitutionalReportFamilyV2>('class-results');
  const [classId, setClassId] = useState<number | null>(null);
  const [period, setPeriod] = useState<Period>(1);
  const [lens, setLens] = useState<Lens>('result');
  const [referenceTerm, setReferenceTerm] = useState<1 | 2 | 3 | null>(null);
  const [severity, setSeverity] = useState<string>('all');
  const [diagnosticCode, setDiagnosticCode] = useState<string>('all');
  const [auditOffset, setAuditOffset] = useState(0);
  const [reportState, setReportState] = useState<LoadState>('idle');
  const [report, setReport] = useState<RelationalInstitutionalReportResponseV2 | null>(null);
  const [historyState, setHistoryState] = useState<LoadState>('idle');
  const [history, setHistory] = useState<readonly RelationalBulletinHistoryItemV2[]>([]);
  const [selectedSnapshots, setSelectedSnapshots] = useState<readonly string[]>([]);
  const [downloadState, setDownloadState] = useState<LoadState>('idle');
  const [downloadMessage, setDownloadMessage] = useState('');
  const requestRef = useRef<AbortController | null>(null);
  const outputRef = useRef<HTMLHeadingElement | null>(null);

  useEffect(() => {
    if (year !== RELATIONAL_INSTITUTIONAL_REPORTS_YEAR_V2) {
      setCatalogState(year === null ? 'loading' : 'unavailable');
      return;
    }
    const controller = new AbortController();
    setCatalogState('loading');
    void requestRelationalInstitutionalReportV2({
      contractVersion: RELATIONAL_INSTITUTIONAL_REPORTS_CONTRACT_VERSION_V2,
      operation: 'catalog',
      year,
    }, controller.signal).then((response) => {
      if (response.state !== 'ready' || response.operation !== 'catalog') return;
      setClasses(response.classes);
      setClassId((current) => current ?? response.classes[0]?.id ?? null);
      setCatalogState(response.classes.length === 0 ? 'empty' : 'ready');
    }).catch((cause: unknown) => {
      if (!(cause instanceof DOMException && cause.name === 'AbortError')) setCatalogState(toLoadState(cause));
    });
    return () => controller.abort();
  }, [year]);

  useEffect(() => {
    if (family === 'class-results') setLens('result');
    if (family === 'composition' && lens === 'result') setLens('quantitative');
    setReport(null);
    setReportState('idle');
  }, [family, lens]);

  useEffect(() => {
    if (period === 'annual' || period === 1 || (referenceTerm !== null && referenceTerm >= period)) setReferenceTerm(null);
  }, [period, referenceTerm]);

  const classOptions = useMemo(() => classes.map((item) => ({ id: String(item.id), label: item.code, description: item.name })), [classes]);
  const referenceOptions = useMemo(() => {
    const options: { id: string; label: string }[] = [{ id: 'none', label: 'Sem comparação' }];
    if (period !== 'annual' && period >= 2) options.push({ id: '1', label: 'Comparar com 1º trimestre' });
    if (period !== 'annual' && period >= 3) options.push({ id: '2', label: 'Comparar com 2º trimestre' });
    return options;
  }, [period]);
  const readyPerformance = report?.state === 'ready' && report.operation === 'performance' ? report : null;
  const readyCouncil = report?.state === 'ready' && report.operation === 'council' ? report : null;
  const readyAudit = report?.state === 'ready' && report.operation === 'audit' ? report : null;

  function resetOutput() {
    requestRef.current?.abort();
    setReport(null);
    setReportState('idle');
  }

  function buildRequest(): RelationalInstitutionalReportRequestV2 | null {
    if (year !== RELATIONAL_INSTITUTIONAL_REPORTS_YEAR_V2) return null;
    if (family === 'audit') return {
      contractVersion: 2,
      operation: 'audit',
      year,
      severities: severity === 'all' ? [] : [severity as 'warning' | 'blocking-error'],
      codes: diagnosticCode === 'all' ? [] : [diagnosticCode as (typeof GRADEBOOK_IMPORT_DIAGNOSTIC_CODES_V1)[number]],
      classCode: classId === null ? null : classes.find((item) => item.id === classId)?.code ?? null,
      limit: 50,
      offset: auditOffset,
    };
    if (classId === null) return null;
    if (family === 'council') return { contractVersion: 2, operation: 'council', year, classId };
    return {
      contractVersion: 2,
      operation: 'performance',
      family,
      year,
      classId,
      period,
      lens: family === 'class-results' ? 'result' : lens,
      referenceTerm,
      statuses: [...ALL_STATUSES],
    };
  }

  async function generate() {
    const request = buildRequest();
    if (request === null) return;
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setReport(null);
    setReportState('loading');
    try {
      const response = await requestRelationalInstitutionalReportV2(request, controller.signal);
      if (controller.signal.aborted) return;
      setReport(response);
      const empty = response.state === 'ready' && response.operation === 'audit' && response.items.length === 0;
      setReportState(empty ? 'empty' : 'ready');
      window.requestAnimationFrame(() => outputRef.current?.focus());
    } catch (cause) {
      if (!(cause instanceof DOMException && cause.name === 'AbortError')) setReportState(toLoadState(cause));
    }
  }

  async function loadHistory() {
    if (year !== 2026 || classId === null) return;
    setHistoryState('loading');
    setHistory([]);
    setSelectedSnapshots([]);
    try {
      const response = await requestRelationalInstitutionalReportV2({ contractVersion: 2, operation: 'bulletin-history', year, classId });
      if (response.state === 'ready' && response.operation === 'bulletin-history') {
        setHistory(response.report.items);
        setHistoryState(response.report.items.length === 0 ? 'empty' : 'ready');
      }
    } catch (cause) { setHistoryState(toLoadState(cause)); }
  }

  async function downloadSelected() {
    const selected = history.filter((item) => selectedSnapshots.includes(`${item.snapshotId}:${item.snapshotVersion}`));
    if (selected.length === 0) return;
    setDownloadState('loading');
    setDownloadMessage('');
    let ready = 0;
    let failed = 0;
    for (const item of selected) {
      try {
        const response = await requestRelationalInstitutionalReportV2({ contractVersion: 2, operation: 'bulletin-reprint', snapshotId: item.snapshotId, snapshotVersion: item.snapshotVersion });
        if (response.state !== 'ready' || response.operation !== 'bulletin-reprint') throw new Error('snapshot-unavailable');
        await runRelationalBulletinPdfActionV2('download', response.report.snapshot);
        ready += 1;
      } catch { failed += 1; }
    }
    setDownloadMessage(`${ready} PDF(s) preparado(s); ${failed} falha(s) isolada(s).`);
    setDownloadState(ready > 0 ? 'ready' : 'unavailable');
  }

  return (
    <div className="grid min-w-0 gap-6" aria-busy={catalogState === 'loading' || reportState === 'loading' || historyState === 'loading'}>
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div><div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted"><FileText className="size-4" /> Relatórios institucionais</div><h2 className="mt-2 text-2xl font-semibold tracking-[-0.035em] sm:text-3xl">Leituras oficiais e rastreáveis</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-muted">Projeções relacionais de 2026, sem reconstruir indicadores ou documentos históricos a partir de dados atuais.</p></div>
        <Chip size="lg" variant="soft">Ano letivo 2026</Chip>
      </header>

      {catalogState === 'loading' && <div className="flex min-h-28 items-center justify-center gap-2 text-sm text-muted"><Spinner size="sm" />Carregando catálogo relacional…</div>}
      {(catalogState === 'empty' || catalogState === 'not-authorized' || catalogState === 'unavailable') && <StateAlert state={catalogState} />}
      {catalogState === 'ready' && <>
        <Card className="overflow-visible"><Card.Content className="grid gap-4 p-4 sm:p-5 lg:grid-cols-3">
          <SelectControl label="Família" value={family} items={FAMILY_OPTIONS} onChange={(value) => { setFamily(value as RelationalInstitutionalReportFamilyV2); setAuditOffset(0); resetOutput(); }} />
          <SelectControl label={family === 'audit' ? 'Turma (opcional)' : 'Turma'} value={classId === null ? 'none' : String(classId)} items={family === 'audit' ? [{ id: 'none', label: 'Todas as turmas' }, ...classOptions] : classOptions} onChange={(value) => { setClassId(value === 'none' ? null : Number(value)); setHistory([]); setHistoryState('idle'); setSelectedSnapshots([]); resetOutput(); }} />
          {family !== 'audit' && family !== 'council' ? <SelectControl label="Período" value={String(period)} items={PERIOD_OPTIONS} onChange={(value) => { setPeriod(value === 'annual' ? 'annual' : Number(value) as 1 | 2 | 3); resetOutput(); }} /> : <div className="rounded-2xl border border-border bg-surface-secondary/50 p-4"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Fonte</p><p className="mt-2 text-sm font-medium">{family === 'council' ? 'Sessão e decisões do Conselho V3' : 'Diagnósticos atuais de importação'}</p></div>}

          {family !== 'audit' && family !== 'council' && <>
            <SelectControl label="Lente" value={family === 'class-results' ? 'result' : lens} disabled={family === 'class-results'} items={family === 'composition' ? LENS_OPTIONS.filter((item) => item.id !== 'result') : LENS_OPTIONS} onChange={(value) => { setLens(value as Lens); resetOutput(); }} />
            <SelectControl label="Comparação trimestral" value={referenceTerm === null ? 'none' : String(referenceTerm)} disabled={period === 1 || period === 'annual'} items={referenceOptions} onChange={(value) => { setReferenceTerm(value === 'none' ? null : Number(value) as 1 | 2); resetOutput(); }} />
          </>}
          {family === 'audit' && <>
            <SelectControl label="Severidade" value={severity} items={[{ id: 'all', label: 'Todas' }, ...GRADEBOOK_IMPORT_DIAGNOSTIC_SEVERITIES_V1.map((id) => ({ id, label: id === 'warning' ? 'Aviso' : 'Erro bloqueante' }))]} onChange={(value) => { setSeverity(value); setAuditOffset(0); resetOutput(); }} />
            <SelectControl label="Tipo de achado" value={diagnosticCode} items={[{ id: 'all', label: 'Todos' }, ...GRADEBOOK_IMPORT_DIAGNOSTIC_CODES_V1.map((id) => ({ id, label: DIAGNOSTIC_LABELS[id] ?? id }))]} onChange={(value) => { setDiagnosticCode(value); setAuditOffset(0); resetOutput(); }} />
          </>}
        </Card.Content></Card>

        <div className="flex flex-wrap items-center gap-2"><Button variant="primary" isDisabled={(family !== 'audit' && classId === null) || reportState === 'loading'} onPress={() => void generate()}>{reportState === 'loading' ? <Spinner size="sm" /> : <BarChart3 className="size-4" />}Gerar relatório</Button>{family === 'audit' && auditOffset > 0 && <Button variant="outline" onPress={() => { setAuditOffset(Math.max(0, auditOffset - 50)); resetOutput(); }}>Página anterior</Button>}{family === 'audit' && readyAudit !== null && readyAudit.nextOffset !== null && <Button variant="outline" onPress={() => { setAuditOffset(readyAudit.nextOffset ?? 0); resetOutput(); }}>Próxima página</Button>}</div>

        <section className="grid gap-4" aria-label="Saída do relatório" aria-live="polite">
          {reportState === 'loading' && <div className="flex min-h-32 items-center justify-center gap-2 text-sm text-muted"><Spinner size="sm" />Consultando a projeção relacional…</div>}
          {(reportState === 'empty' || reportState === 'not-authorized' || reportState === 'not-found' || reportState === 'scope-too-large' || reportState === 'unavailable') && <StateAlert state={reportState} />}
          {reportState === 'ready' && <h3 ref={outputRef} tabIndex={-1} className="sr-only outline-none">Relatório carregado</h3>}
          {readyPerformance && <PerformanceReport response={readyPerformance} />}
          {readyCouncil && <CouncilReport response={readyCouncil} />}
          {readyAudit && <AuditReport items={readyAudit.items} />}
        </section>

        <Card><Card.Header><div className="flex items-center gap-2 text-primary"><ArchiveRestore className="size-5" /><Card.Title>Reimpressão de boletins emitidos</Card.Title></div><Card.Description>Somente snapshots imutáveis V2. Selecione até 3 documentos por vez.</Card.Description></Card.Header><Card.Content className="grid gap-3"><div className="flex flex-wrap gap-2"><Button variant="secondary" isDisabled={classId === null || historyState === 'loading'} onPress={() => void loadHistory()}>{historyState === 'loading' ? <Spinner size="sm" /> : <History className="size-4" />}Carregar histórico</Button><Button variant="primary" isDisabled={selectedSnapshots.length === 0 || downloadState === 'loading'} onPress={() => void downloadSelected()}>{downloadState === 'loading' ? <Spinner size="sm" /> : <FileDown className="size-4" />}Baixar selecionados ({selectedSnapshots.length})</Button></div>{historyState === 'empty' && <p className="text-sm text-muted">Nenhum boletim emitido para esta turma.</p>}{historyState === 'ready' && <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{history.map((item) => { const key = `${item.snapshotId}:${item.snapshotVersion}`; const selected = selectedSnapshots.includes(key); const disabled = !selected && selectedSnapshots.length >= 3; return <Button key={key} variant={selected ? 'primary' : 'outline'} isDisabled={disabled} aria-pressed={selected} className="h-auto min-h-20 justify-start p-3 text-left" onPress={() => setSelectedSnapshots(selected ? selectedSnapshots.filter((value) => value !== key) : [...selectedSnapshots, key])}><span className="min-w-0"><span className="block truncate font-semibold">{item.studentName}</span><span className="mt-1 block text-xs opacity-80">{item.className} · {item.period.kind === 'annual' ? 'Anual + REC' : `${item.period.term}º trimestre`} · v{item.snapshotVersion}</span><span className="mt-1 block text-xs opacity-70">Emitido em {formatDate(item.emittedAt)}</span></span></Button>; })}</div>}{downloadMessage && <p className={`text-sm ${downloadState === 'unavailable' ? 'text-danger' : 'text-success'}`}>{downloadMessage}</p>}</Card.Content></Card>
      </>}
    </div>
  );
}

export const GradebookRelationalInstitutionalReportsPage = RelationalInstitutionalReportsPageV2;
