import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button, Card, Checkbox, Tooltip, Input, Label, Table, TextField } from '@heroui/react';
import type { ScopeV1 } from '../../../../shared/student-portal-contracts/core-v1';
import type { AdminReadQueryV2 } from '../../../../shared/student-portal-contracts/admin-read-v2';
import type { PortalAdminClientV1 } from '../shared/admin-client-v1';
import { PortalClientErrorV1 } from '../../student-portal/shared/transport-v1';
import { settingsScopeKeyV1 } from '../settings/settings-values-v1';
import type { PortalAdminReadClientV2, PortalClassCatalogV2 } from './accounts-client-v2';
import { AccountDetailV1, type AccountDetailPropsV1 } from './account-detail-v1';
import { StudentBulkV1 } from './student-bulk-v1';
import { allowDraftNavigationV1 } from '../../../shared/forms/draft-navigation-v1';
import { ClassFilterV1 } from './class-filter-v1';
import { useContinuousReadV1, ContinuousEndV1 } from '../shared/continuous-read-v1';
import { AccountIdentityV1, AccountStatusV1, AccountsErrorV1 } from './accounts-presentation-v1';
import { accountCredentialPreparableV1 } from './accounts-values-v1';
import { QrBatchToolsV1 } from '../credentials/qr-batch-tools-v1';
import { LiveReadNoticeV1 } from '../../../shared/live-data/live-read-notice-v1';
import {
  firstAccessLabelV1,
  accountPageMatchesV1,
  lastAuthenticationLabelV1,
} from './accounts-values-v1';
import {
  AccountFilterTagsV1,
  ACCOUNT_STATE_OPTIONS_V1,
  ACCOUNT_BLOCK_OPTIONS_V1,
  matchesAccountFiltersV1,
  type AccountStateFilterV1,
} from './account-filters-v1';
import './student-accounts-v1.css';
import '../credentials/student-credentials-v1.css';

export interface StudentAccountsPropsV1 extends Pick<
  AccountDetailPropsV1,
  'slots' | 'onQr' | 'onReprint' | 'describeScope'
