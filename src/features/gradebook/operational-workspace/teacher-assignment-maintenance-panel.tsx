import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Button, Card, Chip, Label, Spinner, Surface } from '@heroui/react';
import {
  BadgeCheck,
  BookOpenCheck,
  CheckCircle2,
  GraduationCap,
  Link2,
  Plus,
  RefreshCw,
  Search,
} from 'lucide-react';

import type {
  AcademicYearId,
  ClassGroupId,
  SubjectId,
  TeacherId,
  TeachingAssignmentId,
} from '../../../../shared/gradebook-contracts/entities';
import {
  GLOBAL_SEARCH_CONTRACT_VERSION_V1,
  GLOBAL_SEARCH_ORDER_V1,
  type GlobalSearchResultV1,
} from '../../../../shared/gradebook-contracts/search/global-search-contract-v1';
import { OPERATIONAL_WORKSPACE_CONTRACT_VERSION_V1 } from '../../../../shared/gradebook-contracts/operational-workspace/operational-workspace-contract-v1';
import { requestOperationalWorkspaceV1 } from './operational-workspace-client';
import {
  TeacherAssignmentMaintenanceClientErrorV1,
  confirmTeacherSourceNameMaintenanceV1,
  confirmTeachingAssignmentMaintenanceV1,
  registerTeacherMaintenanceV1,
  registerTeachingAssignmentMaintenanceV1,
  requestTeacherMaintenanceStateV1,
  type TeacherMaintenanceAssignmentClientV1,
  type TeacherMaintenanceStateClientV1,
} from './teacher-assignment-maintenance-client';

type ReferenceKind = 'class-group' | 'subject';
type ReferenceSearchState = 'idle' | 'loading' | 'ready' | 'empty' | 'unavailable';
type MaintenanceState = 'idle' | 'loading' | 'ready' | 'unavailable' | 'not-authorized';

interface ReferenceChoiceV1 {
  readonly kind: ReferenceKind;
  readonly id: ClassGroupId | SubjectId;
  readonly label: string;
}

export interface TeacherAssignmentMaintenancePanelProps {
  readonly academicYearId: AcademicYearId;
  readonly teacherReference: TeacherId | null;
  readonly onOpenTeacher: (teacherReference: TeacherId) => void;
  readonly onRefreshTeacher: () => void;
}

function maintenanceClientState(error: unknown): Extract<MaintenanceState, 'unavailable' | 'not-authorized'> {
  return error instanceof TeacherAssignmentMaintenanceClientErrorV1 && error.code === 'not-authorized'
    ? 'not-authorized'
    : 'unavailable';
}

function originLabel(value: TeacherMaintenanceAssignmentClientV1['confirmationOrigin']): string {
  switch (value) {
    case 'imported-source':
      return 'Importada · aguardando confirmação';
    case 'user-confirmed':
      return 'Confirmada pelo usuário';
    case 'administrative':
      return 'Cadastro administrativo';
  }
}

function resultChoice(result: GlobalSearchResultV1): ReferenceChoiceV1 | null {
  if (result.kind === 'class-group') {
    return { kind: result.kind, id: result.id, label: result.code };
  }
  if (result.kind === 'subject') {
    return { kind: result.kind, id: result.id, label: result.displayName };
  }
  return null;
}

function MutationAlert({ message, focusRef }: { message: string; focusRef: React.RefObject<HTMLDivElement | null> }) {
  if (!message) return null;
  return (
    <div ref={focusRef} tabIndex={-1} className="outline-none focus-visible:ring-2 focus-visible:ring-focus">
      <Alert status="default">
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Title>Atualização da Central do Professor</Alert.Title>
          <Alert.Description>{message}</Alert.Description>
        </Alert.Content>
      </Alert>
    </div>
  );
}

