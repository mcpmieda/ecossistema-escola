import { useRef, useState } from 'react';
import { Alert, Button, Card, Chip, Label, Spinner, Surface } from '@heroui/react';
import {
  CheckCircle2,
  ClipboardCheck,
  Eye,
  Filter,
  ListChecks,
  RotateCcw,
  Scale,
  ShieldAlert,
  Wrench,
} from 'lucide-react';
import type { AcademicYearId } from '../../../../shared/gradebook-contracts/entities';
import {
  AUDIT_OCCURRENCE_STATES_V1,
  AUDIT_SEVERITIES_V1,
  RECONCILIATION_STATUSES_V1,
  type AuditOccurrenceStateV1,
  type ReconciliationResultId,
  type ReconciliationTargetV1,
} from '../../../../shared/gradebook-contracts/audit/audit-contract-v1';
import {
  AUDIT_WORKSPACE_COLLECTIONS_V1,
  AUDIT_WORKSPACE_CONTRACT_VERSION_V1,
  AUDIT_WORKSPACE_ORDERS_V1,
  type AuditWorkspaceCollectionV1,
  type AuditWorkspaceCursorV1,
  type AuditWorkspaceDetailReferenceV1,
  type AuditWorkspaceDetailV1,
  type AuditWorkspaceFiltersV1,
  type AuditWorkspaceListItemV1,
  type AuditWorkspaceListRequestV1,
  type AuditWorkspaceResolutionTransitionV1,
} from '../../../../shared/gradebook-contracts/audit-workspace/audit-workspace-contract-v1';
import { IMPORT_BATCH_STATUSES_V1 } from '../../../../shared/gradebook-contracts/imports/import-contract-v1';
import type { ImportBatchId } from '../../../../shared/gradebook-contracts/imports/import-ids-v1';
import {
  OPERATIONAL_WORKSPACE_CONTRACT_VERSION_V1,
  type OperationalWorkspaceAcademicYearOptionV1,
} from '../../../../shared/gradebook-contracts/operational-workspace/operational-workspace-contract-v1';
import { requestOperationalWorkspaceV1 } from '../operational-workspace/operational-workspace-client';
import {
  AuditWorkspaceClientErrorV1,
  DETERMINISTIC_CORRECTION_TRANSPORT_VERSION_V2,
  requestAuditWorkspaceDetailV1,
  requestAuditWorkspaceListV1,
  requestAuditWorkspaceResolutionV1,
  requestDeterministicCorrectionExecutionV2,
  requestDeterministicCorrectionInspectionV2,
  type DeterministicCorrectionCaseSummaryV2,
} from './audit-workspace-client';

type ViewState = 'idle' | 'loading' | 'ready' | 'empty' | 'unavailable' | 'not-authorized';
type ResolutionAction = 'acknowledged' | 'resolved' | 'dismissed-with-reason';

type FilterDraft = {
  importBatchId: string;
  importBatchStatus: string;
  occurrenceState: string;
  severity: string;
  category: string;
  recordType: string;
  reconciliationStatus: string;
  fromInclusive: string;
  toExclusive: string;
};

const EMPTY_DRAFT: FilterDraft = {
  importBatchId: '',
  importBatchStatus: '',
  occurrenceState: '',
  severity: '',
  category: '',
  recordType: '',
  reconciliationStatus: '',
  fromInclusive: '',
  toExclusive: '',
};

const RECORD_TYPES = [
  'grade-entry',
  'term-result',
  'final-recovery',
  'annual-result',
] as const satisfies readonly ReconciliationTargetV1['kind'][];

const COLLECTION_LABELS: Record<AuditWorkspaceCollectionV1, string> = {
  'import-batches': 'Lotes',
  'audit-occurrences': 'Ocorrências',
  reconciliations: 'Reconciliações',
};

function friendlyInstant(value: string): string {
  return value
    .replace('T', ' ')
    .replace(/\.\d{3}Z$/u, ' UTC')
    .replace(/Z$/u, ' UTC');
}

function presentationLabel(value: string): string {
  return value.replaceAll('-', ' ');
}

function clientFailureState(error: unknown): Extract<ViewState, 'unavailable' | 'not-authorized'> {
  return error instanceof AuditWorkspaceClientErrorV1 && error.code === 'not-authorized'
    ? 'not-authorized'
    : 'unavailable';
}

function filtersFromDraft(
  collection: AuditWorkspaceCollectionV1,
  draft: FilterDraft,
): AuditWorkspaceFiltersV1 {
  const period =
    draft.fromInclusive || draft.toExclusive
      ? {
          fromInclusive: draft.fromInclusive || null,
          toExclusive: draft.toExclusive || null,
        }
      : undefined;

  if (collection === 'import-batches') {
    return {
      ...(draft.importBatchId.trim()
        ? { importBatchId: draft.importBatchId.trim() as ImportBatchId }
        : {}),
      ...(draft.importBatchStatus
        ? {
            importBatchStatuses: [
              draft.importBatchStatus as (typeof IMPORT_BATCH_STATUSES_V1)[number],
            ],
          }
        : {}),
      ...(period ? { period } : {}),
    };
  }

  if (collection === 'audit-occurrences') {
    return {
      ...(draft.importBatchId.trim()
        ? { importBatchId: draft.importBatchId.trim() as ImportBatchId }
        : {}),
      ...(draft.occurrenceState
        ? {
            occurrenceStates: [
              draft.occurrenceState as (typeof AUDIT_OCCURRENCE_STATES_V1)[number],
            ],
          }
        : {}),
      ...(draft.severity
        ? { severities: [draft.severity as (typeof AUDIT_SEVERITIES_V1)[number]] }
        : {}),
      ...(draft.category.trim() ? { categories: [draft.category.trim()] } : {}),
      ...(period ? { period } : {}),
    };
  }

  return {
    ...(draft.recordType
      ? { recordTypes: [draft.recordType as ReconciliationTargetV1['kind']] }
      : {}),
    ...(draft.reconciliationStatus
      ? {
          reconciliationStatuses: [
            draft.reconciliationStatus as (typeof RECONCILIATION_STATUSES_V1)[number],
          ],
        }
      : {}),
    ...(period ? { period } : {}),
  };
}

