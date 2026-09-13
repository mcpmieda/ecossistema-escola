import { Avatar, Button, Chip } from '@heroui/react';
import type { AdminAccountReadV2 } from '../../../../shared/student-portal-contracts/admin-read-v2';
import type { PortalClientErrorV1 } from '../../student-portal/shared/transport-v1';
import { accountStateLabelV1 } from './accounts-values-v1';

export function AccountIdentityV1({ account }: { account: AdminAccountReadV2 }) {
  const name = account.name || 'Nome indisponível';
  const initials = account.name
    .trim()
    .split(/\s+/u)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('');
  return (
    <div className="pa-account-identity">
      <Avatar size="sm" aria-hidden="true">
        <Avatar.Fallback>{initials || '?'}</Avatar.Fallback>
      </Avatar>
      <div>
        <strong>{name}</strong>
        <span>{account.classLabel || 'Turma não resolvida'}</span>
      </div>
    </div>
  );
}
export function AccountStatusV1({ account }: { account: AdminAccountReadV2 }) {
  return (
    <div className="pa-account-tags">
      <Chip size="sm" variant="soft">
        {accountStateLabelV1(account)}
      </Chip>
      {account.blocked && (
        <Chip size="sm" color="danger" variant="soft">
          Bloqueio administrativo
        </Chip>
      )}
    </div>
  );
}
export function AccountsErrorV1({
  error,
  onReload,
  canReload = true,
}: {
  error: PortalClientErrorV1;
  onReload: () => void;
  canReload?: boolean;
}) {
  const message =
    error.state === 'unauthenticated'
      ? 'Sessão administrativa expirada. Entre novamente.'
      : error.state === 'forbidden'
        ? 'Sem autorização para consultar este escopo.'
        : error.state === 'conflict'
          ? 'O estado mudou. Recarregue antes de decidir novamente.'
          : error.state === 'invalid-request'
            ? 'A consulta ou a página expirou. Volte à primeira página ou recarregue.'
            : error.state === 'rate-limited'
              ? 'Limite temporário. Aguarde para consultar novamente.'
              : 'Não foi possível consultar o estado atual. Nenhum estado foi presumido.';
  return (
    <div role="alert" className="pa-account-notice">
      <p>{message}</p>
      <Button variant="secondary" isDisabled={!canReload} onPress={onReload}>
        Recarregar consulta
      </Button>
    </div>
  );
}
