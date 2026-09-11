import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Card, Chip, Spinner, Surface } from '@heroui/react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  FileWarning,
  History,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react';
import type { GradebookImportDiagnosticsAuditRecordV1 } from '../../../../shared/gradebook-contracts/imports/import-diagnostics-v1';
import { useGradebookYear } from '../../../platform/gradebook-year-context';
import { listGradebookImportDiagnosticsAuditV1 } from '../import/import-diagnostics-client-v1';

type LoadState = 'loading' | 'ready' | 'empty' | 'not-authorized' | 'unavailable';
type SeverityFilter = 'all' | 'blocking-error' | 'warning';

const PAGE_SIZE = 50;
const ACTIVE_YEAR = 2026;

const DIAGNOSTIC_LABELS: Readonly<Record<string, string>> = {
  'invalid-text': 'Texto em campo de nota',
  'negative-grade': 'Nota negativa',
  'invalid-precision': 'Precisão inválida',
  'invalid-maximum': 'Máximo inválido',
  'duplicate-student-number': 'Número de aluno duplicado',
  'source-unavailable': 'Valor de origem indisponível',
  'above-maximum': 'Nota acima do máximo',
};

function instant(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(date)
    : value;
}

function location(value: GradebookImportDiagnosticsAuditRecordV1): string {
  const student = value.studentNumber === undefined
    ? null
    : `${value.studentNumber}. ${value.studentName ?? 'Aluno não identificado'}`;
  return [student, value.classCode, value.subject, value.period, value.fieldLabel]
    .filter(Boolean)
    .join(' · ');
}

function StateAlert({ state }: { readonly state: Exclude<LoadState, 'loading' | 'ready'> }) {
  if (state === 'not-authorized') {
    return (
      <Alert status="warning">
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Title>Acesso não autorizado</Alert.Title>
          <Alert.Description>Sua sessão não pode consultar a Auditoria do Banco de Notas.</Alert.Description>
        </Alert.Content>
      </Alert>
    );
  }
  if (state === 'unavailable') {
    return (
      <Alert status="danger">
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Title>Auditoria indisponível</Alert.Title>
          <Alert.Description>A consulta relacional falhou. Nenhum achado substituto foi criado.</Alert.Description>
        </Alert.Content>
      </Alert>
    );
  }
  return (
    <Alert status="success">
      <Alert.Indicator />
      <Alert.Content>
        <Alert.Title>Nenhum achado atual</Alert.Title>
        <Alert.Description>O recorte de 2026 não possui erro ou aviso de importação pendente.</Alert.Description>
      </Alert.Content>
    </Alert>
  );
}

