import type { AttentionLevel } from '../../shared/banco-notas-professores';

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
