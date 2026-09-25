import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Card, Chip, Checkbox, Skeleton, Table, Tooltip } from '@heroui/react';
import { Info } from 'lucide-react';
import type { ScopeV1 } from '../../../../shared/student-portal-contracts/core-v1';
import type { PortalAdminClientV1 } from '../shared/admin-client-v1';
import type { PortalAdminReadClientV2, PortalClassCatalogV2 } from '../accounts/accounts-client-v2';
import { ClassFilterV1 } from '../accounts/class-filter-v1';
import { settingsScopeKeyV1 } from '../settings/settings-values-v1';
import type { PortalClientErrorV1 } from '../../student-portal/shared/transport-v1';
import { createBirthEditorV1, emptyBirthEditorV1 } from './birth-editor-v1';
import { birthDirtyV1 } from './birth-values-v1';
import { ContinuousEndV1 } from '../shared/continuous-read-v1';
import type { BirthScopeV1 } from './birth-read-v1';
import { BirthDiscardDialogV1 } from './birth-review-v1';
import { LiveReadNoticeV1 } from '../../../shared/live-data/live-read-notice-v1';
import { useLiveRefreshV1 } from '../../../shared/live-data/use-live-refresh-v1';
import { useDraftNavigationGuardV1 } from '../../../shared/forms/draft-navigation-v1';
import { StudentAvatarV1 } from '../shared/student-avatar-v1';
import { BirthInputV1 } from './birth-input-v1';
import { StudentNameV1 } from '../shared/account-open-v1';
import { QrBatchToolsV1 } from '../credentials/qr-batch-tools-v1';
import type { QrRendererV1 } from '../credentials/qr-operation-v1';
import { accountCredentialPreparableV1, firstAccessLabelV1 } from '../accounts/accounts-values-v1';
import './student-birth-years-v1.css';

