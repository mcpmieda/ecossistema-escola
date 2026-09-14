import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AlertDialog, Button, Card } from '@heroui/react';
import type { AdminAccountReadV2 } from '../../../../shared/student-portal-contracts/admin-read-v2';
import type { ScopeV1 } from '../../../../shared/student-portal-contracts/core-v1';
import type { PortalAdminClientV1 } from '../shared/admin-client-v1';
import { PortalClientErrorV1 } from '../../student-portal/shared/transport-v1';
import { settingsScopeKeyV1 } from '../settings/settings-values-v1';
import type { PortalAdminReadClientV2 } from './accounts-client-v2';
import {
  createAccountMutationV1,
  type AccountMutationStateV1,
  type AccountQrResultV1,
} from './account-mutation-v1';
import { useAccountsReadV1 } from './accounts-read-v1';
import { AccountIdentityV1, AccountStatusV1, AccountsErrorV1 } from './accounts-presentation-v1';
import {
  ACCOUNT_ACTIONS_V1,
  accountAccessOriginV1,
  accountCommandV1,
  accountLinkLabelV1,
  accountManageableV1,
  accountPageMatchesV1,
  lastAuthenticationLabelV1,
  type AccountActionV1,
  type AccountCommandV1,
} from './accounts-values-v1';

export interface AccountSlotContextV1 {
  account: AdminAccountReadV2;
  scope: Extract<ScopeV1, { kind: 'account' }>;
  canWrite: boolean;
  refresh: () => void;
}
export type AccountSlotsV1 = Partial<
  Record<
    'birth' | 'credentials' | 'sessions' | 'publication' | 'audit' | 'settings',
    (context: AccountSlotContextV1) => ReactNode
  >
