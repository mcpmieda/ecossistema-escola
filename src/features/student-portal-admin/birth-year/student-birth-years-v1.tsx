import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Card, Input, Label, ScrollShadow, Table, TextField } from '@heroui/react';
import type { ScopeV1 } from '../../../../shared/student-portal-contracts/core-v1';
import type { PortalAdminClientV1 } from '../shared/admin-client-v1';
import type { PortalAdminReadClientV2, PortalClassCatalogV2 } from '../accounts/accounts-client-v2';
import { ClassFilterV1 } from '../accounts/class-filter-v1';
import { SettingsCheckboxV1 } from '../settings/settings-editors-v1';
import { settingsScopeKeyV1 } from '../settings/settings-values-v1';
import type { PortalClientErrorV1 } from '../../student-portal/shared/transport-v1';
import {
  createBirthEditorV1,
  emptyBirthEditorV1,
  type BirthEditorV1,
  type BirthEditorStateV1,
} from './birth-editor-v1';
import { birthDirtyV1, validBirthYearV1, type BirthDraftRowV1 } from './birth-values-v1';
import type { BirthCursorsV1, BirthScopeV1 } from './birth-read-v1';
import { BirthDiscardDialogV1, BirthReviewDialogV1 } from './birth-review-v1';
import './student-birth-years-v1.css';

