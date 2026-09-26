import { Building2, GraduationCap, UserRound } from 'lucide-react';
import { Chip } from '@heroui/react';
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
      <Chip size="sm" variant="soft">
        <Icon size={15} aria-hidden />
        {scope.kind === 'school'
          ? 'Toda a escola'
          : scope.kind === 'class'
            ? 'Esta turma'
            : 'Este aluno'}
      </Chip>
      {scope.kind !== 'school' && label ? <strong>{label}</strong> : null}
      <span>
        {scope.kind === 'school'
          ? 'Padrão para turmas e alunos'
          : 'As opções sem personalização seguem o padrão.'}
      </span>
    </div>
  );
}
