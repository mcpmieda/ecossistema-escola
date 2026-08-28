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
import {
  ArrowLeft,
  ArrowRight,
  CircleAlert,
  FileSpreadsheet,
  RefreshCw,
  Search,
  Users,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type {
  ProfessorDetail,
  ProfessorListItem,
  ProfessoresFilters,
} from '../../shared/banco-notas-professores';
import type { AttentionLevel } from '../../shared/banco-notas-acompanhamento';
import type { PageResult } from '../../shared/banco-notas-turmas-alunos';
import { resolveSafeReturnHref } from './safe-return';

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
  if (!response.ok)
    throw new ApiError(
      payload.message ?? 'Não foi possível carregar os professores.',
      response.status,
    );
  return payload;
}

function formatDate(value: string | null) {
  if (!value) return 'Sem atividade registrada';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? 'Data indisponível'
    : new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(parsed);
}

const modelLabels: Record<string, string> = {
  missing: 'Sem modelo',
  draft: 'Rascunho',
  validated: 'Validado',
  ready_to_share: 'Pronto para compartilhar',
  shared: 'Compartilhado',
  connected: 'Conectado',
  suspended: 'Suspenso',
  archived: 'Arquivado',
};

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
              ? 'Registro não encontrado'
              : 'Não foi possível carregar'}
        </Alert.Title>
        <Alert.Description>
          {forbidden
            ? 'Seu perfil não possui autorização administrativa para esta consulta.'
            : error.message}
        </Alert.Description>
      </Alert.Content>
      {!forbidden && (
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

function AttentionChip({ level, reasons }: { level: AttentionLevel; reasons: string[] }) {
  const label =
    level === 'error'
      ? 'Erro'
      : level === 'warning'
        ? 'Atenção'
        : level === 'info'
          ? 'Informação'
          : 'Normal';
  return (
    <div className="grid min-w-36 gap-1">
      <Chip
        size="sm"
        variant="soft"
        color={
          level === 'error'
            ? 'danger'
            : level === 'warning'
              ? 'warning'
              : level === 'normal'
                ? 'success'
                : 'default'
        }
      >
        {label}
      </Chip>
      {reasons[0] && <span className="text-xs text-muted">{reasons[0]}</span>}
    </div>
  );
}

function Pager({
  result,
  update,
}: {
  result: PageResult<unknown>;
  update: (key: string, value: string) => void;
}) {
  return (
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
  );
}

export function ProfessoresPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get('q') ?? '');
  const [result, setResult] = useState<PageResult<ProfessorListItem> | null>(null);
  const [filters, setFilters] = useState<ProfessoresFilters | null>(null);
  const [filtersError, setFiltersError] = useState(false);
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
    setError(null);
    setFiltersError(false);
    void get<PageResult<ProfessorListItem>>(
      `/v1/professores${params.toString() ? `?${params}` : ''}`,
      controller.signal,
    )
      .then(setResult)
      .catch((caught: unknown) => {
        if ((caught as Error).name !== 'AbortError') setError(caught as Error);
      });
    void get<ProfessoresFilters>('/v1/professores/filters', controller.signal)
      .then(setFilters)
      .catch((caught: unknown) => {
        if ((caught as Error).name !== 'AbortError') setFiltersError(true);
      });
    return () => controller.abort();
  }, [params, reload]);
  const year = params.get('schoolYearId');
  const groups = useMemo(
    () => filters?.classGroups.filter((item) => !year || item.schoolYearId === year) ?? [],
    [filters, year],
  );
  const components = useMemo(
    () => filters?.components.filter((item) => !year || item.schoolYearId === year) ?? [],
    [filters, year],
  );
  const diagnosticTotal = filters
    ? Object.values(filters.diagnostics).reduce((total, value) => total + value, 0)
    : 0;
  const returnQuery = params.toString();
  return (
    <Frame
      title="Professores"
      description="Diretório operacional read-only de professores, atribuições, modelos, identidade institucional, fontes, atividade e pendências do Banco de Notas."
    >
      {(filtersError || diagnosticTotal > 0) && result && (
        <Alert status="warning" className="mb-5">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>Visão parcial</Alert.Title>
            <Alert.Description>
              {filtersError
                ? 'A lista está disponível, mas os filtros e diagnósticos não puderam ser atualizados.'
                : `${diagnosticTotal} inconsistência(s) estrutural(is) foram diagnosticadas sem correção automática.`}
            </Alert.Description>
          </Alert.Content>
        </Alert>
      )}
      <Surface className="bn-card" aria-label="Filtros de professores">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <SearchField value={search} onChange={setSearch} aria-label="Pesquisar professor">
            <Label>Pesquisar</Label>
            <SearchField.Group>
              <Search className="size-4 text-muted" />
              <SearchField.Input placeholder="Nome do professor" />
              <SearchField.ClearButton />
            </SearchField.Group>
          </SearchField>
          <Filter
            label="Ano letivo"
            value={year ?? ''}
            options={filters?.schoolYears ?? []}
            onChange={(value) => update('schoolYearId', value)}
          />
          <Filter
            label="Status"
            value={params.get('status') ?? ''}
            options={[
              { id: 'active', label: 'Ativo' },
              { id: 'inactive', label: 'Inativo' },
            ]}
            onChange={(value) => update('status', value)}
          />
          <Filter
            label="Turma"
            value={params.get('classGroupId') ?? ''}
            options={groups}
            onChange={(value) => update('classGroupId', value)}
          />
          <Filter
            label="Componente"
            value={params.get('componentId') ?? ''}
            options={components}
            onChange={(value) => update('componentId', value)}
          />
          <Filter
            label="Identidade institucional"
            value={params.get('identity') ?? ''}
            options={[
              { id: 'linked', label: 'Vinculada' },
              { id: 'missing', label: 'Não vinculada' },
            ]}
            onChange={(value) => update('identity', value)}
          />
          <Filter
            label="Estado do modelo"
            value={params.get('modelState') ?? ''}
            options={Object.entries(modelLabels).map(([id, label]) => ({ id, label }))}
            onChange={(value) => update('modelState', value)}
          />
          <Filter
            label="Atribuição"
            value={params.get('assignment') ?? ''}
            options={[
              { id: 'with', label: 'Com atribuição' },
              { id: 'without', label: 'Sem atribuição' },
            ]}
            onChange={(value) => update('assignment', value)}
          />
          <Filter
            label="Situação"
            value={params.get('attention') ?? ''}
            options={[
              { id: 'needs_attention', label: 'Precisa de atenção' },
              { id: 'normal', label: 'Sem atenção crítica' },
            ]}
            onChange={(value) => update('attention', value)}
          />
          <div className="flex items-end">
            <Button
              variant="outline"
              onPress={() => {
                setSearch('');
                setParams({});
              }}
            >
              Limpar filtros
            </Button>
          </div>
        </div>
      </Surface>
      {error ? (
        <div className="mt-5">
          <Failure error={error} retry={() => setReload((value) => value + 1)} />
        </div>
      ) : !result ? (
        <Skeleton className="mt-5 h-80 rounded-2xl" aria-label="Carregando professores" />
      ) : result.items.length === 0 ? (
        <Surface className="bn-card mt-5 text-center">
          <Users className="mx-auto size-8 text-muted" />
          <h2 className="mt-3 font-semibold">
            {params.toString()
              ? 'Nenhum professor para estes filtros'
              : 'Nenhum professor cadastrado no Banco de Notas'}
          </h2>
          <p className="mt-2 text-sm text-muted">
            {params.toString()
              ? 'Ajuste ou limpe os filtros para ampliar a pesquisa.'
              : 'Professores canônicos aparecerão aqui quando existirem no D1.'}
          </p>
        </Surface>
      ) : (
        <Card className="mt-5 overflow-hidden">
          <Card.Header className="border-b border-border/60">
            <Card.Title>Diretório operacional</Card.Title>
            <Card.Description>{result.total} professor(es) encontrado(s).</Card.Description>
          </Card.Header>
          <Card.Content className="p-0">
            <Table variant="secondary">
              <Table.ScrollContainer>
                <Table.Content aria-label="Professores do Banco de Notas">
                  <Table.Header>
                    <Table.Column id="teacher">Professor</Table.Column>
                    <Table.Column id="situation">Situação</Table.Column>
                    <Table.Column id="identity">Identidade</Table.Column>
                    <Table.Column id="contexts">Turmas / componentes</Table.Column>
                    <Table.Column id="models">Modelos</Table.Column>
                    <Table.Column id="pending">Pendências</Table.Column>
                    <Table.Column id="activity">Atividade</Table.Column>
                    <Table.Column id="action">Ação</Table.Column>
                  </Table.Header>
                  <Table.Body>
                    {result.items.map((row) => (
                      <Table.Row id={row.id} key={row.id}>
                        <Table.Cell>
                          <p className="min-w-40 font-medium">{row.displayName}</p>
                          <p className="text-xs text-muted">
                            {row.status === 'active' ? 'Ativo' : 'Inativo'} · {row.assignments}{' '}
                            assignment(s)
                          </p>
                        </Table.Cell>
                        <Table.Cell>
                          <AttentionChip
                            level={row.attentionLevel}
                            reasons={row.attentionReasons}
                          />
                        </Table.Cell>
                        <Table.Cell>
                          <Chip
                            size="sm"
                            variant="soft"
                            color={row.identityState === 'linked' ? 'success' : 'warning'}
                          >
                            {row.identityState === 'linked'
                              ? 'Identidade vinculada'
                              : 'Identidade não vinculada'}
                          </Chip>
                        </Table.Cell>
                        <Table.Cell>
                          {row.assignments > 0 ? (
                            <span>
                              {row.classGroups} turma(s) · {row.components} componente(s)
                            </span>
                          ) : (
                            <span className="text-muted">
                              Sem atribuição no período selecionado
                            </span>
                          )}
                        </Table.Cell>
                        <Table.Cell>
                          <p>
                            {row.connectedModels} conectado(s) / {row.models} total
                          </p>
                          <p className="text-xs text-muted">
                            {row.modelStates
                              .map((state) => modelLabels[state] ?? state)
                              .join(', ') || 'Sem modelo'}
                          </p>
                        </Table.Cell>
                        <Table.Cell>{row.openFindings}</Table.Cell>
                        <Table.Cell className="whitespace-nowrap text-muted">
                          {formatDate(row.lastActivityAt)}
                        </Table.Cell>
                        <Table.Cell>
                          <Button
                            size="sm"
                            variant="outline"
                            onPress={() =>
                              navigate(
                                `/professores/${row.id}?retorno=${encodeURIComponent(returnQuery)}${year ? `&schoolYearId=${year}` : ''}`,
                              )
                            }
                          >
                            Ver professor <ArrowRight className="size-4" />
                          </Button>
                        </Table.Cell>
                      </Table.Row>
                    ))}
                  </Table.Body>
                </Table.Content>
              </Table.ScrollContainer>
            </Table>
          </Card.Content>
          <Pager result={result} update={update} />
        </Card>
      )}
    </Frame>
  );
}

