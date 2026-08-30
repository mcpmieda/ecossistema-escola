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
import { ArrowLeft, ArrowRight, BookOpenCheck, RefreshCw, Search, Users } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type {
  AlunoDetail,
  AlunoListItem,
  PageResult,
  TurmaDetail,
  TurmaListItem,
  TurmasAlunosFilters,
} from '../../shared/banco-notas-turmas-alunos';

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
    throw new ApiError(payload.message ?? 'Não foi possível carregar os dados.', response.status);
  return payload;
}
function date(value: string | null) {
  if (!value) return 'Sem nota registrada';
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
function useDirectory<T>(endpoint: string) {
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get('q') ?? '');
  const [result, setResult] = useState<PageResult<T> | null>(null);
  const [filters, setFilters] = useState<TurmasAlunosFilters | null>(null);
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
    void get<PageResult<T>>(
      `${endpoint}${params.toString() ? `?${params}` : ''}`,
      controller.signal,
    )
      .then(setResult)
      .catch((caught: unknown) => {
        if ((caught as Error).name !== 'AbortError') setError(caught as Error);
      });
    void get<TurmasAlunosFilters>('/v1/turmas-alunos/filters', controller.signal)
      .then(setFilters)
      .catch((caught: unknown) => {
        if ((caught as Error).name !== 'AbortError') setFiltersError(true);
      });
    return () => controller.abort();
  }, [endpoint, params, reload]);
  return {
    params,
    setParams,
    search,
    setSearch,
    result,
    filters,
    filtersError,
    error,
    update,
    retry: () => setReload((value) => value + 1),
  };
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

