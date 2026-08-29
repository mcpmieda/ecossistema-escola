import type { AttentionLevel } from '../../shared/banco-notas-acompanhamento';
import type { PendingKind, PendingSeverity } from '../../shared/banco-notas-pendencias';

export type OperationalAttentionFacts = {
  activeAssignments: number;
  teacherInactive?: boolean;
  failedImports: number;
  openErrorFindings: number;
  openFindings: number;
  models: number;
  missingModelContexts?: number;
  suspendedModels: number;
  nonConnectedModels: number;
  missingSources: number;
  identityMissingForRequiredModel: boolean;
  modelsWithoutAssignments?: number;
  orphanAssignments?: number;
};

export function deriveOperationalAttention(facts: OperationalAttentionFacts): {
  level: AttentionLevel;
  reasons: string[];
} {
  const reasons: string[] = [];
  let level: AttentionLevel = 'normal';
  const order: AttentionLevel[] = ['normal', 'info', 'warning', 'error'];
  const add = (reason: string, candidate: AttentionLevel) => {
    if (!reasons.includes(reason)) reasons.push(reason);
    if (order.indexOf(candidate) > order.indexOf(level)) level = candidate;
  };

  if (facts.failedImports > 0) add('Importação com erro', 'error');
  if (facts.openErrorFindings > 0) add('Finding de erro pendente', 'error');
  else if (facts.openFindings > 0) add('Pendência de importação', 'warning');
  if (facts.suspendedModels > 0) add('Modelo suspenso', 'error');
  if (
    facts.activeAssignments > 0 &&
    (facts.missingModelContexts ?? (facts.models === 0 ? 1 : 0)) > 0
  )
    add('Modelo ainda não criado', 'warning');
  else if (facts.nonConnectedModels > 0) add('Modelo ainda não conectado', 'info');
  if (facts.activeAssignments > 0 && facts.missingSources > 0)
    add('Fonte autoritativa não configurada', 'warning');
  if (facts.identityMissingForRequiredModel)
    add('Identidade institucional necessária ausente', 'warning');
  if (facts.teacherInactive && facts.activeAssignments > 0)
    add('Professor inativo com atribuição ativa', 'warning');
  if ((facts.modelsWithoutAssignments ?? 0) > 0) add('Modelo sem atribuição no período', 'warning');
  if ((facts.orphanAssignments ?? 0) > 0) add('Atribuição com relação incompleta', 'error');
  if (facts.activeAssignments === 0 && facts.models === 0)
    add('Sem atribuição no período selecionado', 'info');

  return { level, reasons };
}

export const pendingKindsBySeverity: Record<PendingSeverity, readonly PendingKind[]> = {
  error: ['import_error', 'finding_error', 'model_suspended', 'orphan_assignment'],
  warning: [
    'finding_warning',
    'model_missing',
    'identity_missing',
    'source_missing',
    'inactive_teacher_assignment',
    'model_without_assignment',
  ],
  info: ['finding_info', 'model_not_connected', 'import_analysis_pending'],
};

const emptyFacts = (): OperationalAttentionFacts => ({
  activeAssignments: 0,
  failedImports: 0,
  openErrorFindings: 0,
  openFindings: 0,
  models: 0,
  suspendedModels: 0,
  nonConnectedModels: 0,
  missingSources: 0,
  identityMissingForRequiredModel: false,
});

export function classifyOperationalPending(kind: PendingKind): {
  severity: PendingSeverity;
  reason: string;
} {
  if (kind === 'finding_info') return { severity: 'info', reason: 'Finding informativo aberto' };
  if (kind === 'import_analysis_pending')
    return { severity: 'info', reason: 'Análise de importação ainda não concluída' };

  const facts = emptyFacts();
  if (kind === 'import_error') facts.failedImports = 1;
  if (kind === 'finding_error') facts.openErrorFindings = 1;
  if (kind === 'finding_warning') facts.openFindings = 1;
  if (kind === 'model_suspended') facts.suspendedModels = 1;
  if (kind === 'model_missing') {
    facts.activeAssignments = 1;
    facts.missingModelContexts = 1;
  }
  if (kind === 'identity_missing') facts.identityMissingForRequiredModel = true;
  if (kind === 'source_missing') {
    facts.activeAssignments = 1;
    facts.missingSources = 1;
  }
  if (kind === 'inactive_teacher_assignment') {
    facts.activeAssignments = 1;
    facts.teacherInactive = true;
  }
  if (kind === 'model_without_assignment') {
    facts.models = 1;
    facts.modelsWithoutAssignments = 1;
  }
  if (kind === 'model_not_connected') {
    facts.models = 1;
    facts.nonConnectedModels = 1;
  }
  if (kind === 'orphan_assignment') facts.orphanAssignments = 1;

  const classification = deriveOperationalAttention(facts);
  const severity = classification.level === 'normal' ? 'info' : classification.level;
  return { severity, reason: classification.reasons[0] ?? 'Informação operacional' };
}
