import { Building2, GraduationCap, UserRound } from 'lucide-react';
import type { ScopeV1 } from '../../../../shared/student-portal-contracts/core-v1';
export function PolicyScopeV1({ scope, label }: { scope: ScopeV1; label?: string }) {
  const Icon =
    scope.kind === 'school' ? Building2 : scope.kind === 'class' ? GraduationCap : UserRound;
  return (
    <div
      className={'pa-policy-scope pa-policy-scope--' + scope.kind}
      role="note"
      aria-label="Alcance das políticas"
    >
      <Icon size={22} aria-hidden />
      <div>
        <span>
          {scope.kind === 'school'
            ? 'TODA A ESCOLA'
            : scope.kind === 'class'
              ? 'SOMENTE ESTA TURMA'
              : 'SOMENTE ESTE ALUNO'}
        </span>
        <strong>
          {label ||
            (scope.kind === 'school'
              ? 'Escola · 2026'
              : scope.kind === 'class'
                ? 'Turma selecionada'
                : 'Aluno selecionado')}
        </strong>
      </div>
    </div>
  );
}