export function TurmasPage() {
  const navigate = useNavigate();
  const state = useDirectory<TurmaListItem>('/v1/turmas');
  return (
    <Frame
      title="Turmas"
      description="Diretório read-only de turmas e alunos derivados exclusivamente dos mappings canônicos da versão mais recente de cada modelo docente."
    >
      <Surface className="bn-card">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <SearchField
            value={state.search}
            onChange={state.setSearch}
            aria-label="Pesquisar turmas"
          >
            <Label>Pesquisar</Label>
            <SearchField.Group>
              <Search className="size-4 text-muted" />
              <SearchField.Input placeholder="Nome da turma" />
              <SearchField.ClearButton />
            </SearchField.Group>
          </SearchField>
          <Filter
            label="Ano letivo"
            value={state.params.get('schoolYearId') ?? ''}
            options={state.filters?.schoolYears ?? []}
            onChange={(value) => state.update('schoolYearId', value)}
          />
          <Filter
            label="Situação"
            value={state.params.get('status') ?? ''}
            options={[
              { id: 'active', label: 'Ativa' },
              { id: 'inactive', label: 'Inativa' },
            ]}
            onChange={(value) => state.update('status', value)}
          />
          <Filter
            label="Professor"
            value={state.params.get('teacherId') ?? ''}
            options={state.filters?.teachers ?? []}
            onChange={(value) => state.update('teacherId', value)}
          />
          <Filter
            label="Componente"
            value={state.params.get('componentId') ?? ''}
            options={
              state.filters?.components.filter(
                (item) =>
                  !state.params.get('schoolYearId') ||
                  item.schoolYearId === state.params.get('schoolYearId'),
              ) ?? []
            }
            onChange={(value) => state.update('componentId', value)}
          />
          <Filter
            label="Atenção"
            value={state.params.get('attention') ?? ''}
            options={[
              { id: 'needs_attention', label: 'Precisa de atenção' },
              { id: 'normal', label: 'Normal' },
            ]}
            onChange={(value) => state.update('attention', value)}
          />
        </div>
      </Surface>
      {state.filtersError && state.result && (
        <Alert status="warning" className="mt-5">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>Visão parcial</Alert.Title>
            <Alert.Description>
              A lista está disponível, mas as opções de filtro não puderam ser atualizadas.
            </Alert.Description>
          </Alert.Content>
        </Alert>
      )}
      {state.error ? (
        <div className="mt-5">
          <Failure error={state.error} retry={state.retry} />
        </div>
      ) : !state.result ? (
        <Skeleton className="mt-5 h-80 rounded-2xl" />
      ) : state.result.items.length === 0 ? (
        <Surface className="bn-card mt-5 text-center">
          <BookOpenCheck className="mx-auto size-8 text-muted" />
          <h2 className="mt-3 font-semibold">
            {state.params.toString()
              ? 'Nenhuma turma encontrada para estes filtros'
              : 'Nenhuma turma cadastrada'}
          </h2>
          <p className="mt-2 text-sm text-muted">
            Ajuste os filtros ou aguarde o cadastro institucional da turma.
          </p>
        </Surface>
      ) : (
        <Card className="mt-5 overflow-hidden">
          <Card.Header>
            <Card.Title>Turmas</Card.Title>
            <Card.Description>{state.result.total} turma(s) encontrada(s).</Card.Description>
          </Card.Header>
          <Card.Content className="p-0">
            <Table variant="secondary">
              <Table.ScrollContainer>
                <Table.Content aria-label="Diretório de turmas">
                  <Table.Header>
                    <Table.Column id="class">Turma</Table.Column>
                    <Table.Column id="students">Alunos canônicos</Table.Column>
                    <Table.Column id="context">Componentes/professores</Table.Column>
                    <Table.Column id="mapping">Campos mapeados</Table.Column>
                    <Table.Column id="models">Modelos</Table.Column>
                    <Table.Column id="attention">Situação</Table.Column>
                    <Table.Column id="updated">Última nota</Table.Column>
                    <Table.Column id="action">Ação</Table.Column>
                  </Table.Header>
                  <Table.Body>
                    {state.result.items.map((row) => (
                      <Table.Row id={row.id} key={row.id}>
                        <Table.Cell>
                          <p className="font-medium">{row.name}</p>
                          <p className="text-xs text-muted">{row.schoolYearName}</p>
                        </Table.Cell>
                        <Table.Cell>
                          {row.students > 0 ? row.students : 'Nenhum relacionado'}
                        </Table.Cell>
                        <Table.Cell>
                          {row.components} / {row.teachers}
                        </Table.Cell>
                        <Table.Cell>{row.mappedFields}</Table.Cell>
                        <Table.Cell>
                          {row.connectedModels} de {row.models}
                        </Table.Cell>
                        <Table.Cell>
                          <Chip
                            size="sm"
                            variant="soft"
                            color={
                              row.attentionLevel === 'normal'
                                ? 'success'
                                : row.attentionLevel === 'error'
                                  ? 'danger'
                                  : 'warning'
                            }
                          >
                            {row.attentionLevel === 'normal'
                              ? 'Normal'
                              : row.attentionReasons.join(' · ')}
                          </Chip>
                        </Table.Cell>
                        <Table.Cell className="whitespace-nowrap text-muted">
                          {date(row.lastUpdatedAt)}
                        </Table.Cell>
                        <Table.Cell>
                          <Button
                            size="sm"
                            variant="outline"
                            onPress={() =>
                              navigate(
                                `/turmas/${row.id}?retorno=${encodeURIComponent(state.params.toString())}`,
                              )
                            }
                          >
                            Ver turma <ArrowRight className="size-4" />
                          </Button>
                        </Table.Cell>
                      </Table.Row>
                    ))}
                  </Table.Body>
                </Table.Content>
              </Table.ScrollContainer>
            </Table>
          </Card.Content>
          <Pager result={state.result} update={state.update} />
        </Card>
      )}
    </Frame>
  );
}