> {
  reader: PortalAdminReadClientV2;
  client: PortalAdminClientV1;
  catalog: PortalClassCatalogV2;
  scope: ScopeV1;
  canWrite: boolean;
  identityKey: string;
  scopeLabel?: string;
}
export function StudentAccountsV1(props: StudentAccountsPropsV1) {
  return (
    <AccountsBodyV1
      key={props.identityKey + ':' + settingsScopeKeyV1(props.scope) + ':' + props.canWrite}
      {...props}
    />
  );
}
function AccountsBodyV1(props: StudentAccountsPropsV1) {
  const [name, setName] = useState('');
  const [states, setStates] = useState<Set<string>>(() => new Set());
  const [blocks, setBlocks] = useState<Set<string>>(() => new Set());
  const [selectedClass, setSelectedClass] = useState<{ id: number; label: string } | null>(null);
  const [qrMount, setQrMount] = useState<HTMLDivElement | null>(null);
  const [bulkMount, setBulkMount] = useState<HTMLDivElement | null>(null);
  const scope = useMemo<ScopeV1>(
    () =>
      props.scope.kind === 'school' && selectedClass
        ? { kind: 'class', academicYear: 2026, classId: selectedClass.id }
        : props.scope,
    [props.scope, selectedClass],
  );
  const query = useMemo<AdminReadQueryV2>(
    () => ({
      contractVersion: 2,
      operation: 'accounts-read',
      scope,
      page: { limit: 100 },
      ...(name.trim() ? { nameSearch: name.trim() } : {}),
      ...(states.size === 1 ? { accountState: [...states][0] as AccountStateFilterV1 } : {}),
      ...(blocks.size === 1 ? { blocked: blocks.has('blocked') } : {}),
    }),
    [scope, name, states, blocks],
  );
  return (
    <section className="pa-accounts" aria-label="Contas do Portal de 2026">
      <header>
        <h2>Alunos</h2>
      </header>
      <Card className={`pa-account-controls-card${scope.kind === 'class' ? ' pa-account-controls-card--class' : ''}`}>
        <Card.Content className="pa-account-controls">
          <div className="pa-account-filters">
          {props.scope.kind === 'school' && (
            <ClassFilterV1
              catalog={props.catalog}
              selected={selectedClass}
              onChange={(value) => {
                if (allowDraftNavigationV1()) setSelectedClass(value);
              }}
            />
          )}
          <TextField
            className="pa-account-search min-w-48 max-w-72"
            value={name}
            onChange={(value) => {
              if (allowDraftNavigationV1()) setName(value);
            }}
          >
            <Label>Buscar aluno</Label>
            <Input maxLength={200} />
          </TextField>
          <AccountFilterTagsV1
            label="Situação"
            selected={states}
            onChange={(value) => {
              if (allowDraftNavigationV1()) setStates(value);
            }}
            options={ACCOUNT_STATE_OPTIONS_V1}
          />
          <AccountFilterTagsV1
            label="Bloqueio"
            selected={blocks}
            onChange={(value) => {
              if (allowDraftNavigationV1()) setBlocks(value);
            }}
            options={ACCOUNT_BLOCK_OPTIONS_V1}
          />
          </div>
          <div ref={setQrMount} className="pa-account-qr-mount" />
          {scope.kind === 'class' && <div ref={setBulkMount} className="pa-account-bulk-mount" />}
        </Card.Content>
      </Card>
      <AccountsResultsV1
        key={JSON.stringify([
          query,
          [...states].sort((left, right) => left.localeCompare(right)),
          [...blocks].sort((left, right) => left.localeCompare(right)),
        ])}
        {...props}
        query={query}
        states={states}
        blocks={blocks}
        qrMount={qrMount}
        bulkMount={bulkMount}
        bulkScopeLabel={
          selectedClass?.label ?? props.scopeLabel ?? (scope.kind === 'school' ? 'Escola' : 'Turma')
        }
      />
    </section>
  );
}
function AccountsResultsV1(
  props: StudentAccountsPropsV1 & {
    query: AdminReadQueryV2;
    states: Set<string>;
    blocks: Set<string>;
    qrMount: HTMLDivElement | null;
    bulkMount: HTMLDivElement | null;
    bulkScopeLabel: string;
  },
) {
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedQr, setSelectedQr] = useState<Set<string>>(() => new Set());
  const selectedTrigger = useRef<HTMLElement | null>(null);
  const listControl = useRef<HTMLDivElement>(null);
  const [authorizationError, setAuthorizationError] = useState<PortalClientErrorV1 | null>(null);
  const load = useCallback(
    async (cursor: string | undefined, signal: AbortSignal) => {
      const result = await props.reader.query(
        { ...props.query, page: { limit: 100, ...(cursor ? { cursor } : {}) } },
        signal,
      );
      if (result.state !== 'accounts-read') throw new PortalClientErrorV1('invalid-response');
      return accountPageMatchesV1(result, props.query.scope);
    },
    [props.reader, props.query, refreshVersion],
  );
  const read = useContinuousReadV1(load, 'accountId');
  const current = !authorizationError && read.state.state === 'ready' ? read.state.data : null;
  const visibleItems =
    current?.items.filter((item) => matchesAccountFiltersV1(item, props.states, props.blocks)) ??
    [];
  const qrClass = props.query.scope.kind === 'class' ? props.query.scope : null;
  const eligibleQr = new Set(
    visibleItems.filter(accountCredentialPreparableV1).map((account) => account.accountId),
  );
  useEffect(() => setSelectedQr(new Set()), [current?.scopeVersion]);
  const protectedFailure =
    read.state.state === 'error' &&
    ['unauthenticated', 'forbidden'].includes(read.state.error.state);
  const onChanged = useCallback(() => setRefreshVersion((value) => value + 1), []);
  const onAuthorizationLost = useCallback((error: PortalClientErrorV1) => {
    setAuthorizationError(error);
    setSelectedId(null);
  }, []);
  const reload = () => {
    if (!read.canReload) return;
    setAuthorizationError(null);
    read.clear();
    read.reload();
  };
  return (
    <>
      {props.qrMount && createPortal(<section className="pa-account-qr-panel" aria-label="QR code">
        <h2>QR code</h2>
        {qrClass && current ? (
          <QrBatchToolsV1
            client={props.client}
            accounts={visibleItems}
            selected={selectedQr}
            onSelectAll={(select) => setSelectedQr(select ? eligibleQr : new Set())}
            classId={qrClass.classId}
            scopeVersion={current.scopeVersion}
            label={props.bulkScopeLabel}
            canWrite={props.canWrite && !authorizationError && !protectedFailure}
            pendingBirth={Boolean(read.refreshing || read.refreshError)}
            hasMore={Boolean(current.nextCursor)}
            onCommitted={onChanged}
            onAuthorizationLost={onAuthorizationLost}
          />
        ) : (
          <p className="text-sm text-muted">
            {qrClass ? 'Carregando opções de QR…' : 'Selecione uma turma para gerar PDF.'}
          </p>
        )}
      </section>, props.qrMount)}
      {props.bulkMount && !authorizationError &&
        !protectedFailure &&
        props.query.scope.kind === 'class' && (
          createPortal(<StudentBulkV1
            client={props.client}
            scope={props.query.scope}
            scopeLabel={props.bulkScopeLabel}
            canWrite={props.canWrite}
            onAuthorizationLost={onAuthorizationLost}
          />, props.bulkMount)
        )}
      <Card className="pa-account-list-card">
        <Card.Content>
          <div className="pa-account-page-controls" tabIndex={-1} ref={listControl}>
            <p role="status">
              {current
                ? `${visibleItems.length} alunos${current.nextCursor ? ' · lista em carregamento' : ''}`
                : 'Alunos'}
            </p>
            <LiveReadNoticeV1 failed={Boolean(read.refreshError)} />
          </div>

          {(read.state.state === 'idle' || read.state.state === 'loading') && (
            <p role="status">Consultando contas…</p>
          )}
          {(authorizationError || read.state.state === 'error') && (
            <AccountsErrorV1
              error={
                authorizationError ??
                (read.state.state === 'error'
                  ? read.state.error
                  : new PortalClientErrorV1('forbidden'))
              }
              canReload={read.canReload}
              onReload={reload}
            />
          )}
          {current && visibleItems.length === 0 && !current.nextCursor && (
            <p role="status">Nenhuma conta encontrada neste filtro.</p>
          )}
          {current && visibleItems.length > 0 && (
            <Table className="pa-account-table">
              <Table.ScrollContainer
                className="pa-account-scroll"
                tabIndex={0}
                role="region"
                aria-label="Tabela de contas, role horizontalmente para todas as colunas"
              >
                <Table.Content
                  aria-label="Contas do Portal"
                  selectionMode={qrClass ? 'multiple' : 'none'}
                  selectedKeys={selectedQr}
                  disabledBehavior="selection"
                  disabledKeys={visibleItems
                    .filter((account) => !props.canWrite || !eligibleQr.has(account.accountId))
                    .map((account) => account.accountId)}
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
                    {qrClass ? (
                      <Table.Column id="selection" aria-label="Selecionar alunos para QR">
                        <Checkbox slot="selection" aria-label="Selecionar alunos disponíveis">
                          <Checkbox.Content>
                            <Checkbox.Control>
                              <Checkbox.Indicator />
                            </Checkbox.Control>
                          </Checkbox.Content>
                        </Checkbox>
                      </Table.Column>
                    ) : null}
                    <Table.Column isRowHeader>Aluno e turma</Table.Column>
                    <Table.Column>Situação</Table.Column>
                    <Table.Column>Acesso</Table.Column>
                    <Table.Column>
                      <Tooltip>
                        <Tooltip.Trigger>Último acesso</Tooltip.Trigger>
                        <Tooltip.Content>
                          Último acesso bem-sucedido nos registros dos últimos 12 meses. Horário de
                          Brasília.
                        </Tooltip.Content>
                      </Tooltip>
                    </Table.Column>
                    <Table.Column>Sessões ativas</Table.Column>
                  </Table.Header>
                  <Table.Body items={visibleItems}>
                    {(account) => (
                      <Table.Row
                        id={account.accountId}
                        key={account.accountId}
                        className={
                          selectedId === account.accountId ? 'pa-account-selected' : undefined
                        }
                      >
                        {qrClass ? (
                          <Table.Cell>
                            <Checkbox slot="selection" aria-label="Selecionar para QR">
                              <Checkbox.Content>
                                <Checkbox.Control>
                                  <Checkbox.Indicator />
                                </Checkbox.Control>
                              </Checkbox.Content>
                            </Checkbox>
                          </Table.Cell>
                        ) : null}
                        <Table.Cell>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="pa-student-name"
                            aria-label={'Abrir ficha de ' + (account.name || 'conta sem nome')}
                            onPress={(event) => {
                              selectedTrigger.current = event.target as HTMLElement;
                              setSelectedId(account.accountId);
                            }}
                          >
                            <AccountIdentityV1 account={account} />
                          </Button>
                        </Table.Cell>
                        <Table.Cell>
                          <AccountStatusV1 account={account} />
                          {account.state !== 'active' && (
                            <span className="text-xs text-muted">
                              {firstAccessLabelV1(account)}
                            </span>
                          )}
                        </Table.Cell>
                        <Table.Cell>
                          {account.access.state !== 'resolved'
                            ? 'Indisponível'
                            : account.access.accessPermitted
                              ? 'Permitido'
                              : 'Fechado'}
                        </Table.Cell>
                        <Table.Cell>
                          {lastAuthenticationLabelV1(account.lastAuthenticationAt)}
                        </Table.Cell>
                        <Table.Cell>{account.validSessionCount}</Table.Cell>
                      </Table.Row>
                    )}
                  </Table.Body>
                </Table.Content>
                <ContinuousEndV1
                  more={read.more}
                  busy={read.refreshing}
                  failed={Boolean(read.refreshError)}
                  loadMore={read.loadMore}
                  retry={read.reload}
                />
              </Table.ScrollContainer>
            </Table>
          )}
          {current && !visibleItems.length ? (
            <ContinuousEndV1
              more={read.more}
              busy={read.refreshing}
              failed={Boolean(read.refreshError)}
              loadMore={read.loadMore}
              retry={read.reload}
            />
          ) : null}
        </Card.Content>
      </Card>
      {selectedId && !protectedFailure && !authorizationError && (
        <AccountDetailV1
          accountId={selectedId}
          parentScope={props.query.scope}
          reader={props.reader}
          client={props.client}
          canWrite={props.canWrite}
          onClose={() => {
            setSelectedId(null);
            (selectedTrigger.current?.isConnected
              ? selectedTrigger.current
              : listControl.current
            )?.focus();
          }}
          onChanged={onChanged}
          onAuthorizationLost={onAuthorizationLost}
          slots={props.slots}
          onQr={props.onQr}
          onReprint={props.onReprint}
          describeScope={props.describeScope}
        />
      )}
    </>
  );
}
