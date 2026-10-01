import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Button,
  Card,
  Checkbox,
  Tooltip,
  Input,
  Label,
  ListBox,
  Select,
  Table,
  TextField,
} from '@heroui/react';
import { Star } from 'lucide-react';
import {
  sealLabelV1,
  useSealCountsV1,
  useSealCountsCacheV1,
  type SealCountsV1,
  type SealCountsCacheV1,
} from './brilliant-seals-v1';
import type { ScopeV1 } from '../../../../shared/student-portal-contracts/core-v1';
import type { AdminReadQueryV2 } from '../../../../shared/student-portal-contracts/admin-read-v2';
import { ADMIN_ACCOUNTS_PAGE_SIZE_V2 } from '../../../../shared/student-portal-contracts/admin-read-v2';
import { useDebouncedSearchV1 } from '../shared/debounced-search-v1';
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
import { useLiveRefreshScopeV1 } from '../../../shared/live-data/live-refresh-scope-v1';
import { panelHashAccountIdV1, writePanelHashParamsV1 } from '../shared/panel-hash-v1';
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
/** Classificação da lista (owner request 29/09/2026). */
type AccountOrderV1 = 'name' | 'seals' | 'last-access';
const ACCOUNT_ORDERS_V1: readonly { id: AccountOrderV1; label: string }[] = [
  { id: 'name', label: 'Nome (A–Z)' },
  { id: 'seals', label: 'Selos brilhantes' },
  { id: 'last-access', label: 'Último acesso' },
];
function AccountsBodyV1(props: StudentAccountsPropsV1) {
  const sealCache = useSealCountsCacheV1(props.reader);
  const [name, setName] = useState('');
  const nameSearch = useDebouncedSearchV1(name.trim());
  const [order, setOrder] = useState<AccountOrderV1>('name');
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
      page: { limit: ADMIN_ACCOUNTS_PAGE_SIZE_V2 },
      ...(nameSearch ? { nameSearch } : {}),
      ...(states.size === 1 ? { accountState: [...states][0] as AccountStateFilterV1 } : {}),
      ...(blocks.size === 1 ? { blocked: blocks.has('blocked') } : {}),
    }),
    [scope, nameSearch, states, blocks],
  );
  return (
    <section className="pa-accounts" aria-label="Contas do Portal de 2026">
      <header>
        <h2>Alunos</h2>
      </header>
      <Card
        className={`pa-account-controls-card${scope.kind === 'class' ? ' pa-account-controls-card--class' : ''}`}
      >
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
            <Select
              className="pa-account-order min-w-48 max-w-64"
              selectedKey={order}
              onSelectionChange={(key) => {
                const next = ACCOUNT_ORDERS_V1.find((item) => item.id === key);
                if (next) setOrder(next.id);
              }}
            >
              <Label>Classificar por</Label>
              <Select.Trigger>
                <Select.Value />
                <Select.Indicator />
              </Select.Trigger>
              <Select.Popover>
                <ListBox>
                  {ACCOUNT_ORDERS_V1.map((item) => (
                    <ListBox.Item key={item.id} id={item.id} textValue={item.label}>
                      {item.label}
                      <ListBox.ItemIndicator />
                    </ListBox.Item>
                  ))}
                </ListBox>
              </Select.Popover>
            </Select>
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
        sealCache={sealCache}
        order={order}
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
function orderAccountsV1<
  T extends { accountId: string; name: string; lastAuthenticationAt: string | null },
>(items: readonly T[], order: AccountOrderV1, seals: SealCountsV1 | null): T[] {
  if (order === 'name') return [...items];
  const byName = (left: T, right: T) => left.name.localeCompare(right.name, 'pt-BR');
  if (order === 'last-access')
    return [...items].sort(
      (left, right) =>
        (right.lastAuthenticationAt ?? '').localeCompare(left.lastAuthenticationAt ?? '') ||
        byName(left, right),
    );
  if (!seals) return [...items];
  return [...items].sort(
    (left, right) =>
      (seals.get(right.accountId) ?? -1) - (seals.get(left.accountId) ?? -1) || byName(left, right),
  );
}
function SealCountV1({ count }: { count: number | null | undefined }) {
  if (count === undefined || count === null) return null;
  return (
    <span className="pa-seal-count" aria-label={sealLabelV1(count)}>
      <Star size={12} fill="currentColor" aria-hidden="true" />
      {count}
    </span>
  );
}
function AccountsResultsV1(
  props: StudentAccountsPropsV1 & {
    query: AdminReadQueryV2;
    sealCache: SealCountsCacheV1;
    order: AccountOrderV1;
    states: Set<string>;
    blocks: Set<string>;
    qrMount: HTMLDivElement | null;
    bulkMount: HTMLDivElement | null;
    bulkScopeLabel: string;
  },
) {
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [visibleLimit, setVisibleLimit] = useState(ADMIN_ACCOUNTS_PAGE_SIZE_V2);
  const [selectedId, setSelectedId] = useState<string | null>(() => panelHashAccountIdV1('aluno'));
  const rankingActive = useLiveRefreshScopeV1() && selectedId === null;
  useEffect(() => writePanelHashParamsV1({ aluno: selectedId }), [selectedId]);
  // Leaving the list (another area) forgets the record, so a reload does not reopen it elsewhere.
  useEffect(() => () => writePanelHashParamsV1({ aluno: null }), []);
  const [selectedQr, setSelectedQr] = useState<Set<string>>(() => new Set());
  const selectedTrigger = useRef<HTMLElement | null>(null);
  const listControl = useRef<HTMLDivElement>(null);
  const [authorizationError, setAuthorizationError] = useState<PortalClientErrorV1 | null>(null);
  const load = useCallback(
    async (cursor: string | undefined, signal: AbortSignal) => {
      const result = await props.reader.query(
        {
          ...props.query,
          page: { limit: ADMIN_ACCOUNTS_PAGE_SIZE_V2, ...(cursor ? { cursor } : {}) },
        },
        signal,
      );
      if (result.state !== 'accounts-read') throw new PortalClientErrorV1('invalid-response');
      return accountPageMatchesV1(result, props.query.scope);
    },
    [props.reader, props.query, refreshVersion],
  );
  const read = useContinuousReadV1(
    load,
    'accountId',
    undefined,
    rankingActive,
    false,
    ADMIN_ACCOUNTS_PAGE_SIZE_V2,
  );
  const current = !authorizationError && read.state.state === 'ready' ? read.state.data : null;
  const filteredItems = useMemo(
    () =>
      current?.items.filter((item) => matchesAccountFiltersV1(item, props.states, props.blocks)) ??
      [],
    [current?.items, props.states, props.blocks],
  );
  // Global rankings need the complete collection; alphabetical browsing reads only visited pages.
  const { more, refreshing, loadMore } = read;
  useEffect(() => {
    if (props.order !== 'name' && !authorizationError && more && !refreshing && !read.refreshError)
      loadMore();
  }, [props.order, authorizationError, more, refreshing, read.refreshError, loadMore]);
  const sealAccountIds = useMemo(
    () => (current?.items ?? []).map((item) => item.accountId),
    [current?.items],
  );
  const seals = useSealCountsV1(
    props.reader,
    props.order === 'seals' && current && sealAccountIds.length ? { accountIds: sealAccountIds } : null,
    { active: rankingActive, revision: current?.scopeVersion, cache: props.sealCache },
  );
  const sealCounts = seals.state === 'ready' ? seals.counts : null;
  // The seal count travels inside each row: React Aria re-renders a row only when its item changes.
  const orderedItems = useMemo(
    () =>
      orderAccountsV1(filteredItems, props.order, sealCounts).map((account) => ({
        ...account,
        seals: props.order === 'seals' ? sealCounts?.get(account.accountId) : undefined,
      })),
    [filteredItems, props.order, sealCounts],
  );
  const visibleItems = useMemo(
    () => orderedItems.slice(0, visibleLimit),
    [orderedItems, visibleLimit],
  );
  const moreRows = rankingActive && (orderedItems.length > visibleLimit || read.more);
  const loadRows = () => {
    if (orderedItems.length > visibleLimit)
      setVisibleLimit((limit) => limit + ADMIN_ACCOUNTS_PAGE_SIZE_V2);
    else if (read.more && read.canReload) {
      setVisibleLimit((limit) => limit + ADMIN_ACCOUNTS_PAGE_SIZE_V2);
      read.loadMore();
    }
  };
  const loadingRows = orderedItems.length <= visibleLimit && read.refreshing;
  const qrClass = props.query.scope.kind === 'class' ? props.query.scope : null;
  const eligibleQr = new Set(
    orderedItems.filter(accountCredentialPreparableV1).map((account) => account.accountId),
  );
  useEffect(() => setSelectedQr(new Set()), [current?.scopeVersion]);
  const protectedFailure =
    read.state.state === 'error' &&
    ['unauthenticated', 'forbidden'].includes(read.state.error.state);
  useEffect(() => {
    if (protectedFailure) props.sealCache.clear();
  }, [protectedFailure, props.sealCache]);
  const onChanged = useCallback(() => {
    props.sealCache.clear();
    setRefreshVersion((value) => value + 1);
  }, [props.sealCache]);
  const onAuthorizationLost = useCallback(
    (error: PortalClientErrorV1) => {
      props.sealCache.clear();
      setAuthorizationError(error);
      setSelectedId(null);
    },
    [props.sealCache],
  );
  const sealError =
    seals.state === 'error'
      ? seals.error
      : seals.state === 'ready'
        ? seals.refreshError
        : undefined;
  useEffect(() => {
    if (sealError && ['unauthenticated', 'forbidden'].includes(sealError.state))
      onAuthorizationLost(sealError);
  }, [sealError, onAuthorizationLost]);
  const reload = () => {
    if (!read.canReload) return;
    props.sealCache.clear();
    setAuthorizationError(null);
    read.clear();
    read.reload();
  };
  return (
    <>
      {props.qrMount &&
        createPortal(
          <section className="pa-account-qr-panel" aria-label="QR code">
            <h2>QR code</h2>
            {qrClass && current ? (
              <QrBatchToolsV1
                client={props.client}
                accounts={orderedItems}
                selected={selectedQr}
                onSelectAll={(select) => setSelectedQr(select ? eligibleQr : new Set())}
                academicYear={qrClass.academicYear}
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
          </section>,
          props.qrMount,
        )}
      {props.bulkMount &&
        !authorizationError &&
        !protectedFailure &&
        props.query.scope.kind === 'class' &&
        createPortal(
          <StudentBulkV1
            client={props.client}
            scope={props.query.scope}
            scopeLabel={props.bulkScopeLabel}
            canWrite={props.canWrite}
            selected={selectedQr}
            onAuthorizationLost={onAuthorizationLost}
          />,
          props.bulkMount,
        )}
      <Card className="pa-account-list-card">
        <Card.Content>
          <div className="pa-account-page-controls" tabIndex={-1} ref={listControl}>
            <p role="status">
              {current
                ? `${orderedItems.length} ${orderedItems.length === 1 ? 'aluno' : 'alunos'}${current.nextCursor ? ' · lista em carregamento' : ''}${props.order === 'seals' && seals.state === 'loading' ? ' · contando selos' : ''}`
                : 'Alunos'}
            </p>
            <LiveReadNoticeV1
              failed={Boolean(read.refreshError || (props.order === 'seals' && sealError))}
            />
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
                          <SealCountV1 count={account.seals} />
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
                  more={moreRows}
                  busy={loadingRows}
                  failed={Boolean(read.refreshError)}
                  loadMore={loadRows}
                  retry={read.reload}
                />
              </Table.ScrollContainer>
            </Table>
          )}
          {current && !visibleItems.length ? (
            <ContinuousEndV1
              more={moreRows}
              busy={loadingRows}
              failed={Boolean(read.refreshError)}
              loadMore={loadRows}
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
