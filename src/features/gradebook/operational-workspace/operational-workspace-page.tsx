import { useRef, useState } from 'react';
import { Alert, Button, Card, Chip, Label, SearchField, Spinner, Surface } from '@heroui/react';
import {
  BookOpenText,
  Building2,
  GraduationCap,
  Search,
  Shapes,
  UserRound,
  UsersRound,
} from 'lucide-react';
import type { AcademicYearId } from '../../../../shared/gradebook-contracts/entities';
import {
  GLOBAL_SEARCH_CONTRACT_VERSION_V1,
  GLOBAL_SEARCH_ORDER_V1,
  type GlobalSearchCursorV1,
  type GlobalSearchResultV1,
} from '../../../../shared/gradebook-contracts/search/global-search-contract-v1';
import {
  OPERATIONAL_WORKSPACE_CONTRACT_VERSION_V1,
  navigationIntentFromGlobalSearchResultV1,
  type OperationalWorkspaceAcademicYearOptionV1,
  type OperationalWorkspaceNavigationIntentV1,
} from '../../../../shared/gradebook-contracts/operational-workspace/operational-workspace-contract-v1';
import type {
  OperationalWorkspaceCenterViewV1,
  OperationalWorkspaceEntityLinkV1,
  OperationalWorkspaceStudentStatusV1,
  OperationalWorkspaceTeachingAssignmentV1,
  OperationalWorkspaceTransportRequestV1,
  OperationalWorkspaceTransportResponseV1,
} from '../../../../shared/gradebook-contracts/operational-workspace/operational-workspace-transport-v1';
import { requestOperationalWorkspaceV1 } from './operational-workspace-client';

type WorkspaceState = 'idle' | 'loading' | 'ready' | 'empty' | 'unavailable' | 'not-authorized';
type CenterKind = OperationalWorkspaceNavigationIntentV1['kind'];

const CENTER_KINDS: readonly CenterKind[] = ['student', 'class-group', 'teacher', 'subject'];
const CENTER_LABELS: Record<CenterKind, string> = {
  student: 'Aluno',
  'class-group': 'Turma',
  teacher: 'Professor',
  subject: 'Componente',
};

function centerIcon(kind: CenterKind) {
  switch (kind) {
    case 'student':
      return UserRound;
    case 'class-group':
      return UsersRound;
    case 'teacher':
      return GraduationCap;
    case 'subject':
      return Shapes;
  }
}

function resultLabel(result: GlobalSearchResultV1): string {
  return result.kind === 'class-group' ? result.code : result.displayName;
}

function statusLabel(status: OperationalWorkspaceStudentStatusV1['status']): string {
  switch (status) {
    case 'active':
      return 'Ativo';
    case 'transferred':
      return 'Transferido';
    case 'withdrawn':
      return 'Desistente';
    case 'deceased':
      return 'Falecido';
    default:
      return 'Outro';
  }
}

function lifecycleLabel(status: 'active' | 'inactive'): string {
  return status === 'active' ? 'Ativo' : 'Inativo';
}

function StateAlert({ state }: { state: Extract<WorkspaceState, 'empty' | 'unavailable' | 'not-authorized'> }) {
  if (state === 'not-authorized') {
    return (
      <Alert status="warning">
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Title>Acesso não autorizado</Alert.Title>
          <Alert.Description>
            Sua sessão não possui autorização para consultar as Centrais acadêmicas.
          </Alert.Description>
        </Alert.Content>
      </Alert>
    );
  }
  if (state === 'unavailable') {
    return (
      <Alert status="danger">
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Title>Centrais indisponíveis neste ambiente</Alert.Title>
          <Alert.Description>
            A consulta acadêmica permanece fechada quando o runtime local ou de preview não está disponível.
          </Alert.Description>
        </Alert.Content>
      </Alert>
    );
  }
  return (
    <Alert status="default">
      <Alert.Indicator />
      <Alert.Content>
        <Alert.Title>Nenhum ano acadêmico disponível</Alert.Title>
        <Alert.Description>
          O catálogo acadêmico não possui anos configurados para esta consulta.
        </Alert.Description>
      </Alert.Content>
    </Alert>
  );
}