export interface StudentBirthYearsPropsV1 {
  qrMode?: boolean;
  renderArtifact?: QrRendererV1;
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
      key={`${props.identityKey}:${settingsScopeKeyV1(props.scope)}:${props.canWrite}`}
      {...props}
    />
  );
}
function BirthAreaV1(props: StudentBirthYearsPropsV1) {
  const [selected, setSelected] = useState<{ id: number; label: string } | null>(null);
  const [blocked, setBlocked] = useState(false);
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
    props.scope.kind === 'school' ? (selected?.label ?? 'Turma') : (props.scopeLabel ?? 'Aluno');
  return (
    <section className="pa-birth" aria-label="Anos de nascimento">
      <header className="pa-section-heading">
        <h2>{props.qrMode ? 'QR code' : 'Nascimento'}</h2>
        <Tooltip>
          <Tooltip.Trigger aria-label="Sobre o salvamento do ano">
            <Info size={16} />
          </Tooltip.Trigger>
          <Tooltip.Content>
            Digite quatro dígitos. Salva automaticamente. Enter confirma; Esc desfaz a edição.
          </Tooltip.Content>
        </Tooltip>
      </header>
      {props.scope.kind === 'school' &&
        (props.catalog ? (
          <ClassFilterV1
            catalog={props.catalog}
            selected={selected}
            onChange={setSelected}
            disabled={blocked}
            allLabel="Escolha a turma"
          />
        ) : (
          <p role="alert">Turmas indisponíveis.</p>
        ))}
      {scope ? (
        <BirthPagesV1
          key={settingsScopeKeyV1(scope)}
          {...props}
          scope={scope}
          scopeLabel={label}
          onBlock={setBlocked}
        />
      ) : (
        <p className="text-sm text-muted">Escolha uma turma.</p>
      )}
    </section>
  );
}
type PageProps = StudentBirthYearsPropsV1 & {
  scope: BirthScopeV1;
  scopeLabel: string;
  onBlock: (value: boolean) => void;
};
function BirthPagesV1(props: PageProps) {
  return <BirthPageBodyV1 {...props} />;
}
function BirthPageBodyV1(props: PageProps) {
  const [state, setState] = useState(emptyBirthEditorV1),
    [clock, setClock] = useState(Date.now),
    [discard, setDiscard] = useState(false);
  const { client, reader, scope, canWrite, onChanged, onAuthorizationLost, onBlock } = props;
  const [selectedQr, setSelectedQr] = useState<Set<string>>(() => new Set());
  const [pendingRefresh, setPendingRefresh] = useState(false);
  const requestRefresh = useCallback(() => setPendingRefresh(true), []);
  const saved = useCallback(() => {
    if (props.qrMode) requestRefresh();
    onChanged?.();
  }, [props.qrMode, requestRefresh, onChanged]);
  const editor = useMemo(
    () =>
      createBirthEditorV1({
        client,
        reader,
        scope,
        continuous: true,
        canWrite,
        confirmOnEdit: true,
        publish: setState,
        onChanged: saved,
        onAuthorizationLost,
      }),
    [client, reader, scope, canWrite, saved, onAuthorizationLost],
  );
  useEffect(() => {
    void editor.load();
    return () => editor.clear();
  }, [editor]);
  useLiveRefreshV1(editor.refresh, {
    domains: ['portal', 'gradebook'],
    canRefresh: editor.canRefresh,
  });
  const dirty = state.rows.some(birthDirtyV1),
    blocked = dirty || state.singleBusy || !!state.singleFailure;
  useEffect(() => {
    onBlock(blocked);
    return () => onBlock(false);
  }, [onBlock, blocked]);
  useDraftNavigationGuardV1(blocked);
  useEffect(() => {
    if (!pendingRefresh || blocked || !editor.canRefresh()) return;
    setPendingRefresh(false);
    void editor.refresh();
  }, [pendingRefresh, blocked, editor]);
  const eligibleQr = new Set(
    state.rows
      .filter((row) => accountCredentialPreparableV1(row.record.account))
      .map((row) => row.record.account.accountId),
  );
  const retryAt = Math.max(state.retryAt, state.singleFailure?.retryAt ?? 0);
  useEffect(() => {
    if (!retryAt) return;
    setClock(Date.now());
    const timer = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [retryAt]);
  const error = state.error ?? state.singleFailure?.error;
  const reload = () => {
    if (blocked) {
      editor.suspendDrafts();
      setDiscard(true);
    } else void editor.load();
  };
  return (
    <Card aria-label="Anos de nascimento" className="pa-birth-card">
      <Card.Header className="flex-row items-center justify-between gap-3">
        <Card.Title>{props.scopeLabel}</Card.Title>
        <div className="flex items-center gap-2">
          <LiveReadNoticeV1 failed={Boolean(state.refreshError)} />
          {state.state === 'ready' ? (
            <Chip size="sm" variant="soft">
              <Chip.Label>{state.rows.length} alunos</Chip.Label>
            </Chip>
          ) : null}
        </div>
      </Card.Header>
      <Card.Content>
        {!canWrite ? (
          <p role="status" className="text-xs text-muted">
            Somente leitura
          </p>
        ) : null}
        {error ? (
          <div role="alert" className="pa-birth-notice">
            <span>{birthFailureText(error)}</span>
            {state.singleFailure?.retryable ? (
              <Button
                size="sm"
                variant="secondary"
                isDisabled={state.singleBusy || clock < retryAt}
                onPress={() => {
                  void editor.retry();
                }}
              >
                Tentar novamente
              </Button>
            ) : (
              <Button
                size="sm"
                variant="secondary"
                isDisabled={state.singleBusy || clock < retryAt}
                onPress={reload}
              >
                Recarregar
              </Button>
            )}
          </div>
        ) : null}
        {state.state === 'idle' || state.state === 'loading' ? (
          <Skeleton className="h-48 rounded-lg" />
        ) : null}
        {state.state === 'ready' ? (
          !state.rows.length && !state.next ? (
            <p className="text-sm text-muted">Nenhum aluno nesta turma.</p>
          ) : (
            <>
              {props.qrMode && scope.kind === 'class' ? (
                <QrBatchToolsV1
                  client={client}
                  accounts={state.rows.map((row) => row.record.account)}
                  selected={selectedQr}
                  onSelectAll={(selected) => setSelectedQr(selected ? eligibleQr : new Set())}
                  classId={scope.classId}
                  scopeVersion={state.accountsScopeVersion ?? -1}
                  label={props.scopeLabel}
                  canWrite={canWrite}
                  pendingBirth={
                    state.accountsScopeVersion === undefined ||
                    blocked ||
                    pendingRefresh ||
                    Boolean(state.refreshing) ||
                    Boolean(state.refreshError)
                  }
                  hasMore={Boolean(state.next)}
                  onCommitted={requestRefresh}
                  onAuthorizationLost={onAuthorizationLost}
                  renderArtifact={props.renderArtifact}
                />
              ) : null}
              <Table variant="secondary">
                <Table.ScrollContainer
                  className="pa-birth-scroll"
                  role="region"
                  tabIndex={0}
                  aria-label="Anos de nascimento por aluno"
                >
                  <Table.Content
                    aria-label="Anos de nascimento por conta"
                    selectionMode={props.qrMode ? 'multiple' : 'none'}
                    selectedKeys={selectedQr}
                    disabledBehavior="selection"
                    disabledKeys={state.rows
                      .filter((row) => !canWrite || !eligibleQr.has(row.record.account.accountId))
                      .map((row) => row.record.account.accountId)}
                    onSelectionChange={(keys) =>
                      setSelectedQr(
                        new Set(
                          keys === 'all'
                            ? eligibleQr
                            : [...keys].map(String).filter((id) => eligibleQr.has(id)),
                        ),
                      )
                    }
                  >
                    <Table.Header>
                      {props.qrMode ? (
                        <Table.Column id="selection" aria-label="Selecionar alunos">
                          <Checkbox slot="selection" aria-label="Selecionar alunos disponíveis">
                            <Checkbox.Content>
                              <Checkbox.Control>
                                <Checkbox.Indicator />
                              </Checkbox.Control>
                            </Checkbox.Content>
                          </Checkbox>
                        </Table.Column>
                      ) : null}
                      <Table.Column id="name" isRowHeader>
                        Aluno
                      </Table.Column>
                      <Table.Column id="year">Ano de nascimento</Table.Column>
                      {props.qrMode ? <Table.Column id="class">Turma</Table.Column> : null}
                      {props.qrMode ? <Table.Column id="readiness">Acesso</Table.Column> : null}
                    </Table.Header>
                    <Table.Body>
                      {state.rows.map((row) => {
                        const id = row.record.account.accountId,
                          name = row.record.account.name || 'Aluno sem nome';
                        return (
                          <Table.Row key={id} id={id}>
                            {props.qrMode ? (
                              <Table.Cell>
                                <Checkbox slot="selection" aria-label="Selecionar">
                                  <Checkbox.Content>
                                    <Checkbox.Control>
                                      <Checkbox.Indicator />
                                    </Checkbox.Control>
                                  </Checkbox.Content>
                                </Checkbox>
                              </Table.Cell>
                            ) : null}
                            <Table.Cell>
                              <StudentNameV1 accountId={id} name={name} parentScope={scope}>
                                <div className="pa-account-identity">
                                  <StudentAvatarV1 id={id} />
                                  <strong>{name}</strong>
                                </div>
                              </StudentNameV1>
                            </Table.Cell>
                            <Table.Cell>
                              <BirthInputV1
                                row={row}
                                editor={editor}
                                disabled={!canWrite || discard}
                              />
                            </Table.Cell>
                            {props.qrMode ? (
                              <Table.Cell>{row.record.account.classLabel}</Table.Cell>
                            ) : null}
                            {props.qrMode ? (
                              <Table.Cell>
                                <Chip
                                  size="sm"
                                  variant="soft"
                                  color={eligibleQr.has(id) ? 'success' : 'warning'}
                                >
                                  <Chip.Label>{firstAccessLabelV1(row.record.account)}</Chip.Label>
                                </Chip>
                              </Table.Cell>
                            ) : null}
                          </Table.Row>
                        );
                      })}
                    </Table.Body>
                  </Table.Content>
                  <ContinuousEndV1
                    more={Boolean(state.next)}
                    busy={blocked || Boolean(state.refreshing)}
                    failed={Boolean(state.refreshError)}
                    loadMore={() => void editor.loadMore()}
                    retry={() => void editor.refresh()}
                  />
                </Table.ScrollContainer>
              </Table>
            </>
          )
        ) : null}
        {discard ? (
          <BirthDiscardDialogV1
            onCancel={() => {
              setDiscard(false);
              editor.resumeDrafts();
            }}
            onConfirm={() => {
              setDiscard(false);
              void editor.load();
            }}
          />
        ) : null}
      </Card.Content>
    </Card>
  );
}
function birthFailureText(error: PortalClientErrorV1) {
  switch (error.state) {
    case 'unauthenticated':
      return 'Sessão expirada. Entre novamente.';
    case 'forbidden':
      return 'Sem permissão para alterar.';
    case 'conflict':
      return 'Este cadastro mudou em outra sessão. Recarregue antes de editar.';
    case 'rate-limited':
      return 'Aguarde alguns instantes para tentar novamente.';
    default:
      return 'Não foi possível confirmar o salvamento.';
  }
}
