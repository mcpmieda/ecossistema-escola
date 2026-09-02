import type {
  BulletinModelKindV1,
  BulletinPeriodV1,
} from '../../../../shared/gradebook-contracts/bulletins/bulletin-contract-v1';
import type {
  AcademicGradeValueV1,
  AnnualFinalDecisionV1,
  ApplicabilityV1,
  ComparedAcademicStateV1,
  ResultCoverageV1,
} from '../../../../shared/gradebook-contracts/results/results-contract-v1';

export function bulletinPeriodLabelV1(period: BulletinPeriodV1): string {
  return period.kind === 'annual' ? 'Anual' : `${period.term}º trimestre`;
}

export function bulletinModelLabelV1(model: BulletinModelKindV1): string {
  if (model === 'synthetic') return 'Sintético';
  if (model === 'composition') return 'Composição';
  return 'Detalhado';
}

export function bulletinGradeValueLabelV1(value: AcademicGradeValueV1): string {
  switch (value.state) {
    case 'numeric':
      return String(value.value);
    case 'official-zero':
      return '0 — zero oficial';
    case 'legacy-zero':
      return '0 — zero legado';
    case 'absent':
      return 'Ausente';
    case 'not-applicable':
      return value.reason ? `Não aplicável — ${value.reason}` : 'Não aplicável';
    case 'insufficient-data':
      return `Dados insuficientes — ${value.reason}`;
  }
}

export function bulletinApplicabilityLabelV1(value: ApplicabilityV1): string {
  switch (value.state) {
    case 'applicable':
      return 'Aplicável';
    case 'not-applicable':
      return value.reason ? `Não aplicável — ${value.reason}` : 'Não aplicável';
    case 'insufficient-data':
      return `Dados insuficientes — ${value.reason}`;
  }
}

export function bulletinCoverageLabelV1(coverage: ResultCoverageV1): string {
  const base = `Cobertura: ${coverage.state} · ${coverage.resolvedItemCount}/${coverage.expectedItemCount} itens resolvidos`;
  return coverage.reasons.length === 0 ? base : `${base} · motivos: ${coverage.reasons.join(', ')}`;
}

export function bulletinAcademicStateLabelV1(state: ComparedAcademicStateV1): string {
  return `Importado: ${state.imported} · Calculado: ${state.calculated}`;
}

export function bulletinFinalDecisionLabelV1(decision: AnnualFinalDecisionV1): string {
  if (decision.status === 'pending') return 'Pendente';
  const details = [
    decision.outcome,
    decision.basis,
    decision.resultingState,
    decision.decidedAt,
    decision.reference,
  ].filter((item): item is string => typeof item === 'string' && item.length > 0);
  return `Registrada · ${details.join(' · ')}`;
}

export function bulletinEmissionDateLabelV1(
  emittedAt: string,
  locale: string,
  dateStyle: 'short' | 'long',
): string {
  const date = new Date(emittedAt);
  if (Number.isNaN(date.getTime())) return emittedAt;
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle }).format(date);
  } catch {
    return emittedAt;
  }
}
