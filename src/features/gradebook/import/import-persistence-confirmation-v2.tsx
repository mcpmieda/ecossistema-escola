import { useMemo, useState } from 'react';
import { Alert, Button, Surface } from '@heroui/react';
import type {
  AcademicYearId,
  EnrollmentId,
  StudentId,
  TeachingAssignmentId,
} from '../../../../shared/gradebook-contracts/entities';
import type { BatchSuccess } from './import-batch';
import type { ConfirmedImportReferencesV2 } from './import-persistence-client-v2';
import type { ImportPersistenceStateV4 } from './use-import-batch';

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
  const [draft, setDraft] = useState<Draft>({ academicYearId: '', sheets: {} });
  const isComplete = useMemo(() => complete(result, draft), [draft, result]);

  function update(next: Draft) {
    setDraft(next);
    onReady(complete(result, next));
  }

  const disabled = !isComplete || externalBusy;
  return (
    <Surface variant="secondary" className="mt-5 rounded-2xl p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="mr-auto font-semibold">Confirmar referências acadêmicas oficiais</h4>
        <span className="text-xs font-medium">{responseLabel(persistence)}</span>
      </div>
      <p className="mt-2 text-xs text-muted">
        Os rótulos da planilha são apenas sugestões. Informe somente IDs opacos obtidos no espaço
        acadêmico oficial.
      </p>
      <label className="mt-4 block text-xs font-medium">
        AcademicYearId
        <input
          value={draft.academicYearId}
          onChange={(event) => update({ ...draft, academicYearId: event.target.value })}
          className="mt-1 h-10 w-full rounded-xl border border-border bg-transparent px-3 text-sm"
          autoComplete="off"
        />
      </label>
      <div className="mt-4 space-y-4">
        {result.summary.gradeSheets
          .filter((sheet) => sheet.stage !== 'overview')
          .map((sheet) => {
            const refs = draft.sheets[sheet.name] ?? { teachingAssignmentId: '', students: {} };
            return (
              <details key={sheet.name} className="rounded-xl border border-border p-3">
                <summary className="cursor-pointer text-sm font-medium">
                  {sheet.name} · {sheet.className} · {sheet.discipline}
                </summary>
                <label className="mt-3 block text-xs font-medium">
                  TeachingAssignmentId
                  <input
                    value={refs.teachingAssignmentId}
                    onChange={(event) =>
                      update({
                        ...draft,
                        sheets: {
                          ...draft.sheets,
                          [sheet.name]: { ...refs, teachingAssignmentId: event.target.value },
                        },
                      })
                    }
                    className="mt-1 h-9 w-full rounded-xl border border-border bg-transparent px-3 text-sm"
                    autoComplete="off"
                  />
                </label>
                <div className="mt-3 max-h-72 space-y-2 overflow-auto">
                  {sheet.students.map((student) => {
                    const studentRefs = refs.students[student.row] ?? {
                      studentId: '',
                      enrollmentId: '',
                    };
                    return (
                      <div
                        key={student.row}
                        className="grid gap-2 rounded-lg border border-border/60 p-2 sm:grid-cols-[minmax(8rem,1fr)_minmax(10rem,1fr)_minmax(10rem,1fr)]"
                      >
                        <span className="text-xs">
                          <strong>{student.number}</strong> · {student.name}
                        </span>
                        <input
                          aria-label={`StudentId ${sheet.name} linha ${student.row}`}
                          placeholder="StudentId"
                          value={studentRefs.studentId}
                          onChange={(event) =>
                            update({
                              ...draft,
                              sheets: {
                                ...draft.sheets,
                                [sheet.name]: {
                                  ...refs,
                                  students: {
                                    ...refs.students,
                                    [student.row]: {
                                      ...studentRefs,
                                      studentId: event.target.value,
                                    },
                                  },
                                },
                              },
                            })
                          }
                          className="h-8 rounded-lg border border-border bg-transparent px-2 text-xs"
                          autoComplete="off"
                        />
                        <input
                          aria-label={`EnrollmentId ${sheet.name} linha ${student.row}`}
                          placeholder="EnrollmentId"
                          value={studentRefs.enrollmentId}
                          onChange={(event) =>
                            update({
                              ...draft,
                              sheets: {
                                ...draft.sheets,
                                [sheet.name]: {
                                  ...refs,
                                  students: {
                                    ...refs.students,
                                    [student.row]: {
                                      ...studentRefs,
                                      enrollmentId: event.target.value,
                                    },
                                  },
                                },
                              },
                            })
                          }
                          className="h-8 rounded-lg border border-border bg-transparent px-2 text-xs"
                          autoComplete="off"
                        />
                      </div>
                    );
                  })}
                </div>
              </details>
            );
          })}
      </div>
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
              {persistence.response.summary.committedWrites.total} write(s) confirmados no limite
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
        Persistir este arquivo
      </Button>
    </Surface>
  );
}
