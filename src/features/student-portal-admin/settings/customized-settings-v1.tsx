import { useCallback, useState, type ReactNode } from 'react';
import { Button, Card, Chip, Drawer, Table } from '@heroui/react';
import type { ScopeV1 } from '../../../../shared/student-portal-contracts/core-v1';
import type { AdminReadResponseV2 } from '../../../../shared/student-portal-contracts/admin-read-v2';
import type { PortalAdminReadClientV2 } from '../accounts/accounts-client-v2';
import { PortalClientErrorV1 } from '../../student-portal/shared/transport-v1';
import { AccountsErrorV1 } from '../accounts/accounts-presentation-v1';
import { ContinuousEndV1, useContinuousReadV1 } from '../shared/continuous-read-v1';
import { InfoV1 } from '../shared/info-v1';
import { StudentAvatarV1 } from '../shared/student-avatar-v1';
import { SETTINGS_LABELS_V1, settingsScopeKeyV1, type SettingsFieldV1 } from './settings-values-v1';
import { allowDraftNavigationV1 } from '../../../shared/forms/draft-navigation-v1';

type Row = Extract<AdminReadResponseV2, { state: 'settings-overrides' }>['items'][number];
export function CustomizedSettingsV1({
  reader,
  scope,
  renderEditor,
}: {
  reader: PortalAdminReadClientV2;
  scope: ScopeV1;
  renderEditor: (scope: ScopeV1, label: string, onCommitted: () => void) => ReactNode;
}) {
  const key = settingsScopeKeyV1(scope);
  const load = useCallback(
    async (cursor: string | undefined, signal: AbortSignal) => {
      const result = await reader.query(
        {
          contractVersion: 2,
          operation: 'settings-overrides',
          scope,
          page: { limit: 100, ...(cursor ? { cursor } : {}) },
        },
        signal,
      );
      if (
        result.state !== 'settings-overrides' ||
        settingsScopeKeyV1(result.scope) !== key ||
        (scope.kind === 'account' &&
          result.items.some((item) => settingsScopeKeyV1(item.scope) !== key))
      )
        throw new PortalClientErrorV1('invalid-response');
      return result;
    },
    [reader, key],
  );
  const read = useContinuousReadV1(load, 'id');
  const [selected, setSelected] = useState<Row | null>(null);
  const data = read.state.state === 'ready' ? read.state.data : null;
  return (
    <Card className="pa-custom-settings">
      <Card.Header className="flex-row items-center justify-between">
        <h3>Configurações personalizadas</h3>
        <InfoV1 label="Sobre as configurações personalizadas">
          Opções definidas diretamente para turmas ou alunos. Usar padrão remove uma personalização;
          valores apenas herdados não entram nesta lista.
        </InfoV1>
      </Card.Header>
      <Card.Content>
        {read.state.state === 'loading' || read.state.state === 'idle' ? (
          <p role="status">Consultando personalizações…</p>
        ) : null}
        {read.state.state === 'error' ? (
          <AccountsErrorV1
            error={read.state.error}
            canReload={read.canReload}
            onReload={read.reload}
          />
        ) : null}
        {data?.items.length === 0 && !data.nextCursor ? (
          <p className="text-sm text-muted">Nenhuma personalização.</p>
        ) : null}
        {data && data.items.length > 0 ? (
          <Table>
            <Table.ScrollContainer>
              <Table.Content aria-label="Configurações personalizadas">
                <Table.Header>
                  <Table.Column isRowHeader>Turma ou aluno</Table.Column>
                  <Table.Column>Opções personalizadas</Table.Column>
                </Table.Header>
                <Table.Body items={data.items}>
                  {(row) => (
                    <Table.Row id={row.id} key={row.id}>
                      <Table.Cell>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="pa-student-name"
                          onPress={() => setSelected(row)}
                        >
                          {row.scope.kind === 'account' ? <StudentAvatarV1 id={row.id} /> : null}
                          <span className="pa-custom-owner">
                            <strong>{row.label}</strong>
                            {row.scope.kind === 'account' ? <small>{row.classLabel}</small> : null}
                          </span>
                        </Button>
                      </Table.Cell>
                      <Table.Cell>
                        <div className="pa-custom-options">
                          {Object.entries(row.value).map(([field, value]) => (
                            <Chip
                              key={field}
                              size="sm"
                              variant="soft"
                              color={
                                typeof value === 'boolean'
                                  ? value
                                    ? 'success'
                                    : 'warning'
                                  : 'accent'
                              }
                            >
                              <Chip.Label>
                                {SETTINGS_LABELS_V1[field as SettingsFieldV1]}
                                {typeof value === 'boolean'
                                  ? `: ${value ? 'Ativado' : 'Desativado'}`
                                  : Array.isArray(value)
                                    ? `: ${value.join(', ') || 'Nenhum'}`
                                    : ''}
                              </Chip.Label>
                            </Chip>
                          ))}
                        </div>
                      </Table.Cell>
                    </Table.Row>
                  )}
                </Table.Body>
              </Table.Content>
            </Table.ScrollContainer>
          </Table>
        ) : null}
        {data ? (
          <ContinuousEndV1
            more={read.more}
            busy={read.refreshing}
            failed={Boolean(read.refreshError)}
            loadMore={read.loadMore}
            retry={read.reload}
          />
        ) : null}
      </Card.Content>
      {selected && data ? (
        <Drawer.Backdrop
          isOpen
          onOpenChange={(open) => {
            if (!open && allowDraftNavigationV1()) setSelected(null);
          }}
        >
          <Drawer.Content placement="right">
            <Drawer.Dialog
              aria-label={`Personalizações de ${selected.label}`}
              className="pa-student-drawer"
            >
              <Drawer.Header className="flex-row justify-between items-center">
                <Drawer.Heading>{selected.label}</Drawer.Heading>
                <Button
                  size="sm"
                  variant="ghost"
                  onPress={() => {
                    if (allowDraftNavigationV1()) setSelected(null);
                  }}
                >
                  Fechar
                </Button>
              </Drawer.Header>
              <Drawer.Body>{renderEditor(selected.scope, selected.label, read.reload)}</Drawer.Body>
            </Drawer.Dialog>
          </Drawer.Content>
        </Drawer.Backdrop>
      ) : null}
    </Card>
  );
}
