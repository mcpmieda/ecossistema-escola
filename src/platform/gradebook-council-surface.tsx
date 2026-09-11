import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Button, Label, Spinner, Surface } from '@heroui/react';
import type {
  CouncilClassReferenceV1,
  CouncilStudentReferenceV1,
} from '../../shared/gradebook-contracts/council/council-workspace-contract-v1';
import type { AcademicYearId } from '../../shared/gradebook-contracts/entities';
import {
  GLOBAL_SEARCH_CONTRACT_VERSION_V1,
  GLOBAL_SEARCH_ORDER_V1,
  type GlobalSearchResultV1,
} from '../../shared/gradebook-contracts/search/global-search-contract-v1';
import { CouncilInstitutionalPanelV2 } from '../features/gradebook/council/council-institutional-panel-v2';
import { CouncilWorkspacePage } from '../features/gradebook/council/council-workspace-page';
import { requestOperationalWorkspaceV1 } from '../features/gradebook/operational-workspace/operational-workspace-client';
import { resolveLegacyAcademicYear } from './gradebook-legacy-year';
import { useGradebookYear } from './gradebook-year-context';

type CouncilMountState = 'loading' | 'ready' | 'empty' | 'unavailable' | 'not-authorized';
type CouncilSearchState = 'idle' | CouncilMountState;
type CouncilSelectedClass = {
  readonly reference: CouncilClassReferenceV1;
  readonly label: string;
};

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

