import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Card } from '@heroui/react';
import { useAccountsReadV1 } from '../accounts/accounts-read-v1';
import { AccountsErrorV1 } from '../accounts/accounts-presentation-v1';
import { accountPageMatchesV1 } from '../accounts/accounts-values-v1';
import type { StudentCredentialsPropsV1 } from './student-credentials-v1';
import type { ScopeV1 } from '../../../../shared/student-portal-contracts/core-v1';
import { PortalClientErrorV1 } from '../../student-portal/shared/transport-v1';
import { createQrOperationV1, type QrOperationStateV1 } from './qr-operation-v1';
import { createQrPrintV1 } from './qr-print-v1';
import { qrFilenameV1 } from './qr-filename-v1';

export function IndividualQrV1(
  props: StudentCredentialsPropsV1 & { scope: Extract<ScopeV1, { kind: 'account' }> },
) {
  const { client, reader, canWrite, scope, renderArtifact } = props;
  const [state, setState] = useState<QrOperationStateV1>({ state: 'idle' });
  const [notice, setNotice] = useState('');
  const [clock, setClock] = useState(Date.now);
  const notify = useRef(props.onAuthorizationLost);
  notify.current = props.onAuthorizationLost;
  const load = useCallback(
    async (signal: AbortSignal) => {
      const value = await reader.query(
        { contractVersion: 2, operation: 'accounts-read', scope, page: { limit: 100 } },
        signal,
      );
      if (value.state !== 'accounts-read') throw new PortalClientErrorV1('invalid-response');
      accountPageMatchesV1(value, scope);
      return value.items[0] ?? null;
    },
    [reader, scope.accountId],
  );
  const read = useAccountsReadV1(load);
  const operation = useMemo(
    () =>
      createQrOperationV1({
        client,
        canWrite,
        publish: setState,
        render: renderArtifact,
        retainUntilClear: true,
        onAuthorizationLost: (error) => notify.current?.(error),
      }),
    [client, canWrite, renderArtifact],
  );
  const printer = useMemo(createQrPrintV1, []);
  const requested = useRef<string | null>(null);
  useEffect(() => {
    const clear = () => {
      requested.current = null;
      operation.clear();
      printer.clear();
    };
    window.addEventListener('pagehide', clear);
    return () => {
      window.removeEventListener('pagehide', clear);
      clear();
    };
  }, [operation, printer]);
  useEffect(() => {
    if (
      read.state.state === 'error' &&
      ['unauthenticated', 'forbidden'].includes(read.state.error.state)
    ) {
      operation.clear();
      printer.clear();
      notify.current?.(read.state.error);
    }
    if (read.state.state !== 'ready' || !read.state.data || !canWrite) return;
    const account = read.state.data;
    if (!account.firstAccess.qrIssued) return;
    const key = account.accountId + ':' + account.version;
    if (requested.current === key) return;
    requested.current = key;
    operation.clear();
    void operation.submit(
      {
        contractVersion: 1,
        operation: 'qr-reprint',
        accountId: account.accountId,
        expectedVersion: account.version,
        idempotencyKey: crypto.randomUUID(),
      },
      'png',
    );
  }, [read.state, canWrite, operation, printer]);
  useEffect(() => {
    if (state.state !== 'error') return;
    setClock(Date.now());
    const timer = setTimeout(() => setClock(Date.now()), Math.max(0, state.retryAt - Date.now()));
    return () => clearTimeout(timer);
  }, [state]);
  const imageUrl = state.state === 'ready' ? operation.imageUrl() : null;
  return (
    <Card className="pa-individual-qr" aria-label="QR atual do aluno">
      <Card.Content>
        {!canWrite ? (
          <p role="status">Somente operadores autorizados podem consultar o QR.</p>
        ) : null}
        {read.state.state === 'error' ? (
          <AccountsErrorV1
            error={read.state.error}
            canReload={read.canReload}
            onReload={read.reload}
          />
        ) : null}
        {canWrite && read.state.state === 'ready' && !read.state.data?.firstAccess.qrIssued ? (
          <p role="status">
            Nenhum QR emitido. Use a emissão pela turma; abrir esta ficha não cria nem troca
            credenciais.
          </p>
        ) : null}
        {state.state === 'requesting' ||
        state.state === 'rendering' ||
        read.state.state === 'loading' ? (
          <p role="status">Carregando QR atual…</p>
        ) : null}
        {imageUrl ? (
          <div className="pa-individual-qr-layout">
            <img src={imageUrl} alt="QR atual de acesso" width={224} height={224} />
            <div className="pa-individual-qr-actions">
              <Button onPress={() => operation.download(qrFilenameV1(props.scopeLabel, 'png'))}>
                Baixar imagem
              </Button>
              <Button
                variant="secondary"
                onPress={() => void operation.copy()}
                isDisabled={state.state === 'ready' && state.copy === 'pending'}
              >
                Copiar imagem
              </Button>
              <Button
                variant="secondary"
                onPress={() => {
                  void printer.print(imageUrl).then((ok) => {
                    if (!ok)
                      setNotice(
                        'Não foi possível imprimir. Baixe a imagem para imprimir pelo navegador.',
                      );
                  });
                }}
              >
                Imprimir
              </Button>
            </div>
          </div>
        ) : null}
        {state.state === 'ready' && state.copy === 'copied' ? (
          <p role="status">Imagem copiada.</p>
        ) : null}
        {state.state === 'ready' && state.copy === 'download-required' ? (
          <p role="alert">Cópia indisponível neste navegador. Use Baixar imagem.</p>
        ) : null}
        {state.state === 'ready' && state.downloadFailed ? (
          <p role="alert">O download não começou. Tente novamente.</p>
        ) : null}
        {state.state === 'error' ? (
          <div role="alert">
            <p>
              {state.stage === 'render'
                ? 'O QR foi consultado, mas a imagem não ficou pronta. A nova tentativa não troca o QR.'
                : 'Não foi possível consultar o QR atual.'}
            </p>
            {state.retryable ? (
              <Button
                variant="secondary"
                isDisabled={clock < state.retryAt}
                onPress={() => void operation.retry()}
              >
                Tentar novamente
              </Button>
            ) : (
              <Button
                variant="secondary"
                isDisabled={clock < state.retryAt}
                onPress={() => {
                  requested.current = null;
                  read.reload();
                }}
              >
                Recarregar QR atual
              </Button>
            )}
          </div>
        ) : null}
        {notice ? <p role="alert">{notice}</p> : null}
      </Card.Content>
    </Card>
  );
}