export interface StudentBirthYearsPropsV1 {
  client: PortalAdminClientV1;
  reader: PortalAdminReadClientV2;
  scope: ScopeV1;
  identityKey: string;
  canWrite: boolean;
  catalog?: PortalClassCatalogV2;
  scopeLabel?: string;
  onAuthorizationLost?: (error: PortalClientErrorV1) => void;
  onChanged?: () => void;
}
export function StudentBirthYearsV1(props: StudentBirthYearsPropsV1) {
  return (
    <BirthAreaV1
      key={props.identityKey + ':' + settingsScopeKeyV1(props.scope) + ':' + props.canWrite}
      {...props}
    />
  );
}
function BirthAreaV1(props: StudentBirthYearsPropsV1) {
  const [selected, setSelected] = useState<{ id: number; label: string } | null>(null);
  const scope = useMemo<BirthScopeV1 | null>(
    () =>
      props.scope.kind !== 'school'
        ? props.scope
        : selected
          ? { kind: 'class', academicYear: 2026, classId: selected.id }
          : null,
    [props.scope, selected],
  );
  const label =
    props.scope.kind === 'school'
      ? selected?.label || 'Turma'
      : props.scopeLabel ||
        (props.scope.kind === 'class' ? 'Turma selecionada' : 'Conta selecionada');
  return (
    <section className="pa-birth" aria-label="Dados de acesso de 2026">
      <header>
        <h2>Dados de acesso</h2>
        <p>Ano de nascimento · 2026</p>
      </header>
      {props.scope.kind === 'school' &&
        (props.catalog ? (
          <ClassFilterV1 catalog={props.catalog} selected={selected} onChange={setSelected} />
        ) : (
          <p role="alert">Catálogo de turmas indisponível.</p>
        ))}
      {scope ? (
        <BirthPagesV1 key={settingsScopeKeyV1(scope)} {...props} scope={scope} scopeLabel={label} />
      ) : (
        <p>Selecione uma turma para consultar os dados de acesso.</p>
      )}
    </section>
  );
}
type PageProps = StudentBirthYearsPropsV1 & { scope: BirthScopeV1; scopeLabel: string };
function BirthPagesV1(props: PageProps) {
  const [history, setHistory] = useState<(BirthCursorsV1 | undefined)[]>([undefined]),
    [page, setPage] = useState(0);
  const cursor = history[page];
  return (
    <BirthPageBodyV1
      key={String(page) + ':' + (cursor?.accounts ?? '') + ':' + (cursor?.birth ?? '')}
      {...props}
      cursor={cursor}
      page={page}
      onPrevious={() => setPage((value) => Math.max(0, value - 1))}
      onNext={(next) => {
        setHistory((value) => [...value.slice(0, page + 1), next]);
        setPage((value) => value + 1);
      }}
    />
  );
}
function BirthPageBodyV1(
  props: PageProps & {
    cursor?: BirthCursorsV1;
    page: number;
    onPrevious: () => void;
    onNext: (cursor: BirthCursorsV1) => void;
  },
) {
  const [state, setState] = useState<BirthEditorStateV1>(emptyBirthEditorV1);
  const [clock, setClock] = useState(Date.now);
  const [navigation, setNavigation] = useState<'reload' | 'previous' | 'next' | null>(null);
  const reviewTrigger = useRef<HTMLElement | null>(null);
  const restoreReviewFocus = useRef(false);
  const { client, reader, scope, cursor, canWrite, onAuthorizationLost, onChanged } = props;
  const editor = useMemo(
    () =>
      createBirthEditorV1({
        client,
        reader,
        scope,
        cursor,
        canWrite,
        publish: setState,
        onAuthorizationLost,
        onChanged,
      }),
    [client, reader, scope, cursor, canWrite, onAuthorizationLost, onChanged],
  );
  useEffect(() => {
    void editor.load();
    return () => editor.clear();
  }, [editor]);
  useEffect(() => {
    if (state.review || !restoreReviewFocus.current) return;
    restoreReviewFocus.current = false;
    const target = reviewTrigger.current;
    const frame = requestAnimationFrame(() => {
      if (target?.isConnected && !target.matches(':disabled')) target.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [state.review]);
  function openReview(
    kind: 'provenance' | 'clear' | 'batch-set' | 'batch-clear',
    target: Element,
    id?: string,
  ) {
    reviewTrigger.current = target instanceof HTMLElement ? target : null;
    editor.review(kind, id);
  }
  const retryAt = Math.max(state.retryAt, state.singleFailure?.retryAt ?? 0, state.batch.retryAt);
  useEffect(() => {
    setClock(Date.now());
    if (!retryAt) return;
    const timer = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [retryAt]);
  const active =
    state.singleBusy || state.batch.state === 'running' || state.batch.state === 'waiting';
  const batchById = new Map(state.batch.outcomes.map((item) => [item.accountId, item]));
  const hasWork =
    state.rows.some(
      (row) =>
        birthDirtyV1(row) && batchById.get(row.record.account.accountId)?.state !== 'committed',
    ) ||
    state.singleFailure !== null ||
    !['idle', 'complete'].includes(state.batch.state);
  function navigate(target: 'reload' | 'previous' | 'next', confirmed = false) {
    if (active || state.review || clock < retryAt) return;
    if (hasWork && !confirmed) {
      editor.suspendDrafts();
      setNavigation(target);
      return;
    }
    setNavigation(null);
    if (target === 'reload') void editor.load();
    else if (target === 'previous') props.onPrevious();
    else if (state.next) props.onNext(state.next);
  }
  // The modal makes the background inert. Keep its trigger enabled for focus restoration;
  // the controller independently rejects edits/commands while a review is open.
  const rowsEditable = canWrite && state.batch.state === 'idle' && !navigation;
  const selected = state.rows.filter((row) => row.selected);
  return (
    <Card aria-label="Anos de nascimento">
      <Card.Header>
        <h3>{props.scopeLabel}</h3>
        <Button
          variant="secondary"
          isDisabled={active || !!state.review || clock < retryAt || state.state === 'loading'}
          onPress={() => navigate('reload')}
        >
          Recarregar dados
        </Button>
      </Card.Header>
      <Card.Content>
        <p>
          Nome somente leitura. Digite quatro dígitos, de 1900 a 2026. Vazio durante a edição não
          apaga o ano salvo.
        </p>
        <p>
          Uma correção começa como não confirmada. Use “Conferir procedência” após verificar a fonte
          legítima. Anos de teste não habilitam o PIN.
        </p>
        {!canWrite && (
          <p role="status">Somente consulta: esta identidade não pode alterar dados.</p>
        )}
        {state.state === 'idle' || state.state === 'loading' ? (
          <p role="status">Carregando dados de acesso…</p>
        ) : null}
        {state.state === 'error' && (
          <div role="alert">
            <p>{birthFailureText(state.error)}</p>
            <p>Os dados desta consulta não estão disponíveis.</p>
          </div>
        )}
        {state.state === 'ready' && (
          <>
            {props.scope.kind === 'class' && (
              <div className="pa-birth-toolbar">
                <Button
                  variant={state.mode === 'single' ? 'primary' : 'secondary'}
                  aria-pressed={state.mode === 'single'}
                  isDisabled={
                    !canWrite || active || hasWork || !!state.review || state.batch.state !== 'idle'
                  }
                  onPress={() => editor.setMode('single')}
                >
                  Edição com autosave
                </Button>
                <Button
                  variant={state.mode === 'batch' ? 'primary' : 'secondary'}
                  aria-pressed={state.mode === 'batch'}
                  isDisabled={
                    !canWrite || active || hasWork || !!state.review || state.batch.state !== 'idle'
                  }
                  onPress={() => editor.setMode('batch')}
                >
                  Preparar lote
                </Button>
              </div>
            )}
            <p>
              {state.mode === 'single'
                ? 'Salvamento após uma pausa de digitação ou Enter. As gravações são feitas uma de cada vez.'
                : 'Modo lote: edite os valores próprios e selecione até 100 contas desta página. Nada é salvo até confirmar o lote.'}
            </p>
            {state.singleFailure && (
              <div role="alert" className="pa-birth-notice">
                <p>
                  {state.singleFailure.committed
                    ? 'O servidor confirmou a gravação, mas a consulta atualizada precisa de revisão.'
                    : state.singleFailure.retryable
                      ? 'Falha ao salvar. O resultado desta tentativa pode ainda não estar confirmado.'
                      : 'O servidor recusou esta alteração. Consulte os dados atuais antes de revisar.'}
                </p>
                <p>{birthFailureText(state.singleFailure.error)}</p>
                {state.singleFailure.retryable ? (
                  <Button
                    variant="secondary"
                    isDisabled={state.singleBusy || clock < state.singleFailure.retryAt}
                    onPress={() => {
                      void editor.retry();
                    }}
                  >
                    {state.singleFailure.committed ? 'Repetir consulta' : 'Repetir mesma gravação'}
                  </Button>
                ) : (
                  <p>Recarregue os dados e revise antes de preparar outra alteração.</p>
                )}
              </div>
            )}
            {state.mode === 'batch' && (
              <div className="pa-birth-toolbar">
                <SettingsCheckboxV1
                  label="Selecionar esta página"
                  selected={!!state.rows.length && selected.length === state.rows.length}
                  disabled={!rowsEditable || active}
                  onChange={editor.selectAll}
                />
                <span role="status">
                  {selected.length} de {state.rows.length} selecionadas nesta página
                </span>
                <Button
                  isDisabled={
                    !rowsEditable ||
                    active ||
                    !selected.length ||
                    selected.some((row) => !validBirthYearV1(row.year))
                  }
                  onPress={(event) => openReview('batch-set', event.target)}
                >
                  Revisar lote de anos
                </Button>
                <Button
                  variant="danger"
                  isDisabled={!rowsEditable || active || !selected.length}
                  onPress={(event) => openReview('batch-clear', event.target)}
                >
                  Limpar anos selecionados
                </Button>
              </div>
            )}
            <BirthBatchProgressV1 state={state} editor={editor} clock={clock} />
            {!state.rows.length ? (
              <p>Nenhuma conta vinculada encontrada neste escopo.</p>
            ) : (
              <Table>
                <ScrollShadow
                  className="pa-birth-scroll"
                  orientation="horizontal"
                  role="region"
                  tabIndex={0}
                  aria-label="Tabela de dados de acesso, role para consultar todas as linhas e colunas"
                >
                  <Table.Content aria-label="Anos de nascimento por conta">
                    <Table.Header>
                      <Table.Column id="name" isRowHeader>
                        Conta
                      </Table.Column>
                      <Table.Column id="year">Ano e procedência</Table.Column>
                      <Table.Column id="status">Salvamento</Table.Column>
                      <Table.Column id="actions">Ações</Table.Column>
                    </Table.Header>
                    <Table.Body>
                      {state.rows.map((row) => {
                        const id = row.record.account.accountId,
                          name = row.record.account.name || 'Conta sem nome';
                        const outcome = batchById.get(id);
                        return (
                          <Table.Row key={id} id={id}>
                            <Table.Cell>
                              <strong>{name}</strong>
                              <small>{row.record.account.classLabel || 'Turma sem rótulo'}</small>
                              {state.mode === 'batch' && (
                                <SettingsCheckboxV1
                                  label={'Selecionar ' + name}
                                  selected={row.selected}
                                  disabled={!rowsEditable || active}
                                  onChange={(selected) => editor.select(id, selected)}
                                />
                              )}
                            </Table.Cell>
                            <Table.Cell>
                              <TextField
                                value={row.year}
                                isDisabled={!rowsEditable}
                                onChange={(year) => editor.edit(id, year)}
                                isInvalid={row.year !== '' && !validBirthYearV1(row.year)}
                              >
                                <Label className="pa-birth-input-label">
                                  Ano de nascimento de {name}
                                </Label>
                                <Input
                                  inputMode="numeric"
                                  autoComplete="off"
                                  spellCheck={false}
                                  maxLength={4}
                                  onKeyDown={(event) => {
                                    if (event.key === 'Enter') {
                                      event.preventDefault();
                                      void editor.flush(id);
                                    }
                                  }}
                                />
                              </TextField>
                              <small>
                                {row.year && row.confirmation === 'confirmed'
                                  ? 'Procedência conferida para este ano'
                                  : 'Não confirmado (teste)'}
                              </small>
                              <small>
                                Na última consulta:{' '}
                                {row.record.birth.confirmation === 'confirmed'
                                  ? 'confirmado'
                                  : row.record.birth.year === null
                                    ? 'sem ano'
                                    : 'não confirmado (teste)'}
                              </small>
                            </Table.Cell>
                            <Table.Cell>
                              <span role="status">
                                {outcome ? batchOutcomeText(outcome.state) : rowStatusText(row)}
                              </span>
                            </Table.Cell>
                            <Table.Cell>
                              <div className="pa-birth-row-actions">
                                <Button
                                  variant="secondary"
                                  isDisabled={
                                    !rowsEditable ||
                                    active ||
                                    !!state.singleFailure ||
                                    !validBirthYearV1(row.year) ||
                                    row.confirmation === 'confirmed'
                                  }
                                  onPress={(event) => openReview('provenance', event.target, id)}
                                  aria-label={'Conferir procedência de ' + name}
                                >
                                  Conferir procedência
                                </Button>
                                <Button
                                  variant="secondary"
                                  isDisabled={
                                    !rowsEditable ||
                                    active ||
                                    !birthDirtyV1(row) ||
                                    !!state.singleFailure
                                  }
                                  onPress={() => editor.restore(id)}
                                  aria-label={'Restaurar rascunho de ' + name}
                                >
                                  Restaurar salvo
                                </Button>
                                <Button
                                  variant="danger-soft"
                                  isDisabled={
                                    !rowsEditable ||
                                    active ||
                                    !!state.singleFailure ||
                                    row.record.birth.year === null
                                  }
                                  onPress={(event) => openReview('clear', event.target, id)}
                                  aria-label={'Limpar ano de ' + name}
                                >
                                  Limpar ano
                                </Button>
                              </div>
                            </Table.Cell>
                          </Table.Row>
                        );
                      })}
                    </Table.Body>
                  </Table.Content>
                </ScrollShadow>
              </Table>
            )}
            <div className="pa-birth-toolbar">
              <Button
                variant="secondary"
                isDisabled={active || !!state.review || props.page === 0}
                onPress={() => navigate('previous')}
              >
                Página anterior
              </Button>
              <span>Página {props.page + 1} · até 100 contas</span>
              <Button
                variant="secondary"
                isDisabled={active || !!state.review || !state.next}
                onPress={() => navigate('next')}
              >
                Próxima página
              </Button>
            </div>
          </>
        )}
        {state.review && (
          <BirthReviewDialogV1
            key={state.review.kind}
            review={state.review}
            rows={state.rows}
            scopeLabel={props.scopeLabel}
            onCancel={() => {
              restoreReviewFocus.current = true;
              editor.cancelReview();
            }}
            onConfirm={() => {
              void editor.confirmReview();
            }}
          />
        )}
        {navigation && (
          <BirthDiscardDialogV1
            onCancel={() => {
              setNavigation(null);
              editor.resumeDrafts();
            }}
            onConfirm={() => navigate(navigation, true)}
          />
        )}
      </Card.Content>
    </Card>
  );
}
function birthFailureText(error?: PortalClientErrorV1) {
  switch (error?.state) {
    case 'unauthenticated':
      return 'A sessão expirou. Entre novamente para consultar os dados.';
    case 'forbidden':
      return 'Esta identidade não tem autorização para a operação.';
    case 'conflict':
      return 'A conta, o vínculo ou o ano foi alterado em outra operação. Recarregue e revise.';
    case 'rate-limited':
      return 'Aguarde o prazo indicado pelo servidor antes de repetir.';
    default:
      return 'Não foi possível confirmar a operação agora. Tente novamente quando o serviço estiver disponível.';
  }
}
function rowStatusText(row: BirthDraftRowV1) {
  if (row.status === 'saving') return 'Salvando…';
  if (row.status === 'saved' && !birthDirtyV1(row)) return 'Salvo';
  if (row.status === 'conflict') return 'Conflito — recarregue e revise';
  if (row.status === 'refresh-error') return 'Gravado; consulta pendente';
  if (row.status === 'error') return 'Falha ao salvar';
  if (birthDirtyV1(row))
    return validBirthYearV1(row.year)
      ? 'Rascunho ainda não confirmado pelo servidor'
      : 'Edição incompleta — não salva';
  return 'Consultado';
}
function batchOutcomeText(state: string) {
  return state === 'committed'
    ? 'Salvo pelo lote'
    : state === 'conflict'
      ? 'Conflito — revisar'
      : state === 'forbidden'
        ? 'Não autorizado no lote'
        : 'Aguardando retomada';
}
function BirthBatchProgressV1({
  state,
  editor,
  clock,
}: {
  state: BirthEditorStateV1;
  editor: BirthEditorV1;
  clock: number;
}) {
  const batch = state.batch;
  if (batch.state === 'idle') return null;
  const committed = batch.outcomes.filter((x) => x.state === 'committed').length;
  const conflicts = batch.outcomes.filter((x) => x.state === 'conflict').length;
  const forbidden = batch.outcomes.filter((x) => x.state === 'forbidden').length;
  return (
    <div className="pa-birth-notice" aria-label="Andamento do lote">
      <p role="status">
        {committed} salvo(s) · {conflicts} conflito(s) · {forbidden} não autorizado(s).{' '}
        {batch.rounds} chamada(s).
      </p>
      <p>
        {batch.state === 'complete'
          ? 'Processamento encerrado. Consulte os resultados atuais antes de editar novamente.'
          : batch.reason === 'expired'
            ? 'A janela de retomada terminou. Recarregue e revise os valores antes de iniciar outra operação.'
            : batch.pauseRequested
              ? 'A chamada atual pode concluir. As próximas retomadas estão pausadas.'
              : batch.state === 'paused'
                ? 'Lote pausado. Os resultados confirmados são preservados; retomar usa a mesma operação.'
                : batch.state === 'error'
                  ? 'A operação precisa de nova consulta e revisão.'
                  : 'Processamento sequencial. Aguardando os próximos resultados do servidor.'}
      </p>
      {batch.error && <p>{birthFailureText(batch.error)}</p>}
      {(batch.state === 'running' || batch.state === 'waiting') && (
        <Button variant="secondary" isDisabled={batch.pauseRequested} onPress={editor.pauseBatch}>
          Pausar retomadas
        </Button>
      )}
      {batch.state === 'paused' && batch.retryable && (
        <Button
          isDisabled={clock < batch.retryAt}
          onPress={() => {
            void editor.resumeBatch();
          }}
        >
          Retomar mesmo lote
        </Button>
      )}
    </div>
  );
}