function EntityLinkButton({
  link,
  onNavigate,
}: {
  link: OperationalWorkspaceEntityLinkV1;
  onNavigate: (intent: OperationalWorkspaceNavigationIntentV1) => void;
}) {
  return (
    <Button
      size="sm"
      variant="ghost"
      className="h-auto justify-start px-2 py-1 text-left"
      onPress={() => onNavigate({ kind: link.kind, id: link.id } as OperationalWorkspaceNavigationIntentV1)}
    >
      {link.label}
    </Button>
  );
}

function StatusHistory({ values }: { values: readonly OperationalWorkspaceStudentStatusV1[] }) {
  if (values.length === 0) return <span className="text-xs text-muted">Sem histórico de situação.</span>;
  return (
    <div className="flex flex-wrap gap-2">
      {values.map((status) => (
        <Chip key={status.id} size="sm" variant="soft">
          {statusLabel(status.status)}
          {status.occurredOn ? ` · ${status.occurredOn}` : ''}
        </Chip>
      ))}
    </div>
  );
}

function AssignmentList({
  assignments,
  onNavigate,
}: {
  assignments: readonly OperationalWorkspaceTeachingAssignmentV1[];
  onNavigate: (intent: OperationalWorkspaceNavigationIntentV1) => void;
}) {
  if (assignments.length === 0) {
    return <p className="text-sm text-muted">Nenhuma atribuição encontrada neste ano.</p>;
  }
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {assignments.map((assignment) => (
        <Surface key={assignment.id} variant="secondary" className="rounded-2xl p-4">
          <div className="grid gap-2 text-sm">
            {assignment.classGroup && (
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted">Turma</span>
                <EntityLinkButton link={assignment.classGroup} onNavigate={onNavigate} />
              </div>
            )}
            {assignment.teacher && (
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted">Professor</span>
                <EntityLinkButton link={assignment.teacher} onNavigate={onNavigate} />
              </div>
            )}
            {assignment.subject && (
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted">Componente</span>
                <EntityLinkButton link={assignment.subject} onNavigate={onNavigate} />
              </div>
            )}
          </div>
        </Surface>
      ))}
    </div>
  );
}

