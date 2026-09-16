import { useCallback, useState, type ReactNode } from 'react';
import { Button, Card, Chip, Drawer, Input, Table } from '@heroui/react';
import type { ScopeV1 } from '../../../../shared/student-portal-contracts/core-v1';
import type { AdminReadResponseV2 } from '../../../../shared/student-portal-contracts/admin-read-v2';
import type { PortalAdminReadClientV2 } from '../accounts/accounts-client-v2';
import type { PortalAdminClientV1 } from '../shared/admin-client-v1';
import { StudentPublicationV1 } from '../publication/student-publication-v1';
import { PortalClientErrorV1 } from '../../student-portal/shared/transport-v1';
import { AccountsErrorV1 } from '../accounts/accounts-presentation-v1';
import { ContinuousEndV1, useContinuousReadV1 } from '../shared/continuous-read-v1';
import { InfoV1 } from '../shared/info-v1';
import { StudentAvatarV1 } from '../shared/student-avatar-v1';
import { LiveReadNoticeV1 } from '../../../shared/live-data/live-read-notice-v1';
import { SETTINGS_LABELS_V1, settingsScopeKeyV1, type SettingsFieldV1 } from './settings-values-v1';
import { allowDraftNavigationV1 } from '../../../shared/forms/draft-navigation-v1';

type Row = Extract<AdminReadResponseV2, { state: 'customizations-read' }>['items'][number];
type Area = 'settings' | 'publication';
type Props = {
  reader: PortalAdminReadClientV2;
  client: PortalAdminClientV1;
  canWrite: boolean;
  scope: ScopeV1;
  renderEditor: (scope: ScopeV1, label: string, onCommitted: () => void) => ReactNode;
};
const periodLabel = (period: string) => period.startsWith('REC')
  ? `Recuperação ${period.slice(3)}` : `${period.slice(1)}º trimestre`;