function listRequest(
  academicYearId: AcademicYearId,
  collection: AuditWorkspaceCollectionV1,
  filters: AuditWorkspaceFiltersV1,
  cursor: AuditWorkspaceCursorV1 | null,
): AuditWorkspaceListRequestV1 {
  const page = { limit: 20, cursor };
  switch (collection) {
    case 'import-batches':
      return {
        contractVersion: AUDIT_WORKSPACE_CONTRACT_VERSION_V1,
        academicYearId,
        collection,
        filters,
        page,
        order: AUDIT_WORKSPACE_ORDERS_V1['import-batches'],
      };
    case 'audit-occurrences':
      return {
        contractVersion: AUDIT_WORKSPACE_CONTRACT_VERSION_V1,
        academicYearId,
        collection,
        filters,
        page,
        order: AUDIT_WORKSPACE_ORDERS_V1['audit-occurrences'],
      };
    case 'reconciliations':
      return {
        contractVersion: AUDIT_WORKSPACE_CONTRACT_VERSION_V1,
        academicYearId,
        collection,
        filters,
        page,
        order: AUDIT_WORKSPACE_ORDERS_V1.reconciliations,
      };
  }
}

function WorkspaceStateAlert({
  state,
}: {
  state: Extract<ViewState, 'empty' | 'unavailable' | 'not-authorized'>;
}) {
  if (state === 'not-authorized') {
    return (
      <Alert status="warning">
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Title>Acesso não autorizado</Alert.Title>
          <Alert.Description>
            Sua sessão não possui autorização para consultar o workspace de Auditoria.
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
          <Alert.Title>Auditoria indisponível neste ambiente</Alert.Title>
          <Alert.Description>
            O workspace permanece fechado quando o runtime acadêmico local ou de preview não está
            disponível.
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
          Não há contexto acadêmico configurado para revisar neste ambiente.
        </Alert.Description>
      </Alert.Content>
    </Alert>
  );
}

function FilterPanel({
  collection,
  draft,
  onChange,
  onApply,
  onClear,
  loading,
}: {
  collection: AuditWorkspaceCollectionV1;
  draft: FilterDraft;
  onChange: (draft: FilterDraft) => void;
  onApply: () => void;
  onClear: () => void;
  loading: boolean;
}) {
  const inputClass =
    'h-10 w-full rounded-xl border border-border bg-transparent px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-focus';
  const set = (key: keyof FilterDraft, value: string) => onChange({ ...draft, [key]: value });

  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        onApply();
      }}
    >
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {(collection === 'import-batches' || collection === 'audit-occurrences') && (
          <div>
            <Label htmlFor="audit-filter-batch" className="mb-1.5 block text-sm font-medium">
              ID do lote
            </Label>
            <input
              id="audit-filter-batch"
              className={inputClass}
              value={draft.importBatchId}
              onChange={(event) => set('importBatchId', event.currentTarget.value)}
              placeholder="Identidade opaca do lote"
            />
          </div>
        )}

        {collection === 'import-batches' && (
          <div>
            <Label htmlFor="audit-filter-batch-status" className="mb-1.5 block text-sm font-medium">
              Situação do lote
            </Label>
            <select
              id="audit-filter-batch-status"
              className={inputClass}
              value={draft.importBatchStatus}
              onChange={(event) => set('importBatchStatus', event.currentTarget.value)}
            >
              <option value="">Todas</option>
              {IMPORT_BATCH_STATUSES_V1.map((status) => (
                <option key={status} value={status}>
                  {presentationLabel(status)}
                </option>
              ))}
            </select>
          </div>
        )}

        {collection === 'audit-occurrences' && (
          <>
            <div>
              <Label
                htmlFor="audit-filter-occurrence-state"
                className="mb-1.5 block text-sm font-medium"
              >
                Estado da ocorrência
              </Label>
              <select
                id="audit-filter-occurrence-state"
                className={inputClass}
                value={draft.occurrenceState}
                onChange={(event) => set('occurrenceState', event.currentTarget.value)}
              >
                <option value="">Todos</option>
                {AUDIT_OCCURRENCE_STATES_V1.map((state) => (
                  <option key={state} value={state}>
                    {presentationLabel(state)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="audit-filter-severity" className="mb-1.5 block text-sm font-medium">
                Gravidade
              </Label>
              <select
                id="audit-filter-severity"
                className={inputClass}
                value={draft.severity}
                onChange={(event) => set('severity', event.currentTarget.value)}
              >
                <option value="">Todas</option>
                {AUDIT_SEVERITIES_V1.map((severity) => (
                  <option key={severity} value={severity}>
                    {presentationLabel(severity)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="audit-filter-category" className="mb-1.5 block text-sm font-medium">
                Categoria exata
              </Label>
              <input
                id="audit-filter-category"
                className={inputClass}
                value={draft.category}
                onChange={(event) => set('category', event.currentTarget.value)}
                placeholder="Categoria"
              />
            </div>
          </>
        )}

        {collection === 'reconciliations' && (
          <>
            <div>
              <Label
                htmlFor="audit-filter-record-type"
                className="mb-1.5 block text-sm font-medium"
              >
                Tipo de registro
              </Label>
              <select
                id="audit-filter-record-type"
                className={inputClass}
                value={draft.recordType}
                onChange={(event) => set('recordType', event.currentTarget.value)}
              >
                <option value="">Todos</option>
                {RECORD_TYPES.map((kind) => (
                  <option key={kind} value={kind}>
                    {presentationLabel(kind)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label
                htmlFor="audit-filter-reconciliation-status"
                className="mb-1.5 block text-sm font-medium"
              >
                Resultado da reconciliação
              </Label>
              <select
                id="audit-filter-reconciliation-status"
                className={inputClass}
                value={draft.reconciliationStatus}
                onChange={(event) => set('reconciliationStatus', event.currentTarget.value)}
              >
                <option value="">Todos</option>
                {RECONCILIATION_STATUSES_V1.map((status) => (
                  <option key={status} value={status}>
                    {presentationLabel(status)}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}

        <div>
          <Label htmlFor="audit-filter-from" className="mb-1.5 block text-sm font-medium">
            A partir de
          </Label>
          <input
            id="audit-filter-from"
            type="date"
            className={inputClass}
            value={draft.fromInclusive}
            onChange={(event) => set('fromInclusive', event.currentTarget.value)}
          />
        </div>
        <div>
          <Label htmlFor="audit-filter-to" className="mb-1.5 block text-sm font-medium">
            Antes de
          </Label>
          <input
            id="audit-filter-to"
            type="date"
            className={inputClass}
            value={draft.toExclusive}
            onChange={(event) => set('toExclusive', event.currentTarget.value)}
          />
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="primary" size="sm" isDisabled={loading}>
          <Filter className="size-4" />
          Aplicar filtros
        </Button>
        <Button type="button" variant="outline" size="sm" onPress={onClear} isDisabled={loading}>
          <RotateCcw className="size-4" />
          Limpar filtros
        </Button>
      </div>
    </form>
  );
}

function ListItemButton({
  item,
  onOpen,
}: {
  item: AuditWorkspaceListItemV1;
  onOpen: (reference: AuditWorkspaceDetailReferenceV1) => void;
}) {
  if (item.kind === 'import-batch') {
    return (
      <Button
        variant="ghost"
        fullWidth
        className="h-auto justify-start px-3 py-3 text-left"
        onPress={() => onOpen(item.reference)}
      >
        <ClipboardCheck className="size-4 shrink-0 text-muted" />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{item.reference.id}</span>
          <span className="block text-xs text-muted">
            Atualizado em {friendlyInstant(item.updatedAt)}
          </span>
        </span>
        <Chip size="sm" variant="soft">
          {presentationLabel(item.status)}
        </Chip>
      </Button>
    );
  }
  if (item.kind === 'audit-occurrence') {
    return (
      <Button
        variant="ghost"
        fullWidth
        className="h-auto justify-start px-3 py-3 text-left"
        onPress={() => onOpen(item.reference)}
      >
        <ShieldAlert className="size-4 shrink-0 text-muted" />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{item.category}</span>
          <span className="block truncate text-xs text-muted">
            {item.reference.id} · {friendlyInstant(item.createdAt)}
          </span>
        </span>
        <span className="flex flex-wrap justify-end gap-1">
          <Chip size="sm" variant="soft">
            {presentationLabel(item.severity)}
          </Chip>
          <Chip size="sm" variant="soft">
            {presentationLabel(item.state)}
          </Chip>
        </span>
      </Button>
    );
  }
  return (
    <Button
      variant="ghost"
      fullWidth
      className="h-auto justify-start px-3 py-3 text-left"
      onPress={() => onOpen(item.reference)}
    >
      <Scale className="size-4 shrink-0 text-muted" />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">
          {presentationLabel(item.target.kind)} · {item.target.id}
        </span>
        <span className="block truncate text-xs text-muted">
          Regra {item.ruleVersion} · {friendlyInstant(item.recordedAt)}
        </span>
      </span>
      <Chip size="sm" variant="soft">
        {presentationLabel(item.status)}
      </Chip>
    </Button>
  );
}

function PendingItems({
  detail,
  onOpen,
}: {
  detail: AuditWorkspaceDetailV1;
  onOpen: (reference: AuditWorkspaceDetailReferenceV1) => void;
}) {
  if (detail.pendingItems.length === 0) {
    return <p className="text-sm text-muted">Nenhuma pendência vinculada a este detalhe.</p>;
  }
  return (
    <ul className="grid gap-2" aria-label="Pendências do detalhe">
      {detail.pendingItems.map((pending, index) => {
        if (pending.kind === 'audit-occurrence') {
          return (
            <li key={`${pending.kind}:${pending.id}`}>
              <Button
                size="sm"
                variant="ghost"
                fullWidth
                className="justify-start"
                onPress={() => onOpen({ kind: 'audit-occurrence', id: pending.id })}
              >
                <ShieldAlert className="size-4" />
                Ocorrência · {pending.id}
              </Button>
            </li>
          );
        }
        if (pending.kind === 'reconciliation') {
          return (
            <li key={`${pending.kind}:${pending.id}`}>
              <Button
                size="sm"
                variant="ghost"
                fullWidth
                className="justify-start"
                onPress={() => onOpen({ kind: 'reconciliation', id: pending.id })}
              >
                <Scale className="size-4" />
                Reconciliação · {pending.id}
              </Button>
            </li>
          );
        }
        return (
          <li
            key={`${pending.kind}:${pending.importFileId}:${index}`}
            className="rounded-xl bg-default/40 px-3 py-2 text-sm"
          >
            Revisão de arquivo · {pending.importFileId}
          </li>
        );
      })}
    </ul>
  );
}

function resolutionOptions(state: AuditOccurrenceStateV1): readonly ResolutionAction[] {
  if (state === 'open') return ['acknowledged', 'resolved', 'dismissed-with-reason'];
  if (state === 'acknowledged') return ['resolved', 'dismissed-with-reason'];
  return [];
}

function transitionFor(
  state: AuditOccurrenceStateV1,
  action: ResolutionAction,
  text: string,
): AuditWorkspaceResolutionTransitionV1 | null {
  if (action === 'acknowledged') {
    if (state !== 'open') return null;
    return {
      previousState: 'open',
      nextState: 'acknowledged',
      ...(text.trim() ? { note: text.trim() } : {}),
    };
  }
  if (state !== 'open' && state !== 'acknowledged') return null;
  if (!text.trim()) return null;
  return action === 'resolved'
    ? { previousState: state, nextState: 'resolved', justification: text.trim() }
    : { previousState: state, nextState: 'dismissed-with-reason', justification: text.trim() };
}

function DeterministicCorrectionPanel({
  value,
  state,
  notice,
  onExecute,
}: {
  value: DeterministicCorrectionCaseSummaryV2 | null;
  state: ViewState;
  notice: string | null;
  onExecute: () => void;
}) {
  if (state === 'loading') {
    return (
      <Surface variant="secondary" className="rounded-2xl p-4" role="status">
        <div className="flex items-center gap-2 text-sm text-muted">
          <Spinner size="sm" color="accent" />
          Carregando investigação determinística…
        </div>
      </Surface>
    );
  }
  if (state === 'empty') {
    return (
      <Surface variant="secondary" className="rounded-2xl p-4">
        <p className="text-sm text-muted">
          Nenhum caso de investigação determinística foi encontrado para esta reconciliação.
        </p>
      </Surface>
    );
  }
  if ((state === 'unavailable' || state === 'not-authorized') && value === null) {
    return (
      <Alert status="warning">
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Title>Investigação indisponível</Alert.Title>
          <Alert.Description>
            O caso permanece bloqueado; nenhuma correção foi executada.
          </Alert.Description>
        </Alert.Content>
      </Alert>
    );
  }
  if (!value) return null;

  const eligible = value.automaticCorrection.state === 'eligible';
  const completed = value.correctionOutcome.state === 'completed';
  return (
    <Surface variant="secondary" className="rounded-2xl p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Wrench className="size-4 text-muted" />
        <h3 className="font-medium">Investigação e correção determinística</h3>
        <Chip size="sm" variant="soft">
          {presentationLabel(value.investigation.state)}
        </Chip>
        <Chip size="sm" variant="soft">
          {eligible ? 'elegível' : 'não elegível'}
        </Chip>
      </div>
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted">Divergência observada</dt>
          <dd className="font-medium">{presentationLabel(value.divergence.status)}</dd>
        </div>
        <div>
          <dt className="text-muted">Impacto acadêmico</dt>
          <dd className="font-medium">{presentationLabel(value.academicImpact.state)}</dd>
        </div>
        <div>
          <dt className="text-muted">Causa / bloqueio</dt>
          <dd className="font-medium">
            {eligible
              ? presentationLabel(value.automaticCorrection.rootCauseCode)
              : presentationLabel(value.automaticCorrection.reason)}
          </dd>
        </div>
        <div>
          <dt className="text-muted">Resultado da correção</dt>
          <dd className="font-medium">{presentationLabel(value.correctionOutcome.state)}</dd>
        </div>
        <div>
          <dt className="text-muted">Liberação institucional</dt>
          <dd className="font-medium">{presentationLabel(value.institutionalRelease.state)}</dd>
        </div>
        <div>
          <dt className="text-muted">Política do futuro piloto</dt>
          <dd className="font-medium">{presentationLabel(value.pilotFlow.state)}</dd>
        </div>
      </dl>
      {!eligible && (
        <p className="mt-3 text-sm text-muted">{value.automaticCorrection.explanation}</p>
      )}
      {value.pilotFlow.state === 'stop' && (
        <Alert status="danger" className="mt-4">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>Fluxo bloqueado para investigação</Alert.Title>
            <Alert.Description>
              A autoridade continua imported-source e o caso não pode ser liberado enquanto o stop
              estiver ativo.
            </Alert.Description>
          </Alert.Content>
        </Alert>
      )}
      {eligible && !completed && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button size="sm" variant="primary" onPress={onExecute}>
            <Wrench className="size-4" />
            Executar correção determinística
          </Button>
          <p className="text-xs text-muted">
            A operação usa CAS, planner, executor e transação oficiais; não altera a planilha.
          </p>
        </div>
      )}
      {notice && (
        <Alert status={completed ? 'success' : 'warning'} className="mt-4">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>
              {completed ? 'Correção registrada' : 'Correção não concluída'}
            </Alert.Title>
            <Alert.Description>{notice}</Alert.Description>
          </Alert.Content>
        </Alert>
      )}
    </Surface>
  );
}

function DetailCard({
  detail,
  headingRef,
  resolutionAction,
  resolutionText,
  resolutionState,
  resolutionNotice,
  onResolutionAction,
  onResolutionText,
  onResolve,
  onOpenPending,
  correctionCase,
  correctionState,
  correctionNotice,
  onExecuteCorrection,
}: {
  detail: AuditWorkspaceDetailV1;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  resolutionAction: ResolutionAction;
  resolutionText: string;
  resolutionState: ViewState;
  resolutionNotice: string | null;
  onResolutionAction: (action: ResolutionAction) => void;
  onResolutionText: (value: string) => void;
  onResolve: () => void;
  onOpenPending: (reference: AuditWorkspaceDetailReferenceV1) => void;
  correctionCase: DeterministicCorrectionCaseSummaryV2 | null;
  correctionState: ViewState;
  correctionNotice: string | null;
  onExecuteCorrection: () => void;
}) {
  const inputClass =
    'w-full rounded-xl border border-border bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-focus';

  return (
    <Card variant="default">
      <Card.Header>
        <div className="min-w-0">
          <Card.Description>Detalhe da Auditoria</Card.Description>
          <Card.Title ref={headingRef} tabIndex={-1} className="mt-1 break-all outline-none">
            {detail.reference.id}
          </Card.Title>
        </div>
        <Chip variant="soft">versão {detail.version}</Chip>
      </Card.Header>
      <Card.Content className="grid gap-5">
        <div className="grid gap-3 md:grid-cols-2">
          <Surface variant="secondary" className="rounded-2xl p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Tipo</p>
            <p className="mt-1 font-medium">{presentationLabel(detail.kind)}</p>
          </Surface>
          <Surface variant="secondary" className="rounded-2xl p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">
              Registrado em
            </p>
            <p className="mt-1 font-medium">{friendlyInstant(detail.recordedAt)}</p>
          </Surface>
        </div>

        {detail.kind === 'import-batch' && (
          <div className="grid gap-4">
            <Surface variant="secondary" className="rounded-2xl p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium">Lote de importação</p>
                  <p className="mt-1 text-sm text-muted">
                    {detail.record.summary.processedFileCount}/
                    {detail.record.summary.totalFileCount} arquivos processados
                  </p>
                </div>
                <Chip variant="soft">{presentationLabel(detail.record.status)}</Chip>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                <div>
                  <span className="text-muted">Aprovados</span>
                  <strong className="block">{detail.record.summary.approvedFileCount}</strong>
                </div>
                <div>
                  <span className="text-muted">Em revisão</span>
                  <strong className="block">{detail.record.summary.reviewRequiredFileCount}</strong>
                </div>
                <div>
                  <span className="text-muted">Rejeitados</span>
                  <strong className="block">{detail.record.summary.rejectedFileCount}</strong>
                </div>
                <div>
                  <span className="text-muted">Falhos</span>
                  <strong className="block">{detail.record.summary.failedFileCount}</strong>
                </div>
              </div>
            </Surface>
            <Alert status="default">
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Title>Elegibilidade de promoção — somente informativa</Alert.Title>
                <Alert.Description>
                  {detail.promotionEligibility.eligible === null
                    ? 'Nenhum plano de importação já produzido foi disponibilizado para esta projeção.'
                    : detail.promotionEligibility.eligible
                      ? 'O plano já existente informa elegibilidade.'
                      : 'O plano já existente informa que o lote ainda não está elegível.'}{' '}
                  Este workspace não executa promoção.
                </Alert.Description>
              </Alert.Content>
            </Alert>
          </div>
        )}

        {detail.kind === 'audit-occurrence' && (
          <Surface variant="secondary" className="rounded-2xl p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Chip variant="soft">{presentationLabel(detail.record.severity)}</Chip>
              <Chip variant="soft">{presentationLabel(detail.record.state)}</Chip>
              <Chip variant="soft">{detail.record.category}</Chip>
            </div>
            <p className="mt-4 text-sm leading-6">{detail.record.message}</p>
            {detail.record.recommendedAction && (
              <p className="mt-3 text-sm text-muted">
                Ação recomendada: {detail.record.recommendedAction}
              </p>
            )}
          </Surface>
        )}

        {detail.kind === 'reconciliation' && (
          <div className="grid gap-4">
            <Surface variant="secondary" className="rounded-2xl p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Chip variant="soft">{presentationLabel(detail.record.status)}</Chip>
                <Chip variant="soft">{presentationLabel(detail.record.target.kind)}</Chip>
              </div>
              <p className="mt-3 break-all text-sm">Alvo: {detail.record.target.id}</p>
              <p className="mt-1 text-sm text-muted">Regra: {detail.record.ruleVersion}</p>
              {'explanation' in detail.record && detail.record.explanation && (
                <p className="mt-3 text-sm leading-6 text-muted">{detail.record.explanation}</p>
              )}
            </Surface>
            <DeterministicCorrectionPanel
              value={correctionCase}
              state={correctionState}
              notice={correctionNotice}
              onExecute={onExecuteCorrection}
            />
          </div>
        )}

        <div>
          <h3 className="mb-2 font-medium">Pendências</h3>
          <PendingItems detail={detail} onOpen={onOpenPending} />
        </div>

        {detail.kind === 'audit-occurrence' &&
          resolutionOptions(detail.record.state).length > 0 && (
            <Surface variant="secondary" className="rounded-2xl p-4">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="size-4 text-muted" />
                <h3 className="font-medium">Registrar resolução</h3>
              </div>
              <form
                className="mt-4 grid gap-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  onResolve();
                }}
              >
                <div>
                  <Label
                    htmlFor="audit-resolution-action"
                    className="mb-1.5 block text-sm font-medium"
                  >
                    Ação
                  </Label>
                  <select
                    id="audit-resolution-action"
                    className={inputClass}
                    value={resolutionAction}
                    onChange={(event) =>
                      onResolutionAction(event.currentTarget.value as ResolutionAction)
                    }
                  >
                    {resolutionOptions(detail.record.state).map((action) => (
                      <option key={action} value={action}>
                        {presentationLabel(action)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label
                    htmlFor="audit-resolution-text"
                    className="mb-1.5 block text-sm font-medium"
                  >
                    {resolutionAction === 'acknowledged' ? 'Observação opcional' : 'Justificativa'}
                  </Label>
                  <textarea
                    id="audit-resolution-text"
                    className={`${inputClass} min-h-24 resize-y`}
                    value={resolutionText}
                    onChange={(event) => onResolutionText(event.currentTarget.value)}
                    required={resolutionAction !== 'acknowledged'}
                    placeholder={
                      resolutionAction === 'acknowledged'
                        ? 'Observação da conferência'
                        : 'Justificativa obrigatória'
                    }
                  />
                </div>
                <div className="flex items-center gap-3">
                  <Button
                    type="submit"
                    variant="primary"
                    size="sm"
                    isDisabled={
                      resolutionState === 'loading' ||
                      (resolutionAction !== 'acknowledged' && !resolutionText.trim())
                    }
                  >
                    {resolutionState === 'loading' && <Spinner size="sm" />}
                    Confirmar ação
                  </Button>
                  <p className="text-xs text-muted">
                    Identidade e instante efetivos são definidos pelo servidor.
                  </p>
                </div>
              </form>
              {resolutionNotice && (
                <Alert
                  status={resolutionState === 'ready' ? 'success' : 'warning'}
                  className="mt-4"
                >
                  <Alert.Indicator />
                  <Alert.Content>
                    <Alert.Title>
                      {resolutionState === 'ready'
                        ? 'Resolução registrada'
                        : 'Resolução não concluída'}
                    </Alert.Title>
                    <Alert.Description>{resolutionNotice}</Alert.Description>
                  </Alert.Content>
                </Alert>
              )}
            </Surface>
          )}
      </Card.Content>
    </Card>
  );
}

export function AuditWorkspacePage() {
  const [activated, setActivated] = useState(false);
  const [workspaceState, setWorkspaceState] = useState<ViewState>('idle');
  const [years, setYears] = useState<readonly OperationalWorkspaceAcademicYearOptionV1[]>([]);
  const [selectedYear, setSelectedYear] = useState<AcademicYearId | null>(null);
  const [collection, setCollection] = useState<AuditWorkspaceCollectionV1>('import-batches');
  const [draft, setDraft] = useState<FilterDraft>(EMPTY_DRAFT);
  const [appliedFilters, setAppliedFilters] = useState<AuditWorkspaceFiltersV1>({});
  const [listState, setListState] = useState<ViewState>('idle');
  const [items, setItems] = useState<readonly AuditWorkspaceListItemV1[]>([]);
  const [nextCursor, setNextCursor] = useState<AuditWorkspaceCursorV1 | null>(null);
  const [detailState, setDetailState] = useState<ViewState>('idle');
  const [detail, setDetail] = useState<AuditWorkspaceDetailV1 | null>(null);
  const [resolutionAction, setResolutionAction] = useState<ResolutionAction>('acknowledged');
  const [resolutionText, setResolutionText] = useState('');
  const [resolutionState, setResolutionState] = useState<ViewState>('idle');
  const [resolutionNotice, setResolutionNotice] = useState<string | null>(null);
  const [correctionCase, setCorrectionCase] = useState<DeterministicCorrectionCaseSummaryV2 | null>(
    null,
  );
  const [correctionState, setCorrectionState] = useState<ViewState>('idle');
  const [correctionNotice, setCorrectionNotice] = useState<string | null>(null);
  const listSequence = useRef(0);
  const detailSequence = useRef(0);
  const detailHeadingRef = useRef<HTMLHeadingElement>(null);

  const resetDetail = () => {
    detailSequence.current += 1;
    setDetail(null);
    setDetailState('idle');
    setResolutionState('idle');
    setResolutionNotice(null);
    setResolutionText('');
    setCorrectionCase(null);
    setCorrectionState('idle');
    setCorrectionNotice(null);
  };

  const loadBootstrap = async () => {
    setActivated(true);
    setWorkspaceState('loading');
    try {
      const response = await requestOperationalWorkspaceV1({
        contractVersion: OPERATIONAL_WORKSPACE_CONTRACT_VERSION_V1,
        operation: 'bootstrap',
      });
      if (response.state === 'ready' && 'availableAcademicYears' in response) {
        setYears(response.availableAcademicYears);
        setWorkspaceState('ready');
        return;
      }
      setYears([]);
      setWorkspaceState(response.state);
    } catch {
      setYears([]);
      setWorkspaceState('unavailable');
    }
  };

  const loadList = async (
    year: AcademicYearId,
    targetCollection: AuditWorkspaceCollectionV1,
    filters: AuditWorkspaceFiltersV1,
    cursor: AuditWorkspaceCursorV1 | null = null,
  ) => {
    const sequence = ++listSequence.current;
    const append = cursor !== null;
    setListState('loading');
    try {
      const response = await requestAuditWorkspaceListV1(
        listRequest(year, targetCollection, filters, cursor),
      );
      if (sequence !== listSequence.current) return;
      if (response.outcome === 'items') {
        setItems((current) => (append ? [...current, ...response.items] : response.items));
        setNextCursor(response.nextCursor);
        setListState('ready');
        return;
      }
      setItems([]);
      setNextCursor(null);
      if (response.outcome === 'no-results') setListState('empty');
      else if (response.outcome === 'not-authorized') setListState('not-authorized');
      else setListState('unavailable');
    } catch (error) {
      if (sequence !== listSequence.current) return;
      setItems([]);
      setNextCursor(null);
      setListState(clientFailureState(error));
    }
  };

  const selectYear = (value: string) => {
    listSequence.current += 1;
    resetDetail();
    setDraft(EMPTY_DRAFT);
    setAppliedFilters({});
    setItems([]);
    setNextCursor(null);
    if (!value) {
      setSelectedYear(null);
      setListState('idle');
      return;
    }
    const year = value as AcademicYearId;
    setSelectedYear(year);
    void loadList(year, collection, {});
  };

  const selectCollection = (value: AuditWorkspaceCollectionV1) => {
    listSequence.current += 1;
    resetDetail();
    setCollection(value);
    setDraft(EMPTY_DRAFT);
    setAppliedFilters({});
    setItems([]);
    setNextCursor(null);
    if (selectedYear) void loadList(selectedYear, value, {});
    else setListState('idle');
  };

  const applyFilters = () => {
    if (!selectedYear) return;
    resetDetail();
    const filters = filtersFromDraft(collection, draft);
    setAppliedFilters(filters);
    setItems([]);
    setNextCursor(null);
    void loadList(selectedYear, collection, filters);
  };

  const clearFilters = () => {
    setDraft(EMPTY_DRAFT);
    setAppliedFilters({});
    resetDetail();
    if (selectedYear) void loadList(selectedYear, collection, {});
  };

  const loadCorrectionCase = async (
    year: AcademicYearId,
    reconciliationId: ReconciliationResultId,
  ) => {
    setCorrectionState('loading');
    setCorrectionNotice(null);
    try {
      const response = await requestDeterministicCorrectionInspectionV2({
        contractVersion: DETERMINISTIC_CORRECTION_TRANSPORT_VERSION_V2,
        operation: 'inspect-deterministic-correction',
        academicYearId: year,
        reconciliationId,
      });
      if (response.outcome === 'case') {
        setCorrectionCase(response.case);
        setCorrectionState('ready');
        return;
      }
      setCorrectionCase(null);
      setCorrectionState(response.outcome === 'not-found' ? 'empty' : 'unavailable');
    } catch (error) {
      setCorrectionCase(null);
      setCorrectionState(clientFailureState(error));
    }
  };

  const loadDetail = async (reference: AuditWorkspaceDetailReferenceV1) => {
    if (!selectedYear) return;
    const sequence = ++detailSequence.current;
    setDetailState('loading');
    setDetail(null);
    setResolutionState('idle');
    setResolutionNotice(null);
    setResolutionText('');
    setCorrectionCase(null);
    setCorrectionState('idle');
    setCorrectionNotice(null);
    try {
      const response = await requestAuditWorkspaceDetailV1({
        contractVersion: AUDIT_WORKSPACE_CONTRACT_VERSION_V1,
        academicYearId: selectedYear,
        reference,
      });
      if (sequence !== detailSequence.current) return;
      if (response.outcome === 'detail') {
        setDetail(response.detail);
        setDetailState('ready');
        if (response.detail.kind === 'audit-occurrence') {
          const actions = resolutionOptions(response.detail.record.state);
          setResolutionAction(actions[0] ?? 'resolved');
        } else if (response.detail.kind === 'reconciliation') {
          void loadCorrectionCase(selectedYear, response.detail.record.id);
        }
        window.requestAnimationFrame(() => detailHeadingRef.current?.focus());
        return;
      }
      setDetail(null);
      if (response.outcome === 'not-authorized') setDetailState('not-authorized');
      else if (response.outcome === 'not-found') setDetailState('empty');
      else setDetailState('unavailable');
    } catch (error) {
      if (sequence !== detailSequence.current) return;
      setDetail(null);
      setDetailState(clientFailureState(error));
    }
  };

  const resolveOccurrence = async () => {
    if (!selectedYear || detail?.kind !== 'audit-occurrence') return;
    const transition = transitionFor(detail.record.state, resolutionAction, resolutionText);
    if (!transition) {
      setResolutionState('unavailable');
      setResolutionNotice('Revise a ação e a justificativa antes de confirmar.');
      return;
    }
    const reference = detail.reference;
    setResolutionState('loading');
    setResolutionNotice(null);
    try {
      const response = await requestAuditWorkspaceResolutionV1({
        contractVersion: AUDIT_WORKSPACE_CONTRACT_VERSION_V1,
        academicYearId: selectedYear,
        occurrenceId: detail.record.id,
        expectedVersion: detail.version,
        transition,
      });
      if (response.outcome === 'applied') {
        await loadDetail(reference);
        setResolutionState('ready');
        setResolutionNotice(`Novo estado: ${presentationLabel(response.state)}.`);
        void loadList(selectedYear, collection, appliedFilters);
        return;
      }
      if (response.outcome === 'not-authorized') {
        setResolutionState('not-authorized');
        setResolutionNotice('Sua sessão não possui autorização para registrar esta resolução.');
        return;
      }
      if (response.outcome === 'version-conflict') {
        await loadDetail(reference);
        setResolutionState('unavailable');
        setResolutionNotice(
          'O registro foi atualizado por outra operação. Revise a versão atual antes de tentar novamente.',
        );
        return;
      }
      setResolutionState('unavailable');
      setResolutionNotice('A transição não pôde ser aplicada com segurança.');
    } catch (error) {
      const state = clientFailureState(error);
      setResolutionState(state);
      setResolutionNotice(
        state === 'not-authorized'
          ? 'Sua sessão não possui autorização para registrar esta resolução.'
          : 'O workspace não pôde registrar a resolução neste momento.',
      );
    }
  };

  const executeDeterministicCorrection = async () => {
    if (!selectedYear || !correctionCase) return;
    const current = correctionCase;
    setCorrectionState('loading');
    setCorrectionNotice(null);
    try {
      const response = await requestDeterministicCorrectionExecutionV2({
        contractVersion: DETERMINISTIC_CORRECTION_TRANSPORT_VERSION_V2,
        operation: 'execute-deterministic-correction',
        academicYearId: selectedYear,
        caseReference: current.reference,
        expectedVersion: current.version,
      });
      if (
        response.outcome === 'applied' ||
        response.outcome === 'already-completed' ||
        response.outcome === 'not-eligible' ||
        response.outcome === 'blocked'
      ) {
        setCorrectionCase(response.case);
        setCorrectionState('ready');
        setCorrectionNotice(
          response.outcome === 'applied'
            ? 'Nova versão criada e reconciliação pós-reprocessamento registrada.'
            : response.outcome === 'already-completed'
              ? 'A correção já havia sido concluída; nenhuma nova versão foi criada.'
              : 'O caso permanece bloqueado e nenhuma escrita foi executada.',
        );
        if (detail?.kind === 'reconciliation') {
          void loadList(selectedYear, collection, appliedFilters);
        }
        return;
      }
      if (response.outcome === 'version-conflict') {
        await loadCorrectionCase(selectedYear, current.divergence.id);
        setCorrectionNotice(
          'O caso foi atualizado por outra operação. Revise a versão atual antes de tentar novamente.',
        );
        return;
      }
      setCorrectionState(response.outcome === 'not-authorized' ? 'not-authorized' : 'unavailable');
      setCorrectionNotice('A correção não pôde ser executada com segurança.');
    } catch (error) {
      setCorrectionState(clientFailureState(error));
      setCorrectionNotice('A correção não pôde ser executada com segurança.');
    }
  };

  return (
    <Surface
      variant="default"
      className="mt-6 rounded-[2rem] border border-border/70 p-5 shadow-sm sm:p-7"
      aria-busy={
        workspaceState === 'loading' || listState === 'loading' || detailState === 'loading'
      }
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted">
            <ListChecks className="size-4" />
            Auditoria e revisão
          </div>
          <h2 className="mt-3 text-2xl font-semibold tracking-[-0.035em] sm:text-3xl">
            Revise lotes, ocorrências e reconciliações
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            Consulte pendências, abra detalhes e registre somente as transições de Auditoria já
            previstas no contrato.
          </p>
        </div>
        {!activated && (
          <Button variant="primary" onPress={() => void loadBootstrap()}>
            <ClipboardCheck className="size-4" />
            Abrir Auditoria
          </Button>
        )}
      </div>

      {activated && workspaceState === 'loading' && (
        <div className="mt-6 flex items-center gap-3 text-sm text-muted" role="status">
          <Spinner size="sm" color="accent" />
          Carregando contexto de Auditoria…
        </div>
      )}

      {activated &&
        (workspaceState === 'empty' ||
          workspaceState === 'unavailable' ||
          workspaceState === 'not-authorized') && (
          <div className="mt-6">
            <WorkspaceStateAlert state={workspaceState} />
          </div>
        )}

      {activated && workspaceState === 'ready' && (
        <div className="mt-6 grid gap-5">
          <Surface variant="secondary" className="rounded-2xl p-4 sm:p-5">
            <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
              <div>
                <Label htmlFor="audit-academic-year" className="mb-1.5 block text-sm font-medium">
                  Ano acadêmico
                </Label>
                <select
                  id="audit-academic-year"
                  className="h-10 w-full rounded-xl border border-border bg-transparent px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-focus"
                  value={selectedYear ?? ''}
                  onChange={(event) => selectYear(event.currentTarget.value)}
                >
                  <option value="">Selecione o ano</option>
                  {years.map((year) => (
                    <option key={year.id} value={year.id}>
                      {year.label}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-muted">
                  O sistema não escolhe o ano automaticamente.
                </p>
              </div>
              <div className="min-w-0">
                <nav aria-label="Coleções da Auditoria" className="flex flex-wrap gap-2">
                  {AUDIT_WORKSPACE_COLLECTIONS_V1.map((value) => (
                    <Button
                      key={value}
                      size="sm"
                      variant={collection === value ? 'primary' : 'secondary'}
                      aria-current={collection === value ? 'page' : undefined}
                      onPress={() => selectCollection(value)}
                    >
                      {value === 'import-batches' ? (
                        <ClipboardCheck className="size-4" />
                      ) : value === 'audit-occurrences' ? (
                        <ShieldAlert className="size-4" />
                      ) : (
                        <Scale className="size-4" />
                      )}
                      {COLLECTION_LABELS[value]}
                    </Button>
                  ))}
                </nav>
              </div>
            </div>
          </Surface>

          {!selectedYear && (
            <Surface variant="secondary" className="rounded-2xl p-6 text-center">
              <p className="font-medium">Selecione um ano acadêmico</p>
              <p className="mt-1 text-sm text-muted">
                Listas, filtros e resolução sempre permanecem isolados no ano escolhido.
              </p>
            </Surface>
          )}

          {selectedYear && (
            <>
              <Surface variant="secondary" className="rounded-2xl p-4 sm:p-5">
                <FilterPanel
                  collection={collection}
                  draft={draft}
                  onChange={setDraft}
                  onApply={applyFilters}
                  onClear={clearFilters}
                  loading={listState === 'loading'}
                />
              </Surface>

              <section
                aria-label={COLLECTION_LABELS[collection]}
                aria-live="polite"
                className="grid gap-3"
              >
                {listState === 'loading' && (
                  <div className="flex items-center gap-2 text-sm text-muted" role="status">
                    <Spinner size="sm" color="accent" />
                    Carregando {COLLECTION_LABELS[collection].toLowerCase()}…
                  </div>
                )}
                {listState === 'empty' && (
                  <Surface variant="secondary" className="rounded-2xl p-6 text-center">
                    <p className="font-medium">Nenhum item encontrado</p>
                    <p className="mt-1 text-sm text-muted">
                      Ajuste os filtros ou escolha outra coleção.
                    </p>
                  </Surface>
                )}
                {listState === 'not-authorized' && <WorkspaceStateAlert state="not-authorized" />}
                {listState === 'unavailable' && <WorkspaceStateAlert state="unavailable" />}
                {items.length > 0 && (
                  <Surface variant="secondary" className="rounded-2xl p-2">
                    <ul
                      className="grid gap-1"
                      aria-label={`Itens de ${COLLECTION_LABELS[collection]}`}
                    >
                      {items.map((item) => (
                        <li key={`${item.kind}:${item.reference.id}`}>
                          <ListItemButton
                            item={item}
                            onOpen={(reference) => void loadDetail(reference)}
                          />
                        </li>
                      ))}
                    </ul>
                    {nextCursor && (
                      <div className="flex justify-center p-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onPress={() =>
                            void loadList(selectedYear, collection, appliedFilters, nextCursor)
                          }
                          isDisabled={listState === 'loading'}
                        >
                          Carregar mais
                        </Button>
                      </div>
                    )}
                  </Surface>
                )}
              </section>

              <section aria-label="Detalhe da Auditoria" aria-live="polite">
                {detailState === 'loading' && (
                  <div className="flex items-center gap-2 text-sm text-muted" role="status">
                    <Spinner size="sm" color="accent" />
                    Carregando detalhe…
                  </div>
                )}
                {detailState === 'idle' && (
                  <Surface variant="secondary" className="rounded-2xl p-6 text-center">
                    <Eye className="mx-auto size-5 text-muted" />
                    <p className="mt-2 font-medium">Abra um item para revisar</p>
                    <p className="mt-1 text-sm text-muted">
                      O detalhe é carregado somente quando solicitado.
                    </p>
                  </Surface>
                )}
                {detailState === 'empty' && (
                  <Surface variant="secondary" className="rounded-2xl p-6 text-center">
                    <p className="font-medium">Detalhe não encontrado</p>
                  </Surface>
                )}
                {detailState === 'not-authorized' && <WorkspaceStateAlert state="not-authorized" />}
                {detailState === 'unavailable' && <WorkspaceStateAlert state="unavailable" />}
                {detailState === 'ready' && detail && (
                  <DetailCard
                    detail={detail}
                    headingRef={detailHeadingRef}
                    resolutionAction={resolutionAction}
                    resolutionText={resolutionText}
                    resolutionState={resolutionState}
                    resolutionNotice={resolutionNotice}
                    onResolutionAction={(action) => {
                      setResolutionAction(action);
                      setResolutionText('');
                      setResolutionNotice(null);
                      setResolutionState('idle');
                    }}
                    onResolutionText={setResolutionText}
                    onResolve={() => void resolveOccurrence()}
                    onOpenPending={(reference) => void loadDetail(reference)}
                    correctionCase={correctionCase}
                    correctionState={correctionState}
                    correctionNotice={correctionNotice}
                    onExecuteCorrection={() => void executeDeterministicCorrection()}
                  />
                )}
              </section>
            </>
          )}
        </div>
      )}
    </Surface>
  );
}
