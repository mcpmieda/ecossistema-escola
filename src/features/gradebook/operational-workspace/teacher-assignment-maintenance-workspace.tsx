import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Card, Chip, Label, SearchField, Spinner, Surface } from '@heroui/react';
import { BookUser, GraduationCap, Search, Settings2 } from 'lucide-react';

import type { AcademicYearId, TeacherId } from '../../../../shared/gradebook-contracts/entities';
import {
  GLOBAL_SEARCH_CONTRACT_VERSION_V1,
  GLOBAL_SEARCH_ORDER_V1,
  type GlobalSearchResultV1,
} from '../../../../shared/gradebook-contracts/search/global-search-contract-v1';
import {
  OPERATIONAL_WORKSPACE_CONTRACT_VERSION_V1,
  type OperationalWorkspaceAcademicYearOptionV1,
} from '../../../../shared/gradebook-contracts/operational-workspace/operational-workspace-contract-v1';
import { requestOperationalWorkspaceV1 } from './operational-workspace-client';
import { createOperationalWorkspaceRequestGate } from './operational-workspace-request-gate';
import { TeacherAssignmentMaintenancePanel } from './teacher-assignment-maintenance-panel';

type WorkspaceState = 'idle' | 'loading' | 'ready' | 'empty' | 'unavailable' | 'not-authorized';

function teacherLabel(result: GlobalSearchResultV1): string {
  return result.kind === 'teacher' ? result.displayName : '';
}