>;
export interface AccountDetailPropsV1 {
  accountId: string;
  parentScope: ScopeV1;
  reader: PortalAdminReadClientV2;
  client: PortalAdminClientV1;
  canWrite: boolean;
  onClose: () => void;
  onChanged: () => void;
  onAuthorizationLost?: (error: PortalClientErrorV1) => void;
  onQr?: (result: AccountQrResultV1, signal: AbortSignal) => void | Promise<void>;
  onReprint?: (context: AccountSlotContextV1) => void;
  slots?: AccountSlotsV1;
  describeScope?: (scope: ScopeV1) => string;
}
const slotLabels = {
  birth: 'Ano de nascimento',
  credentials: 'Credenciais',
  sessions: 'Sessões',
  publication: 'Períodos',
  audit: 'Auditoria',
  settings: 'Configurações de acesso',
} as const;
export function AccountDetailV1(props: AccountDetailPropsV1) {
  return (
    <AccountDetailBodyV1
      key={props.accountId + ':' + settingsScopeKeyV1(props.parentScope) + ':' + props.canWrite}
      {...props}
    />
  );
}
function AccountDetailBodyV1({
  accountId,
  parentScope,
  reader,
  client,
  canWrite,
  onClose,
  onChanged,
  onAuthorizationLost,
  onQr,
  onReprint,
  slots,
  describeScope,
}: AccountDetailPropsV1) {
  const ownScope = useMemo(
    () => ({ kind: 'account' as const, academicYear: 2026 as const, accountId }),
    [accountId],
  );
  const parentKey = settingsScopeKeyV1(parentScope);
  const parentClassId = parentScope.kind === 'class' ? parentScope.classId : null;
  const load = useCallback(
    async (signal: AbortSignal) => {
      const result = await reader.query(
        { contractVersion: 2, operation: 'accounts-read', scope: ownScope, page: { limit: 100 } },
        signal,
      );
      if (result.state !== 'accounts-read') throw new PortalClientErrorV1('invalid-response');
      accountPageMatchesV1(result, ownScope);
      const account = result.items[0] ?? null;
      if (account && parentClassId !== null && account.classId !== parentClassId)
        throw new PortalClientErrorV1('conflict');
      return account;
    },
    [reader, ownScope, parentClassId],
  );
  const read = useAccountsReadV1(load);
  const [mutation, setMutation] = useState<AccountMutationStateV1>({ state: 'idle' });
  const [review, setReview] = useState<{
    action: AccountActionV1;
    command: AccountCommandV1;
    name: string;
  } | null>(null);
  const [clock, setClock] = useState(0);
  const writer = useMemo(
    () => createAccountMutationV1(client, accountId, setMutation, onQr),
    [client, accountId, onQr],
  );
  const handledVersion = useRef<number | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const focused = useRef(false);
  useEffect(() => {
    if (focused.current || (read.state.state !== 'ready' && read.state.state !== 'error')) return;
    focused.current = true;
    heading.current?.scrollIntoView?.({ block: 'start' });
    heading.current?.focus({ preventScroll: true });
  }, [read.state.state]);
  useEffect(() => () => writer.clear(), [writer, parentKey]);
  useEffect(() => {
    if (mutation.state !== 'error') return;
    setClock(Date.now());
    const timer = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [mutation]);
  useEffect(() => {
    if (mutation.state === 'committed' && handledVersion.current !== mutation.version) {
      handledVersion.current = mutation.version;
      read.reload();
      onChanged();
    }
  }, [mutation, read, onChanged]);
  const pending = mutation.state === 'pending';
  const failed = mutation.state === 'error';
  const protectedFailure =
    failed && ['unauthenticated', 'forbidden'].includes(mutation.error.state);
  useEffect(() => {
    const error =
      mutation.state === 'error'
        ? mutation.error
        : read.state.state === 'error'
          ? read.state.error
          : null;
    if (error && ['unauthenticated', 'forbidden'].includes(error.state))
      onAuthorizationLost?.(error);
  }, [mutation, read.state, onAuthorizationLost]);
  const account = !protectedFailure && read.state.state === 'ready' ? read.state.data : null;
  const editable = canWrite && !!account && accountManageableV1(account) && !pending && !failed;
  function refresh() {
    if (pending || (failed && Date.now() < mutation.retryAt)) return;
    writer.clear();
    setReview(null);
    read.reload();
  }
  const context: AccountSlotContextV1 | null = account
    ? {
        account,
        scope: ownScope,
        canWrite: editable,
        refresh,
      }
    : null;
  return (
    <Card className="pa-account-detail" aria-label="Ficha da conta">
      <Card.Header>
        <h3 ref={heading} tabIndex={-1}>
          Ficha da conta · 2026
        </h3>
        <Button variant="secondary" onPress={onClose}>
          Fechar ficha
        </Button>
      </Card.Header>
      <Card.Content>
        {mutation.state === 'committed' && (
          <div role="status" className="pa-account-notice">
            <p>Ação concluída pelo servidor. Os dados abaixo dependem da consulta atualizada.</p>
            {mutation.artifact === 'preparing' && <p>Preparando a imagem do novo QR…</p>}
            {mutation.artifact === 'unavailable' && (
              <p>
                O novo QR foi gerado, mas o cartão não foi aberto. Use a reimpressão; não é
                necessário regenerar novamente.
              </p>
            )}
          </div>
        )}
        {failed && (
          <div role="alert" className="pa-account-notice">
            <p>
              {mutation.error.state === 'conflict'
                ? 'A conta mudou. Recarregue e revise uma nova ação.'
                : protectedFailure
                  ? 'A autorização administrativa terminou. Os dados desta ficha foram removidos.'
                  : mutation.retryable
                    ? 'Não foi possível confirmar a resposta. A ação pode ter sido concluída; repetir usa a mesma solicitação.'
                    : 'A ação foi recusada. Recarregue a ficha antes de decidir novamente.'}
            </p>
            {mutation.retryable && (
              <Button
                variant="secondary"
                isDisabled={clock < mutation.retryAt}
                onPress={() => {
                  void writer.retry();
                }}
              >
                Repetir mesma solicitação
              </Button>
            )}
            <Button variant="secondary" isDisabled={clock < mutation.retryAt} onPress={refresh}>
              Recarregar ficha
            </Button>
          </div>
        )}
        {pending && <p role="status">Enviando ação. Aguarde a confirmação do servidor.</p>}
        {!protectedFailure && (read.state.state === 'idle' || read.state.state === 'loading') && (
          <p role="status">Consultando ficha…</p>
        )}
        {!protectedFailure && read.state.state === 'error' && (
          <AccountsErrorV1
            error={read.state.error}
            canReload={read.canReload && !pending}
            onReload={refresh}
          />
        )}
        {!protectedFailure && read.state.state === 'ready' && !account && (
          <p role="status">
            Conta não encontrada neste escopo. Nenhuma conta foi criada ou associada pelo nome.
          </p>
        )}
        {account && context && (
          <>
            <AccountIdentityV1 account={account} />
            <AccountStatusV1 account={account} />
            <dl className="pa-account-facts">
              <div>
                <dt>Vínculo</dt>
                <dd>{accountLinkLabelV1(account)}</dd>
              </div>
              <div>
                <dt>Acesso configurado</dt>
                <dd>
                  {account.access.state !== 'resolved'
                    ? 'Não resolvido'
                    : account.access.enabled
                      ? 'Habilitado'
                      : 'Desabilitado'}
                </dd>
              </div>
              <div>
                <dt>Origem do acesso</dt>
                <dd>{accountAccessOriginV1(account.access.source, describeScope)}</dd>
              </div>
              <div>
                <dt>Acesso permitido agora</dt>
                <dd>
                  {account.access.accessPermitted ? 'Sim, conforme as regras de acesso' : 'Não'}
                </dd>
              </div>
              <div>
                <dt>Última autenticação bem-sucedida</dt>
                <dd>{lastAuthenticationLabelV1(account.lastAuthenticationAt)}</dd>
              </div>
              <div>
                <dt>Sessões válidas nesta consulta</dt>
                <dd>{account.validSessionCount}</dd>
              </div>
            </dl>
            <p>
              A permissão de acesso não comprova credenciais válidas nem um login realizado. O
              bloqueio por tentativas é independente do bloqueio administrativo.
            </p>
            {!canWrite && <p>Modo somente leitura.</p>}
            {!accountManageableV1(account) && (
              <p>
                As ações de credenciais estão indisponíveis para este vínculo. Corrija a origem ou
                use o procedimento administrativo próprio; não há associação por nome.
              </p>
            )}
            <div className="pa-account-actions" aria-label="Ações de acesso">
              {(
                [
                  account.blocked ? 'unblock' : 'block',
                  'password-reset',
                  'account-reset',
                  'qr-regenerate',
                ] as AccountActionV1[]
              ).map((action) => (
                <Button
                  key={action}
                  variant="secondary"
                  isDisabled={!editable}
                  onPress={() =>
                    setReview({
                      action,
                      command: accountCommandV1(account, action),
                      name: account.name || 'Nome indisponível',
                    })
                  }
                >
                  {ACCOUNT_ACTIONS_V1[action].label}
                </Button>
              ))}
              {onReprint && (
                <Button
                  variant="secondary"
                  isDisabled={!editable}
                  onPress={() => onReprint(context)}
                >
                  Reimprimir QR
                </Button>
              )}
            </div>
            {Object.entries(slotLabels).map(([key, label]) => {
              const render = slots?.[key as keyof AccountSlotsV1];
              return render ? (
                <section className="pa-account-slot" key={key} aria-label={label}>
                  {render(context)}
                </section>
              ) : null;
            })}
          </>
        )}
        <AlertDialog.Backdrop
          isOpen={review !== null}
          isDismissable={false}
          isKeyboardDismissDisabled={pending}
          onOpenChange={(open) => {
            if (!open && !pending) setReview(null);
          }}
        >
          <AlertDialog.Container size="md" placement="center">
            <AlertDialog.Dialog className="pa-account-dialog">
              <AlertDialog.Header>
                <AlertDialog.Heading>
                  {review ? ACCOUNT_ACTIONS_V1[review.action].label : 'Revisar ação'}
                </AlertDialog.Heading>
              </AlertDialog.Header>
              <AlertDialog.Body>
                <p>{review?.name} · conta individual de 2026</p>
                <p>{review && ACCOUNT_ACTIONS_V1[review.action].description}</p>
                <p>
                  A confirmação usa o estado consultado. Se outra operação mudar a conta, será
                  necessário recarregar e revisar novamente.
                </p>
              </AlertDialog.Body>
              <AlertDialog.Footer>
                <Button
                  autoFocus
                  variant="secondary"
                  isDisabled={pending}
                  onPress={() => setReview(null)}
                >
                  Cancelar
                </Button>
                <Button
                  variant="danger"
                  isDisabled={!review || !editable}
                  onPress={() => {
                    if (!review || !editable) return;
                    const command = review.command;
                    setReview(null);
                    void writer.submit(command);
                  }}
                >
                  Confirmar ação
                </Button>
              </AlertDialog.Footer>
            </AlertDialog.Dialog>
          </AlertDialog.Container>
        </AlertDialog.Backdrop>
      </Card.Content>
    </Card>
  );
}
