import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Surface } from '@heroui/react';
import type {
  AcademicYearId,
  EnrollmentId,
  StudentId,
  TeachingAssignmentId,
} from '../../../../shared/gradebook-contracts/entities';
import {
  GLOBAL_SEARCH_CONTRACT_VERSION_V1,
  GLOBAL_SEARCH_ORDER_V1,
} from '../../../../shared/gradebook-contracts/search/global-search-contract-v1';
import {
  OPERATIONAL_WORKSPACE_TRANSPORT_VERSION_V1,
  type OperationalWorkspaceClassGroupCenterViewV1,
} from '../../../../shared/gradebook-contracts/operational-workspace/operational-workspace-transport-v1';
import type { BatchSuccess } from './import-batch';
import type { ConfirmedImportReferencesV2 } from './import-persistence-client-v2';
import type { ImportPersistenceStateV4 } from './use-import-batch';
import { requestOperationalWorkspaceV1 } from '../operational-workspace/operational-workspace-client';

type Draft = {
  academicYearId: string;
  sheets: Record<
    string,
    {
      teachingAssignmentId: string;
      students: Record<number, { studentId: string; enrollmentId: string }>;
    }
  >;
};

type AcademicYearOption = { readonly id: string; readonly label: string };
type ClassCandidate = { readonly id: string; readonly label: string };
type ClassResolution = {
  readonly query: string;
  readonly candidates: readonly ClassCandidate[];
  readonly selectedId: string;
  readonly center: OperationalWorkspaceClassGroupCenterViewV1 | null;
  readonly loading: boolean;
  readonly error: string | null;
};

function normalized(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '')
    .trim()
    .toUpperCase();
}

function uniqueClassLabels(result: BatchSuccess): string[] {
  const labels = new Map<string, string>();
  for (const sheet of result.summary.gradeSheets) {
    if (sheet.stage === 'overview') continue;
    const key = normalized(sheet.className);
    if (key && !labels.has(key)) labels.set(key, sheet.className);
  }
  return [...labels.values()];
}

function complete(result: BatchSuccess, draft: Draft): boolean {
  if (!draft.academicYearId.trim()) return false;
  return result.summary.gradeSheets
    .filter((sheet) => sheet.stage !== 'overview')
    .every((sheet) => {
      const refs = draft.sheets[sheet.name];
      return (
        Boolean(refs?.teachingAssignmentId.trim()) &&
        sheet.students.every((student) => {
          const item = refs?.students[student.row];
          return Boolean(item?.studentId.trim() && item.enrollmentId.trim());
        })
      );
    });
}

function responseLabel(state: ImportPersistenceStateV4): string {
  switch (state.state) {
    case 'recognized':
      return 'Reconhecido localmente';
    case 'ready':
      return 'Pronto para persistir';
    case 'persisting':
      return 'Persistindo';
    case 'failed':
      return `Indisponível: ${state.message}`;
    case 'completed': {
      const labels = {
        applied: 'Aplicado',
        'no-changes': 'Sem mudanças acadêmicas',
        'review-required': 'Revisão necessária',
        blocked: 'Bloqueado',
        conflict: 'Conflito',
        'invalid-request': 'Pedido inválido',
        'not-authorized': 'Não autorizado',
        unavailable: 'Indisponível',
      } as const;
      return labels[state.response.state];
    }
  }
}

function initialClassResolutions(result: BatchSuccess): Record<string, ClassResolution> {
  return Object.fromEntries(
    uniqueClassLabels(result).map((label) => [
      label,
      {
        query: label,
        candidates: [],
        selectedId: '',
        center: null,
        loading: false,
        error: null,
      } satisfies ClassResolution,
    ]),
  );
}

