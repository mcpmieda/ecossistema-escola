import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertDialog, Button, Card, Chip, ScrollShadow, Table } from '@heroui/react';
import type { AdminReadResponseV2 } from '../../../../shared/student-portal-contracts/admin-read-v2';
import type { ScopeV1 } from '../../../../shared/student-portal-contracts/core-v1';
import { settingsScopeKeyV1 } from '../settings/settings-values-v1';
import { AccountsErrorV1 } from '../accounts/accounts-presentation-v1';
import { OperationsScopeV1 } from '../overview/operations-scope-v1';
import {
  operationDateV1,
  authorizationLostV1,
  useOperationalReadV1,
  type OperationsPropsV1,
} from '../overview/operations-values-v1';
import { PortalClientErrorV1 } from '../../student-portal/shared/transport-v1';
import { LiveReadNoticeV1 } from '../../../shared/live-data/live-read-notice-v1';
import {
  createSessionMutationV1,
  type RevokeCommandV1,
  type SessionMutationStateV1,
} from './session-mutation-v1';

type SessionsPageV2 = Extract<AdminReadResponseV2, { state: 'sessions-read' }>;
type SessionRowV2 = SessionsPageV2['items'][number];
const labels = {
  valid: 'Válida',
  expired: 'Expirada',
  revoked: 'Revogada',
  unavailable: 'Acesso indisponível',
} as const;
export function StudentSessionsV1(props: OperationsPropsV1) {
  return (
    <OperationsScopeV1 {...props}>
      {(scope, label, onAuthorizationLost) => (
        <SessionsBodyV1
          key={props.identityKey + settingsScopeKeyV1(scope) + props.canWrite}
          {...props}
          scope={scope}
          scopeLabel={label}
          onAuthorizationLost={onAuthorizationLost}
        />
      )}
    </OperationsScopeV1>
  );
}
function SessionsBodyV1(props: OperationsPropsV1) {
  const parentScope = props.scope;
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined]);
  const [revision, setRevision] = useState(0);
  const [mutation, setMutation] = useState<SessionMutationStateV1>({ state: 'idle' });
  const [preparing, setPreparing] = useState(false);
  const [prepareError, setPrepareError] = useState<PortalClientErrorV1 | null>(null);
  const [prepareRetryAt, setPrepareRetryAt] = useState(0);
  const [review, setReview] = useState<{
    command: RevokeCommandV1;
    label: string;
    count: number;
    at: string;
  } | null>(null);
  const [clock, setClock] = useState(Date.now);
  const pendingReview = useRef<AbortController | null>(null);
  const returnFocus = useRef<Element | null>(null);
  const cursor = cursors.at(-1),
    scopeKey = settingsScopeKeyV1(props.scope);
  const load = useCallback(
    async (signal: AbortSignal) => {
      const data = await props.reader.query(
        {
          contractVersion: 2,
          operation: 'sessions-read',
          scope: props.scope,
          page: { limit: 100, ...(cursor ? { cursor } : {}) },
        },
        signal,
      );
      if (
        data.state !== 'sessions-read' ||
        settingsScopeKeyV1(data.scope) !== scopeKey ||
        new Set(data.items.map((s) => s.sessionId)).size !== data.items.length ||
        (parentScope.kind === 'account' &&
          data.items.some((s) => s.accountId !== parentScope.accountId.toLowerCase()))
      )
        throw new PortalClientErrorV1('invalid-response');
      return data;
    },
    [props.reader, scopeKey, cursor, revision],
  );
  const read = useOperationalReadV1(load, props.onAuthorizationLost);
  const operation = useMemo(
    () => createSessionMutationV1(props.client, props.canWrite, setMutation),
    [props.client, props.canWrite],
  );
  useEffect(
    () => () => {
      operation.clear();
      pendingReview.current?.abort();
    },
    [operation],
  );
  useEffect(() => {
    if (mutation.state === 'committed') {
      read.clear();
      setCursors([undefined]);
      setRevision((v) => v + 1);
    }
    if (mutation.state === 'error' && authorizationLostV1(mutation.error))
      props.onAuthorizationLost?.(mutation.error);
  }, [mutation]);
  useEffect(() => {
    if (mutation.state !== 'error' && !prepareError) return;
    setClock(Date.now());
    const deadline = Math.max(prepareRetryAt, mutation.state === 'error' ? mutation.retryAt : 0);
    const timer = setTimeout(() => setClock(Date.now()), Math.max(0, deadline - Date.now()));
    return () => clearTimeout(timer);
  }, [mutation, prepareError, prepareRetryAt]);
  const data = read.state.state === 'ready' ? read.state.data : null;
  const busy =
    clock < prepareRetryAt ||
    preparing ||
    !!review ||
    mutation.state === 'pending' ||
    (mutation.state === 'error' && mutation.retryable);
  function cancelReview() {
    pendingReview.current?.abort();
    pendingReview.current = null;
    setPreparing(false);
    setReview(null);
    requestAnimationFrame(() => {
      if (returnFocus.current instanceof HTMLElement) returnFocus.current.focus();
    });
  }
  async function prepare(scope: ScopeV1, label: string, sessionId?: string) {
    if (!props.canWrite || busy || scope.kind === 'school') return;
    returnFocus.current = document.activeElement;
    const controller = new AbortController();
    pendingReview.current?.abort();
    pendingReview.current = controller;
    setPreparing(true);
    setPrepareError(null);
    operation.clear();
    try {
      const fresh = await props.reader.query(
        { contractVersion: 2, operation: 'sessions-read', scope, page: { limit: 100 } },
        controller.signal,
      );
      controller.signal.throwIfAborted();
      if (
        fresh.state !== 'sessions-read' ||
        settingsScopeKeyV1(fresh.scope) !== settingsScopeKeyV1(scope)
      )
        throw new PortalClientErrorV1('invalid-response');
      if (
        scope.kind === 'account' &&
        (fresh.items.some((s) => s.accountId !== scope.accountId) ||
          (parentScope.kind === 'class' &&
            fresh.items.some((s) => s.classId !== parentScope.classId)))
      )
        throw new PortalClientErrorV1('conflict');
      if (fresh.revocableCount === 0) throw new PortalClientErrorV1('conflict');
      setReview({
        label,
        count: sessionId ? 1 : fresh.revocableCount,
        at: fresh.observedAt,
        command: {
          contractVersion: 1,
          operation: 'sessions-revoke',
          scope,
          ...(sessionId ? { sessionId } : {}),
          expectedVersion: fresh.version,
          idempotencyKey: crypto.randomUUID(),
          confirmed: true,
        },
      });
    } catch (error) {
      if (controller.signal.aborted) return;
      const failure =
        error instanceof PortalClientErrorV1 ? error : new PortalClientErrorV1('network-error');
      if (authorizationLostV1(failure)) props.onAuthorizationLost?.(failure);
      else setPrepareError(failure);
      setPrepareRetryAt(Date.now() + (failure.retryAfterSeconds ?? 0) * 1000);
    } finally {
      if (pendingReview.current === controller) {
        pendingReview.current = null;
        setPreparing(false);
      }
    }
  }
  function accountAction(row: SessionRowV2, individual: boolean) {
    void prepare(
      { kind: 'account', academicYear: 2026, accountId: row.accountId },
      individual
        ? 'Sessão de ' + (row.name || 'aluno selecionado')
        : 'Todas as sessões de ' + (row.name || 'aluno selecionado'),
      individual ? row.sessionId : undefined,
    );
  }
  return (
    <Card className="pa-operations-card">
      <Card.Header>
        <div className="pa-operations-header">
          <div>
            <h2>Sessões</h2>
            <p>{props.scopeLabel} · 2026</p>
          </div>
          <LiveReadNoticeV1 failed={Boolean(read.refreshError)} />
        </div>
      </Card.Header>
      <Card.Content>
        <p>
          O estado abaixo corresponde à última consulta do servidor. Sessão curta não garante saída
          ao fechar o navegador.
        </p>
        {read.state.state === 'loading' && <p role="status">Consultando sessões…</p>}
        {read.state.state === 'error' && (
          <AccountsErrorV1
            error={read.state.error}
            canReload={!busy && read.canReload}
            onReload={read.reload}
          />
        )}
        {prepareError && (
          <AccountsErrorV1
            error={prepareError}
            canReload={clock >= prepareRetryAt}
            onReload={() => {
              setPrepareError(null);
              read.reload();
            }}
          />
        )}
        {preparing && (
          <div role="status">
            Conferindo o escopo…{' '}
            <Button variant="secondary" onPress={cancelReview}>
              Cancelar conferência
            </Button>
          </div>
        )}
        {mutation.state === 'pending' && (
          <p role="status">
            Solicitando encerramento… Se mudar de escopo, uma solicitação já aceita pode continuar
            no servidor.
          </p>
        )}
        {mutation.state === 'committed' && (
          <p role="status">
            Encerramento confirmado pelo servidor. A lista é consultada novamente.
          </p>
        )}
        {mutation.state === 'expired' && (
          <p role="alert">
            O prazo de retomada terminou. Consulte o estado antes de uma nova decisão.
          </p>
        )}
        {mutation.state === 'error' && (
          <div role="alert">
            <p>
              {mutation.error.state === 'conflict'
                ? 'O estado mudou. Consulte novamente antes de confirmar.'
                : mutation.retryable
                  ? 'Não foi possível confirmar a resposta. Retomar repete somente a mesma solicitação.'
                  : 'A solicitação não pôde ser concluída.'}
            </p>
            <div className="pa-operations-actions">
              {mutation.retryable && (
                <Button
                  isDisabled={clock < mutation.retryAt}
                  onPress={() => void operation.retry()}
                >
                  Retomar encerramento
                </Button>
              )}
              <Button
                variant="secondary"
                isDisabled={clock < mutation.retryAt}
                onPress={() => {
                  operation.clear();
                  read.reload();
                }}
              >
                Consultar novamente
              </Button>
            </div>
          </div>
        )}
        {data && (
          <>
            <p className="pa-operations-muted">
              Na consulta de {operationDateV1(data.observedAt)}: {data.revocableCount} sessão(ões)
              sem revogação, incluindo expiradas.
            </p>
            {props.scope.kind !== 'school' && (
              <Button
                variant="danger"
                isDisabled={!props.canWrite || busy || data.revocableCount === 0}
                onPress={() =>
                  void prepare(
                    props.scope,
                    props.scope.kind === 'class'
                      ? 'Todas as sessões da turma ' + props.scopeLabel
                      : 'Todas as sessões da conta ' + props.scopeLabel,
                  )
                }
              >
                {props.scope.kind === 'class'
                  ? 'Encerrar sessões da turma'
                  : 'Encerrar sessões da conta'}
              </Button>
            )}
            {!props.canWrite && <p>Permissão somente de leitura.</p>}
            {data.items.length === 0 ? (
              <p>Nenhuma sessão encontrada neste escopo.</p>
            ) : (
              <Table>
                <ScrollShadow
                  className="pa-operations-scroll"
                  orientation="horizontal"
                  role="region"
                  aria-label="Rolagem das sessões"
                  tabIndex={0}
                >
                  <Table.Content aria-label="Sessões do Portal">
                    <Table.Header>
                      <Table.Column isRowHeader id="student">
                        Aluno e turma
                      </Table.Column>
                      <Table.Column id="state">Estado na consulta</Table.Column>
                      <Table.Column id="expiry">Vencimento efetivo</Table.Column>
                      <Table.Column id="actions">Ações</Table.Column>
                    </Table.Header>
                    <Table.Body>
                      {data.items.map((row) => (
                        <Table.Row key={row.sessionId} id={row.sessionId}>
                          <Table.Cell>
                            <strong>{row.name || 'Nome indisponível'}</strong>
                            <p>{row.classLabel || 'Turma não resolvida'}</p>
                          </Table.Cell>
                          <Table.Cell>
                            <Chip size="sm" variant="soft">
                              {labels[row.validity]}
                            </Chip>
                            <p>{row.persistent ? 'Persistente' : 'Curta'}</p>
                            <p>Iniciada em {operationDateV1(row.createdAt)}</p>
                            {row.revokedAt && <p>Revogada em {operationDateV1(row.revokedAt)}</p>}
                          </Table.Cell>
                          <Table.Cell>
                            {operationDateV1(row.effectiveExpiresAt)}
                            <details>
                              <summary>Data armazenada</summary>
                              {operationDateV1(row.expiresAt)}
                            </details>
                          </Table.Cell>
                          <Table.Cell>
                            <div className="pa-operations-actions">
                              <Button
                                size="sm"
                                variant="secondary"
                                isDisabled={
                                  !props.canWrite ||
                                  busy ||
                                  row.revokedAt !== null ||
                                  (props.scope.kind === 'class' &&
                                    row.classId !== props.scope.classId)
                                }
                                onPress={() => accountAction(row, true)}
                              >
                                Encerrar esta sessão
                              </Button>
                              {props.scope.kind !== 'account' && (
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  isDisabled={
                                    !props.canWrite ||
                                    busy ||
                                    (props.scope.kind === 'class' &&
                                      row.classId !== props.scope.classId)
                                  }
                                  onPress={() => accountAction(row, false)}
                                >
                                  Encerrar sessões desta conta
                                </Button>
                              )}
                            </div>
                          </Table.Cell>
                        </Table.Row>
                      ))}
                    </Table.Body>
                  </Table.Content>
                </ScrollShadow>
              </Table>
            )}
            <div className="pa-operations-actions">
              <Button
                variant="secondary"
                isDisabled={busy || cursors.length === 1}
                onPress={() => setCursors((c) => c.slice(0, -1))}
              >
                Página anterior
              </Button>
              <span>Página {cursors.length}</span>
              <Button
                variant="secondary"
                isDisabled={busy || !data.nextCursor}
                onPress={() => setCursors((c) => [...c, data.nextCursor!])}
              >
                Próxima página
              </Button>
            </div>
          </>
        )}
        {review && (
          <AlertDialog.Backdrop
            isOpen
            isDismissable={false}
            isKeyboardDismissDisabled={false}
            onOpenChange={(open) => {
              if (!open) cancelReview();
            }}
          >
            <AlertDialog.Container>
              <AlertDialog.Dialog className="pa-operations-dialog">
                <AlertDialog.Header>
                  <AlertDialog.Heading>Confirmar encerramento de sessões</AlertDialog.Heading>
                </AlertDialog.Header>
                <AlertDialog.Body>
                  <p>{review.label} · 2026</p>
                  <p>
                    {review.count} sessão(ões) na consulta de {operationDateV1(review.at)}.
                  </p>
                  <p>
                    {review.command.sessionId
                      ? 'A ação abrange somente a sessão selecionada.'
                      : 'A ação abrange todas as sessões existentes neste escopo no momento da confirmação no servidor, inclusive expiradas.'}
                  </p>
                  <p>
                    Senha e QR permanecem. Um novo login permitido pode criar outra sessão depois.
                  </p>
                </AlertDialog.Body>
                <AlertDialog.Footer>
                  <Button autoFocus variant="secondary" onPress={cancelReview}>
                    Cancelar
                  </Button>
                  <Button
                    variant="danger"
                    onPress={() => {
                      const captured = review.command;
                      setReview(null);
                      read.clear();
                      void operation.submit(captured);
                    }}
                  >
                    Encerrar sessões
                  </Button>
                </AlertDialog.Footer>
              </AlertDialog.Dialog>
            </AlertDialog.Container>
          </AlertDialog.Backdrop>
        )}
      </Card.Content>
    </Card>
  );
}