function Finding({ value }: { readonly value: GradebookImportDiagnosticsAuditRecordV1 }) {
  const blocking = value.severity === 'blocking-error';
  return (
    <li className="relative pb-5 last:pb-0">
      <span
        aria-hidden="true"
        className={`absolute -left-[1.85rem] mt-1 size-4 rounded-full ring-4 ring-surface ${blocking ? 'bg-danger' : 'bg-warning'}`}
      />
      <Surface variant="secondary" className="rounded-2xl border border-border/60 p-4 sm:p-5">
        <div className="flex flex-wrap items-start gap-2">
          <div className="mr-auto min-w-0">
            <p className="font-semibold">{DIAGNOSTIC_LABELS[value.code] ?? value.code}</p>
            <p className="mt-1 break-words text-sm text-muted">{location(value) || value.fileName}</p>
          </div>
          <Chip size="sm" color={blocking ? 'danger' : 'warning'} variant="soft">
            {blocking ? 'Erro bloqueante' : 'Aviso'}
          </Chip>
          <Chip size="sm" variant="soft">{value.observations} observação(ões)</Chip>
        </div>
        <p className="mt-3 text-sm">{value.message}</p>
        {value.cause && <p className="mt-2 text-sm text-muted"><strong className="font-medium text-foreground">O que aconteceu:</strong> {value.cause}</p>}
        <p className="mt-2 text-sm text-muted"><strong className="font-medium text-foreground">Ação sugerida:</strong> {value.recommendedAction}</p>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
          <span>Primeira observação: {instant(value.firstObservedAt)}</span>
          <span>Última observação: {instant(value.lastObservedAt)}</span>
          <span className="truncate">Fonte: {value.fileName}</span>
        </div>
        {(value.sheetName || value.cellAddress || value.foundValue) && (
          <details className="mt-3 text-xs text-muted">
            <summary className="cursor-pointer font-medium">Detalhes técnicos</summary>
            <p className="mt-2 break-words">
              {[value.sheetName, value.cellAddress, value.foundValue && `valor: ${value.foundValue}`]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </details>
        )}
      </Surface>
    </li>
  );
}

export function RelationalCurrentAuditPageV2() {
  const year = useGradebookYear()?.year ?? null;
  const [state, setState] = useState<LoadState>('loading');
  const [items, setItems] = useState<readonly GradebookImportDiagnosticsAuditRecordV1[]>([]);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [severity, setSeverity] = useState<SeverityFilter>('all');
  const requestRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    requestRef.current?.abort();
    setLoadingMore(false);
    setItems([]);
    setNextOffset(null);
    if (year !== ACTIVE_YEAR) {
      setState('unavailable');
      return;
    }
    const controller = new AbortController();
    requestRef.current = controller;
    setState('loading');
    try {
      const response = await listGradebookImportDiagnosticsAuditV1(
        { academicYear: ACTIVE_YEAR, limit: PAGE_SIZE, offset: 0 },
        controller.signal,
      );
      if (controller.signal.aborted) return;
      if (response.state === 'not-authorized') return setState('not-authorized');
      if (response.state !== 'ready') return setState('unavailable');
      setItems(response.items);
      setNextOffset(response.nextOffset);
      setState(response.items.length === 0 ? 'empty' : 'ready');
    } catch (cause) {
      if (!(cause instanceof DOMException && cause.name === 'AbortError')) setState('unavailable');
    }
  }, [year]);

  const loadMore = useCallback(async () => {
    if (year !== ACTIVE_YEAR || nextOffset === null || loadingMore) return;
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setLoadingMore(true);
    try {
      const response = await listGradebookImportDiagnosticsAuditV1(
        { academicYear: ACTIVE_YEAR, limit: PAGE_SIZE, offset: nextOffset },
        controller.signal,
      );
      if (controller.signal.aborted) return;
      if (response.state !== 'ready') {
        setState(response.state === 'not-authorized' ? 'not-authorized' : 'unavailable');
        return;
      }
      setItems((current) => [...current, ...response.items]);
      setNextOffset(response.nextOffset);
    } catch (cause) {
      if (!(cause instanceof DOMException && cause.name === 'AbortError')) setState('unavailable');
    } finally {
      if (!controller.signal.aborted) setLoadingMore(false);
    }
  }, [loadingMore, nextOffset, year]);

  useEffect(() => {
    void load();
    return () => requestRef.current?.abort();
  }, [load]);

  const visibleItems = useMemo(
    () => severity === 'all' ? items : items.filter((item) => item.severity === severity),
    [items, severity],
  );
  const blocking = items.filter((item) => item.severity === 'blocking-error').length;
  const warnings = items.length - blocking;
  const sources = new Set(items.map((item) => item.fileName)).size;

  return (
    <div className="grid min-w-0 gap-6" aria-busy={state === 'loading' || loadingMore}>
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted">
            <ShieldAlert className="size-4" /> Auditoria atual
          </div>
          <h2 className="mt-2 text-2xl font-semibold tracking-[-0.035em] sm:text-3xl">Pendências da fonte em linguagem escolar</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
            Achados atuais das planilhas de 2026. A Auditoria explica e sugere; nenhuma correção é executada automaticamente.
          </p>
        </div>
        <Chip size="lg" variant="soft">Ano letivo 2026</Chip>
      </header>

      <Alert status="default">
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Title>Achado atual não é histórico de tratamento</Alert.Title>
          <Alert.Description>
            Ao corrigir e reimportar a fonte, o problema sai das pendências. A trilha humana durável será definida separadamente antes de ganhar registros próprios.
          </Alert.Description>
        </Alert.Content>
      </Alert>

      {state === 'loading' && (
        <div className="flex min-h-32 items-center justify-center gap-2 text-sm text-muted" role="status">
          <Spinner size="sm" /> Consultando achados atuais…
        </div>
      )}
      {(state === 'empty' || state === 'not-authorized' || state === 'unavailable') && <StateAlert state={state} />}

      {state === 'ready' && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Card className="border border-sky-200/70 bg-sky-50/70 dark:border-sky-900/70 dark:bg-sky-950/25"><Card.Content className="p-4"><Clock3 className="size-5 text-sky-600" /><p className="mt-3 text-3xl font-semibold">{items.length}</p><p className="text-xs text-muted">achados carregados nesta sessão</p></Card.Content></Card>
            <Card className="border border-rose-200/70 bg-rose-50/70 dark:border-rose-900/70 dark:bg-rose-950/25"><Card.Content className="p-4"><AlertTriangle className="size-5 text-rose-600" /><p className="mt-3 text-3xl font-semibold">{blocking}</p><p className="text-xs text-muted">erros bloqueantes carregados</p></Card.Content></Card>
            <Card className="border border-amber-200/70 bg-amber-50/70 dark:border-amber-900/70 dark:bg-amber-950/25"><Card.Content className="p-4"><FileWarning className="size-5 text-amber-600" /><p className="mt-3 text-3xl font-semibold">{warnings}</p><p className="text-xs text-muted">avisos carregados</p></Card.Content></Card>
            <Card className="border border-emerald-200/70 bg-emerald-50/70 dark:border-emerald-900/70 dark:bg-emerald-950/25"><Card.Content className="p-4"><CheckCircle2 className="size-5 text-emerald-600" /><p className="mt-3 text-3xl font-semibold">{sources}</p><p className="text-xs text-muted">fontes representadas</p></Card.Content></Card>
          </div>

          <Card>
            <Card.Header className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
              <div className="mr-auto"><Card.Title>Pendências atuais</Card.Title><Card.Description>Filtro aplicado somente aos itens já carregados.</Card.Description></div>
              <div className="flex flex-wrap gap-2" aria-label="Filtrar gravidade dos itens carregados">
                {([
                  ['all', 'Todos'],
                  ['blocking-error', 'Bloqueantes'],
                  ['warning', 'Avisos'],
                ] as const).map(([value, label]) => (
                  <Button key={value} size="sm" variant={severity === value ? 'primary' : 'outline'} aria-pressed={severity === value} onPress={() => setSeverity(value)}>{label}</Button>
                ))}
                <Button size="sm" variant="secondary" onPress={() => void load()}><RefreshCw className="size-4" />Atualizar</Button>
              </div>
            </Card.Header>
            <Card.Content>
              {visibleItems.length === 0
                ? <p className="text-sm text-muted">Nenhum item carregado corresponde ao filtro.</p>
                : <ol className="relative ml-3 border-l border-border pl-6">{visibleItems.map((item) => <Finding key={item.id} value={item} />)}</ol>}
              {nextOffset !== null && (
                <div className="mt-5 flex justify-center">
                  <Button variant="secondary" isPending={loadingMore} isDisabled={loadingMore} onPress={() => void loadMore()}>Carregar mais 50</Button>
                </div>
              )}
            </Card.Content>
          </Card>

          <Surface variant="secondary" className="rounded-2xl border border-border/60 p-5">
            <div className="flex items-start gap-3"><History className="mt-0.5 size-5 text-primary" /><div><h3 className="font-semibold">Tratamento humano</h3><p className="mt-1 text-sm leading-6 text-muted">O histórico mínimo de reconhecimento, justificativa e resolução ainda não possui contrato durável. Por isso esta tela não oferece botões de reconhecer, resolver, descartar ou corrigir.</p></div></div>
          </Surface>
        </>
      )}
    </div>
  );
}