const date = (value: string) => new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short',
}).format(new Date(value));
const relevance: Record<Row['publications'][number]['relevance'], string> = {
  current: 'Decisão vigente',
  superseded: 'Substituída por decisão posterior',
  'other-class': 'Publicação de uma turma anterior',
  unlinked: 'Aluno sem vínculo atual',
  'other-generation': 'Publicação de uma geração anterior',
  disabled: 'Publicação por escopo desativada',
  'source-unavailable': 'Situação da fonte não disponível',
};
function PublicationSummary({ item }: { item: Row['publications'][number] }) {
  const broader = item.broaderDecision;
  return (
    <div className="grid gap-1 rounded-lg border border-separator p-2 text-xs">
      <strong>{periodLabel(item.period)}: {item.action === 'unpublish' ? 'Publicação retirada' : 'Publicação autorizada'}</strong>
      <span>{relevance[item.relevance]} · {date(item.decidedAt)}</span>
      {broader ? (
        <span className="text-muted">
          {broader.scope.kind === 'school' ? 'Escola' : 'Turma'}: {broader.action === 'unpublish' ? 'retirada' : 'autorizada'} · {date(broader.decidedAt)}
        </span>
      ) : <span className="text-muted">Sem decisão explícita da escola ou turma.</span>}
    </div>
  );
}
function CustomizedSettingsScopeV1({ reader, client, canWrite, scope, renderEditor }: Props) {
  const key = settingsScopeKeyV1(scope);
  const [search, setSearch] = useState('');
  const nameSearch = search.trim();
  const load = useCallback(
    async (cursor: string | undefined, signal: AbortSignal) => {
      const result = await reader.query({
        contractVersion: 2, operation: 'customizations-read', scope,
        ...(nameSearch ? { nameSearch } : {}),
        page: { limit: 100, ...(cursor ? { cursor } : {}) },
      }, signal);
      if (result.state !== 'customizations-read' || settingsScopeKeyV1(result.scope) !== key)
        throw new PortalClientErrorV1('invalid-response');
      return result;
    },
    [reader, scope, key, nameSearch],
  );
  const read = useContinuousReadV1(load, 'id');
  const [selected, setSelected] = useState<{ row: Row; area: Area } | null>(null);
  const data = read.state.state === 'ready' ? read.state.data : null;
  const open = (row: Row, area: Area) => {
    if (allowDraftNavigationV1()) setSelected({ row, area });
  };
  const close = () => {
    if (!allowDraftNavigationV1()) return;
    setSelected(null);
    read.reload();
  };
  return (
    <Card className="pa-custom-settings">
      <Card.Header className="flex-row items-center justify-between">
        <h3>Configurações personalizadas</h3>
        <InfoV1 label="Sobre as configurações personalizadas">
          Opções próprias, bloqueios manuais e decisões de publicação por aluno ou turma.
          Usar padrão remove uma opção própria. Decisões de publicação seguem a última ação
          confirmada entre escola, turma e aluno; as substituídas continuam identificadas aqui.
          Este inventário reúne registros atuais, não um histórico de todos os cliques.
        </InfoV1>
      </Card.Header>
      <Card.Content>
        <Input
          aria-label="Buscar personalizações por aluno ou turma"
          placeholder="Buscar aluno ou turma"
          className="max-w-md"
          maxLength={200}
          value={search}
          onChange={(event) => {
            if (!allowDraftNavigationV1()) return;
            setSelected(null);
            setSearch(event.target.value);
          }}
        />
        <p className="text-xs text-muted">
          Publicação autorizada não garante exibição: acesso, vínculo, datas e períodos permitidos
          continuam sendo verificados. Decisões individuais posteriores podem alterar a publicação de uma turma.
        </p>
        {read.state.state === 'loading' || read.state.state === 'idle' ? <p role="status">Consultando personalizações…</p> : null}
        {read.state.state === 'error' ? (
          <AccountsErrorV1 error={read.state.error} canReload={read.canReload} onReload={read.reload} />
        ) : null}
        <LiveReadNoticeV1 failed={Boolean(read.refreshError)} />
        {data?.items.length === 0 && !data.nextCursor ? (
          <p className="text-sm text-muted">{nameSearch ? 'Nenhuma personalização corresponde à busca.' : 'Nenhuma personalização.'}</p>
        ) : null}
        {data && data.items.length > 0 ? (
          <Table>
            <Table.ScrollContainer>
              <Table.Content aria-label="Configurações personalizadas">
                <Table.Header>
                  <Table.Column isRowHeader>Turma ou aluno</Table.Column>
                  <Table.Column>Personalizações e publicações</Table.Column>
                  <Table.Column>Última alteração</Table.Column>
                  <Table.Column>Revisar</Table.Column>
                </Table.Header>
                <Table.Body items={data.items}>
                  {(row) => (
                    <Table.Row id={row.id} key={row.id}>
                      <Table.Cell>
                        <Button variant="ghost" size="sm" className="pa-student-name"
                          onPress={() => open(row, row.value === null && row.publications.length ? 'publication' : 'settings')}>
                          {row.scope.kind === 'account' ? <StudentAvatarV1 id={row.id} /> : null}
                          <span className="pa-custom-owner">
                            <strong>{row.label}</strong>
                            <small>{row.scope.kind === 'account' ? `Aluno · ${row.classLabel || 'Sem turma atual'}` : 'Turma'}</small>
                          </span>
                        </Button>
                      </Table.Cell>
                      <Table.Cell>
                        <div className="grid min-w-60 gap-2">
                          {row.blocked ? (
                            <div className="text-xs"><strong>Bloqueio manual de acesso</strong><p>Gerencie o bloqueio na ficha em Alunos.</p></div>
                          ) : null}
                          <div className="pa-custom-options">
                            {Object.entries(row.value ?? {}).map(([field, value]) => (
                              <Chip key={field} size="sm" variant="soft"
                                color={typeof value === 'boolean' ? value ? 'success' : 'warning' : 'accent'}>
                                <Chip.Label>
                                  {SETTINGS_LABELS_V1[field as SettingsFieldV1]}
                                  {typeof value === 'boolean' ? `: ${value ? 'Ativado' : 'Desativado'}`
                                    : Array.isArray(value) ? `: ${value.map(periodLabel).join(', ') || 'Nenhum'}` : ': Personalizado'}
                                </Chip.Label>
                              </Chip>
                            ))}
                          </div>
                          {row.publications.map((item) => <PublicationSummary key={item.period} item={item} />)}
                        </div>
                      </Table.Cell>
                      <Table.Cell><time dateTime={row.updatedAt}>{date(row.updatedAt)}</time></Table.Cell>
                      <Table.Cell>
                        <div className="flex flex-col items-start gap-1">
                          {row.value !== null || row.blocked ? (
                            <Button size="sm" variant="ghost" aria-label={`Revisar opções de ${row.label}`} onPress={() => open(row, 'settings')}>Opções</Button>
                          ) : null}
                          {row.publications.length ? (
                            <Button size="sm" variant="ghost" aria-label={`Revisar publicações de ${row.label}`} onPress={() => open(row, 'publication')}>Notas publicadas</Button>
                          ) : null}
                        </div>
                      </Table.Cell>
                    </Table.Row>
                  )}
                </Table.Body>
              </Table.Content>
            </Table.ScrollContainer>
          </Table>
        ) : null}
        {data ? <ContinuousEndV1 more={read.more} busy={read.refreshing}
          failed={Boolean(read.refreshError)} loadMore={read.loadMore} retry={read.reload} /> : null}
      </Card.Content>
      {selected && data ? (
        <Drawer.Backdrop isOpen onOpenChange={(isOpen) => { if (!isOpen) close(); }}>
          <Drawer.Content placement="right">
            <Drawer.Dialog aria-label={`Personalizações de ${selected.row.label}`} className="pa-student-drawer">
              <Drawer.Header className="flex-row justify-between items-center">
                <Drawer.Heading>{selected.row.label}</Drawer.Heading>
                <Button size="sm" variant="ghost" onPress={close}>Fechar</Button>
              </Drawer.Header>
              <Drawer.Body>
                {selected.area === 'publication' ? (
                  <StudentPublicationV1 client={client} scope={selected.row.scope} canWrite={canWrite}
                    scopeLabel={selected.row.label}
                    onOpenSettings={() => open(selected.row, 'settings')} />
                ) : (
                  <>
                    {selected.row.blocked ? <p className="text-sm">Bloqueio manual ativo. Para desbloquear, abra a ficha deste aluno na área Alunos.</p> : null}
                    {renderEditor(selected.row.scope, selected.row.label, read.reload)}
                  </>
                )}
              </Drawer.Body>
            </Drawer.Dialog>
          </Drawer.Content>
        </Drawer.Backdrop>
      ) : null}
    </Card>
  );
}
export function CustomizedSettingsV1(props: Props) {
  return <CustomizedSettingsScopeV1 key={settingsScopeKeyV1(props.scope) + ':' + props.canWrite} {...props} />;
}
