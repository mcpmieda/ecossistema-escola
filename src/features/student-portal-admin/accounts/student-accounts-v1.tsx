import { useCallback, useMemo, useRef, useState } from 'react';
import {
  Button,
  Card,
  Input,
  Label,
  ListBox,
  ScrollShadow,
  Select,
  Table,
  TextField,
} from '@heroui/react';
import type { ScopeV1 } from '../../../../shared/student-portal-contracts/core-v1';
import type { AdminReadQueryV2 } from '../../../../shared/student-portal-contracts/admin-read-v2';
import type { PortalAdminClientV1 } from '../shared/admin-client-v1';
import { PortalClientErrorV1 } from '../../student-portal/shared/transport-v1';
import { settingsScopeKeyV1 } from '../settings/settings-values-v1';
import type { PortalAdminReadClientV2, PortalClassCatalogV2 } from './accounts-client-v2';
import { AccountDetailV1, type AccountDetailPropsV1 } from './account-detail-v1';
import { ClassFilterV1 } from './class-filter-v1';
import { useAccountsReadV1 } from './accounts-read-v1';
import { AccountIdentityV1, AccountStatusV1, AccountsErrorV1 } from './accounts-presentation-v1';
import {
  accountAccessOriginV1,
  firstAccessLabelV1,
  accountLinkLabelV1,
  accountPageMatchesV1,
  lastAuthenticationLabelV1,
} from './accounts-values-v1';
import './student-accounts-v1.css';

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
type StateFilterV1 = 'all' | 'pending-activation' | 'active' | 'reset-required';
type BlockFilterV1 = 'all' | 'blocked' | 'unblocked';
export function StudentAccountsV1(props: StudentAccountsPropsV1) {
  return (
    <AccountsBodyV1
      key={props.identityKey + ':' + settingsScopeKeyV1(props.scope) + ':' + props.canWrite}
      {...props}
    />
  );
}
function FilterV1({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Record<string, string>;
  onChange: (value: string) => void;
}) {
  return (
    <Select
      selectedKey={value}
      onSelectionChange={(key) => {
        if (key !== null && String(key) in options) onChange(String(key));
      }}
    >
      <Label>{label}</Label>
      <Select.Trigger>
        <Select.Value />
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover>
        <ListBox>
          {Object.entries(options).map(([id, text]) => (
            <ListBox.Item key={id} id={id} textValue={text}>
              {text}
              <ListBox.ItemIndicator />
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
    </Select>
  );
}
function AccountsBodyV1(props: StudentAccountsPropsV1) {
  const [name, setName] = useState('');
  const [state, setState] = useState<StateFilterV1>('all');
  const [blocked, setBlocked] = useState<BlockFilterV1>('all');
  const [selectedClass, setSelectedClass] = useState<{ id: number; label: string } | null>(null);
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
      ...(state === 'all' ? {} : { accountState: state }),
      ...(blocked === 'all' ? {} : { blocked: blocked === 'blocked' }),
    }),
    [scope, name, state, blocked],
  );
  return (
    <section className="pa-accounts" aria-label="Contas do Portal de 2026">
      <header>
        <h2>Contas do Portal do Aluno</h2>
        <p>{props.scopeLabel || 'Consulta de contas'} · 2026</p>
      </header>
      <Card>
        <Card.Content className="pa-account-filters">
          <TextField value={name} onChange={setName}>
            <Label>Buscar conta por nome</Label>
            <Input maxLength={200} />
          </TextField>
          <FilterV1
            label="Estado da conta"
            value={state}
            onChange={(value) => setState(value as StateFilterV1)}
            options={{
              all: 'Todos os estados',
              'pending-activation': 'Primeiro acesso',
              active: 'Ativa',
              'reset-required': 'Redefinição pendente',
            }}
          />
          <FilterV1
            label="Bloqueio administrativo"
            value={blocked}
            onChange={(value) => setBlocked(value as BlockFilterV1)}
            options={{
              all: 'Com ou sem bloqueio',
              blocked: 'Bloqueadas',
              unblocked: 'Sem bloqueio administrativo',
            }}
          />
          {props.scope.kind === 'school' && (
            <ClassFilterV1
              catalog={props.catalog}
              selected={selectedClass}
              onChange={setSelectedClass}
            />
          )}
        </Card.Content>
      </Card>
      <AccountsResultsV1 key={JSON.stringify(query)} {...props} query={query} />
    </section>
  );
}
function AccountsResultsV1(props: StudentAccountsPropsV1 & { query: AdminReadQueryV2 }) {
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined]);
  const [page, setPage] = useState(0);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedTrigger = useRef<HTMLElement | null>(null);
  const listControl = useRef<HTMLButtonElement>(null);
  const [authorizationError, setAuthorizationError] = useState<PortalClientErrorV1 | null>(null);
  const cursor = cursors[page];
  const load = useCallback(
    async (signal: AbortSignal) => {
      const result = await props.reader.query(
        { ...props.query, page: { limit: 100, ...(cursor ? { cursor } : {}) } },
        signal,
      );
      if (result.state !== 'accounts-read') throw new PortalClientErrorV1('invalid-response');
      return accountPageMatchesV1(result, props.query.scope);
    },
    [props.reader, props.query, cursor, refreshVersion],
  );
  const read = useAccountsReadV1(load);
  const current = !authorizationError && read.state.state === 'ready' ? read.state.data : null;
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
  const resetPages = () => {
    setCursors([undefined]);
    setPage(0);
    setRefreshVersion((value) => value + 1);
  };
  return (
    <>
      <Card>
        <Card.Content>
          <div className="pa-account-page-controls">
            <p role="status">
              Página {page + 1}
              {current ? ' · ' + current.items.length + ' contas nesta consulta' : ''}
            </p>
            <Button
              ref={listControl}
              variant="secondary"
              isDisabled={!read.canReload}
              onPress={reload}
            >
              Atualizar lista
            </Button>
            <Button
              variant="secondary"
              isDisabled={page === 0}
              onPress={() => setPage((value) => value - 1)}
            >
              Página anterior
            </Button>
            <Button
              variant="secondary"
              isDisabled={!current?.nextCursor}
              onPress={() => {
                if (!current?.nextCursor) return;
                setCursors((previous) => [...previous.slice(0, page + 1), current.nextCursor!]);
                setPage((value) => value + 1);
              }}
            >
              Próxima página
            </Button>
            {page > 0 && (
              <Button variant="secondary" onPress={resetPages}>
                Voltar à primeira página
              </Button>
            )}
          </div>
          <p>
            A lista mostra contas existentes. Turma sem conta não gera cadastro. Última autenticação
            considera somente sucessos retidos nos últimos 12 meses, em horário de São Paulo.
          </p>
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
          {current && current.items.length === 0 && (
            <p role="status">Nenhuma conta encontrada neste filtro.</p>
          )}
          {current && current.items.length > 0 && (
            <Table className="pa-account-table" variant="secondary">
              <ScrollShadow
                className="pa-account-scroll"
                orientation="horizontal"
                tabIndex={0}
                role="region"
                aria-label="Tabela de contas, role horizontalmente para todas as colunas"
              >
                <Table.Content aria-label="Contas do Portal">
                  <Table.Header>
                    <Table.Column isRowHeader>Aluno e turma</Table.Column>
                    <Table.Column>Estado e vínculo</Table.Column>
                    <Table.Column>Acesso</Table.Column>
                    <Table.Column>Última autenticação</Table.Column>
                    <Table.Column>Sessões válidas</Table.Column>
                    <Table.Column>Ficha</Table.Column>
                  </Table.Header>
                  <Table.Body items={current.items}>
                    {(account) => (
                      <Table.Row
                        id={account.accountId}
                        key={account.accountId}
                        className={
                          selectedId === account.accountId ? 'pa-account-selected' : undefined
                        }
                      >
                        <Table.Cell>
                          <AccountIdentityV1 account={account} />
                        </Table.Cell>
                        <Table.Cell>
                          <AccountStatusV1 account={account} />
                          <span>{accountLinkLabelV1(account)}</span>
                          <span>{firstAccessLabelV1(account)}</span>
                        </Table.Cell>
                        <Table.Cell>
                          <strong>
                            {account.access.state !== 'resolved'
                              ? 'Não resolvido'
                              : account.access.enabled
                                ? 'Habilitado'
                                : 'Desabilitado'}
                          </strong>
                          <span>
                            {accountAccessOriginV1(account.access.source, props.describeScope)}
                          </span>
                          <span>
                            {account.access.accessPermitted
                              ? 'Permitido pelas regras agora'
                              : 'Não permitido agora'}
                          </span>
                        </Table.Cell>
                        <Table.Cell>
                          {lastAuthenticationLabelV1(account.lastAuthenticationAt)}
                        </Table.Cell>
                        <Table.Cell>{account.validSessionCount}</Table.Cell>
                        <Table.Cell>
                          <Button
                            variant="secondary"
                            aria-label={'Abrir ficha de ' + (account.name || 'conta sem nome')}
                            onPress={(event) => {
                              selectedTrigger.current =
                                event.target instanceof HTMLElement ? event.target : null;
                              setSelectedId(account.accountId);
                            }}
                          >
                            Abrir ficha
                          </Button>
                        </Table.Cell>
                      </Table.Row>
                    )}
                  </Table.Body>
                </Table.Content>
              </ScrollShadow>
            </Table>
          )}
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