export function GradebookCouncilSurface() {
  const globalYear = useGradebookYear()?.year ?? null;
  const [workspaceState, setWorkspaceState] = useState<CouncilMountState>('loading');
  const [academicYearId, setAcademicYearId] = useState<AcademicYearId | null>(null);
  const [classQuery, setClassQuery] = useState('');
  const [classSearchState, setClassSearchState] = useState<CouncilSearchState>('idle');
  const [classResults, setClassResults] = useState<readonly GlobalSearchResultV1[]>([]);
  const [selectedClass, setSelectedClass] = useState<CouncilSelectedClass | null>(null);
  const [focusedStudentReference, setFocusedStudentReference] =
    useState<CouncilStudentReferenceV1 | null>(null);
  const [meetingClosed, setMeetingClosed] = useState(false);
  const bootstrapControllerRef = useRef<AbortController | null>(null);
  const classSearchControllerRef = useRef<AbortController | null>(null);
  const searchSequenceRef = useRef(0);

  const loadAcademicYears = useCallback(() => {
    bootstrapControllerRef.current?.abort();
    classSearchControllerRef.current?.abort();
    searchSequenceRef.current += 1;
    setAcademicYearId(null);
    setClassResults([]);
    setClassSearchState('idle');
    setSelectedClass(null);
    setFocusedStudentReference(null);
    setMeetingClosed(false);
    if (globalYear === null) {
      setWorkspaceState('loading');
      return;
    }
    const controller = new AbortController();
    bootstrapControllerRef.current = controller;
    setWorkspaceState('loading');

    void requestOperationalWorkspaceV1(
      { contractVersion: 1, operation: 'bootstrap' },
      controller.signal,
    )
      .then((response) => {
        if (controller.signal.aborted) return;
        if (response.state === 'not-authorized') {
          setWorkspaceState('not-authorized');
          return;
        }
        if (response.state === 'unavailable') {
          setWorkspaceState('unavailable');
          return;
        }
        if ('availableAcademicYears' in response) {
          if (response.availableAcademicYears.length === 0) {
            setWorkspaceState('empty');
            return;
          }
          setAcademicYearId(resolveLegacyAcademicYear(globalYear, response.availableAcademicYears));
          setWorkspaceState('ready');
          return;
        }
        setWorkspaceState('unavailable');
      })
      .catch((error: unknown) => {
        if (!isAbortError(error)) setWorkspaceState('unavailable');
      });
  }, [globalYear]);

  useEffect(() => {
    loadAcademicYears();
    return () => {
      bootstrapControllerRef.current?.abort();
      classSearchControllerRef.current?.abort();
      searchSequenceRef.current += 1;
    };
  }, [loadAcademicYears]);

  async function searchClasses() {
    const query = classQuery.trim();
    if (academicYearId === null || query.length === 0) return;

    classSearchControllerRef.current?.abort();
    const controller = new AbortController();
    classSearchControllerRef.current = controller;
    const sequence = ++searchSequenceRef.current;
    setClassSearchState('loading');
    setSelectedClass(null);
    setFocusedStudentReference(null);
    setMeetingClosed(false);

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
      if (sequence !== searchSequenceRef.current || controller.signal.aborted) return;
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
    } catch (error: unknown) {
      if (sequence === searchSequenceRef.current && !isAbortError(error)) {
        setClassResults([]);
        setClassSearchState('unavailable');
      }
    }
  }

  const failure =
    workspaceState === 'not-authorized'
      ? ['Acesso não autorizado', 'Sua sessão não possui autorização para abrir o Conselho.']
      : workspaceState === 'unavailable'
        ? ['Conselho indisponível', 'O contexto acadêmico não está disponível neste ambiente.']
        : workspaceState === 'empty'
          ? ['Nenhum ano acadêmico', 'Não há anos acadêmicos disponíveis para selecionar.']
          : null;

  return (
    <div className="grid gap-4" aria-label="Entrada do Conselho de Classe">
      <Surface className="rounded-3xl border border-border p-4 sm:p-6">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
            Conselho de Classe
          </p>
          <h3 className="mt-2 text-2xl font-semibold tracking-[-0.035em]">Abrir turma</h3>
          <p className="mt-2 text-sm leading-6 text-muted">
            Use o ano global e selecione a turma explicitamente. A elegibilidade vem somente da projeção oficial já
            resolvida.
          </p>
        </div>

        <div className="mt-5" aria-live="polite" aria-busy={workspaceState === 'loading'}>
          {workspaceState === 'loading' && (
            <div className="flex items-center gap-2 text-sm text-muted" role="status">
              <Spinner size="sm" /> Carregando anos acadêmicos…
            </div>
          )}
          {failure && (
            <Alert status={workspaceState === 'unavailable' ? 'danger' : 'warning'}>
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Title>{failure[0]}</Alert.Title>
                <Alert.Description>{failure[1]}</Alert.Description>
                {workspaceState === 'unavailable' && (
                  <div className="mt-3">
                    <Button size="sm" variant="outline" onPress={loadAcademicYears}>
                      Tentar novamente
                    </Button>
                  </div>
                )}
              </Alert.Content>
            </Alert>
          )}
        </div>

        {workspaceState === 'ready' && (
          <div className="mt-5 grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)] lg:items-end">
            <div>
              <p className="text-sm font-medium">Ano letivo global</p>
              <p className="mt-1 text-lg font-semibold">{globalYear ?? 'Não selecionado'}</p>
              <p className="mt-1 text-xs text-muted">O Conselho usa exatamente o ano selecionado no Banco.</p>
              {globalYear !== null && academicYearId === null && (
                <p className="mt-2 text-xs text-danger">Ano sem correspondência única no catálogo legado; nenhum ano vizinho será usado.</p>
              )}
            </div>

            <form
              onSubmit={(event) => {
                event.preventDefault();
                void searchClasses();
              }}
            >
              <Label htmlFor="council-class-query" className="mb-1.5 block text-sm font-medium">
                Pesquisar turma
              </Label>
              <div className="flex gap-2">
                <input
                  id="council-class-query"
                  value={classQuery}
                  onChange={(event) => setClassQuery(event.currentTarget.value)}
                  disabled={academicYearId === null}
                  placeholder={academicYearId ? 'Código da turma' : 'Selecione o ano primeiro'}
                  className="h-10 min-w-0 flex-1 rounded-xl border border-border bg-transparent px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-50"
                />
                <Button
                  type="submit"
                  variant="primary"
                  isDisabled={
                    academicYearId === null ||
                    classQuery.trim().length === 0 ||
                    classSearchState === 'loading'
                  }
                >
                  Buscar
                </Button>
              </div>
            </form>
          </div>
        )}

        <div className="mt-4" aria-live="polite" aria-busy={classSearchState === 'loading'}>
          {classSearchState === 'loading' && (
            <p role="status" className="text-sm text-muted">
              Pesquisando turmas…
            </p>
          )}
          {classSearchState === 'empty' && (
            <p className="text-sm text-muted">Nenhuma turma encontrada.</p>
          )}
          {classSearchState === 'unavailable' && (
            <p className="text-sm text-danger">A pesquisa de turmas está indisponível.</p>
          )}
          {classSearchState === 'not-authorized' && (
            <p className="text-sm text-warning">A pesquisa de turmas não foi autorizada.</p>
          )}
          {classResults.length > 0 && (
            <div
              className="flex flex-wrap gap-2"
              role="list"
              aria-label="Turmas disponíveis para o Conselho"
            >
              {classResults.map(
                (result) =>
                  result.kind === 'class-group' && (
                    <Button
                      key={result.id}
                      size="sm"
                      variant={selectedClass?.label === result.code ? 'primary' : 'outline'}
                      onPress={() => {
                        setFocusedStudentReference(null);
                        setMeetingClosed(false);
                        setSelectedClass({
                          reference: result.id as unknown as CouncilClassReferenceV1,
                          label: result.code,
                        });
                      }}
                    >
                      {result.code}
                    </Button>
                  ),
              )}
            </div>
          )}
        </div>
      </Surface>

      {academicYearId !== null && selectedClass !== null && (
        <>
          {meetingClosed && (
            <Alert status="default">
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Title>Conselho fechado</Alert.Title>
                <Alert.Description>
                  O servidor bloqueia novas decisões e contagens; a fotografia histórica permanece
                  disponível no painel institucional.
                </Alert.Description>
              </Alert.Content>
            </Alert>
          )}
          <CouncilWorkspacePage
            academicYearId={academicYearId}
            classReference={selectedClass.reference}
            classLabel={selectedClass.label}
            onFocusedStudentReferenceChange={setFocusedStudentReference}
          />
          <CouncilInstitutionalPanelV2
            academicYearId={academicYearId}
            classReference={selectedClass.reference}
            classLabel={selectedClass.label}
            focusedStudentReference={focusedStudentReference}
            refreshToken={0}
            onMeetingClosedChange={setMeetingClosed}
          />
        </>
      )}
    </div>
  );
}
