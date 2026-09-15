import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Button,
  Card,
  Input,
  Label,
  ListBox,
  Modal,
  ScrollShadow,
  Select,
  Table,
  TextField,
} from '@heroui/react';
import {
  auditKindV1,
  type AdminQueryV1,
  type AdminResponseV1,
} from '../../../../shared/student-portal-contracts/admin-v1';
import {
  calendarInstantV1,
  settingsScopeKeyV1,
  settingsScopeLabelV1,
} from '../settings/settings-values-v1';
import { AccountsErrorV1 } from '../accounts/accounts-presentation-v1';
import { OperationsScopeV1 } from '../overview/operations-scope-v1';
import {
  operationDateV1,
  authorizationLostV1,
  useOperationalReadV1,
  type OperationsPropsV1,
} from '../overview/operations-values-v1';
import { PortalClientErrorV1 } from '../../student-portal/shared/transport-v1';
import { createAuditDetailV1, type AuditDetailStateV1 } from './audit-detail-v1';
import { LiveReadNoticeV1 } from '../../../shared/live-data/live-read-notice-v1';
const eventLabels: Record<NonNullable<AdminQueryV1['event']>, string> = {
  login: 'Entrada',
  'login-failed': 'Tentativa de entrada',
  activated: 'Ativação',
  'password-reset': 'Senha redefinida',
  'account-reset': 'Conta redefinida',
  'qr-issued': 'QR emitido',
  'qr-reprinted': 'QR reimpresso',
  'qr-regenerated': 'QR regenerado',
  blocked: 'Bloqueio',
  unblocked: 'Desbloqueio',
  'session-revoked': 'Sessão revogada',
  'birth-changed': 'Ano de nascimento alterado',
  'settings-changed': 'Configuração alterada',
  published: 'Publicação',
  unpublished: 'Publicação retirada',
  'projection-updated': 'Notas publicadas atualizadas',
  'links-closed': 'Vínculos encerrados',
};
const resultLabels = { success: 'Concluído', denied: 'Negado', failed: 'Falhou' } as const;
type FiltersV1 = Pick<AdminQueryV1, 'from' | 'until' | 'event' | 'result'>;
export function StudentAuditV1(props: OperationsPropsV1) {
  return (
    <OperationsScopeV1 {...props}>
      {(scope, label, onAuthorizationLost) => (
        <AuditBodyV1
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
function AuditBodyV1(props: OperationsPropsV1) {
  const parentScope = props.scope;
  const [from, setFrom] = useState(''),
    [until, setUntil] = useState('');
  const [event, setEvent] = useState<AdminQueryV1['event']>(),
    [result, setResult] = useState<AdminQueryV1['result']>();
  const [filters, setFilters] = useState<FiltersV1>({});
  const [invalid, setInvalid] = useState(false);
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined]);
  const [opened, setOpened] = useState<string | null>(null);
  const [detail, setDetail] = useState<AuditDetailStateV1>({ state: 'idle' });
  const [clock, setClock] = useState(Date.now);
  const scopeKey = settingsScopeKeyV1(props.scope),
    cursor = cursors.at(-1);
  const load = useCallback(
    async (signal: AbortSignal) => {
      const response = await props.client.query(
        {
          contractVersion: 1,
          operation: 'audit',
          scope: props.scope,
          page: { limit: 100, ...(cursor ? { cursor } : {}) },
          ...filters,
        },
        signal,
      );
      if (
        response.state !== 'audit' ||
        new Set(response.items.map((e) => e.eventId)).size !== response.items.length
      )
        throw new PortalClientErrorV1('invalid-response');
      if (
        parentScope.kind === 'account' &&
        response.items.some((e) => e.accountId !== parentScope.accountId.toLowerCase())
      )
        throw new PortalClientErrorV1('invalid-response');
      return response;
    },
    [props.client, scopeKey, cursor, filters],
  );
  const read = useOperationalReadV1(load, props.onAuthorizationLost);
  const detailReader = useMemo(
    () => createAuditDetailV1(props, setDetail),
    [props.client, props.reader, props.canWrite],
  );
  useEffect(() => () => detailReader.clear(), [detailReader]);
  useEffect(() => {
    if (detail.state === 'error' && authorizationLostV1(detail.error))
      props.onAuthorizationLost?.(detail.error);
    if (detail.state !== 'error') return;
    setClock(Date.now());
    const timer = setTimeout(() => setClock(Date.now()), Math.max(0, detail.retryAt - Date.now()));
    return () => clearTimeout(timer);
  }, [detail, props.onAuthorizationLost]);
  const fromInput = useRef<HTMLInputElement>(null),
    untilInput = useRef<HTMLInputElement>(null);
  const openDetail = useCallback(
    (eventId: string) => {
      setOpened(eventId);
      void detailReader.open(props.scope, eventId);
    },
    [detailReader, scopeKey],
  );
  function close() {
    setOpened(null);
    detailReader.clear();
  }
  function apply() {
    try {
      if (fromInput.current?.validity.badInput || untilInput.current?.validity.badInput)
        throw new Error('Incomplete interval');
      const start = calendarInstantV1(from),
        end = calendarInstantV1(until);
      if (start && end && Date.parse(start) > Date.parse(end)) throw new Error('interval');
      close();
      setCursors([undefined]);
      setFilters({
        ...(start ? { from: start } : {}),
        ...(end ? { until: end } : {}),
        ...(event ? { event } : {}),
        ...(result ? { result } : {}),
      });
      setInvalid(false);
    } catch {
      setInvalid(true);
    }
  }
  const data = read.state.state === 'ready' ? read.state.data : null;
  return (
    <Card className="pa-operations-card">
      <Card.Header>
        <div className="pa-operations-header">
          <div>
            <h2>Auditoria</h2>
            <p>{props.scopeLabel} · 2026</p>
          </div>
          <LiveReadNoticeV1 failed={Boolean(read.refreshError)} />
        </div>
      </Card.Header>
      <Card.Content>
        <p>
          Metadados dos últimos 12 meses. IP mascarado na lista; detalhe de IP disponível por até 90
          dias e somente com permissão de escrita.
        </p>
        <div className="pa-operations-filters">
          <TextField value={from} onChange={setFrom}>
            <Label>Desde · São Paulo</Label>
            <Input ref={fromInput} type="datetime-local" step={1} />
          </TextField>
          <TextField value={until} onChange={setUntil}>
            <Label>Até · São Paulo</Label>
            <Input ref={untilInput} type="datetime-local" step={1} />
          </TextField>
          <Select
            selectedKey={event || 'all'}
            onSelectionChange={(key) =>
              setEvent(key === 'all' ? undefined : auditKindV1.parse(key))
            }
          >
            <Label>Evento</Label>
            <Select.Trigger>
              <Select.Value />
              <Select.Indicator />
            </Select.Trigger>
            <Select.Popover>
              <ListBox>
                <ListBox.Item id="all" textValue="Todos os eventos">
                  Todos os eventos
                  <ListBox.ItemIndicator />
                </ListBox.Item>
                {auditKindV1.options.map((key) => (
                  <ListBox.Item key={key} id={key} textValue={eventLabels[key]}>
                    {eventLabels[key]}
                    <ListBox.ItemIndicator />
                  </ListBox.Item>
                ))}
              </ListBox>
            </Select.Popover>
          </Select>
          <Select
            selectedKey={result || 'all'}
            onSelectionChange={(key) =>
              setResult(key === 'all' ? undefined : (key as AdminQueryV1['result']))
            }
          >
            <Label>Resultado</Label>
            <Select.Trigger>
              <Select.Value />
              <Select.Indicator />
            </Select.Trigger>
            <Select.Popover>
              <ListBox>
                <ListBox.Item id="all" textValue="Todos os resultados">
                  Todos os resultados
                  <ListBox.ItemIndicator />
                </ListBox.Item>
                {Object.entries(resultLabels).map(([key, label]) => (
                  <ListBox.Item key={key} id={key} textValue={label}>
                    {label}
                    <ListBox.ItemIndicator />
                  </ListBox.Item>
                ))}
              </ListBox>
            </Select.Popover>
          </Select>
        </div>
        <div className="pa-operations-actions">
          <Button onPress={apply}>Aplicar filtros</Button>
          <Button
            variant="secondary"
            onPress={() => {
              setFrom('');
              setUntil('');
              setEvent(undefined);
              setResult(undefined);
              setFilters({});
              setCursors([undefined]);
              setInvalid(false);
              close();
            }}
          >
            Limpar filtros
          </Button>
        </div>
        {invalid && <p role="alert">Confira as datas e a ordem do intervalo antes de aplicar.</p>}
        {read.state.state === 'loading' && <p role="status">Consultando auditoria…</p>}
        {read.state.state === 'error' && (
          <AccountsErrorV1
            error={read.state.error}
            canReload={read.canReload}
            onReload={read.reload}
          />
        )}
        {data && (
          <>
            {data.items.length === 0 ? (
              <p>Nenhum evento encontrado para os filtros aplicados.</p>
            ) : (
              <AuditEventsV1 items={data.items} canWrite={props.canWrite} onOpen={openDetail} />
            )}
            <div className="pa-operations-actions">
              <Button
                variant="secondary"
                isDisabled={cursors.length === 1}
                onPress={() => {
                  close();
                  setCursors((c) => c.slice(0, -1));
                }}
              >
                Página anterior
              </Button>
              <span>Página {cursors.length}</span>
              <Button
                variant="secondary"
                isDisabled={!data.nextCursor}
                onPress={() => {
                  close();
                  setCursors((c) => [...c, data.nextCursor!]);
                }}
              >
                Próxima página
              </Button>
            </div>
          </>
        )}
        {opened && (
          <Modal.Backdrop
            isOpen
            onOpenChange={(open) => {
              if (!open) close();
            }}
          >
            <Modal.Container>
              <Modal.Dialog className="pa-operations-dialog">
                <Modal.Header>
                  <Modal.Heading>Detalhe de auditoria</Modal.Heading>
                </Modal.Header>
                <Modal.Body>
                  {detail.state === 'loading' && (
                    <p role="status">Consultando detalhe autorizado…</p>
                  )}
                  {detail.state === 'error' && (
                    <AccountsErrorV1
                      error={detail.error}
                      canReload={clock >= detail.retryAt}
                      onReload={() => void detailReader.open(props.scope, opened)}
                    />
                  )}
                  {detail.state === 'expired' && (
                    <p role="status">
                      O detalhe foi descartado após cinco minutos. Feche e consulte novamente se
                      necessário.
                    </p>
                  )}
                  {detail.state === 'ready' && (
                    <dl className="pa-operations-detail">
                      <div>
                        <dt>Evento</dt>
                        <dd>
                          {eventLabels[detail.detail.event.kind]} ·{' '}
                          {resultLabels[detail.detail.event.result]}
                        </dd>
                      </div>
                      <div>
                        <dt>Data</dt>
                        <dd>{operationDateV1(detail.detail.event.at)}</dd>
                      </div>
                      <div>
                        <dt>IP</dt>
                        <dd>{detail.detail.ip || 'Não disponível dentro da retenção atual'}</dd>
                      </div>
                      {detail.detail.ipExpiresAt && (
                        <div>
                          <dt>Limite de retenção</dt>
                          <dd>{operationDateV1(detail.detail.ipExpiresAt)}</dd>
                        </div>
                      )}
                      <div>
                        <dt>Identificador do evento</dt>
                        <dd>{detail.detail.event.eventId}</dd>
                      </div>
                      <div>
                        <dt>Responsável</dt>
                        <dd>{detail.detail.event.actorId}</dd>
                      </div>
                    </dl>
                  )}
                </Modal.Body>
                <Modal.Footer>
                  <Button autoFocus variant="secondary" onPress={close}>
                    Fechar detalhe
                  </Button>
                </Modal.Footer>
              </Modal.Dialog>
            </Modal.Container>
          </Modal.Backdrop>
        )}
      </Card.Content>
    </Card>
  );
}

// Editing draft filters or expiring an IP must not rebuild 100 event rows.
const AuditEventsV1 = memo(function AuditEventsV1({
  items,
  canWrite,
  onOpen,
}: {
  items: Extract<AdminResponseV1, { state: 'audit' }>['items'];
  canWrite: boolean;
  onOpen: (id: string) => void;
}) {
  return (
    <Table>
      <ScrollShadow
        className="pa-operations-scroll"
        orientation="horizontal"
        role="region"
        aria-label="Rolagem da auditoria"
        tabIndex={0}
      >
        <Table.Content aria-label="Eventos de auditoria">
          <Table.Header>
            <Table.Column isRowHeader id="date">
              Data · São Paulo
            </Table.Column>
            <Table.Column id="event">Evento</Table.Column>
            <Table.Column id="result">Resultado</Table.Column>
            <Table.Column id="ip">IP mascarado</Table.Column>
            <Table.Column id="detail">Detalhe</Table.Column>
          </Table.Header>
          <Table.Body>
            {items.map((item) => (
              <Table.Row key={item.eventId} id={item.eventId}>
                <Table.Cell>{operationDateV1(item.at)}</Table.Cell>
                <Table.Cell>
                  {eventLabels[item.kind]}
                  <p>{settingsScopeLabelV1(item.scope)}</p>
                </Table.Cell>
                <Table.Cell>{resultLabels[item.result]}</Table.Cell>
                <Table.Cell>{item.maskedIp || 'Não disponível'}</Table.Cell>
                <Table.Cell>
                  <Button
                    size="sm"
                    variant="secondary"
                    isDisabled={!canWrite}
                    onPress={() => onOpen(item.eventId)}
                  >
                    Ver detalhe
                  </Button>
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Content>
      </ScrollShadow>
    </Table>
  );
});