function applyCenterDefaults(
  result: BatchSuccess,
  classLabel: string,
  center: OperationalWorkspaceClassGroupCenterViewV1,
  current: Draft,
): Draft {
  const nextSheets = { ...current.sheets };
  const currentStudents = center.students.filter(
    (enrollment) => enrollment.position === 'current' && enrollment.student !== null,
  );

  for (const sheet of result.summary.gradeSheets) {
    if (sheet.stage === 'overview' || normalized(sheet.className) !== normalized(classLabel)) continue;
    const previous = nextSheets[sheet.name] ?? { teachingAssignmentId: '', students: {} };
    const assignmentMatches = center.assignments.filter(
      (assignment) => normalized(assignment.subject?.label ?? '') === normalized(sheet.discipline),
    );
    const previousAssignmentStillValid = center.assignments.some(
      (assignment) => assignment.id === previous.teachingAssignmentId,
    );
    const teachingAssignmentId = previousAssignmentStillValid
      ? previous.teachingAssignmentId
      : assignmentMatches.length === 1
        ? assignmentMatches[0]!.id
        : '';
    const students = { ...previous.students };
    for (const sourceStudent of sheet.students) {
      const existing = students[sourceStudent.row];
      const existingStillValid = currentStudents.some(
        (candidate) =>
          candidate.id === existing?.enrollmentId && candidate.student?.id === existing.studentId,
      );
      if (existingStillValid) continue;
      const matches = currentStudents.filter(
        (candidate) => normalized(candidate.student?.label ?? '') === normalized(sourceStudent.name),
      );
      students[sourceStudent.row] =
        matches.length === 1 && matches[0]!.student
          ? { studentId: matches[0]!.student.id, enrollmentId: matches[0]!.id }
          : { studentId: '', enrollmentId: '' };
    }
    nextSheets[sheet.name] = { teachingAssignmentId, students };
  }
  return { ...current, sheets: nextSheets };
}

