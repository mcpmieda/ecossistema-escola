import { useEffect, useState } from 'react';
import { Alert, Button, Surface } from '@heroui/react';
import type { AcademicYearId } from '../../../../shared/gradebook-contracts/entities';
import { OPERATIONAL_WORKSPACE_TRANSPORT_VERSION_V1 } from '../../../../shared/gradebook-contracts/operational-workspace/operational-workspace-transport-v1';
import type { BatchSuccess } from './import-batch';
import {
  inspectOfficialRosterV5,
  type ConfirmedImportContextV5,
} from './import-persistence-client-v2';
import type { ImportPersistenceStateV5 } from './use-import-batch';
import { requestOperationalWorkspaceV1 } from '../operational-workspace/operational-workspace-client';
import type { GradebookImportPersistenceResponseV5 } from '../../../../shared/gradebook-contracts/imports/import-persistence-transport-v5';

type AcademicYearOption = { readonly id: AcademicYearId; readonly label: string };

function responseLabel(state: ImportPersistenceStateV5): string {
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

function planningFailureBreakdown(response: GradebookImportPersistenceResponseV5): string | null {
  if (
    !('issues' in response) ||
    !('summary' in response) ||
    !response.issues.some((issue) => issue.code === 'planning-failed')
  ) {
    return null;
  }
  const parts: string[] = [];
  if (response.summary.assessmentComponents.blocked > 0) {
    parts.push(`componentes (${response.summary.assessmentComponents.blocked})`);
  }
  if (response.summary.academicRecords.blocked > 0) {
    parts.push(`registros acadêmicos (${response.summary.academicRecords.blocked})`);
  }
  return parts.length > 0 ? ` Planner: ${parts.join(', ')}.` : null;
}

export function responseIssueLabel(
  response: GradebookImportPersistenceResponseV5,
): string | null {
  if (response.state === 'invalid-request') {
    return `Motivo técnico: ${response.reason}.`;
  }
  if (!('issues' in response) || response.issues.length === 0) return null;
  const codes = [...new Set(response.issues.map((issue) => issue.code))];
  return `Motivo técnico: ${codes.join(', ')}.${planningFailureBreakdown(response) ?? ''}`;
}

export function ImportPersistenceConfirmationV2({
  result,
  persistence,
  externalBusy,
  onReady,
  onPersist,
}: {
  result: BatchSuccess;
  persistence: ImportPersistenceStateV5;
  externalBusy: boolean;
  onReady: (ready: boolean) => void;
  onPersist: (context: ConfirmedImportContextV5) => Promise<void>;
}) {
  const [academicYears, setAcademicYears] = useState<readonly AcademicYearOption[]>([]);
  const [academicYearId, setAcademicYearId] = useState<AcademicYearId | ''>('');
  const [teacherName, setTeacherName] = useState(result.summary.teacherName ?? '');
  const [bootstrapState, setBootstrapState] = useState<'loading' | 'ready' | 'unavailable'>(
    'loading',
  );
  const [confirmed, setConfirmed] = useState(false);
  const roster = inspectOfficialRosterV5(result);

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
        const match = response.availableAcademicYears.find(
          (option) => option.label === String(result.summary.academicYear),
        );
        setAcademicYearId(match?.id ?? '');
        setBootstrapState('ready');
      })
      .catch((cause: unknown) => {
        if (!(cause instanceof DOMException && cause.name === 'AbortError')) {
          setBootstrapState('unavailable');
        }
      });
    return () => controller.abort();
  }, [result.summary.academicYear]);

  function invalidate() {
    setConfirmed(false);
    onReady(false);
  }

  const recognizedYear = result.summary.academicYear;
  const ready =
    bootstrapState === 'ready' &&
    roster.status === 'ready' &&
    academicYearId !== '' &&
    teacherName.trim().length > 0 &&
    typeof recognizedYear === 'number' &&
    Number.isSafeInteger(recognizedYear);

  return (
    <Surface variant="secondary" className="mt-5 rounded-2xl p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="mr-auto font-semibold">Confirmar cadastro pela planilha</h4>
        <span className="text-xs font-medium">{responseLabel(persistence)}</span>
      </div>
      <p className="mt-2 text-xs text-muted">
        O servidor reutiliza ou cria professor, turmas, disciplinas, alunos, matrículas e
        atribuições. Nenhum identificador técnico precisa ser digitado.
      </p>

      {bootstrapState === 'unavailable' && (
        <Alert status="danger" className="mt-4">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>Cadastro acadêmico indisponível</Alert.Title>
            <Alert.Description>Não foi possível consultar os anos letivos.</Alert.Description>
          </Alert.Content>
        </Alert>
      )}
      {bootstrapState === 'ready' && !academicYearId && (
        <Alert status="warning" className="mt-4">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>Ano letivo ainda não cadastrado</Alert.Title>
            <Alert.Description>
              Cadastre {String(recognizedYear ?? 'o ano reconhecido')} em Configurações e volte à
              importação.
            </Alert.Description>
          </Alert.Content>
        </Alert>
      )}
      {roster.status === 'review-required' && (
        <Alert status="warning" className="mt-4">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>Lista oficial requer revisão</Alert.Title>
            <Alert.Description>
              As listas do 1º, 2º e 3º trimestre precisam coincidir; REC pode conter somente alunos
              dessa lista.
            </Alert.Description>
          </Alert.Content>
        </Alert>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-medium">
          Ano letivo reconhecido
          <select
            value={academicYearId}
            disabled={bootstrapState !== 'ready'}
            onChange={(event) => {
              invalidate();
              setAcademicYearId(event.target.value as AcademicYearId | '');
            }}
            className="mt-1 h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm"
          >
            <option value="">Selecione o ano correspondente</option>
            {academicYears.map((year) => (
              <option key={year.id} value={year.id}>
                {year.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-medium">
          Professor reconhecido em CONFIGURAÇÃO!A2
          <input
            value={teacherName}
            onChange={(event) => {
              invalidate();
              setTeacherName(event.currentTarget.value);
            }}
            className="mt-1 h-10 w-full rounded-xl border border-border bg-transparent px-3 text-sm"
            autoComplete="off"
          />
        </label>
      </div>

      {roster.status === 'ready' && (
        <p className="mt-3 text-xs text-muted">
          {roster.classes} turma(s) e {roster.students} aluno(s) oficiais validados nas guias 1º, 2º
          e 3º. A guia REC será tratada como projeção automática; VG será ignorada.
        </p>
      )}

      {ready && (
        <label className="mt-4 flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(event) => {
              setConfirmed(event.target.checked);
              onReady(event.target.checked);
            }}
            className="mt-1"
          />
          <span>
            Conferi o ano e o professor. Autorizo o cadastro automático a partir da estrutura
            reconhecida.
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
              {persistence.response.summary.committedWrites.total} gravação(ões) acadêmicas
              confirmadas no lote atômico.
              {responseIssueLabel(persistence.response) && (
                <span className="mt-1 block">{responseIssueLabel(persistence.response)}</span>
              )}
            </Alert.Description>
          </Alert.Content>
        </Alert>
      )}

      {persistence.state === 'completed' &&
        !('summary' in persistence.response) &&
        responseIssueLabel(persistence.response) && (
          <Alert status="warning" className="mt-4">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Title>{responseLabel(persistence)}</Alert.Title>
              <Alert.Description>{responseIssueLabel(persistence.response)}</Alert.Description>
            </Alert.Content>
          </Alert>
        )}

      <Button
        className="mt-4"
        variant="primary"
        isDisabled={!ready || !confirmed || externalBusy}
        isPending={persistence.state === 'persisting'}
        onPress={() =>
          void onPersist({
            academicYearId: academicYearId as AcademicYearId,
            teacherName: teacherName.trim(),
          })
        }
      >
        Confirmar, cadastrar e gravar este arquivo
      </Button>
    </Surface>
  );
}