function CenterView({
  view,
  onNavigate,
  headingRef,
}: {
  view: OperationalWorkspaceCenterViewV1;
  onNavigate: (intent: OperationalWorkspaceNavigationIntentV1) => void;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
}) {
  if (view.kind === 'student') {
    return (
      <Card variant="default">
        <Card.Header>
          <div>
            <Card.Description>Central do Aluno</Card.Description>
            <Card.Title ref={headingRef} tabIndex={-1} className="mt-1 outline-none">
              {view.displayName}
            </Card.Title>
          </div>
        </Card.Header>
        <Card.Content className="grid gap-3">
          {view.enrollments.length === 0 ? (
            <p className="text-sm text-muted">Nenhuma matrícula encontrada neste ano.</p>
          ) : (
            view.enrollments.map((enrollment) => (
              <Surface key={enrollment.id} variant="secondary" className="rounded-2xl p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <Chip size="sm" variant="soft">
                    {enrollment.position === 'current' ? 'Posição atual' : 'Posição histórica'}
                  </Chip>
                  {enrollment.classGroup && (
                    <EntityLinkButton link={enrollment.classGroup} onNavigate={onNavigate} />
                  )}
                </div>
                <div className="mt-3">
                  <StatusHistory values={enrollment.statusHistory} />
                </div>
              </Surface>
            ))
          )}
        </Card.Content>
      </Card>
    );
  }

  if (view.kind === 'class-group') {
    return (
      <div className="grid gap-4">
        <Card variant="default">
          <Card.Header>
            <div>
              <Card.Description>Central da Turma</Card.Description>
              <Card.Title ref={headingRef} tabIndex={-1} className="mt-1 outline-none">
                {view.code}
              </Card.Title>
            </div>
            <Chip variant="soft">{view.schoolGrade} · {view.section}{view.shift ? ` · ${view.shift}` : ''}</Chip>
          </Card.Header>
          <Card.Content>
            <div className="grid gap-3 md:grid-cols-2">
              {view.students.map((entry) => (
                <Surface key={entry.id} variant="secondary" className="rounded-2xl p-4">
                  <div className="flex items-center justify-between gap-3">
                    {entry.student ? (
                      <EntityLinkButton link={entry.student} onNavigate={onNavigate} />
                    ) : (
                      <span className="text-sm text-muted">Aluno não disponível</span>
                    )}
                    <Chip size="sm" variant="soft">
                      {entry.position === 'current' ? 'Atual' : 'Histórica'}
                    </Chip>
                  </div>
                  <div className="mt-3">
                    <StatusHistory values={entry.statusHistory} />
                  </div>
                </Surface>
              ))}
              {view.students.length === 0 && (
                <p className="text-sm text-muted">Nenhum aluno encontrado nesta turma.</p>
              )}
            </div>
          </Card.Content>
        </Card>
        <Card variant="default">
          <Card.Header>
            <Card.Title>Atribuições</Card.Title>
          </Card.Header>
          <Card.Content>
            <AssignmentList assignments={view.assignments} onNavigate={onNavigate} />
          </Card.Content>
        </Card>
      </div>
    );
  }

  if (view.kind === 'teacher') {
    return (
      <Card variant="default">
        <Card.Header>
          <div>
            <Card.Description>Central do Professor</Card.Description>
            <Card.Title ref={headingRef} tabIndex={-1} className="mt-1 outline-none">
              {view.displayName}
            </Card.Title>
          </div>
          <Chip variant="soft">{lifecycleLabel(view.status)}</Chip>
        </Card.Header>
        <Card.Content>
          <AssignmentList assignments={view.assignments} onNavigate={onNavigate} />
        </Card.Content>
      </Card>
    );
  }

  return (
    <Card variant="default">
      <Card.Header>
        <div>
          <Card.Description>Central do Componente</Card.Description>
          <Card.Title ref={headingRef} tabIndex={-1} className="mt-1 outline-none">
            {view.displayName}
          </Card.Title>
          <p className="mt-1 text-xs text-muted">{view.code} · {view.shortName}</p>
        </div>
        <Chip variant="soft">{lifecycleLabel(view.status)}</Chip>
      </Card.Header>
      <Card.Content>
        <AssignmentList assignments={view.assignments} onNavigate={onNavigate} />
      </Card.Content>
    </Card>
  );
}

function stateFromResponse(response: OperationalWorkspaceTransportResponseV1): WorkspaceState {
  return response.state;
}

