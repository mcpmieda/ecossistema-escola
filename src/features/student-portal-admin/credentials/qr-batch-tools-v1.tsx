import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Checkbox, Input, Label, Radio, RadioGroup, TextField } from '@heroui/react';
import type { PortalAdminClientV1 } from '../shared/admin-client-v1';
import type { AdminAccountReadV2 } from '../../../../shared/student-portal-contracts/admin-read-v2';
import { accountCredentialPreparableV1 } from '../accounts/accounts-values-v1';
import { createQrOperationV1, type QrOperationStateV1, type QrRendererV1 } from './qr-operation-v1';
import { PRINT_MODES_V1, type PrintModeV1 } from './qr-values-v1';
import { qrFilenameV1 } from './qr-filename-v1';
import type { PortalClientErrorV1 } from '../../student-portal/shared/transport-v1';

export function QrBatchToolsV1({
  client,
  accounts,
  selected,
  onSelectAll,
  classId,
  scopeVersion,
  label,
  canWrite,
  pendingBirth,
  hasMore,
  onCommitted,
  onAuthorizationLost,
  renderArtifact,
}: {
  client: PortalAdminClientV1;
  accounts: AdminAccountReadV2[];
  selected: Set<string>;
  onSelectAll: (selected: boolean) => void;
  classId: number;
  scopeVersion: number;
  label: string;
  canWrite: boolean;
  pendingBirth: boolean;
  hasMore: boolean;
  onCommitted: () => void;
  onAuthorizationLost?: (error: PortalClientErrorV1) => void;
  renderArtifact?: QrRendererV1;
}) {
  const [state, setState] = useState<QrOperationStateV1>({ state: 'idle' });
  const [mode, setMode] = useState<PrintModeV1>('qr-name-class');
  const [withInstruction, setWithInstruction] = useState(false),
    [instruction, setInstruction] = useState('');
  const [clock, setClock] = useState(Date.now);
  const capture = useRef({ instruction: '', filename: '', run: '', selectionKey: '' });
  const callbacks = useRef({ onAuthorizationLost, onCommitted });
  callbacks.current = { onAuthorizationLost, onCommitted };
  const render = useCallback<QrRendererV1>(
    async (cards, format, signal, progress) => {
      if (renderArtifact) return renderArtifact(cards, format, signal, progress);
      const { renderQrPdfV1 } = await import('./qr-artifacts-v1');
      signal.throwIfAborted();
      return renderQrPdfV1(cards, signal, progress, capture.current.instruction);
    },
    [renderArtifact],
  );
  const operation = useMemo(
    () =>
      createQrOperationV1({
        client,
        canWrite,
        publish: setState,
        render,
        retainUntilClear: true,
        onAuthorizationLost: (error) => callbacks.current.onAuthorizationLost?.(error),
      }),
    [client, canWrite, render],
  );
  const autoDownloaded = useRef('');
  useEffect(() => {
    const clear = () => operation.clear();
    window.addEventListener('pagehide', clear);
    return () => {
      window.removeEventListener('pagehide', clear);
      operation.clear();
    };
  }, [operation]);
  useEffect(() => {
    if (
      state.state !== 'ready' ||
      !capture.current.run ||
      autoDownloaded.current === capture.current.run
    )
      return;
    autoDownloaded.current = capture.current.run;
    operation.download(capture.current.filename);
    callbacks.current.onCommitted();
  }, [state, operation]);
  useEffect(() => {
    if (state.state !== 'error') return;
    setClock(Date.now());
    const timer = setTimeout(() => setClock(Date.now()), Math.max(0, state.retryAt - Date.now()));
    return () => clearTimeout(timer);
  }, [state]);
  const working = state.state === 'requesting' || state.state === 'rendering';
  const unresolved = state.state === 'error';
  const chosen = accounts.filter(
    (account) => selected.has(account.accountId) && accountCredentialPreparableV1(account),
  );
  const selectionKey = JSON.stringify([
    chosen.map((account) => account.accountId).sort((left, right) => left.localeCompare(right)), mode,
    withInstruction ? instruction.trim().slice(0, 240) : '',
  ]);
  const readyForSelection = state.state === 'ready' && capture.current.selectionKey === selectionKey;
  function generate() {
    if (!canWrite || working || unresolved || pendingBirth || !chosen.length || chosen.length > 100)
      return;
    const idempotencyKey = crypto.randomUUID();
    capture.current = {
      instruction: withInstruction ? instruction.trim().slice(0, 240) : '',
      filename: qrFilenameV1(label, 'pdf'),
      run: idempotencyKey,
      selectionKey,
    };
    operation.clear();
    void operation.submit(
      {
        contractVersion: 1,
        operation: 'qr-batch',
        classId,
        expectedVersion: scopeVersion,
        accountIds: chosen.map((account) => account.accountId),
        mode,
        confirmed: true,
        idempotencyKey,
      },
      'pdf',
    );
  }
  return (
    <div className="pa-qr-batch-tools" aria-label="Opções do PDF de QR">
      <RadioGroup
        value={mode}
        onChange={(value) => setMode(value as PrintModeV1)}
        orientation="horizontal"
        isDisabled={!canWrite || working || unresolved}
      >
        <Label>Conteúdo do PDF</Label>
        {(Object.entries(PRINT_MODES_V1) as [PrintModeV1, string][]).map(([value, text]) => (
          <Radio key={value} value={value}>
            <Radio.Content>
              <Radio.Control>
                <Radio.Indicator />
              </Radio.Control>
              <span>{text}</span>
            </Radio.Content>
          </Radio>
        ))}
      </RadioGroup>
      <Checkbox
        isSelected={withInstruction}
        onChange={setWithInstruction}
        isDisabled={working || unresolved || !canWrite}
      >
        <Checkbox.Content>
          <Checkbox.Control>
            <Checkbox.Indicator />
          </Checkbox.Control>
          <span>Adicionar instrução ao cartão</span>
        </Checkbox.Content>
      </Checkbox>
      {withInstruction ? (
        <TextField
          value={instruction}
          onChange={setInstruction}
          isDisabled={working || unresolved || !canWrite}
        >
          <Label>Instrução abaixo do QR</Label>
          <Input maxLength={240} placeholder="Texto opcional, somente neste navegador" />
        </TextField>
      ) : null}
      <div className="pa-credentials-actions">
        <Button
          size="sm"
          variant="secondary"
          isDisabled={!canWrite || working || unresolved}
          onPress={() => onSelectAll(true)}
        >
          {hasMore ? 'Selecionar exibidos' : 'Selecionar lista'}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          isDisabled={!selected.size || working || unresolved}
          onPress={() => onSelectAll(false)}
        >
          Limpar
        </Button>
        <span role="status">{chosen.length} selecionados</span>
        <Button
          size="sm"
          isDisabled={
            !canWrite ||
            (!readyForSelection && (
              working || unresolved || pendingBirth || !chosen.length || chosen.length > 100
            ))
          }
          onPress={readyForSelection
            ? () => operation.download(capture.current.filename)
            : generate}
        >
          {readyForSelection ? 'Baixar PDF pronto' : 'Baixar PDF'}
        </Button>
        {state.state === 'ready' ? (
          <Button size="sm" variant="secondary" onPress={() => operation.clear()}>
            Preparar outro PDF
          </Button>
        ) : null}
      </div>
      {chosen.length > 100 ? <p role="alert">Selecione até 100 alunos por PDF.</p> : null}
      {working ? (
        <p role="status">
          {state.state === 'rendering'
            ? `Gerando PDF: ${state.completed} de ${state.total}`
            : 'Preparando QR…'}
        </p>
      ) : null}
      {state.state === 'ready' && state.downloadFailed ? (
        <p role="alert">O PDF está pronto, mas o download não começou.</p>
      ) : null}
      {state.state === 'error' ? (
        <div role="alert">
          <p>
            {state.stage === 'render'
              ? 'O servidor confirmou os QR. Tentar novamente gera somente o arquivo.'
              : state.error.state === 'conflict'
                ? 'A turma mudou. Recarregue a lista e revise os alunos antes de gerar.'
                : 'Não foi possível confirmar o resultado. Não gere outra solicitação sem revisar.'}
          </p>
          {state.retryable ? (
            <Button
              size="sm"
              variant="secondary"
              isDisabled={clock < state.retryAt}
              onPress={() => void operation.retry()}
            >
              Repetir mesma solicitação
            </Button>
          ) : (
            <Button
              size="sm"
              variant="secondary"
              isDisabled={clock < state.retryAt}
              onPress={() => {
                operation.clear();
                callbacks.current.onCommitted();
              }}
            >
              Recarregar disponibilidade
            </Button>
          )}
        </div>
      ) : null}
    </div>
  );
}
