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
import { ArrowLeft, ArrowRight, BarChart3, CircleAlert, RefreshCw, Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type {
  AcompanhamentoDetail,
  AcompanhamentoListResult,
  AcompanhamentoSummary,
  AttentionLevel,
} from '../../shared/banco-notas-acompanhamento';

class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function get<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/api/banco-notas${path}`, {
    credentials: 'same-origin',
    signal,
  });
  const payload = (await response.json().catch(() => ({}))) as T & {
    error?: string;
    message?: string;
  };
  if (!response.ok) {
    throw new ApiError(
      payload.message ?? payload.error ?? 'Não foi possível carregar os dados.',
      response.status,
    );
  }
  return payload;
}

function formatDate(value: string | null): string {
  if (!value) return 'Sem atividade registrada';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Data indisponível';
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
}

const modelLabels: Record<string, string> = {
  draft: 'Rascunho',
  validated: 'Validado',
  ready_to_share: 'Pronto para compartilhar',
  shared: 'Compartilhado',
  connected: 'Conectado',
  suspended: 'Suspenso',
  archived: 'Arquivado',
  missing: 'Sem modelo',
};

function StateChip({ state }: { state: string | null }) {
  const value = state ?? 'missing';
  const color = value === 'connected' ? 'success' : value === 'suspended' ? 'danger' : 'default';
  return (
    <Chip size="sm" variant="soft" color={color}>
      {modelLabels[value] ?? value}
    </Chip>
  );
}

function AttentionChip({ level, reasons }: { level: AttentionLevel; reasons: string[] }) {
  if (level === 'normal') {
    return (
      <Chip size="sm" variant="soft" color="success">
        Normal
      </Chip>
    );
  }
  return (
    <div className="grid min-w-44 gap-1">
      <Chip
        size="sm"
        variant="soft"
        color={level === 'error' ? 'danger' : level === 'warning' ? 'warning' : 'accent'}
      >
        {level === 'error' ? 'Erro' : level === 'warning' ? 'Precisa de atenção' : 'Informação'}
      </Chip>
      <span className="text-xs text-muted">{reasons.join(' · ')}</span>
    </div>
  );
}

function PageFrame({
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

function ErrorState({ error, retry }: { error: Error; retry: () => void }) {
  const forbidden = error instanceof ApiError && error.status === 403;
  return (
    <Alert status="danger">
      <Alert.Indicator />
      <Alert.Content>
        <Alert.Title>{forbidden ? 'Sem permissão' : 'Não foi possível carregar'}</Alert.Title>
        <Alert.Description>
          {forbidden
            ? 'Seu perfil não possui autorização administrativa para consultar o Acompanhamento.'
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

function FilterSelect({
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
      placeholder="Todos"
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
          {(option) => (
            <ListBox.Item id={option.id} textValue={option.label}>
              {option.label}
              <ListBox.ItemIndicator />
            </ListBox.Item>
          )}
        </ListBox>
      </Select.Popover>
    </Select>
  );
}

function SummaryCards({ summary }: { summary: AcompanhamentoSummary }) {
  const cards = [
    ['Turmas', summary.classGroups],
    ['Professores', summary.teachers],
    ['Modelos conectados', `${summary.connectedModels} de ${summary.models}`],
    ['Pendências abertas', summary.openFindings],
    ['Precisam de atenção', summary.needsAttention],
    ['Sync ligado', summary.syncEnabled],
  ];
  return (
    <div className="bn-acompanhamento-metrics">
      {cards.map(([label, value]) => (
        <Card key={label} variant="default">
          <Card.Header>
            <Card.Description>{label}</Card.Description>
            <Card.Title className="text-2xl">{value}</Card.Title>
          </Card.Header>
        </Card>
      ))}
    </div>
  );
}

export function AcompanhamentoPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [summary, setSummary] = useState<AcompanhamentoSummary | null>(null);
  const [result, setResult] = useState<AcompanhamentoListResult | null>(null);
  const [summaryError, setSummaryError] = useState<Error | null>(null);
  const [listError, setListError] = useState<Error | null>(null);
  const [search, setSearch] = useState(params.get('q') ?? '');
  const [reload, setReload] = useState(0);

  const updateParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    next.set('page', '1');
    setParams(next);
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (search !== (params.get('q') ?? '')) updateParam('q', search.trim());
    }, 350);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    const controller = new AbortController();
    setSummaryError(null);
    void get<AcompanhamentoSummary>('/v1/acompanhamento/summary', controller.signal)
      .then(setSummary)
      .catch((error: unknown) => {
        if ((error as Error).name !== 'AbortError') setSummaryError(error as Error);
      });
    return () => controller.abort();
  }, [reload]);

  useEffect(() => {
    const controller = new AbortController();
    setListError(null);
    const query = params.toString();
    void get<AcompanhamentoListResult>(
      `/v1/acompanhamento/turmas${query ? `?${query}` : ''}`,
      controller.signal,
    )
      .then(setResult)
      .catch((error: unknown) => {
        if ((error as Error).name !== 'AbortError') setListError(error as Error);
      });
    return () => controller.abort();
  }, [params, reload]);

  const filteredClasses = useMemo(
    () =>
      summary?.filters.classGroups.filter(
        (group) => !params.get('schoolYearId') || group.schoolYearId === params.get('schoolYearId'),
      ) ?? [],
    [params, summary],
  );
  const retry = () => setReload((value) => value + 1);
  const returnQuery = params.toString();
  const pendingParams = new URLSearchParams();
  ['schoolYearId', 'classGroupId', 'teacherId', 'q'].forEach((key) => {
    const value = params.get(key);
    if (value) pendingParams.set(key, value);
  });

  return (
    <PageFrame
      title="Acompanhamento"
      description="Visão operacional read-only de turmas, professores, modelos, fontes, notas disponíveis e pendências reais do Banco de Notas."
    >
      <div className="mb-5 flex justify-end">
        <Button
          variant="outline"
          onPress={() =>
            navigate(`/pendencias${pendingParams.toString() ? `?${pendingParams}` : ''}`)
          }
        >
          Ver todas as pendências <ArrowRight className="size-4" />
        </Button>
      </div>
      {summaryError && result && (
        <Alert status="warning" className="mb-5">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>Visão parcial</Alert.Title>
            <Alert.Description>
              A lista está disponível, mas o resumo não pôde ser atualizado agora.
            </Alert.Description>
          </Alert.Content>
        </Alert>
      )}

      {!summary && !summaryError ? (
        <div className="bn-acompanhamento-metrics" aria-label="Carregando resumo">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-28 rounded-2xl" />
          ))}
        </div>
      ) : summary ? (
        <>
          <SummaryCards summary={summary} />
          <div className="mt-5 grid gap-5 xl:grid-cols-2">
            <Card variant="default">
              <Card.Header>
                <Card.Title>Estados dos modelos</Card.Title>
                <Card.Description>
                  Distribuição sustentada pelos teacher models no D1.
                </Card.Description>
              </Card.Header>
              <Card.Content className="flex flex-wrap gap-2">
                {summary.modelStates.length ? (
                  summary.modelStates.map((state) => (
                    <Chip key={state.state} variant="soft">
                      {modelLabels[state.state] ?? state.state}: {state.total}
                    </Chip>
                  ))
                ) : (
                  <span className="text-sm text-muted">Nenhum modelo registrado.</span>
                )}
              </Card.Content>
            </Card>
            <Card variant="default">
              <Card.Header>
                <Card.Title>Atividade recente</Card.Title>
                <Card.Description>Últimas mudanças operacionais registradas.</Card.Description>
              </Card.Header>
              <Card.Content className="grid gap-3">
                {summary.recentActivity.length ? (
                  summary.recentActivity.slice(0, 5).map((activity, index) => (
                    <div
                      key={`${activity.kind}:${activity.occurredAt}:${index}`}
                      className="flex items-start justify-between gap-3 rounded-xl border border-border p-3"
                    >
                      <div>
                        <p className="text-sm font-medium">{activity.label}</p>
                        <p className="text-xs text-muted">
                          {activity.kind === 'model'
                            ? 'Modelo'
                            : activity.kind === 'import'
                              ? 'Importação'
                              : 'Reconciliação'}{' '}
                          · {modelLabels[activity.status] ?? activity.status}
                        </p>
                      </div>
                      <span className="whitespace-nowrap text-xs text-muted">
                        {formatDate(activity.occurredAt)}
                      </span>
                    </div>
                  ))
                ) : (
                  <span className="text-sm text-muted">Nenhuma atividade registrada.</span>
                )}
              </Card.Content>
            </Card>
          </div>
        </>
      ) : null}

      <Surface className="bn-card mt-5" aria-label="Filtros de acompanhamento">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <SearchField value={search} onChange={setSearch} aria-label="Pesquisar acompanhamento">
            <Label>Pesquisar</Label>
            <SearchField.Group>
              <Search className="size-4 text-muted" />
              <SearchField.Input placeholder="Turma, professor ou componente" />
              <SearchField.ClearButton />
            </SearchField.Group>
          </SearchField>
          <FilterSelect
            label="Ano letivo"
            value={params.get('schoolYearId') ?? ''}
            options={summary?.filters.schoolYears ?? []}
            onChange={(value) => updateParam('schoolYearId', value)}
          />
          <FilterSelect
            label="Turma"
            value={params.get('classGroupId') ?? ''}
            options={filteredClasses}
            onChange={(value) => updateParam('classGroupId', value)}
          />
          <FilterSelect
            label="Professor"
            value={params.get('teacherId') ?? ''}
            options={summary?.filters.teachers ?? []}
            onChange={(value) => updateParam('teacherId', value)}
          />
          <FilterSelect
            label="Estado do modelo"
            value={params.get('modelState') ?? ''}
            options={Object.entries(modelLabels).map(([id, label]) => ({ id, label }))}
            onChange={(value) => updateParam('modelState', value)}
          />
          <FilterSelect
            label="Sincronização"
            value={params.get('sync') ?? ''}
            options={[
              { id: 'enabled', label: 'Ligada' },
              { id: 'disabled', label: 'Desligada' },
            ]}
            onChange={(value) => updateParam('sync', value)}
          />
          <FilterSelect
            label="Situação"
            value={params.get('attention') ?? ''}
            options={[
              { id: 'needs_attention', label: 'Precisa de atenção' },
              { id: 'normal', label: 'Sem atenção crítica' },
            ]}
            onChange={(value) => updateParam('attention', value)}
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

      {listError ? (
        <div className="mt-5">
          <ErrorState error={listError} retry={retry} />
        </div>
      ) : !result ? (
        <Skeleton className="mt-5 h-80 rounded-2xl" aria-label="Carregando lista" />
      ) : result.items.length === 0 ? (
        <Surface className="bn-card mt-5 text-center">
          <BarChart3 className="mx-auto size-8 text-muted" />
          <h2 className="mt-3 font-semibold">
            {params.toString()
              ? 'Nenhum resultado para estes filtros'
              : 'Nada para acompanhar ainda'}
          </h2>
          <p className="mt-2 text-sm text-muted">
            {params.toString()
              ? 'Ajuste ou limpe os filtros para ampliar a pesquisa.'
              : 'Turmas com atribuições docentes aparecerão aqui quando existirem no D1.'}
          </p>
        </Surface>
      ) : (
        <Card variant="default" className="mt-5 overflow-hidden">
          <Card.Header className="border-b border-border/60">
            <Card.Title>Turmas e modelos</Card.Title>
            <Card.Description>{result.total} acompanhamento(s) encontrado(s).</Card.Description>
          </Card.Header>
          <Card.Content className="p-0">
            <Table variant="secondary">
              <Table.ScrollContainer>
                <Table.Content aria-label="Acompanhamento de turmas e modelos">
                  <Table.Header>
                    <Table.Column id="class">Turma</Table.Column>
                    <Table.Column id="teacher">Professor</Table.Column>
                    <Table.Column id="model">Modelo e fonte</Table.Column>
                    <Table.Column id="sync">Sync</Table.Column>
                    <Table.Column id="attention">Situação</Table.Column>
                    <Table.Column id="activity">Atividade</Table.Column>
                    <Table.Column id="action">Ação</Table.Column>
                  </Table.Header>
                  <Table.Body>
                    {result.items.map((row) => (
                      <Table.Row
                        id={`${row.classGroupId}:${row.teacherId}`}
                        key={`${row.classGroupId}:${row.teacherId}`}
                      >
                        <Table.Cell>
                          <div className="min-w-40">
                            <p className="font-medium">{row.classGroupName}</p>
                            <p className="text-xs text-muted">{row.schoolYearName}</p>
                          </div>
                        </Table.Cell>
                        <Table.Cell>
                          <Button
                            size="sm"
                            variant="ghost"
                            onPress={() =>
                              navigate(
                                `/professores/${row.teacherId}?retorno=${encodeURIComponent(`/acompanhamento${returnQuery ? `?${returnQuery}` : ''}`)}&schoolYearId=${row.schoolYearId}`,
                              )
                            }
                          >
                            {row.teacherName}
                          </Button>
                          <p className="text-xs text-muted">
                            {row.components.join(', ') || 'Componente não informado'}
                          </p>
                        </Table.Cell>
                        <Table.Cell>
                          <div className="grid min-w-44 gap-1">
                            <StateChip state={row.modelState} />
                            <span className="text-xs text-muted">
                              {row.sourceName ?? 'Fonte não configurada'}
                            </span>
                          </div>
                        </Table.Cell>
                        <Table.Cell>
                          <Chip
                            size="sm"
                            variant="soft"
                            color={row.syncEnabled ? 'accent' : 'default'}
                          >
                            {row.syncEnabled ? 'Ligada' : 'Desligada'}
                          </Chip>
                        </Table.Cell>
                        <Table.Cell>
                          <AttentionChip
                            level={row.attentionLevel}
                            reasons={row.attentionReasons}
                          />
                        </Table.Cell>
                        <Table.Cell className="whitespace-nowrap text-sm text-muted">
                          {formatDate(row.lastActivityAt)}
                        </Table.Cell>
                        <Table.Cell>
                          <Button
                            size="sm"
                            variant="outline"
                            onPress={() =>
                              navigate(
                                `/acompanhamento/turmas/${row.classGroupId}?retorno=${encodeURIComponent(returnQuery)}`,
                              )
                            }
                          >
                            Ver acompanhamento <ArrowRight className="size-4" />
                          </Button>
                        </Table.Cell>
                      </Table.Row>
                    ))}
                  </Table.Body>
                </Table.Content>
              </Table.ScrollContainer>
            </Table>
          </Card.Content>
          <Card.Footer className="justify-between border-t border-border/60">
            <span className="text-sm text-muted">
              Página {result.page} de {Math.max(result.totalPages, 1)}
            </span>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                isDisabled={result.page <= 1}
                onPress={() => updateParam('page', String(result.page - 1))}
              >
                Anterior
              </Button>
              <Button
                size="sm"
                variant="outline"
                isDisabled={result.page >= result.totalPages}
                onPress={() => updateParam('page', String(result.page + 1))}
              >
                Próxima
              </Button>
            </div>
          </Card.Footer>
        </Card>
      )}
    </PageFrame>
  );
}

export function AcompanhamentoDetailPage() {
  const navigate = useNavigate();
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const [detail, setDetail] = useState<AcompanhamentoDetail | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [reload, setReload] = useState(0);
  const returnParams = params.get('retorno') ?? '';
  const backHref =
    returnParams.startsWith('/') && !returnParams.startsWith('//')
      ? returnParams
      : `/acompanhamento${returnParams ? `?${returnParams}` : ''}`;

  useEffect(() => {
    const controller = new AbortController();
    setError(null);
    setDetail(null);
    void get<AcompanhamentoDetail>(`/v1/acompanhamento/turmas/${id}`, controller.signal)
      .then(setDetail)
      .catch((caught: unknown) => {
        if ((caught as Error).name !== 'AbortError') setError(caught as Error);
      });
    return () => controller.abort();
  }, [id, reload]);

  return (
    <PageFrame
      title={detail?.classGroup.name ?? 'Detalhe da turma'}
      description="Contexto operacional da turma, seus professores, modelos, fonte autoritativa, notas disponíveis e pendências."
    >
      <Button variant="outline" size="sm" onPress={() => navigate(backHref)} className="mb-5">
        <ArrowLeft className="size-4" /> Voltar ao acompanhamento
      </Button>
      {detail && (
        <Button
          variant="outline"
          size="sm"
          onPress={() => navigate(`/turmas/${detail.classGroup.id}`)}
          className="mb-5 ml-2"
        >
          Ver página da turma <ArrowRight className="size-4" />
        </Button>
      )}
      {detail && (
        <Button
          variant="outline"
          size="sm"
          onPress={() => navigate(`/pendencias?classGroupId=${detail.classGroup.id}`)}
          className="mb-5 ml-2"
        >
          Ver pendências <CircleAlert className="size-4" />
        </Button>
      )}
      {error ? (
        <ErrorState error={error} retry={() => setReload((value) => value + 1)} />
      ) : !detail ? (
        <div className="grid gap-4">
          <Skeleton className="h-36 rounded-2xl" />
          <Skeleton className="h-72 rounded-2xl" />
        </div>
      ) : (
        <div className="grid gap-5">
          <div className="bn-acompanhamento-metrics">
            <Card>
              <Card.Header>
                <Card.Description>Ano letivo</Card.Description>
                <Card.Title>{detail.classGroup.schoolYearName}</Card.Title>
              </Card.Header>
            </Card>
            <Card>
              <Card.Header>
                <Card.Description>Professores/componentes</Card.Description>
                <Card.Title>{detail.assignments.length}</Card.Title>
              </Card.Header>
            </Card>
            <Card>
              <Card.Header>
                <Card.Description>Snapshots de notas</Card.Description>
                <Card.Title>{detail.notes.snapshots}</Card.Title>
              </Card.Header>
            </Card>
            <Card>
              <Card.Header>
                <Card.Description>Pendências abertas</Card.Description>
                <Card.Title>
                  {detail.findings.filter((finding) => finding.status === 'open').length}
                </Card.Title>
              </Card.Header>
            </Card>
          </div>

          <Card className="overflow-hidden">
            <Card.Header>
              <Card.Title>Professores, modelos e fontes</Card.Title>
              <Card.Description>
                A autoridade exibida é a configuração vigente no D1.
              </Card.Description>
            </Card.Header>
            <Card.Content className="p-0">
              <Table variant="secondary">
                <Table.ScrollContainer>
                  <Table.Content aria-label="Professores e modelos da turma">
                    <Table.Header>
                      <Table.Column id="teacher">Professor</Table.Column>
                      <Table.Column id="component">Componente</Table.Column>
                      <Table.Column id="model">Modelo</Table.Column>
                      <Table.Column id="source">Fonte</Table.Column>
                      <Table.Column id="sync">Sync</Table.Column>
                      <Table.Column id="activity">Última atividade</Table.Column>
                    </Table.Header>
                    <Table.Body>
                      {detail.assignments.map((assignment) => (
                        <Table.Row
                          id={`${assignment.teacherId}:${assignment.componentName}`}
                          key={`${assignment.teacherId}:${assignment.componentName}`}
                        >
                          <Table.Cell>
                            <Button
                              size="sm"
                              variant="ghost"
                              onPress={() =>
                                navigate(
                                  `/professores/${assignment.teacherId}?retorno=${encodeURIComponent(`/acompanhamento/turmas/${id}`)}&schoolYearId=${detail.classGroup.schoolYearId}`,
                                )
                              }
                            >
                              {assignment.teacherName}
                            </Button>
                          </Table.Cell>
                          <Table.Cell>{assignment.componentName}</Table.Cell>
                          <Table.Cell>
                            <StateChip state={assignment.modelState} />
                          </Table.Cell>
                          <Table.Cell>
                            <p>{assignment.sourceName ?? 'Não configurada'}</p>
                            <p className="text-xs text-muted">
                              {assignment.sourceAuthority ?? 'Sem autoridade vigente'}
                            </p>
                          </Table.Cell>
                          <Table.Cell>
                            {assignment.modelSyncEnabled ? 'Ligada' : 'Desligada'}
                          </Table.Cell>
                          <Table.Cell className="whitespace-nowrap text-muted">
                            {formatDate(assignment.lastActivityAt)}
                          </Table.Cell>
                        </Table.Row>
                      ))}
                    </Table.Body>
                  </Table.Content>
                </Table.ScrollContainer>
              </Table>
            </Card.Content>
          </Card>

          <Card className="overflow-hidden">
            <Card.Header>
              <Card.Title>Campos e períodos com snapshot</Card.Title>
              <Card.Description>
                Contagem factual por campo; não representa percentual de lançamento.
              </Card.Description>
            </Card.Header>
            <Card.Content className="p-0">
              {detail.notes.byField.length === 0 ? (
                <div className="p-6 text-sm text-muted">
                  Nenhum snapshot de nota está disponível para esta turma.
                </div>
              ) : (
                <Table variant="secondary">
                  <Table.ScrollContainer>
                    <Table.Content aria-label="Campos e períodos com snapshot">
                      <Table.Header>
                        <Table.Column id="field">Campo/período</Table.Column>
                        <Table.Column id="snapshots">Snapshots</Table.Column>
                        <Table.Column id="present">Presentes</Table.Column>
                        <Table.Column id="absent">Ausências explícitas</Table.Column>
                        <Table.Column id="zero">Zeros numéricos</Table.Column>
                        <Table.Column id="updated">Atualização</Table.Column>
                      </Table.Header>
                      <Table.Body>
                        {detail.notes.byField.map((field) => (
                          <Table.Row id={field.field} key={field.field}>
                            <Table.Cell className="font-medium">{field.field}</Table.Cell>
                            <Table.Cell>{field.snapshots}</Table.Cell>
                            <Table.Cell>{field.presentValues}</Table.Cell>
                            <Table.Cell>{field.absentValues}</Table.Cell>
                            <Table.Cell>{field.numericZeroValues}</Table.Cell>
                            <Table.Cell className="whitespace-nowrap text-muted">
                              {formatDate(field.lastUpdatedAt)}
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
              <Card.Title>Alunos e dados de nota disponíveis</Card.Title>
              <Card.Description>
                Relações derivadas dos mappings canônicos do modelo. Zero numérico e ausência
                permanecem distintos.
              </Card.Description>
            </Card.Header>
            <Card.Content className="p-0">
              {detail.students.length === 0 ? (
                <div className="p-6 text-sm text-muted">
                  Não há roster canônico persistido nos mappings desta turma. Nenhum aluno foi
                  inferido ou inventado.
                </div>
              ) : (
                <Table variant="secondary">
                  <Table.ScrollContainer>
                    <Table.Content aria-label="Alunos e notas disponíveis">
                      <Table.Header>
                        <Table.Column id="student">Aluno</Table.Column>
                        <Table.Column id="fields">Campos</Table.Column>
                        <Table.Column id="present">Valores presentes</Table.Column>
                        <Table.Column id="absent">Ausências explícitas</Table.Column>
                        <Table.Column id="zero">Zeros numéricos</Table.Column>
                        <Table.Column id="updated">Atualização</Table.Column>
                      </Table.Header>
                      <Table.Body>
                        {detail.students.map((student) => (
                          <Table.Row id={student.id} key={student.id}>
                            <Table.Cell className="font-medium">{student.displayName}</Table.Cell>
                            <Table.Cell>{student.fieldsAvailable}</Table.Cell>
                            <Table.Cell>{student.presentValues}</Table.Cell>
                            <Table.Cell>{student.absentValues}</Table.Cell>
                            <Table.Cell>{student.numericZeroValues}</Table.Cell>
                            <Table.Cell className="whitespace-nowrap text-muted">
                              {formatDate(student.lastUpdatedAt)}
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
              <Card.Title>Pendências de importação</Card.Title>
              <Card.Description>
                Leitura do histórico; nenhuma resolução destrutiva é feita nesta tela.
              </Card.Description>
            </Card.Header>
            <Card.Content className="p-0">
              {detail.findings.length === 0 ? (
                <div className="flex items-center gap-3 p-6 text-sm text-muted">
                  <CircleAlert className="size-5" /> Nenhum finding relacionado foi registrado.
                </div>
              ) : (
                <Table variant="secondary">
                  <Table.ScrollContainer>
                    <Table.Content aria-label="Pendências da turma">
                      <Table.Header>
                        <Table.Column id="severity">Severidade</Table.Column>
                        <Table.Column id="code">Pendência</Table.Column>
                        <Table.Column id="status">Estado</Table.Column>
                        <Table.Column id="import">Importação</Table.Column>
                        <Table.Column id="date">Data</Table.Column>
                      </Table.Header>
                      <Table.Body>
                        {detail.findings.map((finding, index) => (
                          <Table.Row
                            id={`${finding.code}:${index}`}
                            key={`${finding.code}:${index}`}
                          >
                            <Table.Cell>
                              <Chip
                                size="sm"
                                variant="soft"
                                color={
                                  finding.severity === 'error'
                                    ? 'danger'
                                    : finding.severity === 'warning'
                                      ? 'warning'
                                      : 'default'
                                }
                              >
                                {finding.severity}
                              </Chip>
                            </Table.Cell>
                            <Table.Cell className="font-medium">{finding.code}</Table.Cell>
                            <Table.Cell>
                              {finding.status === 'open' ? 'Pendente' : 'Resolvida'}
                            </Table.Cell>
                            <Table.Cell>{finding.importState}</Table.Cell>
                            <Table.Cell className="whitespace-nowrap text-muted">
                              {formatDate(finding.occurredAt)}
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
        </div>
      )}
    </PageFrame>
  );
}
