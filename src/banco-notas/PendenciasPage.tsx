import {
  Alert,
  Breadcrumbs,
  Button,
  Card,
  Chip,
  Label,
  ListBox,
  SearchField,
  Select,
  Skeleton,
  Surface,
  Table,
} from '@heroui/react';
import { ArrowLeft, ArrowRight, CircleAlert, RefreshCw, Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type {
  PendenciasSummary,
  PendingItem,
  PendingKind,
  PendingSeverity,
} from '../../shared/banco-notas-pendencias';
import type { PageResult } from '../../shared/banco-notas-turmas-alunos';
import { SyncAttemptsPanel } from './SyncAttemptsPanel';

class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function get<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/api/banco-notas${path}`, { credentials: 'same-origin', signal });
  const payload = (await response.json().catch(() => ({}))) as T & { message?: string };
  if (!response.ok) {
    throw new ApiError(
      payload.message ?? 'Não foi possível carregar as pendências.',
      response.status,
    );
  }
  return payload;
}

const kindLabels: Record<PendingKind, string> = {
  import_error: 'Importação com erro',
  finding_error: 'Finding de erro',
  finding_warning: 'Finding de atenção',
  finding_info: 'Finding informativo',
  model_suspended: 'Modelo suspenso',
  model_missing: 'Modelo ausente',
  identity_missing: 'Identidade ausente',
  source_missing: 'Fonte ausente',
  inactive_teacher_assignment: 'Professor inativo com atribuição',
  orphan_assignment: 'Atribuição incompleta',
  model_without_assignment: 'Modelo sem atribuição',
  model_not_connected: 'Modelo não conectado',
  import_analysis_pending: 'Análise de importação pendente',
  sync_conflict: 'Conflito de sincronização',
  sync_failed: 'Falha de sincronização',
  sync_rejected_stale: 'Baseline de sincronização desatualizada',
};

const kindOptions = Object.entries(kindLabels).map(([id, label]) => ({ id, label }));

function formatDate(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? 'Data indisponível'
    : new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(parsed);
}

function Frame({
  title,
  description,
  children,
}: React.PropsWithChildren<{ title: string; description: string }>) {
  return (
    <main className="bn-main">
      <Breadcrumbs className="mb-5">
        <Breadcrumbs.Item href="/#sistemas">Centro de Administração</Breadcrumbs.Item>
        <Breadcrumbs.Item href="/banco-de-notas">Banco de Notas</Breadcrumbs.Item>
        <Breadcrumbs.Item>{title}</Breadcrumbs.Item>
      </Breadcrumbs>
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">{description}</p>
      </header>
      {children}
    </main>
  );
}

function Failure({ error, retry }: { error: Error; retry: () => void }) {
  const forbidden = error instanceof ApiError && error.status === 403;
  const notFound = error instanceof ApiError && error.status === 404;
  return (
    <Alert status="danger">
      <Alert.Indicator />
      <Alert.Content>
        <Alert.Title>
          {forbidden
            ? 'Sem permissão'
            : notFound
              ? 'Pendência não encontrada'
              : 'Não foi possível carregar'}
        </Alert.Title>
        <Alert.Description>
          {forbidden
            ? 'Seu perfil não possui autorização administrativa para consultar a Central.'
            : error.message}
        </Alert.Description>
      </Alert.Content>
      {!forbidden && !notFound && (
        <Button size="sm" variant="outline" onPress={retry}>
          <RefreshCw className="size-4" /> Tentar novamente
        </Button>
      )}
    </Alert>
  );
}

function Filter({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ id: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <Select
      aria-label={label}
      selectedKey={value || null}
      onSelectionChange={(key) => onChange(key ? String(key) : '')}
    >
      <Label>{label}</Label>
      <Select.Trigger>
        <Select.Value />
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover>
        <ListBox items={[{ id: '', label: 'Todos' }, ...options]}>
          {(item) => (
            <ListBox.Item id={item.id} textValue={item.label}>
              {item.label}
              <ListBox.ItemIndicator />
            </ListBox.Item>
          )}
        </ListBox>
      </Select.Popover>
    </Select>
  );
}

function SeverityChip({ severity }: { severity: PendingSeverity }) {
  return (
    <Chip
      size="sm"
      variant="soft"
      color={severity === 'error' ? 'danger' : severity === 'warning' ? 'warning' : 'accent'}
    >
      {severity === 'error' ? 'Erro' : severity === 'warning' ? 'Atenção' : 'Informação'}
    </Chip>
  );
}

function SummaryCards({
  summary,
  selectSeverity,
}: {
  summary: PendenciasSummary;
  selectSeverity: (severity: string) => void;
}) {
  const cards: Array<[string, number, string]> = [
    ['Total aberto', summary.total, ''],
    ['Erros', summary.error, 'error'],
    ['Atenções', summary.warning, 'warning'],
    ['Informações', summary.info, 'info'],
  ];
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Resumo de pendências">
      {cards.map(([label, value, severity]) => (
        <Card key={label} variant="default">
          <Card.Header>
            <Card.Description>{label}</Card.Description>
            <Card.Title className="text-2xl">{value}</Card.Title>
          </Card.Header>
          <Card.Footer>
            <Button size="sm" variant="ghost" onPress={() => selectSeverity(severity)}>
              {severity ? `Filtrar ${label.toLocaleLowerCase('pt-BR')}` : 'Ver todas'}
            </Button>
          </Card.Footer>
        </Card>
      ))}
    </div>
  );
}

export function PendenciasPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get('q') ?? '');
  const [summary, setSummary] = useState<PendenciasSummary | null>(null);
  const [result, setResult] = useState<PageResult<PendingItem> | null>(null);
  const [summaryError, setSummaryError] = useState<Error | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [reload, setReload] = useState(0);

  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.set('page', '1');
    setParams(next);
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (search.trim() !== (params.get('q') ?? '')) update('q', search.trim());
    }, 350);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    const controller = new AbortController();
    const summaryParams = new URLSearchParams(params);
    summaryParams.delete('page');
    summaryParams.delete('pageSize');
    summaryParams.delete('severity');
    setSummaryError(null);
    void get<PendenciasSummary>(
      `/v1/pendencias/summary${summaryParams.toString() ? `?${summaryParams}` : ''}`,
      controller.signal,
    )
      .then(setSummary)
      .catch((caught: unknown) => {
        if ((caught as Error).name !== 'AbortError') setSummaryError(caught as Error);
      });
    return () => controller.abort();
  }, [params, reload]);

  useEffect(() => {
    const controller = new AbortController();
    setError(null);
    void get<PageResult<PendingItem>>(
      `/v1/pendencias${params.toString() ? `?${params}` : ''}`,
      controller.signal,
    )
      .then(setResult)
      .catch((caught: unknown) => {
        if ((caught as Error).name !== 'AbortError') setError(caught as Error);
      });
    return () => controller.abort();
  }, [params, reload]);

  const selectedYear = params.get('schoolYearId') ?? '';
  const classes = useMemo(
    () =>
      summary?.filters.classGroups.filter(
        (item) => !selectedYear || item.schoolYearId === selectedYear,
      ) ?? [],
    [selectedYear, summary],
  );
  const components = useMemo(
    () =>
      summary?.filters.components.filter(
        (item) => !selectedYear || item.schoolYearId === selectedYear,
      ) ?? [],
    [selectedYear, summary],
  );

  return (
    <Frame
      title="Central de Pendências"
      description="Observabilidade operacional read-only para investigar erros, atenções e informações factuais sem corrigir ou alterar dados automaticamente."
    >
      <SyncAttemptsPanel title="Tentativas relacionadas à operação" />
      {summaryError && result && (
        <Alert status="warning" className="mb-5">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>Visão parcial</Alert.Title>
            <Alert.Description>
              A lista está disponível, mas o resumo e os filtros não puderam ser atualizados.
            </Alert.Description>
          </Alert.Content>
        </Alert>
      )}

      {!summary && !summaryError ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Carregando resumo">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-36 rounded-2xl" />
          ))}
        </div>
      ) : summary ? (
        <SummaryCards summary={summary} selectSeverity={(value) => update('severity', value)} />
      ) : null}

      <Surface className="bn-card mt-5" aria-label="Filtros da Central de Pendências">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <SearchField value={search} onChange={setSearch} aria-label="Pesquisar pendência">
            <Label>Pesquisar</Label>
            <SearchField.Group>
              <Search className="size-4 text-muted" />
              <SearchField.Input placeholder="Professor, turma, componente ou código" />
              <SearchField.ClearButton />
            </SearchField.Group>
          </SearchField>
          <Filter
            label="Ano letivo"
            value={selectedYear}
            options={summary?.filters.schoolYears ?? []}
            onChange={(value) => update('schoolYearId', value)}
          />
          <Filter
            label="Severidade"
            value={params.get('severity') ?? ''}
            options={[
              { id: 'error', label: 'Erro' },
              { id: 'warning', label: 'Atenção' },
              { id: 'info', label: 'Informação' },
            ]}
            onChange={(value) => update('severity', value)}
          />
          <Filter
            label="Tipo"
            value={params.get('kind') ?? ''}
            options={kindOptions}
            onChange={(value) => update('kind', value)}
          />
          <Filter
            label="Professor"
            value={params.get('teacherId') ?? ''}
            options={summary?.filters.teachers ?? []}
            onChange={(value) => update('teacherId', value)}
          />
          <Filter
            label="Turma"
            value={params.get('classGroupId') ?? ''}
            options={classes}
            onChange={(value) => update('classGroupId', value)}
          />
          <Filter
            label="Componente"
            value={params.get('componentId') ?? ''}
            options={components}
            onChange={(value) => update('componentId', value)}
          />
          <Filter
            label="Status"
            value={params.get('status') ?? ''}
            options={[{ id: 'open', label: 'Aberta' }]}
            onChange={(value) => update('status', value)}
          />
        </div>
      </Surface>

      <Card className="mt-5 overflow-hidden">
        <Card.Header className="flex-row items-start justify-between gap-4">
          <div>
            <Card.Title>Pendências abertas</Card.Title>
            <Card.Description>
              {result ? `${result.total} evidência(s) factual(is)` : 'Carregando evidências'}
            </Card.Description>
          </div>
          <Button size="sm" variant="outline" onPress={() => setReload((value) => value + 1)}>
            <RefreshCw className="size-4" /> Atualizar
          </Button>
        </Card.Header>
        <Card.Content className="p-0">
          {error ? (
            <div className="p-5">
              <Failure error={error} retry={() => setReload((value) => value + 1)} />
            </div>
          ) : !result ? (
            <div className="grid gap-3 p-5">
              {Array.from({ length: 5 }, (_, index) => (
                <Skeleton key={index} className="h-16 rounded-xl" />
              ))}
            </div>
          ) : result.items.length === 0 ? (
            <div className="grid justify-items-center gap-3 p-10 text-center">
              <CircleAlert className="size-8 text-muted" />
              <div>
                <p className="font-medium">Nenhuma pendência encontrada</p>
                <p className="mt-1 text-sm text-muted">
                  Ajuste os filtros ou confirme que não há evidências abertas neste contexto.
                </p>
              </div>
            </div>
          ) : (
            <Table variant="secondary">
              <Table.ScrollContainer>
                <Table.Content aria-label="Lista de pendências operacionais">
                  <Table.Header>
                    <Table.Column id="severity">Severidade</Table.Column>
                    <Table.Column id="kind">Tipo</Table.Column>
                    <Table.Column id="context">Contexto</Table.Column>
                    <Table.Column id="date">Atualização</Table.Column>
                    <Table.Column id="action">Ação</Table.Column>
                  </Table.Header>
                  <Table.Body>
                    {result.items.map((item) => (
                      <Table.Row key={item.id}>
                        <Table.Cell>
                          <SeverityChip severity={item.severity} />
                        </Table.Cell>
                        <Table.Cell>
                          <p className="font-medium">{item.title}</p>
                          <p className="mt-1 max-w-72 text-xs text-muted">{item.evidence}</p>
                        </Table.Cell>
                        <Table.Cell>
                          <p className="max-w-80 text-sm">{item.description}</p>
                        </Table.Cell>
                        <Table.Cell>{formatDate(item.updatedAt)}</Table.Cell>
                        <Table.Cell>
                          <Button
                            size="sm"
                            variant="outline"
                            onPress={() =>
                              navigate(
                                `/pendencias/${encodeURIComponent(item.id)}?retorno=${encodeURIComponent(params.toString())}`,
                              )
                            }
                          >
                            Investigar <ArrowRight className="size-4" />
                          </Button>
                        </Table.Cell>
                      </Table.Row>
                    ))}
                  </Table.Body>
                </Table.Content>
              </Table.ScrollContainer>
            </Table>
          )}
        </Card.Content>
        {result && (
          <Card.Footer className="justify-between border-t border-border/60">
            <span className="text-sm text-muted">
              Página {result.page} de {Math.max(result.totalPages, 1)}
            </span>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                isDisabled={result.page <= 1}
                onPress={() => update('page', String(result.page - 1))}
              >
                Anterior
              </Button>
              <Button
                size="sm"
                variant="outline"
                isDisabled={result.page >= result.totalPages}
                onPress={() => update('page', String(result.page + 1))}
              >
                Próxima
              </Button>
            </div>
          </Card.Footer>
        )}
      </Card>
    </Frame>
  );
}

export function PendenciaDetailPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [params] = useSearchParams();
  const [item, setItem] = useState<PendingItem | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [reload, setReload] = useState(0);
  const returnQuery = params.get('retorno') ?? '';
  const backHref = `/pendencias${returnQuery ? `?${returnQuery}` : ''}`;

  useEffect(() => {
    const controller = new AbortController();
    setError(null);
    void get<PendingItem>(`/v1/pendencias/${encodeURIComponent(id ?? '')}`, controller.signal)
      .then(setItem)
      .catch((caught: unknown) => {
        if ((caught as Error).name !== 'AbortError') setError(caught as Error);
      });
    return () => controller.abort();
  }, [id, reload]);

  const currentReturn = `/pendencias/${encodeURIComponent(id ?? '')}?retorno=${encodeURIComponent(returnQuery)}`;
  const openContext = (href: string) => {
    const appPath = href.replace(/^\/banco-de-notas/u, '');
    const separator = appPath.includes('?') ? '&' : '?';
    void navigate(`${appPath}${separator}retorno=${encodeURIComponent(currentReturn)}`);
  };

  return (
    <Frame
      title={item?.title ?? 'Detalhe da pendência'}
      description="Causa, evidência e contexto factual para investigação, sem ação automática de resolução."
    >
      <Button size="sm" variant="outline" className="mb-5" onPress={() => navigate(backHref)}>
        <ArrowLeft className="size-4" /> Voltar à Central
      </Button>
      <SyncAttemptsPanel title="Tentativas recentes para investigação" />
      {error ? (
        <Failure error={error} retry={() => setReload((value) => value + 1)} />
      ) : !item ? (
        <div className="grid gap-4">
          <Skeleton className="h-40 rounded-2xl" />
          <Skeleton className="h-72 rounded-2xl" />
        </div>
      ) : (
        <div className="grid gap-5">
          <Surface className="bn-card">
            <div className="grid gap-5 md:grid-cols-3">
              <div>
                <p className="text-xs text-muted">Severidade</p>
                <div className="mt-2">
                  <SeverityChip severity={item.severity} />
                </div>
              </div>
              <div>
                <p className="text-xs text-muted">Tipo</p>
                <p className="mt-2 text-sm font-medium">{kindLabels[item.kind]}</p>
              </div>
              <div>
                <p className="text-xs text-muted">Status</p>
                <Chip className="mt-2" size="sm" variant="soft">
                  Aberta
                </Chip>
              </div>
            </div>
          </Surface>
          <div className="grid gap-5 xl:grid-cols-2">
            <Card>
              <Card.Header>
                <Card.Title>Causa e evidência</Card.Title>
                <Card.Description>Regra operacional e fato persistido.</Card.Description>
              </Card.Header>
              <Card.Content className="grid gap-4 text-sm">
                <div>
                  <p className="text-xs text-muted">Causa</p>
                  <p className="mt-1">{item.title}</p>
                </div>
                <div>
                  <p className="text-xs text-muted">Evidência</p>
                  <p className="mt-1">{item.evidence}</p>
                </div>
                <div>
                  <p className="text-xs text-muted">Origem factual</p>
                  <p className="mt-1">{item.origin}</p>
                </div>
              </Card.Content>
            </Card>
            <Card>
              <Card.Header>
                <Card.Title>Contexto afetado</Card.Title>
                <Card.Description>
                  Entidades canônicas relacionadas por ID persistido.
                </Card.Description>
              </Card.Header>
              <Card.Content className="grid gap-3 text-sm">
                <p>{item.description}</p>
                {item.modelState && <p>Estado do modelo: {item.modelState}</p>}
                {item.sourceName && <p>Fonte: {item.sourceName}</p>}
                <p>Criada em {formatDate(item.createdAt)}</p>
                <p>Atualizada em {formatDate(item.updatedAt)}</p>
              </Card.Content>
            </Card>
          </div>
          <Card>
            <Card.Header>
              <Card.Title>Investigar no contexto</Card.Title>
              <Card.Description>
                Estes links apenas abrem as visões relacionadas; nenhuma pendência é resolvida.
              </Card.Description>
            </Card.Header>
            <Card.Content className="flex flex-wrap gap-2">
              {item.contextLinks.length ? (
                item.contextLinks.map((link) => (
                  <Button
                    key={`${link.kind}:${link.href}`}
                    variant="outline"
                    onPress={() => openContext(link.href)}
                  >
                    {link.label} <ArrowRight className="size-4" />
                  </Button>
                ))
              ) : (
                <p className="text-sm text-muted">
                  Esta evidência não possui outra visão contextual comprovada.
                </p>
              )}
            </Card.Content>
          </Card>
        </div>
      )}
    </Frame>
  );
}