export function AlunosPage() {
  const navigate = useNavigate();
  const state = useDirectory<AlunoListItem>('/v1/alunos');
  const groups = useMemo(
    () =>
      state.filters?.classGroups.filter(
        (group) =>
          !state.params.get('schoolYearId') ||
          group.schoolYearId === state.params.get('schoolYearId'),
      ) ?? [],
    [state.filters, state.params],
  );
  return (
    <Frame
      title="Alunos"
      description="Diretório global de alunos, incluindo registros ainda sem vínculo canônico e sem inferir matrículas por nome."
    >
      <Surface className="bn-card">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <SearchField
            value={state.search}
            onChange={state.setSearch}
            aria-label="Pesquisar alunos"
          >
            <Label>Pesquisar</Label>
            <SearchField.Group>
              <Search className="size-4 text-muted" />
              <SearchField.Input placeholder="Nome ou identificador" />
              <SearchField.ClearButton />
            </SearchField.Group>
          </SearchField>
          <Filter
            label="Ano letivo"
            value={state.params.get('schoolYearId') ?? ''}
            options={state.filters?.schoolYears ?? []}
            onChange={(value) => state.update('schoolYearId', value)}
          />
          <Filter
            label="Turma"
            value={state.params.get('classGroupId') ?? ''}
            options={groups}
            onChange={(value) => state.update('classGroupId', value)}
          />
          <Filter
            label="Situação"
            value={state.params.get('status') ?? ''}
            options={[
              { id: 'active', label: 'Ativo' },
              { id: 'inactive', label: 'Inativo' },
            ]}
            onChange={(value) => state.update('status', value)}
          />
          <Filter
            label="Relação com turma"
            value={state.params.get('relationship') ?? ''}
            options={[
              { id: 'related', label: 'Com turma relacionada' },
              { id: 'unrelated', label: 'Sem turma relacionada' },
            ]}
            onChange={(value) => state.update('relationship', value)}
          />
          <Filter
            label="Snapshots"
            value={state.params.get('snapshots') ?? ''}
            options={[
              { id: 'present', label: 'Com snapshots' },
              { id: 'none', label: 'Sem snapshots' },
            ]}
            onChange={(value) => state.update('snapshots', value)}
          />
        </div>
      </Surface>
      {state.filtersError && state.result && (
        <Alert status="warning" className="mt-5">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>Visão parcial</Alert.Title>
            <Alert.Description>
              A lista está disponível, mas as opções de filtro não puderam ser atualizadas.
            </Alert.Description>
          </Alert.Content>
        </Alert>
      )}
      {state.error ? (
        <div className="mt-5">
          <Failure error={state.error} retry={state.retry} />
        </div>
      ) : !state.result ? (
        <Skeleton className="mt-5 h-80 rounded-2xl" />
      ) : state.result.items.length === 0 ? (
        <Surface className="bn-card mt-5 text-center">
          <Users className="mx-auto size-8 text-muted" />
          <h2 className="mt-3 font-semibold">
            {state.params.toString()
              ? 'Nenhum aluno encontrado para estes filtros'
              : 'Nenhum aluno cadastrado'}
          </h2>
          <p className="mt-2 text-sm text-muted">
            Ajuste ou limpe os filtros para ampliar a pesquisa.
          </p>
        </Surface>
      ) : (
        <Card className="mt-5 overflow-hidden">
          <Card.Header>
            <Card.Title>Alunos</Card.Title>
            <Card.Description>{state.result.total} aluno(s) encontrado(s).</Card.Description>
          </Card.Header>
          <Card.Content className="p-0">
            <Table variant="secondary">
              <Table.ScrollContainer>
                <Table.Content aria-label="Diretório de alunos">
                  <Table.Header>
                    <Table.Column id="student">Aluno</Table.Column>
                    <Table.Column id="classes">Turmas</Table.Column>
                    <Table.Column id="years">Anos letivos</Table.Column>
                    <Table.Column id="fields">Campos mapeados</Table.Column>
                    <Table.Column id="snapshots">Snapshots atuais</Table.Column>
                    <Table.Column id="updated">Última nota</Table.Column>
                    <Table.Column id="action">Ação</Table.Column>
                  </Table.Header>
                  <Table.Body>
                    {state.result.items.map((row) => (
                      <Table.Row id={row.id} key={row.id}>
                        <Table.Cell>
                          <p className="font-medium">{row.displayName}</p>
                          <p className="text-xs text-muted">
                            {row.externalId ?? 'Sem identificador externo'}
                          </p>
                        </Table.Cell>
                        <Table.Cell>{row.classGroups}</Table.Cell>
                        <Table.Cell>{row.schoolYears}</Table.Cell>
                        <Table.Cell>{row.mappedFields}</Table.Cell>
                        <Table.Cell>{row.snapshots}</Table.Cell>
                        <Table.Cell className="whitespace-nowrap text-muted">
                          {date(row.lastUpdatedAt)}
                        </Table.Cell>
                        <Table.Cell>
                          <Button
                            size="sm"
                            variant="outline"
                            onPress={() =>
                              navigate(
                                `/alunos/${row.id}?retorno=${encodeURIComponent(state.params.toString())}`,
                              )
                            }
                          >
                            Ver aluno <ArrowRight className="size-4" />
                          </Button>
                        </Table.Cell>
                      </Table.Row>
                    ))}
                  </Table.Body>
                </Table.Content>
              </Table.ScrollContainer>
            </Table>
          </Card.Content>
          <Pager result={state.result} update={state.update} />
        </Card>
      )}
    </Frame>
  );
}