export function TeacherAssignmentMaintenanceWorkspace() {
  const [activated, setActivated] = useState(false);
  const [workspaceState, setWorkspaceState] = useState<WorkspaceState>('idle');
  const [years, setYears] = useState<readonly OperationalWorkspaceAcademicYearOptionV1[]>([]);
  const [academicYearId, setAcademicYearId] = useState<AcademicYearId | null>(null);
  const [query, setQuery] = useState('');
  const [searchState, setSearchState] = useState<WorkspaceState>('idle');
  const [searchItems, setSearchItems] = useState<readonly GlobalSearchResultV1[]>([]);
  const [teacherReference, setTeacherReference] = useState<TeacherId | null>(null);
  const bootstrapGate = useRef(createOperationalWorkspaceRequestGate());
  const searchGate = useRef(createOperationalWorkspaceRequestGate());
  const teacherHeadingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const bootstrap = bootstrapGate.current;
    const search = searchGate.current;
    return () => {
      bootstrap.invalidate();
      search.invalidate();
    };
  }, []);

  async function openWorkspace() {
    if (workspaceState === 'ready') return;
    const ticket = bootstrapGate.current.begin('teacher-maintenance-bootstrap');
    if (!ticket) return;
    setActivated(true);
    setWorkspaceState('loading');
    try {
      const response = await requestOperationalWorkspaceV1(
        { contractVersion: OPERATIONAL_WORKSPACE_CONTRACT_VERSION_V1, operation: 'bootstrap' },
        ticket.signal,
      );
      if (!ticket.isCurrent()) return;
      if ('availableAcademicYears' in response) {
        setYears(response.availableAcademicYears);
        setWorkspaceState(response.state);
      } else {
        setYears([]);
        setWorkspaceState(response.state);
      }
    } catch {
      if (!ticket.isCurrent()) return;
      setYears([]);
      setWorkspaceState('unavailable');
    } finally {
      ticket.complete();
    }
  }

  function selectYear(value: string) {
    const selected = years.find((year) => year.id === value)?.id ?? null;
    searchGate.current.invalidate();
    setAcademicYearId(selected);
    setQuery('');
    setSearchItems([]);
    setSearchState('idle');
    setTeacherReference(null);
  }

  async function searchTeacher() {
    const year = academicYearId;
    const submitted = query.trim();
    if (!year || !submitted) return;
    const ticket = searchGate.current.begin(JSON.stringify([year, submitted]));
    if (!ticket) return;
    setSearchState('loading');
    setSearchItems([]);
    try {
      const response = await requestOperationalWorkspaceV1(
        {
          contractVersion: OPERATIONAL_WORKSPACE_CONTRACT_VERSION_V1,
          operation: 'search',
          request: {
            contractVersion: GLOBAL_SEARCH_CONTRACT_VERSION_V1,
            academicYearId: year,
            query: submitted,
            scope: { kinds: ['teacher'] },
            page: { limit: 12, cursor: null },
            order: GLOBAL_SEARCH_ORDER_V1,
          },
        },
        ticket.signal,
      );
      if (!ticket.isCurrent()) return;
      if (response.state === 'ready' && 'search' in response) {
        const teachers = response.search.items.filter(
          (result): result is Extract<GlobalSearchResultV1, { readonly kind: 'teacher' }> =>
            result.kind === 'teacher',
        );
        setSearchItems(teachers);
        setSearchState(teachers.length === 0 ? 'empty' : 'ready');
        return;
      }
      setSearchItems([]);
      setSearchState(
        response.state === 'not-authorized' || response.state === 'unavailable'
          ? response.state
          : 'empty',
      );
    } catch {
      if (!ticket.isCurrent()) return;
      setSearchItems([]);
      setSearchState('unavailable');
    } finally {
      ticket.complete();
    }
  }

  function openTeacher(reference: TeacherId) {
    setTeacherReference(reference);
    setSearchItems([]);
    setSearchState('idle');
    window.requestAnimationFrame(() => teacherHeadingRef.current?.focus());
  }

  return (
    <Surface
      variant="default"
      className="mt-5 rounded-[2rem] border border-border/70 p-4 shadow-sm sm:p-7"
      aria-busy={workspaceState === 'loading'}
    >
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:flex-wrap">
        <div className="max-w-2xl">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted">
            <Settings2 className="size-4" aria-hidden="true" />
            Fechamento F5
          </div>
          <h2 className="mt-3 text-xl font-semibold tracking-[-0.03em] sm:text-2xl">
            Cadastro de Professor e atribuições anuais
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            Cadastre Professor, confirme nomes observados e mantenha vínculos anuais sem criar regra de nota ou identidade paralela.
          </p>
        </div>
        {!activated && (
          <Button variant="outline" onPress={() => void openWorkspace()}>
            <BookUser className="size-4" aria-hidden="true" />
            Gerenciar professores e atribuições
          </Button>
        )}
      </div>

      {activated && workspaceState === 'loading' && (
        <div className="mt-5 flex items-center gap-2 text-sm text-muted" role="status" aria-live="polite">
          <Spinner size="sm" />
          Carregando anos acadêmicos configurados…
        </div>
      )}

      {activated && workspaceState === 'not-authorized' && (
        <Alert status="warning" className="mt-5">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>Manutenção não autorizada</Alert.Title>
            <Alert.Description>A autorização efetiva permanece exclusivamente no servidor.</Alert.Description>
          </Alert.Content>
        </Alert>
      )}

      {activated && workspaceState === 'unavailable' && (
        <div className="mt-5 grid gap-3">
          <Alert status="danger">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Title>Manutenção docente indisponível</Alert.Title>
              <Alert.Description>Nenhum dado acadêmico foi alterado.</Alert.Description>
            </Alert.Content>
          </Alert>
          <div>
            <Button size="sm" variant="outline" onPress={() => void openWorkspace()}>
              Tentar abrir novamente
            </Button>
          </div>
        </div>
      )}

      {activated && workspaceState === 'empty' && (
        <Alert status="default" className="mt-5">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>Nenhum ano acadêmico configurado</Alert.Title>
            <Alert.Description>O sistema não escolhe ou cria ano pelo relógio.</Alert.Description>
          </Alert.Content>
        </Alert>
      )}

      {activated && workspaceState === 'ready' && (
        <div className="mt-5 grid gap-5">
          <Card>
            <Card.Header>
              <Card.Title>Contexto e Professor</Card.Title>
              <Card.Description>Escolha o ano explicitamente. Pesquise Professor existente ou cadastre um novo.</Card.Description>
            </Card.Header>
            <Card.Content className="grid gap-4">
              <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)] lg:items-end">
                <div>
                  <Label htmlFor="teacher-maintenance-academic-year" className="mb-1.5 block text-sm font-medium">
                    Ano acadêmico
                  </Label>
                  <select
                    id="teacher-maintenance-academic-year"
                    value={academicYearId ?? ''}
                    onChange={(event) => selectYear(event.currentTarget.value)}
                    className="h-10 w-full rounded-xl border border-border bg-transparent px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-focus"
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
                    void searchTeacher();
                  }}
                >
                  <SearchField
                    name="teacher-maintenance-search"
                    fullWidth
                    value={query}
                    onChange={(value) => {
                      setQuery(value);
                      setSearchItems([]);
                      setSearchState('idle');
                    }}
                    onClear={() => {
                      setQuery('');
                      setSearchItems([]);
                      setSearchState('idle');
                    }}
                    isDisabled={!academicYearId}
                  >
                    <Label>Pesquisar Professor</Label>
                    <SearchField.Group>
                      <SearchField.SearchIcon />
                      <SearchField.Input placeholder={academicYearId ? 'Nome do professor' : 'Selecione o ano primeiro'} />
                      <SearchField.ClearButton />
                      <Button
                        type="submit"
                        size="sm"
                        variant="primary"
                        isDisabled={!academicYearId || !query.trim() || searchState === 'loading'}
                      >
                        <Search className="size-4" aria-hidden="true" />
                        Buscar
                      </Button>
                    </SearchField.Group>
                  </SearchField>
                </form>
              </div>

              {searchState === 'loading' && (
                <span className="flex items-center gap-2 text-sm text-muted" role="status">
                  <Spinner size="sm" />
                  Pesquisando Professor…
                </span>
              )}
              {searchState === 'empty' && query.trim() && (
                <p className="text-sm text-muted">Nenhum Professor encontrado. O cadastro abaixo continua disponível.</p>
              )}
              {searchState === 'unavailable' && (
                <p className="text-sm text-danger">A pesquisa de Professor está indisponível.</p>
              )}
              {searchItems.length > 0 && (
                <Surface variant="secondary" className="rounded-2xl p-2">
                  <ul className="grid gap-1" aria-label="Professores encontrados">
                    {searchItems.map((result) => (
                      <li key={`${result.kind}:${result.id}`}>
                        <Button
                          fullWidth
                          variant="ghost"
                          className="h-auto justify-start gap-2 px-3 py-2 text-left"
                          onPress={() => openTeacher(result.id as TeacherId)}
                        >
                          <GraduationCap className="size-4 shrink-0 text-muted" aria-hidden="true" />
                          <span className="min-w-0 flex-1 truncate">{teacherLabel(result)}</span>
                        </Button>
                      </li>
                    ))}
                  </ul>
                </Surface>
              )}

              {teacherReference && (
                <div className="flex flex-wrap items-center gap-2">
                  <Chip variant="soft">Professor selecionado</Chip>
                  <h3
                    ref={teacherHeadingRef}
                    tabIndex={-1}
                    className="break-all text-xs text-muted outline-none focus-visible:ring-2 focus-visible:ring-focus"
                  >
                    Referência opaca: {teacherReference}
                  </h3>
                  <Button size="sm" variant="ghost" onPress={() => setTeacherReference(null)}>
                    Trocar Professor
                  </Button>
                </div>
              )}
            </Card.Content>
          </Card>

          {academicYearId && (
            <TeacherAssignmentMaintenancePanel
              academicYearId={academicYearId}
              teacherReference={teacherReference}
              onOpenTeacher={openTeacher}
              onRefreshTeacher={() => undefined}
            />
          )}
        </div>
      )}
    </Surface>
  );
}