export function OperationalWorkspacePage() {
  const [activated, setActivated] = useState(false);
  const [workspaceState, setWorkspaceState] = useState<WorkspaceState>('idle');
  const [years, setYears] = useState<readonly OperationalWorkspaceAcademicYearOptionV1[]>([]);
  const [selectedAcademicYearId, setSelectedAcademicYearId] = useState<AcademicYearId | null>(null);
  const [activeCenter, setActiveCenter] = useState<CenterKind>('student');
  const [detailState, setDetailState] = useState<WorkspaceState>('empty');
  const [detail, setDetail] = useState<OperationalWorkspaceCenterViewV1 | null>(null);
  const [query, setQuery] = useState('');
  const [searchState, setSearchState] = useState<WorkspaceState>('empty');
  const [searchItems, setSearchItems] = useState<readonly GlobalSearchResultV1[]>([]);
  const [nextCursor, setNextCursor] = useState<GlobalSearchCursorV1 | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const detailHeadingRef = useRef<HTMLHeadingElement>(null);
  const detailSequence = useRef(0);
  const searchSequence = useRef(0);

  const loadBootstrap = async () => {
    if (workspaceState === 'loading' || workspaceState === 'ready') return;
    setActivated(true);
    setWorkspaceState('loading');
    try {
      const response = await requestOperationalWorkspaceV1({
        contractVersion: OPERATIONAL_WORKSPACE_CONTRACT_VERSION_V1,
        operation: 'bootstrap',
      });
      if ('availableAcademicYears' in response) {
        setYears(response.availableAcademicYears);
        setWorkspaceState(response.state);
      } else {
        setYears([]);
        setWorkspaceState(stateFromResponse(response));
      }
    } catch {
      setYears([]);
      setWorkspaceState('unavailable');
    }
  };

  const clearSelection = () => {
    detailSequence.current += 1;
    searchSequence.current += 1;
    setDetail(null);
    setDetailState('empty');
    setSearchItems([]);
    setNextCursor(null);
    setSearchState('empty');
  };

  const selectYear = (value: string) => {
    const selected = years.find((year) => year.id === value);
    setSelectedAcademicYearId(selected?.id ?? null);
    clearSelection();
    if (selected) window.requestAnimationFrame(() => searchInputRef.current?.focus());
  };

  const loadCenter = async (intent: OperationalWorkspaceNavigationIntentV1) => {
    if (!selectedAcademicYearId) return;
    const sequence = ++detailSequence.current;
    setActiveCenter(intent.kind);
    setDetail(null);
    setDetailState('loading');

    let request: OperationalWorkspaceTransportRequestV1;
    switch (intent.kind) {
      case 'student':
        request = {
          contractVersion: OPERATIONAL_WORKSPACE_CONTRACT_VERSION_V1,
          operation: 'student',
          academicYearId: selectedAcademicYearId,
          id: intent.id,
        };
        break;
      case 'class-group':
        request = {
          contractVersion: OPERATIONAL_WORKSPACE_CONTRACT_VERSION_V1,
          operation: 'class-group',
          academicYearId: selectedAcademicYearId,
          id: intent.id,
        };
        break;
      case 'teacher':
        request = {
          contractVersion: OPERATIONAL_WORKSPACE_CONTRACT_VERSION_V1,
          operation: 'teacher',
          academicYearId: selectedAcademicYearId,
          id: intent.id,
        };
        break;
      case 'subject':
        request = {
          contractVersion: OPERATIONAL_WORKSPACE_CONTRACT_VERSION_V1,
          operation: 'subject',
          academicYearId: selectedAcademicYearId,
          id: intent.id,
        };
        break;
    }

    try {
      const response = await requestOperationalWorkspaceV1(request);
      if (sequence !== detailSequence.current) return;
      if (response.state === 'ready' && 'view' in response) {
        setDetail(response.view);
        setDetailState('ready');
        window.requestAnimationFrame(() => detailHeadingRef.current?.focus());
        return;
      }
      setDetail(null);
      setDetailState(response.state);
    } catch {
      if (sequence !== detailSequence.current) return;
      setDetail(null);
      setDetailState('unavailable');
    }
  };

  const runSearch = async (cursor: GlobalSearchCursorV1 | null = null) => {
    if (!selectedAcademicYearId || !query.trim()) {
      setSearchItems([]);
      setNextCursor(null);
      setSearchState('empty');
      return;
    }
    const sequence = ++searchSequence.current;
    const append = cursor !== null;
    setSearchState('loading');
    try {
      const response = await requestOperationalWorkspaceV1({
        contractVersion: OPERATIONAL_WORKSPACE_CONTRACT_VERSION_V1,
        operation: 'search',
        request: {
          contractVersion: GLOBAL_SEARCH_CONTRACT_VERSION_V1,
          academicYearId: selectedAcademicYearId,
          query,
          scope: { kinds: CENTER_KINDS },
          page: { limit: 20, cursor },
          order: GLOBAL_SEARCH_ORDER_V1,
        },
      });
      if (sequence !== searchSequence.current) return;
      if (response.state === 'ready' && 'search' in response) {
        setSearchItems((current) => (append ? [...current, ...response.search.items] : response.search.items));
        setNextCursor(response.search.nextCursor);
        setSearchState('ready');
        return;
      }
      setSearchItems([]);
      setNextCursor(null);
      setSearchState(response.state);
    } catch {
      if (sequence !== searchSequence.current) return;
      setSearchItems([]);
      setNextCursor(null);
      setSearchState('unavailable');
    }
  };

  const chooseResult = (result: GlobalSearchResultV1) => {
    const intent = navigationIntentFromGlobalSearchResultV1(result);
    void loadCenter(intent);
  };

  return (
    <Surface
      variant="default"
      className="mt-6 rounded-[2rem] border border-border/70 p-5 shadow-sm sm:p-7"
      aria-busy={workspaceState === 'loading'}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted">
            <Building2 className="size-4" />
            Centrais acadêmicas
          </div>
          <h2 className="mt-3 text-2xl font-semibold tracking-[-0.035em] sm:text-3xl">
            Consulte aluno, turma, professor e componente
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            Escolha o ano acadêmico explicitamente e use a pesquisa autorizada para abrir uma Central.
          </p>
        </div>
        {!activated && (
          <Button variant="primary" onPress={() => void loadBootstrap()}>
            <BookOpenText className="size-4" />
            Abrir Centrais
          </Button>
        )}
      </div>

      {activated && workspaceState === 'loading' && (
        <div className="mt-6 flex items-center gap-3 text-sm text-muted" role="status">
          <Spinner size="sm" color="accent" />
          Carregando contexto acadêmico…
        </div>
      )}

      {activated &&
        (workspaceState === 'empty' ||
          workspaceState === 'unavailable' ||
          workspaceState === 'not-authorized') && (
          <div className="mt-6">
            <StateAlert state={workspaceState} />
          </div>
        )}

      {activated && workspaceState === 'ready' && (
        <div className="mt-6 grid gap-5">
          <Surface variant="secondary" className="rounded-2xl p-4 sm:p-5">
            <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)] lg:items-end">
              <div>
                <Label htmlFor="operational-academic-year" className="mb-1.5 block text-sm font-medium">
                  Ano acadêmico
                </Label>
                <select
                  id="operational-academic-year"
                  className="h-10 w-full rounded-xl border border-border bg-transparent px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-focus"
                  value={selectedAcademicYearId ?? ''}
                  onChange={(event) => selectYear(event.currentTarget.value)}
                >
                  <option value="">Selecione o ano</option>
                  {years.map((year) => (
                    <option key={year.id} value={year.id}>
                      {year.label}
                    </option>
                  ))}
                </select>
              </div>

              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void runSearch();
                }}
              >
                <SearchField
                  name="academic-operational-search"
                  fullWidth
                  value={query}
                  onChange={setQuery}
                  onClear={() => {
                    setQuery('');
                    setSearchItems([]);
                    setNextCursor(null);
                    setSearchState('empty');
                  }}
                  isDisabled={!selectedAcademicYearId || searchState === 'loading'}
                >
                  <Label>Pesquisar nas Centrais</Label>
                  <SearchField.Group>
                    <SearchField.SearchIcon />
                    <SearchField.Input
                      ref={searchInputRef}
                      placeholder={
                        selectedAcademicYearId
                          ? 'Nome do aluno, professor, turma ou componente'
                          : 'Selecione o ano primeiro'
                      }
                    />
                    <SearchField.ClearButton />
                    <Button
                      type="submit"
                      variant="primary"
                      size="sm"
                      isDisabled={!selectedAcademicYearId || !query.trim()}
                    >
                      <Search className="size-4" />
                      Buscar
                    </Button>
                  </SearchField.Group>
                </SearchField>
              </form>
            </div>
          </Surface>

          <nav aria-label="Centrais acadêmicas" className="flex flex-wrap gap-2">
            {CENTER_KINDS.map((kind) => {
              const Icon = centerIcon(kind);
              return (
                <Button
                  key={kind}
                  size="sm"
                  variant={activeCenter === kind ? 'primary' : 'secondary'}
                  aria-current={activeCenter === kind ? 'page' : undefined}
                  onPress={() => {
                    setActiveCenter(kind);
                    setDetail(null);
                    setDetailState('empty');
                  }}
                >
                  <Icon className="size-4" />
                  {CENTER_LABELS[kind]}
                </Button>
              );
            })}
          </nav>

          <div aria-live="polite">
            {searchState === 'loading' && (
              <div className="flex items-center gap-2 text-sm text-muted" role="status">
                <Spinner size="sm" color="accent" />
                Pesquisando…
              </div>
            )}
            {searchState === 'empty' && query.trim() && selectedAcademicYearId && (
              <p className="text-sm text-muted">Nenhum resultado encontrado para esta pesquisa.</p>
            )}
            {searchState === 'not-authorized' && <StateAlert state="not-authorized" />}
            {searchState === 'unavailable' && <StateAlert state="unavailable" />}
            {searchItems.length > 0 && (
              <Surface variant="secondary" className="rounded-2xl p-2">
                <ul aria-label="Resultados da pesquisa acadêmica" className="grid gap-1">
                  {searchItems.map((result) => {
                    const Icon = centerIcon(result.kind);
                    return (
                      <li key={`${result.kind}:${result.id}`}>
                        <Button
                          variant="ghost"
                          fullWidth
                          className="h-auto justify-start px-3 py-2 text-left"
                          onPress={() => chooseResult(result)}
                        >
                          <Icon className="size-4 shrink-0 text-muted" />
                          <span className="min-w-0 flex-1 truncate">{resultLabel(result)}</span>
                          <Chip size="sm" variant="soft">
                            {CENTER_LABELS[result.kind]}
                          </Chip>
                        </Button>
                      </li>
                    );
                  })}
                </ul>
                {nextCursor && (
                  <div className="flex justify-center p-2">
                    <Button size="sm" variant="outline" onPress={() => void runSearch(nextCursor)}>
                      Carregar mais resultados
                    </Button>
                  </div>
                )}
              </Surface>
            )}
          </div>

          <section aria-label={`Central do ${CENTER_LABELS[activeCenter]}`} aria-live="polite">
            {!selectedAcademicYearId && (
              <Surface variant="secondary" className="rounded-2xl p-6 text-center">
                <p className="font-medium">Selecione um ano acadêmico</p>
                <p className="mt-1 text-sm text-muted">
                  O sistema não escolhe o ano automaticamente.
                </p>
              </Surface>
            )}
            {selectedAcademicYearId && detailState === 'loading' && (
              <div className="flex items-center gap-2 text-sm text-muted" role="status">
                <Spinner size="sm" color="accent" />
                Carregando Central…
              </div>
            )}
            {selectedAcademicYearId && detailState === 'empty' && (
              <Surface variant="secondary" className="rounded-2xl p-6 text-center">
                <p className="font-medium">Central do {CENTER_LABELS[activeCenter]}</p>
                <p className="mt-1 text-sm text-muted">
                  Use a pesquisa acima para escolher uma identidade neste ano.
                </p>
              </Surface>
            )}
            {detailState === 'not-authorized' && <StateAlert state="not-authorized" />}
            {detailState === 'unavailable' && <StateAlert state="unavailable" />}
            {detailState === 'ready' && detail && (
              <CenterView view={detail} onNavigate={(intent) => void loadCenter(intent)} headingRef={detailHeadingRef} />
            )}
          </section>
        </div>
      )}
    </Surface>
  );
}