function ReferenceSearch({
  academicYearId,
  kind,
  label,
  selected,
  onSelect,
}: {
  academicYearId: AcademicYearId;
  kind: ReferenceKind;
  label: string;
  selected: ReferenceChoiceV1 | null;
  onSelect: (choice: ReferenceChoiceV1 | null) => void;
}) {
  const [query, setQuery] = useState('');
  const [state, setState] = useState<ReferenceSearchState>('idle');
  const [items, setItems] = useState<readonly ReferenceChoiceV1[]>([]);
  const controllerRef = useRef<AbortController | null>(null);
  const sequenceRef = useRef(0);

  useEffect(
    () => () => {
      sequenceRef.current += 1;
      controllerRef.current?.abort();
    },
    [],
  );

  async function runSearch() {
    const submitted = query.trim();
    if (!submitted) {
      setItems([]);
      setState('empty');
      return;
    }
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    const sequence = ++sequenceRef.current;
    setState('loading');
    try {
      const response = await requestOperationalWorkspaceV1(
        {
          contractVersion: OPERATIONAL_WORKSPACE_CONTRACT_VERSION_V1,
          operation: 'search',
          request: {
            contractVersion: GLOBAL_SEARCH_CONTRACT_VERSION_V1,
            academicYearId,
            query: submitted,
            scope: { kinds: [kind] },
            page: { limit: 8, cursor: null },
            order: GLOBAL_SEARCH_ORDER_V1,
          },
        },
        controller.signal,
      );
      if (sequence !== sequenceRef.current) return;
      if (response.state === 'ready' && 'search' in response) {
        const choices = response.search.items.flatMap((result) => {
          const choice = resultChoice(result);
          return choice === null || choice.kind !== kind ? [] : [choice];
        });
        setItems(choices);
        setState(choices.length === 0 ? 'empty' : 'ready');
        return;
      }
      setItems([]);
      setState(response.state === 'not-authorized' || response.state === 'unavailable' ? 'unavailable' : 'empty');
    } catch {
      if (controller.signal.aborted || sequence !== sequenceRef.current) return;
      setItems([]);
      setState('unavailable');
    }
  }

  return (
    <div className="grid gap-2">
      <Label htmlFor={`teacher-assignment-${kind}-search`} className="text-sm font-medium">
        {label}
      </Label>
      {selected ? (
        <Surface variant="secondary" className="flex min-w-0 items-center justify-between gap-2 rounded-xl p-3">
          <span className="truncate text-sm font-medium">{selected.label}</span>
          <Button size="sm" variant="ghost" onPress={() => onSelect(null)}>
            Trocar
          </Button>
        </Surface>
      ) : (
        <form
          className="grid gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void runSearch();
          }}
        >
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              id={`teacher-assignment-${kind}-search`}
              value={query}
              onChange={(event) => {
                setQuery(event.currentTarget.value);
                setItems([]);
                setState('idle');
              }}
              className="h-10 min-w-0 flex-1 rounded-xl border border-border bg-transparent px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-focus"
              placeholder={kind === 'class-group' ? 'Ex.: 6A' : 'Ex.: Matemática'}
            />
            <Button type="submit" size="sm" variant="outline" isDisabled={!query.trim() || state === 'loading'}>
              <Search className="size-4" aria-hidden="true" />
              Buscar
            </Button>
          </div>
        </form>
      )}
      {state === 'loading' && !selected && (
        <span className="flex items-center gap-2 text-xs text-muted" role="status">
          <Spinner size="sm" />
          Pesquisando…
        </span>
      )}
      {state === 'empty' && !selected && (
        <p className="text-xs text-muted">Nenhuma referência encontrada.</p>
      )}
      {state === 'unavailable' && !selected && (
        <p className="text-xs text-danger">A pesquisa desta referência está indisponível.</p>
      )}
      {items.length > 0 && !selected && (
        <ul className="grid gap-1" aria-label={`Resultados para ${label}`}>
          {items.map((item) => (
            <li key={`${item.kind}:${item.id}`}>
              <Button
                size="sm"
                variant="ghost"
                fullWidth
                className="h-auto justify-start px-3 py-2 text-left"
                onPress={() => {
                  onSelect(item);
                  setItems([]);
                  setState('idle');
                }}
              >
                {item.label}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function TeacherAssignmentMaintenancePanel({
  academicYearId,
  teacherReference,
  onOpenTeacher,
  onRefreshTeacher,
}: TeacherAssignmentMaintenancePanelProps) {
  const [maintenanceState, setMaintenanceState] = useState<MaintenanceState>('idle');
  const [maintenance, setMaintenance] = useState<TeacherMaintenanceStateClientV1 | null>(null);
  const [newTeacherName, setNewTeacherName] = useState('');
  const [sourceName, setSourceName] = useState('');
  const [selectedClassGroup, setSelectedClassGroup] = useState<ReferenceChoiceV1 | null>(null);
  const [selectedSubject, setSelectedSubject] = useState<ReferenceChoiceV1 | null>(null);
  const [startsOn, setStartsOn] = useState('');
  const [endsOn, setEndsOn] = useState('');
  const [writing, setWriting] = useState(false);
  const [mutationMessage, setMutationMessage] = useState('');
  const loadSequenceRef = useRef(0);
  const loadControllerRef = useRef<AbortController | null>(null);
  const mutationAlertRef = useRef<HTMLDivElement>(null);

  const loadMaintenance = useCallback(async () => {
    if (teacherReference === null) {
      loadSequenceRef.current += 1;
      loadControllerRef.current?.abort();
      setMaintenance(null);
      setMaintenanceState('idle');
      return;
    }
    loadControllerRef.current?.abort();
    const controller = new AbortController();
    loadControllerRef.current = controller;
    const sequence = ++loadSequenceRef.current;
    setMaintenanceState('loading');
    try {
      const response = await requestTeacherMaintenanceStateV1(
        academicYearId,
        teacherReference,
        controller.signal,
      );
      if (sequence !== loadSequenceRef.current) return;
      setMaintenance(response);
      setMaintenanceState('ready');
    } catch (error) {
      if (controller.signal.aborted || sequence !== loadSequenceRef.current) return;
      setMaintenance(null);
      setMaintenanceState(maintenanceClientState(error));
    }
  }, [academicYearId, teacherReference]);

  useEffect(() => {
    setMutationMessage('');
    setSourceName('');
    setSelectedClassGroup(null);
    setSelectedSubject(null);
    setStartsOn('');
    setEndsOn('');
    void loadMaintenance();
    return () => {
      loadSequenceRef.current += 1;
      loadControllerRef.current?.abort();
    };
  }, [loadMaintenance]);

  function announce(message: string) {
    setMutationMessage(message);
    queueMicrotask(() => mutationAlertRef.current?.focus());
  }

  async function refreshAfterWrite(message: string) {
    announce(message);
    await loadMaintenance();
    onRefreshTeacher();
  }

  async function registerTeacher() {
    if (!newTeacherName.trim() || writing) return;
    setWriting(true);
    try {
      const response = await registerTeacherMaintenanceV1(academicYearId, newTeacherName.trim());
      if (response.state === 'written' && response.entity === 'teacher') {
        setNewTeacherName('');
        announce('Professor cadastrado. A Central foi aberta usando a nova referência opaca.');
        onOpenTeacher(response.reference as TeacherId);
        return;
      }
      announce(
        response.state === 'version-conflict'
          ? 'O identificador técnico colidiu. Nenhuma escrita foi repetida automaticamente.'
          : 'O professor não pôde ser cadastrado neste ano.',
      );
    } catch (error) {
      setMaintenanceState(maintenanceClientState(error));
      announce('O cadastro de professor ficou indisponível.');
    } finally {
      setWriting(false);
    }
  }

  async function confirmSourceName() {
    if (maintenance === null || !sourceName.trim() || writing) return;
    setWriting(true);
    try {
      const response = await confirmTeacherSourceNameMaintenanceV1(
        academicYearId,
        maintenance.teacher.reference,
        maintenance.teacher.currentVersion,
        sourceName.trim(),
      );
      if (response.state === 'version-conflict') {
        await refreshAfterWrite('Outra alteração chegou primeiro. O estado foi recarregado antes de nova tentativa.');
        return;
      }
      if (response.state === 'written' || response.state === 'unchanged') {
        setSourceName('');
        await refreshAfterWrite(
          response.state === 'written'
            ? 'Nome observado confirmado para este professor.'
            : 'Esse nome observado já estava confirmado; nenhuma nova versão foi criada.',
        );
        return;
      }
      announce('O nome observado não pôde ser confirmado.');
    } catch (error) {
      setMaintenanceState(maintenanceClientState(error));
      announce('A confirmação do professor ficou indisponível.');
    } finally {
      setWriting(false);
    }
  }

  async function registerAssignment() {
    if (
      maintenance === null ||
      selectedClassGroup?.kind !== 'class-group' ||
      selectedSubject?.kind !== 'subject' ||
      writing
    ) {
      return;
    }
    setWriting(true);
    try {
      const response = await registerTeachingAssignmentMaintenanceV1({
        academicYearId,
        teacherReference: maintenance.teacher.reference,
        classGroupReference: selectedClassGroup.id as ClassGroupId,
        subjectReference: selectedSubject.id as SubjectId,
        effectivePeriod: {
          ...(startsOn ? { startsOn } : {}),
          ...(endsOn ? { endsOn } : {}),
        },
      });
      if (response.state === 'written') {
        setSelectedClassGroup(null);
        setSelectedSubject(null);
        setStartsOn('');
        setEndsOn('');
        await refreshAfterWrite('Atribuição anual cadastrada administrativamente para o ano selecionado.');
        return;
      }
      announce(
        response.state === 'not-found'
          ? 'Uma das referências selecionadas não existe mais. Pesquise turma e componente novamente.'
          : 'A atribuição anual não pôde ser cadastrada.',
      );
    } catch (error) {
      setMaintenanceState(maintenanceClientState(error));
      announce('O cadastro da atribuição ficou indisponível.');
    } finally {
      setWriting(false);
    }
  }

  async function confirmAssignment(
    assignmentReference: TeachingAssignmentId,
    expectedVersion: number,
  ) {
    if (writing) return;
    setWriting(true);
    try {
      const response = await confirmTeachingAssignmentMaintenanceV1(
        academicYearId,
        assignmentReference,
        expectedVersion,
      );
      if (response.state === 'version-conflict') {
        await refreshAfterWrite('A atribuição mudou em outra operação. O estado foi recarregado antes de nova tentativa.');
        return;
      }
      if (response.state === 'written' || response.state === 'unchanged') {
        await refreshAfterWrite(
          response.state === 'written'
            ? 'Atribuição importada confirmada pelo usuário.'
            : 'A atribuição já tinha origem explícita; nenhuma nova versão foi criada.',
        );
        return;
      }
      announce('A atribuição não pôde ser confirmada.');
    } catch (error) {
      setMaintenanceState(maintenanceClientState(error));
      announce('A confirmação da atribuição ficou indisponível.');
    } finally {
      setWriting(false);
    }
  }

  if (teacherReference === null) {
    return (
      <Card>
        <Card.Header>
          <div className="flex items-center gap-2">
            <GraduationCap className="size-4" aria-hidden="true" />
            <Card.Title>Cadastrar professor</Card.Title>
          </div>
          <Card.Description>
            O ano permanece explícito. O servidor emite a referência técnica; nomes não são usados como identidade única.
          </Card.Description>
        </Card.Header>
        <Card.Content className="grid gap-3">
          <MutationAlert message={mutationMessage} focusRef={mutationAlertRef} />
          <form
            className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"
            onSubmit={(event) => {
              event.preventDefault();
              void registerTeacher();
            }}
          >
            <div>
              <Label htmlFor="teacher-maintenance-display-name" className="mb-1.5 block text-sm font-medium">
                Nome de exibição
              </Label>
              <input
                id="teacher-maintenance-display-name"
                value={newTeacherName}
                onChange={(event) => setNewTeacherName(event.currentTarget.value)}
                className="h-10 w-full rounded-xl border border-border bg-transparent px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-focus"
                placeholder="Nome do professor"
              />
            </div>
            <Button type="submit" variant="primary" isDisabled={!newTeacherName.trim() || writing}>
              <Plus className="size-4" aria-hidden="true" />
              {writing ? 'Cadastrando…' : 'Cadastrar professor'}
            </Button>
          </form>
        </Card.Content>
      </Card>
    );
  }

  return (
    <Card>
      <Card.Header className="flex flex-col items-start gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <BookOpenCheck className="size-4" aria-hidden="true" />
            <Card.Title>Cadastro e atribuições anuais</Card.Title>
          </div>
          <Card.Description>
            Confirmações usam CAS. Nenhuma nota, resultado ou regra acadêmica é alterada nesta área.
          </Card.Description>
        </div>
        <Button size="sm" variant="outline" isDisabled={maintenanceState === 'loading'} onPress={() => void loadMaintenance()}>
          <RefreshCw className="size-4" aria-hidden="true" />
          Atualizar
        </Button>
      </Card.Header>
      <Card.Content className="grid gap-5">
        <MutationAlert message={mutationMessage} focusRef={mutationAlertRef} />

        {maintenanceState === 'loading' && (
          <div className="flex items-center gap-2 text-sm text-muted" role="status" aria-live="polite">
            <Spinner size="sm" />
            Carregando cadastro e versões…
          </div>
        )}
        {maintenanceState === 'not-authorized' && (
          <Alert status="warning">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Title>Manutenção não autorizada</Alert.Title>
              <Alert.Description>A autorização efetiva é verificada somente no servidor.</Alert.Description>
            </Alert.Content>
          </Alert>
        )}
        {maintenanceState === 'unavailable' && (
          <Alert status="danger">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Title>Manutenção indisponível</Alert.Title>
              <Alert.Description>Nenhuma escrita foi repetida automaticamente.</Alert.Description>
            </Alert.Content>
          </Alert>
        )}

        {maintenanceState === 'ready' && maintenance && (
          <>
            <section aria-labelledby="teacher-maintenance-confirmation-heading" className="grid gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 id="teacher-maintenance-confirmation-heading" className="text-sm font-semibold">
                    Confirmar professor
                  </h3>
                  <p className="mt-1 text-xs text-muted">
                    Versão atual: {maintenance.teacher.currentVersion}. Confirme somente um nome efetivamente observado na fonte.
                  </p>
                </div>
                <Chip size="sm" variant="soft">{maintenance.teacher.status === 'active' ? 'Ativo' : 'Inativo'}</Chip>
              </div>
              {maintenance.teacher.sourceNames.length > 0 ? (
                <div className="flex flex-wrap gap-2" aria-label="Nomes de origem confirmados">
                  {maintenance.teacher.sourceNames.map((name) => (
                    <Chip key={name} size="sm" variant="soft">
                      <BadgeCheck className="mr-1 size-3.5" aria-hidden="true" />
                      {name}
                    </Chip>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted">Nenhum nome de origem foi confirmado ainda.</p>
              )}
              <form
                className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"
                onSubmit={(event) => {
                  event.preventDefault();
                  void confirmSourceName();
                }}
              >
                <div>
                  <Label htmlFor="teacher-maintenance-source-name" className="mb-1.5 block text-sm font-medium">
                    Nome observado na planilha
                  </Label>
                  <input
                    id="teacher-maintenance-source-name"
                    value={sourceName}
                    onChange={(event) => setSourceName(event.currentTarget.value)}
                    className="h-10 w-full rounded-xl border border-border bg-transparent px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-focus"
                    placeholder="Digite exatamente o nome observado"
                  />
                </div>
                <Button type="submit" variant="outline" isDisabled={!sourceName.trim() || writing}>
                  <CheckCircle2 className="size-4" aria-hidden="true" />
                  Confirmar nome
                </Button>
              </form>
            </section>

            <section aria-labelledby="teacher-maintenance-assignments-heading" className="grid gap-3">
              <div>
                <h3 id="teacher-maintenance-assignments-heading" className="text-sm font-semibold">
                  Atribuições do ano
                </h3>
                <p className="mt-1 text-xs text-muted">
                  Vínculos importados podem ser confirmados sem alterar professor, turma, componente, D1/D2/D3 ou vigência.
                </p>
              </div>
              {maintenance.assignments.length === 0 ? (
                <p className="text-sm text-muted">Nenhuma atribuição encontrada neste ano.</p>
              ) : (
                <div className="grid gap-2 md:grid-cols-2">
                  {maintenance.assignments.map((assignment) => (
                    <Surface key={assignment.reference} variant="secondary" className="rounded-2xl p-4">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-medium">
                            {assignment.subject?.label ?? 'Componente indisponível'}
                          </p>
                          <p className="mt-1 text-sm text-muted">
                            {assignment.classGroup?.label ?? 'Turma indisponível'}
                          </p>
                        </div>
                        <Chip size="sm" variant="soft">v{assignment.currentVersion}</Chip>
                      </div>
                      <p className="mt-3 text-xs text-muted">{originLabel(assignment.confirmationOrigin)}</p>
                      {(assignment.effectivePeriod.startsOn || assignment.effectivePeriod.endsOn) && (
                        <p className="mt-1 text-xs text-muted">
                          Vigência: {assignment.effectivePeriod.startsOn ?? 'início não informado'} → {assignment.effectivePeriod.endsOn ?? 'fim não informado'}
                        </p>
                      )}
                      {assignment.confirmationOrigin === 'imported-source' && (
                        <Button
                          className="mt-3"
                          size="sm"
                          variant="outline"
                          isDisabled={writing}
                          onPress={() => void confirmAssignment(assignment.reference, assignment.currentVersion)}
                        >
                          <Link2 className="size-4" aria-hidden="true" />
                          Confirmar atribuição importada
                        </Button>
                      )}
                    </Surface>
                  ))}
                </div>
              )}
            </section>

            <section aria-labelledby="teacher-maintenance-new-assignment-heading" className="grid gap-3">
              <div>
                <h3 id="teacher-maintenance-new-assignment-heading" className="text-sm font-semibold">
                  Nova atribuição anual
                </h3>
                <p className="mt-1 text-xs text-muted">
                  Turma e componente são escolhidos pela pesquisa autorizada; o navegador não fabrica referências técnicas.
                </p>
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <ReferenceSearch
                  academicYearId={academicYearId}
                  kind="class-group"
                  label="Turma"
                  selected={selectedClassGroup}
                  onSelect={setSelectedClassGroup}
                />
                <ReferenceSearch
                  academicYearId={academicYearId}
                  kind="subject"
                  label="Componente"
                  selected={selectedSubject}
                  onSelect={setSelectedSubject}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="teacher-assignment-starts-on" className="mb-1.5 block text-sm font-medium">
                    Início da vigência (opcional)
                  </Label>
                  <input
                    id="teacher-assignment-starts-on"
                    type="date"
                    value={startsOn}
                    onChange={(event) => setStartsOn(event.currentTarget.value)}
                    className="h-10 w-full rounded-xl border border-border bg-transparent px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-focus"
                  />
                </div>
                <div>
                  <Label htmlFor="teacher-assignment-ends-on" className="mb-1.5 block text-sm font-medium">
                    Fim da vigência (opcional)
                  </Label>
                  <input
                    id="teacher-assignment-ends-on"
                    type="date"
                    value={endsOn}
                    onChange={(event) => setEndsOn(event.currentTarget.value)}
                    className="h-10 w-full rounded-xl border border-border bg-transparent px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-focus"
                  />
                </div>
              </div>
              <div>
                <Button
                  variant="primary"
                  isDisabled={
                    selectedClassGroup?.kind !== 'class-group' ||
                    selectedSubject?.kind !== 'subject' ||
                    writing
                  }
                  onPress={() => void registerAssignment()}
                >
                  <Plus className="size-4" aria-hidden="true" />
                  {writing ? 'Salvando…' : 'Cadastrar atribuição anual'}
                </Button>
              </div>
            </section>
          </>
        )}
      </Card.Content>
    </Card>
  );
}
