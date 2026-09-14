import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import {
  AlertDialog,
  Button,
  Card,
  Label,
  Radio,
  RadioGroup,
  ScrollShadow,
  Table,
} from '@heroui/react';
import type { ScopeV1 } from '../../../../shared/student-portal-contracts/core-v1';
import type { PortalAdminClientV1 } from '../shared/admin-client-v1';
import type {
  AccountsReadPageV2,
  PortalAdminReadClientV2,
  PortalClassCatalogV2,
} from '../accounts/accounts-client-v2';
import { ClassFilterV1 } from '../accounts/class-filter-v1';
import { useAccountsReadV1 } from '../accounts/accounts-read-v1';
import { AccountsErrorV1 } from '../accounts/accounts-presentation-v1';
import {
  accountCredentialPreparableV1,
  firstAccessLabelV1,
  accountPageMatchesV1,
} from '../accounts/accounts-values-v1';
import { SettingsCheckboxV1 } from '../settings/settings-editors-v1';
import { settingsScopeKeyV1 } from '../settings/settings-values-v1';
import { PortalClientErrorV1 } from '../../student-portal/shared/transport-v1';
import {
  createQrOperationV1,
  type QrCommandV1,
  type QrOperationStateV1,
  type QrRendererV1,
} from './qr-operation-v1';
import { PRINT_MODES_V1, type PrintModeV1 } from './qr-values-v1';
import './student-credentials-v1.css';