function useDetail<T>(endpoint: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setData(null);
    setError(null);
    void get<T>(endpoint, controller.signal)
      .then(setData)
      .catch((caught: unknown) => {
        if ((caught as Error).name !== 'AbortError') setError(caught as Error);
      });
    return () => controller.abort();
  }, [endpoint, reload]);
  return { data, error, retry: () => setReload((value) => value + 1) };
}
export function TurmaDetailPage() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const state = useDetail<TurmaDetail>(`/v1/turmas/${id}`);
  const returnParams = params.get('retorno') ?? '';
  const back =
    returnParams.startsWith('/') && !returnParams.startsWith('//')
      ? returnParams
      : `/turmas${returnParams ? `?${returnParams}` : ''}`;
  return (
    <Frame
      title={state.data?.classGroup.name ?? 'Detalhe da turma'}
      description="Alunos deduplicados por turma, com componentes, professores e disponibilidade factual de notas."
    >
      <div className="mb-5 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onPress={() => navigate(back)}>
          <ArrowLeft className="size-4" /> Voltar às turmas
        </Button>
      </div>
      {state.error ? (
        <Failure error={state.error} retry={state.retry} />
      ) : !state.data ? (
        <Skeleton className="h-80 rounded-2xl" />
      ) : (
        <div className="grid gap-5">
          <Surface className="bn-card">
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <p className="text-xs text-muted">Situação</p>
                <Chip
                  className="mt-2"
                  size="sm"
                  variant="soft"
                  color={state.data.classGroup.status === 'active' ? 'success' : 'default'}
                >
                  {state.data.classGroup.status === 'active' ? 'Ativa' : 'Inativa'}
                </Chip>
              </div>
              <div>
                <p className="text-xs text-muted">Alunos relacionados</p>
                <p className="mt-2 font-semibold">{state.data.students.length}</p>
              </div>
              <div>
                <p className="text-xs text-muted">Última atividade de nota</p>
                <p className="mt-2 text-sm">{date(state.data.lastUpdatedAt)}</p>
              </div>
            </div>
          </Surface>
          <div className="grid gap-5 xl:grid-cols-2">
            <Card>
              <Card.Header>
                <Card.Title>Professores e componentes</Card.Title>
                <Card.Description>
                  Assignments, modelos, fonte vigente e sincronização.
                </Card.Description>
              </Card.Header>
              <Card.Content className="grid gap-3">
                {state.data.assignments.length === 0 ? (
                  <p className="text-sm text-muted">Nenhuma atribuição docente ativa.</p>
                ) : (
                  state.data.assignments.map((assignment) => (
                    <div
                      key={`${assignment.teacherId}:${assignment.componentName}`}
                      className="rounded-xl border border-border p-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          onPress={() =>
                            navigate(
                              `/professores/${assignment.teacherId}?retorno=${encodeURIComponent(`/turmas/${id}`)}&schoolYearId=${state.data?.classGroup.schoolYearId ?? ''}`,
                            )
                          }
                        >
                          {assignment.teacherName}
                        </Button>
                        <Chip size="sm" variant="soft">
                          {assignment.modelState ?? 'Sem modelo'}
                        </Chip>
                      </div>
                      <p className="text-sm">{assignment.componentName}</p>
                      <p className="text-xs text-muted">
                        {assignment.sourceName ?? 'Fonte não configurada'} ·{' '}
                        {assignment.sourceAuthority ?? 'Sem autoridade vigente'} · sync{' '}
                        {assignment.modelSyncEnabled ? 'ligada' : 'desligada'}
                      </p>
                    </div>
                  ))
                )}
              </Card.Content>
            </Card>
            <Card>
              <Card.Header>
                <Card.Title>Pendências</Card.Title>
                <Card.Description>
                  Findings associados ao contexto docente da turma.
                </Card.Description>
              </Card.Header>
              <Card.Content className="grid gap-3">
                {state.data.findings.length === 0 ? (
                  <p className="text-sm text-muted">Nenhuma pendência registrada.</p>
                ) : (
                  state.data.findings.map((finding, index) => (
                    <div
                      key={`${finding.code}:${index}`}
                      className="flex items-center justify-between gap-3 rounded-xl border border-border p-3"
                    >
                      <div>
                        <strong>{finding.code}</strong>
                        <p className="text-xs text-muted">{date(finding.occurredAt)}</p>
                      </div>
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
                        {finding.status === 'open' ? 'Aberta' : 'Resolvida'}
                      </Chip>
                    </div>
                  ))
                )}
              </Card.Content>
            </Card>
          </div>
          <Card className="overflow-hidden">
            <Card.Header>
              <Card.Title>Alunos da turma</Card.Title>
              <Card.Description>
                {state.data.students.length} aluno(s) derivado(s) dos mappings canônicos ·{' '}
                {state.data.classGroup.schoolYearName}
              </Card.Description>
            </Card.Header>
            <Card.Content className="p-0">
              {state.data.students.length === 0 ? (
                <div className="p-6 text-sm text-muted">
                  Nenhum aluno aparece nos mappings canônicos mais recentes desta turma.
                </div>
              ) : (
                <Table variant="secondary">
                  <Table.ScrollContainer>
                    <Table.Content aria-label="Alunos canônicos da turma">
                      <Table.Header>
                        <Table.Column id="student">Aluno</Table.Column>
                        <Table.Column id="status">Status</Table.Column>
                        <Table.Column id="context">Componentes/professores</Table.Column>
                        <Table.Column id="fields">Campos</Table.Column>
                        <Table.Column id="values">Presentes / ausentes / zeros</Table.Column>
                        <Table.Column id="updated">Última atualização</Table.Column>
                        <Table.Column id="action">Ação</Table.Column>
                      </Table.Header>
                      <Table.Body>
                        {state.data.students.map((student) => (
                          <Table.Row id={student.id} key={student.id}>
                            <Table.Cell className="font-medium">{student.displayName}</Table.Cell>
                            <Table.Cell>
                              <Chip size="sm" variant="soft">
                                {student.status === 'active' ? 'Ativo' : 'Inativo'}
                              </Chip>
                            </Table.Cell>
                            <Table.Cell>
                              <p>{student.components.join(', ')}</p>
                              <p className="text-xs text-muted">{student.teachers.join(', ')}</p>
                            </Table.Cell>
                            <Table.Cell>{student.mappedFields}</Table.Cell>
                            <Table.Cell>
                              {student.presentValues} / {student.absentValues} /{' '}
                              {student.numericZeroValues}
                            </Table.Cell>
                            <Table.Cell className="whitespace-nowrap text-muted">
                              {date(student.lastUpdatedAt)}
                            </Table.Cell>
                            <Table.Cell>
                              <Button
                                size="sm"
                                variant="outline"
                                onPress={() =>
                                  navigate(
                                    `/alunos/${student.id}?retorno=${encodeURIComponent(`/turmas/${id}`)}`,
                                  )
                                }
                              >
                                Ver aluno <ArrowRight className="size-4" />
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
          </Card>
        </div>
      )}
    </Frame>
  );
}
export function AlunoDetailPage() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const state = useDetail<AlunoDetail>(`/v1/alunos/${id}`);
  const rawReturn = params.get('retorno') ?? '';
  const safeReturn =
    rawReturn.startsWith('/') && !rawReturn.startsWith('//')
      ? rawReturn
      : `/alunos${rawReturn ? `?${rawReturn}` : ''}`;
  return (
    <Frame
      title={state.data?.student.displayName ?? 'Detalhe do aluno'}
      description="Contextos canônicos por ano e turma, sem combinar alunos por semelhança de nome."
    >
      <Button className="mb-5" size="sm" variant="outline" onPress={() => navigate(safeReturn)}>
        <ArrowLeft className="size-4" /> Voltar
      </Button>
      {state.error ? (
        <Failure error={state.error} retry={state.retry} />
      ) : !state.data ? (
        <Skeleton className="h-80 rounded-2xl" />
      ) : (
        <div className="grid gap-5">
          <Surface className="bn-card">
            <div className="flex flex-wrap items-center gap-3">
              <Chip
                variant="soft"
                color={state.data.student.status === 'active' ? 'success' : 'default'}
              >
                {state.data.student.status === 'active' ? 'Ativo' : 'Inativo'}
              </Chip>
              <span className="text-sm text-muted">
                {state.data.student.externalId ?? 'Sem identificador externo'}
              </span>
            </div>
          </Surface>
          <Card className="overflow-hidden">
            <Card.Header>
              <Card.Title>Turmas e componentes</Card.Title>
              <Card.Description>
                {state.data.contexts.length} contexto(s) canônico(s).
              </Card.Description>
            </Card.Header>
            <Card.Content className="p-0">
              {state.data.contexts.length === 0 ? (
                <div className="p-6 text-sm text-muted">
                  Este aluno existe no cadastro, mas ainda não aparece nos mappings canônicos mais
                  recentes.
                </div>
              ) : (
                <Table variant="secondary">
                  <Table.ScrollContainer>
                    <Table.Content aria-label="Contextos canônicos do aluno">
                      <Table.Header>
                        <Table.Column id="class">Turma</Table.Column>
                        <Table.Column id="context">Componentes/professores</Table.Column>
                        <Table.Column id="fields">Campos</Table.Column>
                        <Table.Column id="values">Presentes / ausentes / zeros</Table.Column>
                        <Table.Column id="findings">Pendências</Table.Column>
                        <Table.Column id="action">Ação</Table.Column>
                      </Table.Header>
                      <Table.Body>
                        {state.data.contexts.map((context) => (
                          <Table.Row
                            id={`${context.schoolYearId}:${context.classGroupId}`}
                            key={`${context.schoolYearId}:${context.classGroupId}`}
                          >
                            <Table.Cell>
                              <p className="font-medium">{context.classGroupName}</p>
                              <p className="text-xs text-muted">{context.schoolYearName}</p>
                            </Table.Cell>
                            <Table.Cell>
                              <p>{context.components.join(', ')}</p>
                              <p className="text-xs text-muted">{context.teachers.join(', ')}</p>
                            </Table.Cell>
                            <Table.Cell>{context.mappedFields}</Table.Cell>
                            <Table.Cell>
                              {context.presentValues} / {context.absentValues} /{' '}
                              {context.numericZeroValues}
                            </Table.Cell>
                            <Table.Cell>{context.openFindings}</Table.Cell>
                            <Table.Cell>
                              <Button
                                size="sm"
                                variant="outline"
                                onPress={() => navigate(`/turmas/${context.classGroupId}`)}
                              >
                                Ver turma <ArrowRight className="size-4" />
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
          </Card>
          {state.data.contexts.map((context) => (
            <Card
              key={`snapshots:${context.schoolYearId}:${context.classGroupId}`}
              className="overflow-hidden"
            >
              <Card.Header>
                <Card.Title>
                  {context.schoolYearName} · {context.classGroupName}
                </Card.Title>
                <Card.Description>
                  Snapshots atuais por componente e campo. Ausência explícita não é nota em branco.
                </Card.Description>
              </Card.Header>
              <Card.Content className="p-0">
                {context.snapshots.length === 0 ? (
                  <div className="p-6 text-sm text-muted">
                    Nenhum snapshot conhecido neste contexto.
                  </div>
                ) : (
                  <Table variant="secondary">
                    <Table.ScrollContainer>
                      <Table.Content aria-label={`Snapshots de ${context.classGroupName}`}>
                        <Table.Header>
                          <Table.Column id="component">Componente</Table.Column>
                          <Table.Column id="field">Campo</Table.Column>
                          <Table.Column id="value">Valor atual</Table.Column>
                          <Table.Column id="source">Origem</Table.Column>
                          <Table.Column id="updated">Atualização</Table.Column>
                        </Table.Header>
                        <Table.Body>
                          {context.snapshots.map((snapshot) => (
                            <Table.Row
                              id={`${snapshot.componentName}:${snapshot.field}`}
                              key={`${snapshot.componentName}:${snapshot.field}`}
                            >
                              <Table.Cell>{snapshot.componentName}</Table.Cell>
                              <Table.Cell className="font-medium">{snapshot.field}</Table.Cell>
                              <Table.Cell>
                                {snapshot.isAbsent ? (
                                  <Chip size="sm" variant="soft" color="warning">
                                    Ausência explícita
                                  </Chip>
                                ) : snapshot.valueNumeric !== null ? (
                                  snapshot.valueNumeric
                                ) : (
                                  (snapshot.valueText ?? 'Sem valor conhecido')
                                )}
                              </Table.Cell>
                              <Table.Cell>{snapshot.sourceName}</Table.Cell>
                              <Table.Cell className="whitespace-nowrap text-muted">
                                {date(snapshot.updatedAt)}
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
          ))}
        </div>
      )}
    </Frame>
  );
}