export function ImportPersistenceConfirmationV2({
  result,
  persistence,
  externalBusy,
  onReady,
  onPersist,
}: {
  result: BatchSuccess;
  persistence: ImportPersistenceStateV4;
  externalBusy: boolean;
  onReady: (ready: boolean) => void;
  onPersist: (references: ConfirmedImportReferencesV2) => Promise<void>;
}) {
  const classLabels = useMemo(() => uniqueClassLabels(result), [result]);
  const [academicYears, setAcademicYears] = useState<readonly AcademicYearOption[]>([]);
  const [draft, setDraft] = useState<Draft>({ academicYearId: '', sheets: {} });
  const [classResolutions, setClassResolutions] = useState<Record<string, ClassResolution>>(() =>
    initialClassResolutions(result),
  );
  const [bootstrapState, setBootstrapState] = useState<'loading' | 'ready' | 'unavailable'>(
    'loading',
  );
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void requestOperationalWorkspaceV1(
      { contractVersion: OPERATIONAL_WORKSPACE_TRANSPORT_VERSION_V1, operation: 'bootstrap' },
      controller.signal,
    )
      .then((response) => {
        if (response.state !== 'ready' || !('availableAcademicYears' in response)) {
          setBootstrapState('unavailable');
          return;
        }
        setAcademicYears(response.availableAcademicYears);
        setBootstrapState('ready');
        if (response.availableAcademicYears.length === 1) {
          setDraft((current) => ({
            academicYearId: response.availableAcademicYears[0]!.id,
            sheets: current.sheets,
          }));
        }
      })
      .catch((cause: unknown) => {
        if (!(cause instanceof DOMException && cause.name === 'AbortError')) {
          setBootstrapState('unavailable');
        }
      });
    return () => controller.abort();
  }, []);

  function invalidateConfirmation() {
    if (confirmed) setConfirmed(false);
    onReady(false);
  }

  function selectAcademicYear(id: string) {
    invalidateConfirmation();
    setDraft({ academicYearId: id, sheets: {} });
    setClassResolutions(initialClassResolutions(result));
  }

  async function loadClassCenter(classLabel: string, classGroupId: string) {
    if (!draft.academicYearId || !classGroupId) return;
    setClassResolutions((current) => ({
      ...current,
      [classLabel]: {
        ...(current[classLabel] ?? initialClassResolutions(result)[classLabel]!),
        selectedId: classGroupId,
        center: null,
        loading: true,
        error: null,
      },
    }));
    try {
      const response = await requestOperationalWorkspaceV1({
        contractVersion: OPERATIONAL_WORKSPACE_TRANSPORT_VERSION_V1,
        operation: 'class-group',
        academicYearId: draft.academicYearId as AcademicYearId,
        id: classGroupId as never,
      });
      if (response.state !== 'ready' || !('view' in response) || response.view.kind !== 'class-group') {
        throw new Error('class-group-unavailable');
      }
      const center = response.view;
      setClassResolutions((current) => ({
        ...current,
        [classLabel]: {
          ...(current[classLabel] ?? initialClassResolutions(result)[classLabel]!),
          selectedId: classGroupId,
          center,
          loading: false,
          error: null,
        },
      }));
      invalidateConfirmation();
      setDraft((current) => applyCenterDefaults(result, classLabel, center, current));
    } catch {
      setClassResolutions((current) => ({
        ...current,
        [classLabel]: {
          ...(current[classLabel] ?? initialClassResolutions(result)[classLabel]!),
          selectedId: classGroupId,
          center: null,
          loading: false,
          error: 'Não foi possível carregar a turma selecionada.',
        },
      }));
    }
  }

  async function searchClass(classLabel: string) {
    const current = classResolutions[classLabel];
    if (!draft.academicYearId || !current?.query.trim()) return;
    invalidateConfirmation();
    setClassResolutions((state) => ({
      ...state,
      [classLabel]: { ...current, candidates: [], selectedId: '', center: null, loading: true, error: null },
    }));
    try {
      const response = await requestOperationalWorkspaceV1({
        contractVersion: OPERATIONAL_WORKSPACE_TRANSPORT_VERSION_V1,
        operation: 'search',
        request: {
          contractVersion: GLOBAL_SEARCH_CONTRACT_VERSION_V1,
          academicYearId: draft.academicYearId as AcademicYearId,
          query: current.query,
          scope: { kinds: ['class-group'] },
          page: { limit: 20, cursor: null },
          order: GLOBAL_SEARCH_ORDER_V1,
        },
      });
      const candidates =
        response.state === 'ready' && 'search' in response
          ? response.search.items.flatMap((item) =>
              item.kind === 'class-group' ? [{ id: item.id, label: item.code }] : [],
            )
          : [];
      const unique =
        candidates.length === 1 &&
        response.state === 'ready' &&
        'search' in response &&
        response.search.nextCursor === null
          ? candidates[0]!
          : null;
      setClassResolutions((state) => ({
        ...state,
        [classLabel]: {
          ...(state[classLabel] ?? current),
          candidates,
          selectedId: unique?.id ?? '',
          center: null,
          loading: Boolean(unique),
          error: candidates.length === 0 ? 'Nenhuma turma encontrada com essa busca.' : null,
        },
      }));
      if (unique) await loadClassCenter(classLabel, unique.id);
    } catch {
      setClassResolutions((state) => ({
        ...state,
        [classLabel]: {
          ...(state[classLabel] ?? current),
          candidates: [],
          selectedId: '',
          center: null,
          loading: false,
          error: 'A pesquisa de turmas está indisponível.',
        },
      }));
    }
  }

  function updateAssignment(sheetName: string, teachingAssignmentId: string) {
    invalidateConfirmation();
    setDraft((current) => ({
      ...current,
      sheets: {
        ...current.sheets,
        [sheetName]: {
          ...(current.sheets[sheetName] ?? { students: {} }),
          teachingAssignmentId,
        },
      },
    }));
  }

  function updateStudent(
    sheetName: string,
    row: number,
    enrollmentId: string,
    center: OperationalWorkspaceClassGroupCenterViewV1,
  ) {
    const enrollment = center.students.find(
      (candidate) => candidate.id === enrollmentId && candidate.position === 'current',
    );
    invalidateConfirmation();
    setDraft((current) => {
      const refs = current.sheets[sheetName] ?? { teachingAssignmentId: '', students: {} };
      return {
        ...current,
        sheets: {
          ...current.sheets,
          [sheetName]: {
            ...refs,
            students: {
              ...refs.students,
              [row]: enrollment?.student
                ? { studentId: enrollment.student.id, enrollmentId: enrollment.id }
                : { studentId: '', enrollmentId: '' },
            },
          },
        },
      };
    });
  }

  const isComplete = complete(result, draft);
  const disabled = !isComplete || !confirmed || externalBusy;

  return (
    <Surface variant="secondary" className="mt-5 rounded-2xl p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="mr-auto font-semibold">Confirmar correspondências da escola</h4>
        <span className="text-xs font-medium">{responseLabel(persistence)}</span>
      </div>
      <p className="mt-2 text-xs text-muted">
        O arquivo permanece no navegador. Antes de gravar, confirme a qual ano, turma, disciplina e
        aluno cada informação reconhecida pertence.
      </p>

      {bootstrapState === 'unavailable' && (
        <Alert status="danger" className="mt-4">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>Cadastro acadêmico indisponível</Alert.Title>
            <Alert.Description>
              Não é possível confirmar a importação sem consultar os cadastros oficiais.
            </Alert.Description>
          </Alert.Content>
        </Alert>
      )}

      <label className="mt-4 block text-xs font-medium">
        Ano letivo
        <select
          value={draft.academicYearId}
          disabled={bootstrapState !== 'ready'}
          onChange={(event) => selectAcademicYear(event.target.value)}
          className="mt-1 h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm"
        >
          <option value="">Selecione o ano letivo</option>
          {academicYears.map((year) => (
            <option key={year.id} value={year.id}>
              {year.label}
            </option>
          ))}
        </select>
      </label>

      {draft.academicYearId && (
        <div className="mt-4 space-y-4">
          {classLabels.map((classLabel) => {
            const resolution = classResolutions[classLabel] ?? initialClassResolutions(result)[classLabel]!;
            return (
              <Surface key={classLabel} variant="default" className="rounded-xl border border-border p-3">
                <p className="text-sm font-semibold">Turma da planilha: {classLabel}</p>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <label className="min-w-0 flex-1 text-xs font-medium">
                    Pesquisar turma oficial
                    <input
                      value={resolution.query}
                      onChange={(event) => {
                        invalidateConfirmation();
                        setClassResolutions((current) => ({
                          ...current,
                          [classLabel]: { ...resolution, query: event.target.value },
                        }));
                      }}
                      className="mt-1 h-9 w-full rounded-xl border border-border bg-transparent px-3 text-sm"
                      autoComplete="off"
                    />
                  </label>
                  <Button
                    className="sm:self-end"
                    size="sm"
                    variant="secondary"
                    isPending={resolution.loading && resolution.center === null}
                    onPress={() => void searchClass(classLabel)}
                  >
                    Buscar turma
                  </Button>
                </div>

                {resolution.candidates.length > 0 && (
                  <label className="mt-3 block text-xs font-medium">
                    Turma oficial
                    <select
                      value={resolution.selectedId}
                      onChange={(event) => {
                        const id = event.target.value;
                        invalidateConfirmation();
                        setClassResolutions((current) => ({
                          ...current,
                          [classLabel]: { ...resolution, selectedId: id, center: null, error: null },
                        }));
                        if (id) void loadClassCenter(classLabel, id);
                      }}
                      className="mt-1 h-9 w-full rounded-xl border border-border bg-surface px-3 text-sm"
                    >
                      <option value="">Selecione a turma encontrada</option>
                      {resolution.candidates.map((candidate) => (
                        <option key={candidate.id} value={candidate.id}>
                          {candidate.label}
                        </option>
                      ))}
                    </select>
                  </label>
                )}

                {resolution.error && <p className="mt-2 text-xs text-danger">{resolution.error}</p>}

                {resolution.center && (
                  <div className="mt-4 space-y-4">
                    {result.summary.gradeSheets
                      .filter(
                        (sheet) =>
                          sheet.stage !== 'overview' &&
                          normalized(sheet.className) === normalized(classLabel),
                      )
                      .map((sheet) => {
                        const refs = draft.sheets[sheet.name] ?? {
                          teachingAssignmentId: '',
                          students: {},
                        };
                        const center = resolution.center!;
                        const studentOptions = center.students.filter(
                          (enrollment) => enrollment.position === 'current' && enrollment.student !== null,
                        );
                        return (
                          <details key={sheet.name} open className="rounded-xl border border-border/70 p-3">
                            <summary className="cursor-pointer text-sm font-medium">
                              {sheet.discipline || 'Componente sem rótulo'} · {sheet.name}
                            </summary>
                            <label className="mt-3 block text-xs font-medium">
                              Disciplina e professor
                              <select
                                value={refs.teachingAssignmentId}
                                onChange={(event) => updateAssignment(sheet.name, event.target.value)}
                                className="mt-1 h-9 w-full rounded-xl border border-border bg-surface px-3 text-sm"
                              >
                                <option value="">Selecione a disciplina</option>
                                {center.assignments.map((assignment) => (
                                  <option key={assignment.id} value={assignment.id}>
                                    {assignment.subject?.label ?? 'Componente sem identificação'} —{' '}
                                    {assignment.teacher?.label ?? 'Docente sem identificação'}
                                  </option>
                                ))}
                              </select>
                            </label>

                            <div className="mt-3 max-h-80 space-y-2 overflow-auto">
                              {sheet.students.map((student) => {
                                const selected = refs.students[student.row]?.enrollmentId ?? '';
                                return (
                                  <label
                                    key={student.row}
                                    className="grid gap-2 rounded-lg border border-border/60 p-2 text-xs sm:grid-cols-[minmax(10rem,1fr)_minmax(14rem,1fr)] sm:items-center"
                                  >
                                    <span>
                                      <strong>{student.number}</strong> · {student.name}
                                    </span>
                                    <select
                                      aria-label={`Aluno oficial para ${student.name}`}
                                      value={selected}
                                      onChange={(event) =>
                                        updateStudent(sheet.name, student.row, event.target.value, center)
                                      }
                                      className="h-8 rounded-lg border border-border bg-surface px-2 text-xs"
                                    >
                                      <option value="">Selecione o aluno oficial</option>
                                      {studentOptions.map((enrollment) => (
                                        <option key={enrollment.id} value={enrollment.id}>
                                          {enrollment.student?.label}
                                        </option>
                                      ))}
                                    </select>
                                  </label>
                                );
                              })}
                            </div>
                          </details>
                        );
                      })}
                  </div>
                )}
              </Surface>
            );
          })}
        </div>
      )}

      {isComplete && (
        <label className="mt-4 flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(event) => {
              const checked = event.target.checked;
              setConfirmed(checked);
              onReady(checked && isComplete);
            }}
            className="mt-1"
          />
          <span>
            Conferi as correspondências de ano, turma, disciplina/professor e alunos deste arquivo.
          </span>
        </label>
      )}

      {persistence.state === 'completed' && 'summary' in persistence.response && (
        <Alert
          status={
            persistence.response.state === 'applied' || persistence.response.state === 'no-changes'
              ? 'success'
              : 'warning'
          }
          className="mt-4"
        >
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>{responseLabel(persistence)}</Alert.Title>
            <Alert.Description>
              {persistence.response.summary.committedWrites.total} gravação(ões) confirmadas no lote
              atômico.
            </Alert.Description>
          </Alert.Content>
        </Alert>
      )}

      <Button
        className="mt-4"
        variant="primary"
        isDisabled={disabled}
        isPending={persistence.state === 'persisting'}
        onPress={() =>
          void onPersist({
            academicYearId: draft.academicYearId as AcademicYearId,
            sheetsByName: Object.fromEntries(
              Object.entries(draft.sheets).map(([name, refs]) => [
                name,
                {
                  teachingAssignmentId: refs.teachingAssignmentId as TeachingAssignmentId,
                  studentsByRow: Object.fromEntries(
                    Object.entries(refs.students).map(([row, student]) => [
                      Number(row),
                      {
                        studentId: student.studentId as StudentId,
                        enrollmentId: student.enrollmentId as EnrollmentId,
                      },
                    ]),
                  ),
                },
              ]),
            ),
          })
        }
      >
        Confirmar e gravar este arquivo
      </Button>
    </Surface>
  );
}