export interface StudentCredentialsPropsV1 {
  client: PortalAdminClientV1;
  reader: PortalAdminReadClientV2;
  scope: ScopeV1;
  identityKey: string;
  canWrite: boolean;
  scopeLabel?: string;
  catalog?: PortalClassCatalogV2;
  onAuthorizationLost?: (error: PortalClientErrorV1) => void;
  /** Optional local renderer for synthetic tests; production uses the real PDF/PNG renderer. */
  renderArtifact?: QrRendererV1;
}
export function StudentCredentialsV1(props: StudentCredentialsPropsV1) {
  return (
    <CredentialsAreaV1
      key={props.identityKey + ':' + settingsScopeKeyV1(props.scope) + ':' + props.canWrite}
      {...props}
    />
  );
}
function CredentialsAreaV1(props: StudentCredentialsPropsV1) {
  const [selectedClass, setSelectedClass] = useState<{ id: number; label: string } | null>(null);
  const scope =
    props.scope.kind === 'school'
      ? selectedClass
        ? { kind: 'class' as const, academicYear: 2026 as const, classId: selectedClass.id }
        : null
      : props.scope;
  const label = props.scope.kind === 'school' ? selectedClass?.label : props.scopeLabel;
  return (
    <section className="pa-credentials" aria-label="QR e cartões de acesso de 2026">
      <header>
        <h2>QR e cartões de acesso</h2>
        <p>2026 · Selecione as contas e o conteúdo do arquivo.</p>
      </header>
      {props.scope.kind === 'school' &&
        (props.catalog ? (
          <ClassFilterV1
            catalog={props.catalog}
            selected={selectedClass}
            onChange={setSelectedClass}
          />
        ) : (
          <p role="alert">Catálogo de turmas indisponível.</p>
        ))}
      {scope ? (
        <CredentialsPagesV1
          key={settingsScopeKeyV1(scope)}
          {...props}
          scope={scope}
          scopeLabel={label}
        />
      ) : (
        <p>Escolha uma turma para preparar os cartões.</p>
      )}
    </section>
  );
}
type ScopedPropsV1 = StudentCredentialsPropsV1 & { scope: Exclude<ScopeV1, { kind: 'school' }> };
function CredentialsPagesV1(props: ScopedPropsV1) {
  const [history, setHistory] = useState<Array<string | undefined>>([undefined]);
  const [page, setPage] = useState(0),
    [revision, setRevision] = useState(0);
  return (
    <CredentialsPageV1
      key={page + ':' + revision}
      {...props}
      cursor={history[page]}
      page={page}
      onFirst={() => {
        setHistory([undefined]);
        setPage(0);
        setRevision((v) => v + 1);
      }}
      onPrevious={() => setPage((v) => v - 1)}
      onNext={(cursor) => {
        setHistory((v) => [...v.slice(0, page + 1), cursor]);
        setPage((v) => v + 1);
      }}
    />
  );
}
type ReviewV1 = { command: QrCommandV1; format: 'pdf' | 'png'; names: string[]; label: string };
function CredentialsPageV1({
  client,
  reader,
  scope,
  scopeLabel,
  canWrite,
  cursor,
  page,
  onFirst,
  onPrevious,
  onNext,
  renderArtifact,
  onAuthorizationLost,
}: ScopedPropsV1 & {
  cursor?: string;
  page: number;
  onFirst: () => void;
  onPrevious: () => void;
  onNext: (cursor: string) => void;
}) {
  const scopeKey = settingsScopeKeyV1(scope);
  const load = useCallback(
    async (signal: AbortSignal): Promise<AccountsReadPageV2> => {
      const result = await reader.query(
        {
          contractVersion: 2,
          operation: 'accounts-read',
          scope,
          page: { limit: 100, ...(cursor ? { cursor } : {}) },
        },
        signal,
      );
      if (result.state !== 'accounts-read') throw new PortalClientErrorV1('invalid-response');
      return accountPageMatchesV1(result, scope);
      // Primitive scope identity preserves reads when a parent's equivalent scope object changes.
    },
    [reader, scopeKey, cursor],
  );
  const read = useAccountsReadV1(load);
  const [authorizationLost, setAuthorizationLost] = useState<PortalClientErrorV1 | null>(null);
  const data = !authorizationLost && read.state.state === 'ready' ? read.state.data : null;
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(scope.kind === 'account' ? [scope.accountId] : []),
  );
  const [mode, setMode] = useState<PrintModeV1>('qr-name-class');
  const [review, setReview] = useState<ReviewV1 | null>(null);
  const [operationState, setOperationState] = useState<QrOperationStateV1>({ state: 'idle' });
  const [clock, setClock] = useState(0);
  const trigger = useRef<HTMLElement | null>(null);
  const notify = useRef(onAuthorizationLost);
  notify.current = onAuthorizationLost;
  const operation = useMemo(
    () =>
      createQrOperationV1({
        client,
        canWrite,
        publish: setOperationState,
        render: renderArtifact,
        onAuthorizationLost(error) {
          setAuthorizationLost(error);
          setReview(null);
          setSelected(new Set());
          notify.current?.(error);
        },
      }),
    [client, canWrite, renderArtifact],
  );
  useEffect(() => {
    const leave = () => operation.clear();
    window.addEventListener('pagehide', leave);
    return () => {
      window.removeEventListener('pagehide', leave);
      operation.clear();
    };
  }, [operation]);
  useEffect(() => {
    if (
      read.state.state !== 'error' ||
      !['unauthenticated', 'forbidden'].includes(read.state.error.state)
    )
      return;
    operation.clear();
    setSelected(new Set());
    setReview(null);
    setAuthorizationLost(read.state.error);
    notify.current?.(read.state.error);
  }, [read.state, operation]);
  useEffect(() => {
    if (operationState.state !== 'error') return;
    setClock(Date.now());
    const timer = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [operationState]);
  const busy = operationState.state === 'requesting' || operationState.state === 'rendering';
  const started = operationState.state !== 'idle';
  const candidates = data?.items.filter(accountCredentialPreparableV1) ?? [];
  const chosen = candidates.filter((item) => selected.has(item.accountId));
  function openReview(kind: 'pdf' | 'qr-issue' | 'qr-reprint', target: EventTarget | null) {
    if (!data || !canWrite || started || !chosen.length || (kind !== 'pdf' && chosen.length !== 1))
      return;
    if (target instanceof HTMLElement) trigger.current = target;
    const common = { contractVersion: 1 as const, idempotencyKey: crypto.randomUUID() };
    const command: QrCommandV1 =
      kind === 'pdf'
        ? {
            ...common,
            operation: 'qr-batch',
            expectedVersion: data.scopeVersion,
            classId: chosen[0]!.classId!,
            accountIds: chosen.map((item) => item.accountId),
            mode,
            confirmed: true,
          }
        : {
            ...common,
            operation: kind,
            expectedVersion: chosen[0]!.version,
            accountId: chosen[0]!.accountId,
          };
    setReview({
      command,
      format: kind === 'pdf' ? 'pdf' : 'png',
      names: chosen.map((item) => item.name),
      label: kind === 'pdf' ? PRINT_MODES_V1[mode] : 'Somente imagem QR',
    });
  }
  function cancelReview() {
    setReview(null);
    requestAnimationFrame(() => trigger.current?.focus());
  }
  return (
    <Card className="pa-credentials-card">
      <Card.Content>
        <h3>
          {scopeLabel || (scope.kind === 'class' ? 'Turma selecionada' : 'Conta selecionada')} ·
          2026
        </h3>
        {!canWrite && (
          <p>Consulta disponível. Sua permissão não permite emitir ou reimprimir credenciais.</p>
        )}
        {authorizationLost ? (
          <p role="alert">
            {authorizationLost.state === 'unauthenticated'
              ? 'Sessão administrativa expirada. Entre novamente.'
              : 'Sem autorização para este escopo.'}
          </p>
        ) : read.state.state === 'error' ? (
          <AccountsErrorV1
            error={read.state.error}
            onReload={read.reload}
            canReload={read.canReload}
          />
        ) : !data ? (
          <p role="status">Consultando contas…</p>
        ) : (
          <>
            <p>
              {data.items.length} conta(s) nesta página · {chosen.length} selecionada(s) · limite de
              100 por arquivo.
            </p>
            {data.items.length === 0 ? (
              <p>Nenhuma conta nesta turma.</p>
            ) : (
              <>
                <CredentialSelectionV1
                  rows={data.items}
                  selected={selected}
                  enabled={canWrite && !started && !review}
                  onChange={setSelected}
                />
                <RadioGroup
                  value={mode}
                  onChange={(value) => {
                    if (!review) setMode(value as PrintModeV1);
                  }}
                  isDisabled={!canWrite || started}
                >
                  <Label>Conteúdo do PDF</Label>
                  {(Object.entries(PRINT_MODES_V1) as [PrintModeV1, string][]).map(
                    ([value, label]) => (
                      <Radio key={value} value={value}>
                        <Radio.Content>
                          <Radio.Control>
                            <Radio.Indicator />
                          </Radio.Control>
                          <span>{label}</span>
                        </Radio.Content>
                      </Radio>
                    ),
                  )}
                </RadioGroup>
                <div className="pa-credentials-actions">
                  <Button
                    isDisabled={!canWrite || started || chosen.length === 0}
                    onPress={(event) => openReview('pdf', event.target)}
                  >
                    Preparar PDF
                  </Button>
                  <Button
                    variant="secondary"
                    isDisabled={!canWrite || started || chosen.length !== 1}
                    onPress={(event) => openReview('qr-issue', event.target)}
                  >
                    Emitir ou recuperar QR
                  </Button>
                  <Button
                    variant="secondary"
                    isDisabled={
                      !canWrite ||
                      started ||
                      chosen.length !== 1 ||
                      !chosen[0]?.firstAccess.qrIssued
                    }
                    onPress={(event) => openReview('qr-reprint', event.target)}
                  >
                    Reimprimir QR existente
                  </Button>
                </div>
                <p>
                  O PDF usa o conteúdo escolhido. A cópia contém somente a imagem QR. Emissão e
                  reimpressão preservam o QR já ativo; regenerar ou redefinir a conta são ações
                  separadas na ficha.
                </p>
              </>
            )}
          </>
        )}
        {!authorizationLost && (
          <QrOperationFeedbackV1
            state={operationState}
            clock={clock}
            retry={() => void operation.retry()}
            cancel={operation.cancel}
            copy={() => void operation.copy()}
            download={operation.download}
          />
        )}
        <div className="pa-credentials-actions">
          <Button
            variant="secondary"
            isDisabled={busy || review !== null}
            onPress={() => {
              operation.clear();
              onFirst();
            }}
          >
            Consultar novamente
          </Button>
          {page > 0 && (
            <Button variant="secondary" isDisabled={busy || review !== null} onPress={onPrevious}>
              Página anterior
            </Button>
          )}
          {data?.nextCursor && (
            <Button
              variant="secondary"
              isDisabled={busy || review !== null}
              onPress={() => onNext(data.nextCursor!)}
            >
              Próxima página
            </Button>
          )}
        </div>
        <p>
          Seleção limitada à página atual. Ao mudar de página, turma ou conta, os arquivos são
          descartados. Uma emissão já aceita pelo servidor permanece disponível para reimpressão.
        </p>
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
              <AlertDialog.Dialog className="pa-credentials-dialog">
                <AlertDialog.Header>
                  <AlertDialog.Heading>Preparar cartões de acesso</AlertDialog.Heading>
                </AlertDialog.Header>
                <AlertDialog.Body>
                  <p>
                    {scopeLabel || chosen[0]?.classLabel || 'Escopo selecionado'} · 2026 ·{' '}
                    {review.names.length} conta(s)
                  </p>
                  <p>{review.label}</p>
                  <p>
                    {review.command.operation === 'qr-reprint'
                      ? 'Reimprime somente o QR ativo existente, sem substituir a credencial.'
                      : 'Cria QR apenas quando a conta ainda não possui credencial. Quando já existe um QR ativo, ele é preservado.'}
                  </p>
                  <ul className="pa-credentials-review">
                    {review.names.map((name, index) => (
                      <li key={index}>{name || 'Nome indisponível'}</li>
                    ))}
                  </ul>
                  <p>Nenhum arquivo será enviado a alunos automaticamente.</p>
                </AlertDialog.Body>
                <AlertDialog.Footer>
                  <Button autoFocus variant="secondary" onPress={cancelReview}>
                    Cancelar
                  </Button>
                  <Button
                    onPress={() => {
                      const captured = review;
                      setReview(null);
                      void operation.submit(captured.command, captured.format);
                    }}
                  >
                    Gerar arquivo
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
// Real per-card progress must not rebuild the 100-row selectable table on every tick.
const CredentialSelectionV1 = memo(function CredentialSelectionV1({
  rows,
  selected,
  enabled,
  onChange,
}: {
  rows: AccountsReadPageV2['items'];
  selected: Set<string>;
  enabled: boolean;
  onChange: Dispatch<SetStateAction<Set<string>>>;
}) {
  const candidates = rows.filter(accountCredentialPreparableV1);
  return (
    <>
      <SettingsCheckboxV1
        label="Selecionar contas disponíveis desta página"
        selected={candidates.length > 0 && candidates.every((item) => selected.has(item.accountId))}
        disabled={!enabled || candidates.length === 0}
        onChange={(value) =>
          onChange(new Set(value ? candidates.map((item) => item.accountId) : []))
        }
      />
      <Table>
        <ScrollShadow
          orientation="horizontal"
          className="pa-credentials-scroll"
          role="region"
          aria-label="Rolagem das contas para cartões"
          tabIndex={0}
        >
          <Table.Content aria-label="Contas para cartões de acesso">
            <Table.Header>
              <Table.Column id="name" isRowHeader>
                Aluno
              </Table.Column>
              <Table.Column id="class">Turma</Table.Column>
              <Table.Column id="readiness">Primeiro acesso</Table.Column>
              <Table.Column id="selection">Seleção</Table.Column>
            </Table.Header>
            <Table.Body>
              {rows.map((item) => (
                <Table.Row key={item.accountId} id={item.accountId}>
                  <Table.Cell>{item.name || 'Nome indisponível'}</Table.Cell>
                  <Table.Cell>{item.classLabel || 'Turma indisponível'}</Table.Cell>
                  <Table.Cell>{firstAccessLabelV1(item)}</Table.Cell>
                  <Table.Cell>
                    <SettingsCheckboxV1
                      label={'Selecionar ' + (item.name || 'conta')}
                      selected={selected.has(item.accountId)}
                      disabled={!enabled || !accountCredentialPreparableV1(item)}
                      onChange={(value) =>
                        onChange((before) => {
                          const next = new Set(before);
                          if (value) next.add(item.accountId);
                          else next.delete(item.accountId);
                          return next;
                        })
                      }
                    />
                    {!accountCredentialPreparableV1(item) && (
                      <span>Corrija a pendência antes de preparar o cartão</span>
                    )}
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Content>
        </ScrollShadow>
      </Table>
    </>
  );
});
function QrOperationFeedbackV1({
  state,
  clock,
  retry,
  cancel,
  copy,
  download,
}: {
  state: QrOperationStateV1;
  clock: number;
  retry: () => void;
  cancel: () => void;
  copy: () => void;
  download: () => void;
}) {
  if (state.state === 'idle') return null;
  return (
    <div className="pa-credentials-feedback" aria-live="polite">
      {state.state === 'requesting' && (
        <p role="status">Solicitando QR de {state.count} conta(s)…</p>
      )}
      {state.state === 'rendering' && (
        <>
          <p>
            Gerando arquivo: {state.completed} de {state.total} cartão(ões).
          </p>
          <progress aria-label="Cartões renderizados" value={state.completed} max={state.total} />
        </>
      )}
      {(state.state === 'requesting' || state.state === 'rendering') && (
        <Button variant="secondary" onPress={cancel}>
          Cancelar geração
        </Button>
      )}
      {state.state === 'ready' && (
        <>
          <p role="status">
            Arquivo pronto · {state.count} cartão(ões)
            {state.format === 'pdf' ? ` · ${state.pages} página(s)` : ''}. Disponível por cinco
            minutos nesta tela.
          </p>
          <div className="pa-credentials-actions">
            <Button onPress={download}>
              {state.format === 'pdf' ? 'Baixar PDF' : 'Baixar imagem QR'}
            </Button>
            {state.format === 'png' && (
              <Button variant="secondary" isDisabled={state.copy === 'pending'} onPress={copy}>
                Copiar somente imagem QR
              </Button>
            )}
            <Button variant="tertiary" onPress={cancel}>
              Descartar arquivo
            </Button>
          </div>
          {state.copy === 'copied' && <p>Imagem QR copiada.</p>}
          {state.copy === 'download-required' && (
            <p role="alert">
              A cópia de imagem não está disponível. Use Baixar imagem QR para salvar o mesmo QR
              localmente.
            </p>
          )}
          {state.downloadFailed && (
            <p role="alert">
              Não foi possível iniciar o download. O arquivo continua disponível para tentar
              novamente.
            </p>
          )}
        </>
      )}
      {state.state === 'error' && (
        <>
          <p role="alert">
            {state.stage === 'render'
              ? 'O servidor confirmou os QR, mas o arquivo não ficou pronto. Tentar novamente gera apenas o arquivo.'
              : state.error.state === 'unauthenticated'
                ? 'Sessão administrativa expirada. Entre novamente.'
                : state.error.state === 'forbidden'
                  ? 'Sem autorização para preparar estas credenciais.'
                  : state.error.state === 'conflict'
                    ? 'O estado mudou ou o QR requer uma ação na ficha. Consulte novamente e revise a seleção.'
                    : state.retryable
                      ? 'A resposta não foi confirmada. Tentar novamente preserva a mesma solicitação.'
                      : 'Solicitação recusada. Consulte novamente e revise a seleção.'}
          </p>
          {state.retryable && (
            <Button variant="secondary" isDisabled={clock < state.retryAt} onPress={retry}>
              Tentar novamente
            </Button>
          )}
        </>
      )}
      {state.state === 'cancelled' && (
        <p>
          Geração ou arquivo descartado. Isso não desfaz uma emissão já aceita. Consulte novamente
          para reimprimir.
        </p>
      )}
      {state.state === 'expired' && (
        <p>Disponibilidade local encerrada. Consulte novamente e prepare outro arquivo.</p>
      )}
    </div>
  );
}
