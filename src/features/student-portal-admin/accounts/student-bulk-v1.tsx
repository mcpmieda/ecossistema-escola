import { useEffect, useRef, useState } from 'react';
import { Button, Card, Input, Label, TextField } from '@heroui/react';
import { useDraftNavigationGuardV1 } from '../../../shared/forms/draft-navigation-v1';
import type { BulkPreviewQueryV1 } from '../../../../shared/student-portal-contracts/bulk-v1';
import type { PortalAdminClientV1 } from '../shared/admin-client-v1';
import type { PortalClientErrorV1 } from '../../student-portal/shared/transport-v1';
import { createStudentBulkControllerV1, type BulkStateV1 } from './student-bulk-controller-v1';

const actions = {
  'qr-regenerate': 'Mudar QR',
  'password-reset': 'Redefinir senhas',
  'account-reset': 'Redefinir contas',
  block: 'Bloquear acesso',
} as const;
const results = {
  pending: 'Pendente',
  committed: 'Concluído',
  failed: 'Não realizado',
  unknown: 'Resultado não confirmado',
  skipped: 'Não elegível',
} as const;
const ineligibility = {
  'recovery-unavailable': 'Ano de nascimento e PIN ainda não confirmados.',
  'already-blocked': 'Acesso já bloqueado.',
} as const;
const errors: Record<string, string> = {
  conflict: 'Conflito; conta preservada.',
  forbidden: 'Sem autorização.',
  'invalid-request': 'Solicitação recusada.',
  unavailable: 'Serviço indisponível.',
  'network-error': 'Resposta não recebida.',
  'rate-limited': 'Aguarde para tentar novamente.',
};
export function StudentBulkV1({
  client,
  scope,
  scopeLabel,
  onAuthorizationLost,
}: {
  client: PortalAdminClientV1;
  scope: BulkPreviewQueryV1['scope'];
  scopeLabel: string;
  onAuthorizationLost: (error: PortalClientErrorV1) => void;
}) {
  const [action, setAction] = useState<BulkPreviewQueryV1['action']>('qr-regenerate');
  const [state, setState] = useState<BulkStateV1>({ phase: 'idle', items: [], total: 0 });
  const [confirmation, setConfirmation] = useState('');
  const [page, setPage] = useState(0);
  const [clock, setClock] = useState(Date.now);
  const callback = useRef(onAuthorizationLost);
  callback.current = onAuthorizationLost;
  const controller = useRef<ReturnType<typeof createStudentBulkControllerV1> | null>(null);
  useEffect(() => {
    const current = createStudentBulkControllerV1(client, setState, (error) =>
      callback.current(error),
    );
    controller.current = current;
    setState({ phase: 'idle', items: [], total: 0 });
    return () => {
      current.dispose();
      controller.current = null;
    };
  }, [client]);
  useEffect(() => {
    if (!state.retryAt) return;
    const timer = setTimeout(() => setClock(Date.now()), Math.max(0, state.retryAt - Date.now()));
    return () => clearTimeout(timer);
  }, [state.retryAt]);
  const locked = ['loading', 'review', 'running', 'paused', 'unknown'].includes(state.phase);
  useDraftNavigationGuardV1(locked);
  const eligible = state.items.filter((item) => !item.ineligibility).length;
  const skipped = state.items.length - eligible;
  const required = action === 'account-reset' ? 'REDEFINIR CONTAS' : String(eligible);
  const completed = state.items.filter((item) => item.result === 'committed').length;
  const failed = state.items.filter((item) => item.result === 'failed').length;
  return (
    <Card>
      <Card.Header>
        <h3>Operações em massa</h3>
      </Card.Header>
      <Card.Content className="flex flex-col gap-3">
        <p>
          {scopeLabel} · {scope.kind === 'school' ? 'Escola inteira' : 'Turma inteira'}
        </p>
        <div className="flex flex-wrap gap-2" aria-label="Operação em massa">
          {Object.entries(actions).map(([key, label]) => (
            <Button
              key={key}
              size="sm"
              variant={action === key ? 'primary' : 'secondary'}
              aria-pressed={action === key}
              isDisabled={locked}
              onPress={() => {
                setAction(key as typeof action);
                setState({ phase: 'idle', items: [], total: 0 });
              }}
            >
              {label}
            </Button>
          ))}
        </div>
        {['idle', 'error', 'done'].includes(state.phase) && (
          <Button
            variant="secondary"
            onPress={() => {
              setConfirmation('');
              setPage(0);
              void controller.current?.preview({
                contractVersion: 1,
                operation: 'bulk-preview',
                scope,
                action,
              });
            }}
          >
            Preparar prévia
          </Button>
        )}
        {state.phase === 'loading' && (
          <>
            <p role="status">
              Carregando a prévia completa{state.total ? ` de ${state.total} contas` : ''}…
            </p>
            <Button onPress={() => controller.current?.cancel()}>Cancelar prévia</Button>
          </>
        )}
        {state.phase === 'review' && (
          <>
            <p role="status">{eligible} contas disponíveis · {skipped} não elegíveis · {state.total} na prévia completa.</p>
            <Button variant="secondary" onPress={() => controller.current?.cancel()}>
              Descartar prévia
            </Button>
            <p>
              {action === 'account-reset'
                ? 'As contas voltarão ao primeiro acesso; senha, QR e sessões atuais serão invalidados.'
                : action === 'password-reset'
                  ? 'As senhas serão redefinidas e as sessões atuais encerradas.'
                  : action === 'qr-regenerate'
                    ? 'Os QR anteriores deixarão de funcionar e as sessões atuais serão encerradas.'
                    : 'O acesso será bloqueado e as sessões atuais encerradas.'}
            </p>
            {eligible > 0 && (
              <>
                <TextField value={confirmation} onChange={setConfirmation}>
                  <Label>Digite {required} para confirmar</Label>
                  <Input autoComplete="off" />
                </TextField>
                <Button
                  variant="danger"
                  isDisabled={confirmation !== required}
                  onPress={() => {
                    void controller.current?.run();
                  }}
                >
                  Confirmar {actions[action].toLowerCase()}
                </Button>
              </>
            )}
          </>
        )}
        {state.phase === 'running' && (
          <Button variant="secondary" onPress={() => controller.current?.cancel()}>
            Parar próximos itens
          </Button>
        )}
        {state.phase === 'paused' && (
          <>
            <Button variant="secondary" onPress={() => controller.current?.finish()}>
              Encerrar lote sem executar pendentes
            </Button>
            <p role="status">Execução pausada. Os itens concluídos foram mantidos.</p>
            <Button
              onPress={() => {
                void controller.current?.run();
              }}
            >
              Continuar itens pendentes
            </Button>
          </>
        )}
        {state.phase === 'unknown' && (
          <>
            <p role="status">
              Resultado não confirmado. Confirme a mesma tentativa antes de continuar.
            </p>
            <Button
              isDisabled={clock < (state.retryAt ?? 0)}
              onPress={() => {
                void controller.current?.run();
              }}
            >
              Retentar mesma operação
            </Button>
          </>
        )}
        {state.phase === 'error' && (
          <p role="alert">
            Não foi possível preparar a operação.{' '}
            {errors[state.error ?? ''] ?? 'Solicitação recusada.'}
          </p>
        )}
        {state.items.length > 0 && (
          <>
            {state.phase !== 'review' && (
              <p role="status">
                {completed} concluídos · {failed} não realizados · {skipped} não elegíveis · {state.total} contas
              </p>
            )}
            <ul aria-label="Resultados por conta" className="divide-y">
              {state.items.slice(page * 25, (page + 1) * 25).map((item) => (
                <li key={item.accountId} className="py-2">
                  <span>
                    {item.name} · {item.classLabel}
                  </span>
                  <span>
                    {' '}
                    — {results[item.result]}
                    {item.error ? ` · ${errors[item.error] ?? 'Solicitação recusada.'}` : ''}
                    {item.ineligibility ? ` · ${ineligibility[item.ineligibility]}` : ''}
                  </span>
                </li>
              ))}
            </ul>
            {state.total > 25 && (
              <div className="flex items-center gap-2">
                <Button size="sm" isDisabled={page === 0} onPress={() => setPage((v) => v - 1)}>
                  Contas anteriores
                </Button>
                <span>
                  {page + 1} / {Math.ceil(state.total / 25)}
                </span>
                <Button
                  size="sm"
                  isDisabled={(page + 1) * 25 >= state.total}
                  onPress={() => setPage((v) => v + 1)}
                >
                  Mais contas
                </Button>
              </div>
            )}
          </>
        )}
      </Card.Content>
    </Card>
  );
}