export function ProfessorDetailPage() {
  const navigate = useNavigate();
  const { id = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const [detail, setDetail] = useState<ProfessorDetail | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [reload, setReload] = useState(0);
  const rawReturn = params.get('retorno') ?? '';
  const backHref = resolveSafeReturnHref(rawReturn, '/professores');
  const selectedYear = params.get('schoolYearId') ?? '';
  useEffect(() => {
    const controller = new AbortController();
    setError(null);
    setDetail(null);
    void get<ProfessorDetail>(
      `/v1/professores/${id}${selectedYear ? `?schoolYearId=${selectedYear}` : ''}`,
      controller.signal,
    )
      .then(setDetail)
      .catch((caught: unknown) => {
        if ((caught as Error).name !== 'AbortError') setError(caught as Error);
      });
    return () => controller.abort();
  }, [id, reload, selectedYear]);
  const updateYear = (value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set('schoolYearId', value);
    else next.delete('schoolYearId');
    setParams(next);
  };
  const professorReturn = `/professores/${id}?${params.toString()}`;
  return (
    <Frame
      title={detail?.teacher.displayName ?? 'Detalhe do professor'}
      description="Responsabilidades, modelos, identidade, atividade e pendências factuais do professor no Banco de Notas."
    >
      <div className="mb-5 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onPress={() => navigate(backHref)}>
          <ArrowLeft className="size-4" /> Voltar aos professores
        </Button>
        {detail && (
          <div className="min-w-56">
            <Filter
              label="Contexto anual"
              value={selectedYear}
              options={detail.availableSchoolYears}
              onChange={updateYear}
            />
          </div>
        )}
      </div>
      {error ? (
        <Failure error={error} retry={() => setReload((value) => value + 1)} />
      ) : !detail ? (
        <div className="grid gap-4">
          <Skeleton className="h-36 rounded-2xl" />
          <Skeleton className="h-80 rounded-2xl" />
        </div>
      ) : (
        <div className="grid gap-5">
          <Surface className="bn-card">
            <div className="grid gap-4 md:grid-cols-4">
              <div>
                <p className="text-xs text-muted">Status</p>
                <Chip
                  className="mt-2"
                  variant="soft"
                  color={detail.teacher.status === 'active' ? 'success' : 'default'}
                >
                  {detail.teacher.status === 'active' ? 'Ativo' : 'Inativo'}
                </Chip>
              </div>
              <div>
                <p className="text-xs text-muted">Situação operacional</p>
                <div className="mt-2">
                  <AttentionChip
                    level={detail.teacher.attentionLevel}
                    reasons={detail.teacher.attentionReasons}
                  />
                </div>
              </div>
              <div>
                <p className="text-xs text-muted">Identidade institucional</p>
                <p className="mt-2 text-sm font-medium">
                  {detail.teacher.identityState === 'linked'
                    ? 'Identidade vinculada'
                    : 'Identidade não vinculada'}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted">Última atividade</p>
                <p className="mt-2 text-sm">{formatDate(detail.teacher.lastActivityAt)}</p>
              </div>
            </div>
          </Surface>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
            {[
              ['Turmas', detail.summary.classGroups],
              ['Componentes', detail.summary.components],
              ['Assignments', detail.summary.assignments],
              ['Modelos', detail.summary.models],
              ['Conectados', detail.summary.connectedModels],
              ['Pendências', detail.summary.openFindings],
            ].map(([label, value]) => (
              <Card key={String(label)}>
                <Card.Header>
                  <Card.Description>{label}</Card.Description>
                  <Card.Title>{value}</Card.Title>
                </Card.Header>
              </Card>
            ))}
          </div>
          <Card className="overflow-hidden">
            <Card.Header>
              <Card.Title>Turmas e componentes</Card.Title>
              <Card.Description>
                Assignments persistidos, modelo do período e fonte autoritativa vigente.
              </Card.Description>
            </Card.Header>
            <Card.Content className="p-0">
              {detail.contexts.length === 0 ? (
                <div className="p-6 text-sm text-muted">
                  Sem atribuição no período selecionado. O professor permanece no diretório
                  canônico.
                </div>
              ) : (
                <Table variant="secondary">
                  <Table.ScrollContainer>
                    <Table.Content aria-label="Atribuições do professor">
                      <Table.Header>
                        <Table.Column id="class">Turma</Table.Column>
                        <Table.Column id="component">Componente</Table.Column>
                        <Table.Column id="assignment">Assignment</Table.Column>
                        <Table.Column id="model">Modelo</Table.Column>
                        <Table.Column id="source">Fonte</Table.Column>
                        <Table.Column id="activity">Atividade</Table.Column>
                        <Table.Column id="actions">Ações</Table.Column>
                      </Table.Header>
                      <Table.Body>
                        {detail.contexts.map((context) => (
                          <Table.Row id={context.assignmentId} key={context.assignmentId}>
                            <Table.Cell>
                              <p className="font-medium">{context.classGroupName}</p>
                              <p className="text-xs text-muted">{context.schoolYearName}</p>
                            </Table.Cell>
                            <Table.Cell>{context.componentName}</Table.Cell>
                            <Table.Cell>
                              {context.assignmentStatus === 'active' ? 'Ativo' : 'Inativo'}
                            </Table.Cell>
                            <Table.Cell>
                              <p>{modelLabels[context.modelState ?? 'missing']}</p>
                              <p className="text-xs text-muted">
                                {context.modelVersion
                                  ? `Versão ${context.modelVersion}`
                                  : 'Sem versão'}{' '}
                                · sync {context.modelSyncEnabled ? 'ligada' : 'desligada'}
                              </p>
                            </Table.Cell>
                            <Table.Cell>
                              <p>{context.sourceName ?? 'Fonte não configurada'}</p>
                              <p className="text-xs text-muted">
                                {context.sourceAuthority ?? 'Sem autoridade vigente'}
                              </p>
                            </Table.Cell>
                            <Table.Cell className="whitespace-nowrap text-muted">
                              {formatDate(context.lastActivityAt)}
                            </Table.Cell>
                            <Table.Cell>
                              <div className="flex min-w-48 flex-wrap gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onPress={() =>
                                    navigate(
                                      `/turmas/${context.classGroupId}?retorno=${encodeURIComponent(professorReturn)}`,
                                    )
                                  }
                                >
                                  Ver turma
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onPress={() =>
                                    navigate(
                                      `/acompanhamento/turmas/${context.classGroupId}?retorno=${encodeURIComponent(professorReturn)}`,
                                    )
                                  }
                                >
                                  Abrir no Acompanhamento
                                </Button>
                              </div>
                            </Table.Cell>
                          </Table.Row>
                        ))}
                      </Table.Body>
                    </Table.Content>
                  </Table.ScrollContainer>
                </Table>
              )}
            </Card.Content>
          </Card>
          <Card className="overflow-hidden">
            <Card.Header>
              <Card.Title>Modelos e planilhas</Card.Title>
              <Card.Description>
                Estado administrativo sem expor Drive IDs e sem criar compartilhamento novo.
              </Card.Description>
            </Card.Header>
            <Card.Content className="p-0">
              {detail.models.length === 0 ? (
                <div className="flex items-center gap-3 p-6 text-sm text-muted">
                  <FileSpreadsheet className="size-5" /> Nenhum teacher model registrado.
                </div>
              ) : (
                <Table variant="secondary">
                  <Table.ScrollContainer>
                    <Table.Content aria-label="Modelos do professor">
                      <Table.Header>
                        <Table.Column id="year">Ano</Table.Column>
                        <Table.Column id="state">Estado</Table.Column>
                        <Table.Column id="version">Versão</Table.Column>
                        <Table.Column id="file">Arquivo utilizável</Table.Column>
                        <Table.Column id="sync">Sync</Table.Column>
                        <Table.Column id="reconciliation">Reconciliação</Table.Column>
                        <Table.Column id="findings">Pendências</Table.Column>
                      </Table.Header>
                      <Table.Body>
                        {detail.models.map((model) => (
                          <Table.Row id={model.schoolYearId} key={model.schoolYearId}>
                            <Table.Cell>{model.schoolYearName}</Table.Cell>
                            <Table.Cell>{modelLabels[model.state] ?? model.state}</Table.Cell>
                            <Table.Cell>{model.currentVersion ?? 'Sem versão'}</Table.Cell>
                            <Table.Cell>
                              {model.fileAvailable ? 'Disponível' : 'Não disponível'}
                            </Table.Cell>
                            <Table.Cell>{model.syncEnabled ? 'Ligada' : 'Desligada'}</Table.Cell>
                            <Table.Cell className="whitespace-nowrap text-muted">
                              {formatDate(model.lastReconciledAt)}
                            </Table.Cell>
                            <Table.Cell>{model.openFindings}</Table.Cell>
                          </Table.Row>
                        ))}
                      </Table.Body>
                    </Table.Content>
                  </Table.ScrollContainer>
                </Table>
              )}
            </Card.Content>
          </Card>
          <div className="grid gap-5 xl:grid-cols-2">
            <Card>
              <Card.Header>
                <Card.Title>Pendências</Card.Title>
                <Card.Description>
                  Diagnóstico factual; nenhuma correção ou resolução destrutiva é executada.
                </Card.Description>
              </Card.Header>
              <Card.Content className="grid gap-3">
                {detail.pending.length === 0 ? (
                  <p className="text-sm text-muted">Nenhuma pendência aberta.</p>
                ) : (
                  detail.pending.map((pending, index) => (
                    <div
                      key={`${pending.code}:${pending.context}:${index}`}
                      className="rounded-xl border border-border p-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium">{pending.code}</p>
                          <p className="text-xs text-muted">{pending.context}</p>
                        </div>
                        <Chip
                          size="sm"
                          variant="soft"
                          color={
                            pending.severity === 'error'
                              ? 'danger'
                              : pending.severity === 'warning'
                                ? 'warning'
                                : 'default'
                          }
                        >
                          {pending.severity}
                        </Chip>
                      </div>
                      {pending.classGroupId && (
                        <Button
                          className="mt-3"
                          size="sm"
                          variant="outline"
                          onPress={() => navigate(`/turmas/${pending.classGroupId}`)}
                        >
                          Ver contexto <ArrowRight className="size-4" />
                        </Button>
                      )}
                    </div>
                  ))
                )}
              </Card.Content>
            </Card>
            <Card>
              <Card.Header>
                <Card.Title>Atividade recente</Card.Title>
                <Card.Description>
                  Eventos factuais por origem; cada timestamp mantém sua própria semântica.
                </Card.Description>
              </Card.Header>
              <Card.Content className="grid gap-3">
                {detail.activity.length === 0 ? (
                  <p className="text-sm text-muted">Nenhuma atividade registrada.</p>
                ) : (
                  detail.activity.map((activity, index) => (
                    <div
                      key={`${activity.kind}:${activity.occurredAt}:${index}`}
                      className="flex items-start justify-between gap-3 rounded-xl border border-border p-3"
                    >
                      <div>
                        <p className="font-medium">{activity.label}</p>
                        <p className="text-xs text-muted">
                          {activity.kind} · {modelLabels[activity.status] ?? activity.status}
                        </p>
                      </div>
                      <span className="whitespace-nowrap text-xs text-muted">
                        {formatDate(activity.occurredAt)}
                      </span>
                    </div>
                  ))
                )}
              </Card.Content>
            </Card>
          </div>
          <Alert status="default">
            <Alert.Indicator>
              <CircleAlert className="size-4" />
            </Alert.Indicator>
            <Alert.Content>
              <Alert.Title>Escopo read-only</Alert.Title>
              <Alert.Description>
                Vínculo de identidade e abertura administrativa da planilha ficam para missão
                futura; esta tela não altera Entra, Graph, compartilhamento ou sincronização.
              </Alert.Description>
            </Alert.Content>
          </Alert>
        </div>
      )}
    </Frame>
  );
}
