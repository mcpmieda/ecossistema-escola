import { Card, Chip, Skeleton, Spinner, Surface, Table } from '@heroui/react';
import {
  Activity,
  BookOpenText,
  Boxes,
  CheckCircle2,
  CircleGauge,
  Database,
  FileText,
  Settings2,
  ShieldCheck,
} from 'lucide-react';
import type {
  ModuleIntegrationState,
  PlatformRoute,
  PlatformSnapshotContract,
} from '../../shared/platform-contract';
import { OperationsPage } from './operations-page';
import { EmptyState, formatDate, ModuleList, PageHeader, shortCorrelation } from './presentation';

function integrationStateLabel(state: ModuleIntegrationState): string {
  switch (state) {
    case 'ready':
      return 'Pronto';
    case 'registry-only':
      return 'Cadastrado';
    case 'contract-mismatch':
      return 'Requer atualização';
    case 'disabled':
      return 'Desabilitado';
    case 'deprecated':
      return 'Descontinuado';
    default:
      return 'Cadastro inválido';
  }
}

function registryStatusLabel(
  status: PlatformSnapshotContract['registeredModules'][number]['status'],
): string {
  switch (status) {
    case 'installed':
      return 'Instalado';
    case 'disabled':
      return 'Desabilitado';
    case 'deprecated':
      return 'Descontinuado';
    default:
      return 'Não identificado';
  }
}

function integrationChip(state: ModuleIntegrationState) {
  if (state === 'ready') return { color: 'success' as const, variant: 'soft' as const };
  if (state === 'contract-mismatch' || state === 'invalid-registry') {
    return { color: 'danger' as const, variant: 'soft' as const };
  }
  return { color: 'default' as const, variant: 'soft' as const };
}

function OverviewPage({ snapshot }: { snapshot: PlatformSnapshotContract }) {
  const activeConfigurations = snapshot.configurations.filter(
    (configuration) => configuration.active,
  ).length;
  const availableModules = snapshot.coreModules.filter((module) => module.state === 'ready').length;

  return (
    <>
      <PageHeader
        eyebrow="Visão geral"
        title="Operação da plataforma"
        description="Resumo do núcleo administrativo e das áreas já conectadas à fundação institucional."
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(280px,.55fr)]">
        <Surface
          variant="secondary"
          className="living-surface pro-spectrum min-h-80 rounded-[2rem] p-6 sm:p-7"
        >
          <div className="living-aura living-aura--right" />
          <div className="relative z-10 flex min-h-[19rem] flex-col">
            <div className="flex items-center gap-2 text-[#365B86]">
              <CircleGauge className="size-4" />
              <span className="text-xs font-semibold uppercase tracking-[0.14em]">Fundação</span>
            </div>
            <h3 className="mt-5 max-w-xl text-3xl font-semibold tracking-[-0.045em] text-[#203856] sm:text-4xl">
              {snapshot.foundation.status === 'ok' ? 'Estrutura disponível' : 'Estrutura degradada'}
            </h3>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[#365B86]">
              O estado considera as estruturas necessárias ao Centro. Informações de
              disponibilidade, monitoramento e recuperação ficam na área de Operação.
            </p>
            <div className="mt-auto grid gap-2 pt-7 sm:grid-cols-3">
              {[
                'Sessão autenticada',
                'Acesso administrativo',
                snapshot.foundation.expectedPlatformListsPresent
                  ? 'Estrutura completa'
                  : 'Estrutura requer atenção',
              ].map((item) => (
                <Surface
                  key={item}
                  variant="default"
                  className="stagger-item flex items-center gap-2 rounded-2xl bg-surface/96 px-3 py-2.5 text-xs"
                >
                  <CheckCircle2 className="size-3.5 text-success" />
                  {item}
                </Surface>
              ))}
            </div>
          </div>
        </Surface>

        <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-1">
          <Card variant="default" className="stagger-item">
            <Card.Header className="flex-row items-start justify-between">
              <div>
                <Card.Description>Dados institucionais</Card.Description>
                <Card.Title className="mt-1 text-2xl">
                  {snapshot.foundation.sharePointListCount}
                </Card.Title>
              </div>
              <Database className="size-4 text-muted" />
            </Card.Header>
            <Card.Content className="text-xs text-muted">estruturas disponíveis</Card.Content>
          </Card>
          <Card variant="default" className="stagger-item">
            <Card.Header className="flex-row items-start justify-between">
              <div>
                <Card.Description>Áreas disponíveis</Card.Description>
                <Card.Title className="mt-1 text-2xl">{availableModules}</Card.Title>
              </div>
              <Boxes className="size-4 text-muted" />
            </Card.Header>
            <Card.Content className="text-xs text-muted">prontas para uso</Card.Content>
          </Card>
          <Card variant="default" className="stagger-item">
            <Card.Header className="flex-row items-start justify-between">
              <div>
                <Card.Description>Configurações</Card.Description>
                <Card.Title className="mt-1 text-2xl">{activeConfigurations}</Card.Title>
              </div>
              <Settings2 className="size-4 text-muted" />
            </Card.Header>
            <Card.Content className="text-xs text-muted">ativas</Card.Content>
          </Card>
        </div>
      </div>

      <Card variant="default" className="mt-5 overflow-hidden">
        <Card.Header className="border-b border-border/60">
          <Card.Title>Áreas do Centro</Card.Title>
          <Card.Description>Acesse o núcleo e acompanhe o estado de cada área.</Card.Description>
        </Card.Header>
        <Card.Content className="p-2">
          <ModuleList modules={snapshot.coreModules} />
        </Card.Content>
      </Card>
    </>
  );
}

function SystemsPage({ snapshot }: { snapshot: PlatformSnapshotContract }) {
  return (
    <>
      <PageHeader
        eyebrow="Catálogo"
        title="Sistemas e módulos"
        description="Acompanhe os sistemas cadastrados e a situação de integração de cada um com o Centro."
      />

      <Card variant="default" className="overflow-hidden">
        <Card.Header className="border-b border-border/60">
          <Card.Title>Módulos do núcleo</Card.Title>
          <Card.Description>
            {snapshot.coreModules.length} áreas cadastradas no Centro.
          </Card.Description>
        </Card.Header>
        <Card.Content className="p-2">
          <ModuleList modules={snapshot.coreModules} />
        </Card.Content>
      </Card>

      <Card variant="default" className="mt-5 overflow-hidden">
        <Card.Header className="border-b border-border/60">
          <Card.Title>Registro e integração</Card.Title>
          <Card.Description>
            A situação indica se o sistema está cadastrado, compatível e disponível para uso no
            Centro.
          </Card.Description>
        </Card.Header>
        <Card.Content className="p-0">
          {snapshot.registeredModules.length === 0 ? (
            <EmptyState
              title="Nenhum sistema independente registrado"
              description="O catálogo está preparado para receber novos sistemas sem duplicar autenticação, sessão ou infraestrutura compartilhada."
            />
          ) : (
            <Table variant="secondary">
              <Table.ScrollContainer>
                <Table.Content aria-label="Registro e integração dos sistemas">
                  <Table.Header>
                    <Table.Column id="system">Sistema</Table.Column>
                    <Table.Column id="version">Versão</Table.Column>
                    <Table.Column id="registry">Registro</Table.Column>
                    <Table.Column id="integration">Integração</Table.Column>
                    <Table.Column id="capabilities">Permissões</Table.Column>
                  </Table.Header>
                  <Table.Body>
                    {snapshot.registeredModules.map((module) => {
                      const stateChip = integrationChip(module.integrationState);
                      return (
                        <Table.Row id={module.id} key={module.id}>
                          <Table.Cell>
                            <div className="font-medium">{module.name}</div>
                          </Table.Cell>
                          <Table.Cell className="whitespace-nowrap">
                            {module.version || '—'}
                          </Table.Cell>
                          <Table.Cell>
                            <Chip variant="soft" size="sm">
                              {registryStatusLabel(module.status)}
                            </Chip>
                          </Table.Cell>
                          <Table.Cell>
                            <div className="flex flex-col items-start gap-1.5">
                              <Chip color={stateChip.color} variant={stateChip.variant} size="sm">
                                {integrationStateLabel(module.integrationState)}
                              </Chip>
                              {module.integrationIssues.length > 0 && (
                                <span className="text-xs text-muted">
                                  Requer revisão da integração
                                </span>
                              )}
                            </div>
                          </Table.Cell>
                          <Table.Cell className="min-w-56">
                            {module.requiredCapabilities.length > 0 ? (
                              <Chip color="success" variant="soft" size="sm">
                                Configuradas
                              </Chip>
                            ) : (
                              <span className="text-xs text-muted">Não definidas</span>
                            )}
                          </Table.Cell>
                        </Table.Row>
                      );
                    })}
                  </Table.Body>
                </Table.Content>
              </Table.ScrollContainer>
            </Table>
          )}
        </Card.Content>
      </Card>
    </>
  );
}

function AuditPage({ snapshot }: { snapshot: PlatformSnapshotContract }) {
  return (
    <>
      <PageHeader
        eyebrow="Rastreabilidade"
        title="Auditoria"
        description="Eventos administrativos disponíveis para consulta, sem expor detalhes sensíveis no navegador."
      />
      <Card variant="default" className="overflow-hidden">
        <Card.Header className="border-b border-border/60">
          <Card.Title>Atividade recente</Card.Title>
          <Card.Description>Consulta somente leitura.</Card.Description>
        </Card.Header>
        <Card.Content className="p-0">
          {snapshot.recentAudit.length === 0 ? (
            <EmptyState
              icon={Activity}
              title="Nenhum evento administrativo registrado"
              description="A estrutura de auditoria está pronta; novos eventos aparecerão quando operações auditáveis forem ativadas."
            />
          ) : (
            <Table variant="secondary">
              <Table.ScrollContainer>
                <Table.Content aria-label="Atividade administrativa recente">
                  <Table.Header>
                    <Table.Column id="when">Quando</Table.Column>
                    <Table.Column id="module">Módulo</Table.Column>
                    <Table.Column id="action">Ação</Table.Column>
                    <Table.Column id="result">Resultado</Table.Column>
                    <Table.Column id="correlation">Correlação</Table.Column>
                  </Table.Header>
                  <Table.Body>
                    {snapshot.recentAudit.map((entry) => (
                      <Table.Row id={entry.id} key={entry.id}>
                        <Table.Cell className="whitespace-nowrap">
                          {formatDate(entry.occurredAt)}
                        </Table.Cell>
                        <Table.Cell>{entry.module}</Table.Cell>
                        <Table.Cell>{entry.action}</Table.Cell>
                        <Table.Cell>
                          <Chip variant="soft" size="sm">
                            {entry.result || '—'}
                          </Chip>
                        </Table.Cell>
                        <Table.Cell className="font-mono text-xs text-muted">
                          {shortCorrelation(entry.correlationId)}
                        </Table.Cell>
                      </Table.Row>
                    ))}
                  </Table.Body>
                </Table.Content>
              </Table.ScrollContainer>
            </Table>
          )}
        </Card.Content>
      </Card>
    </>
  );
}

function SettingsPage({ snapshot }: { snapshot: PlatformSnapshotContract }) {
  return (
    <>
      <PageHeader
        eyebrow="Governança"
        title="Configurações"
        description="Consulte as configurações administrativas e seu estado de vigência."
      />

      <Card variant="default" className="overflow-hidden">
        <Card.Header className="border-b border-border/60">
          <Card.Title>Registro de configurações</Card.Title>
          <Card.Description>Chave, escopo, versão e estado de vigência.</Card.Description>
        </Card.Header>
        <Card.Content className="p-0">
          {snapshot.configurations.length === 0 ? (
            <EmptyState
              icon={Settings2}
              title="Nenhuma configuração cadastrada"
              description="O registro institucional está disponível para receber parâmetros versionados quando suas regras forem definidas."
            />
          ) : (
            <Table variant="secondary">
              <Table.ScrollContainer>
                <Table.Content aria-label="Configurações institucionais">
                  <Table.Header>
                    <Table.Column id="key">Chave</Table.Column>
                    <Table.Column id="scope">Escopo</Table.Column>
                    <Table.Column id="version">Versão</Table.Column>
                    <Table.Column id="state">Estado</Table.Column>
                  </Table.Header>
                  <Table.Body>
                    {snapshot.configurations.map((configuration) => (
                      <Table.Row id={configuration.id} key={configuration.id}>
                        <Table.Cell className="font-medium">{configuration.key}</Table.Cell>
                        <Table.Cell className="text-muted">{configuration.scope}</Table.Cell>
                        <Table.Cell>{configuration.version || '—'}</Table.Cell>
                        <Table.Cell>
                          <Chip
                            color={configuration.active ? 'success' : 'default'}
                            variant="soft"
                            size="sm"
                          >
                            {configuration.active ? 'Ativa' : 'Inativa'}
                          </Chip>
                        </Table.Cell>
                      </Table.Row>
                    ))}
                  </Table.Body>
                </Table.Content>
              </Table.ScrollContainer>
            </Table>
          )}
        </Card.Content>
      </Card>

      <Card variant="default" className="mt-5 overflow-hidden">
        <Card.Header className="border-b border-border/60">
          <Card.Title>Migrações registradas</Card.Title>
          <Card.Description>
            {snapshot.migrations.length} registro(s) encontrado(s).
          </Card.Description>
        </Card.Header>
        <Card.Content className="p-0">
          {snapshot.migrations.length === 0 ? (
            <EmptyState
              icon={Database}
              title="Nenhuma migração registrada"
              description="Nenhuma migração de módulo foi necessária até o momento."
            />
          ) : (
            <Table variant="secondary">
              <Table.ScrollContainer>
                <Table.Content aria-label="Migrações registradas">
                  <Table.Header>
                    <Table.Column id="version">Versão</Table.Column>
                    <Table.Column id="module">Módulo</Table.Column>
                    <Table.Column id="applied">Aplicada em</Table.Column>
                    <Table.Column id="result">Resultado</Table.Column>
                  </Table.Header>
                  <Table.Body>
                    {snapshot.migrations.map((migration) => (
                      <Table.Row id={migration.id} key={migration.id}>
                        <Table.Cell className="font-medium">
                          {migration.version || 'Versão não informada'}
                        </Table.Cell>
                        <Table.Cell className="text-muted">{migration.module}</Table.Cell>
                        <Table.Cell className="whitespace-nowrap">
                          {formatDate(migration.appliedAt)}
                        </Table.Cell>
                        <Table.Cell>
                          <Chip variant="soft" size="sm">
                            {migration.result || '—'}
                          </Chip>
                        </Table.Cell>
                      </Table.Row>
                    ))}
                  </Table.Body>
                </Table.Content>
              </Table.ScrollContainer>
            </Table>
          )}
        </Card.Content>
      </Card>
    </>
  );
}

function PlannedPage({ route }: { route: 'publicacoes' | 'paginas' }) {
  const copy =
    route === 'publicacoes'
      ? {
          title: 'Publicações',
          description:
            'A gestão de publicações será disponibilizada em uma próxima etapa, com revisão, programação e histórico.',
          icon: BookOpenText,
        }
      : {
          title: 'Páginas',
          description:
            'A edição de páginas será disponibilizada em uma próxima etapa, com controle de alterações e versões.',
          icon: FileText,
        };
  const Icon = copy.icon;

  return (
    <>
      <PageHeader
        eyebrow="Próxima fase"
        title={copy.title}
        description="Esta área está reservada para uma próxima etapa e ainda não está disponível para uso."
      />
      <Surface
        variant="secondary"
        className="living-surface pro-spectrum flex min-h-[430px] flex-col items-center justify-center rounded-[2rem] px-6 py-14 text-center"
      >
        <div className="living-aura living-aura--right" />
        <div className="living-aura living-aura--left" />
        <div className="living-icon">
          <Icon className="size-5 text-accent" />
        </div>
        <Chip color="accent" variant="soft" size="sm" className="mt-6">
          Planejado
        </Chip>
        <h3 className="mt-5 max-w-xl text-2xl font-semibold tracking-[-0.04em] text-[#203856]">
          {copy.title} será incorporado ao núcleo
        </h3>
        <p className="mt-3 max-w-xl text-sm leading-6 text-[#365B86]">{copy.description}</p>
        <Surface
          variant="default"
          className="mt-7 flex items-center gap-2 rounded-2xl bg-surface/96 px-4 py-3 text-xs text-muted"
        >
          <ShieldCheck className="size-3.5 text-accent" />
          Recurso ainda não disponível para edição.
        </Surface>
      </Surface>
    </>
  );
}

export function PageContent({
  route,
  snapshot,
}: {
  route: PlatformRoute;
  snapshot: PlatformSnapshotContract;
}) {
  switch (route) {
    case 'operacao':
      return <OperationsPage snapshot={snapshot} />;
    case 'sistemas':
      return <SystemsPage snapshot={snapshot} />;
    case 'auditoria':
      return <AuditPage snapshot={snapshot} />;
    case 'configuracoes':
      return <SettingsPage snapshot={snapshot} />;
    case 'publicacoes':
    case 'paginas':
      return <PlannedPage route={route} />;
    default:
      return <OverviewPage snapshot={snapshot} />;
  }
}

export function LoadingWorkspace() {
  return (
    <Surface
      variant="secondary"
      className="living-surface living-loading-panel pro-spectrum rounded-[2rem] p-5 sm:p-7"
      role="status"
      aria-label="Carregando dados institucionais"
    >
      <div className="living-aura living-aura--right" />
      <div className="relative z-10 flex flex-col items-center py-8 text-center">
        <div className="loading-orbit">
          <Spinner color="accent" size="lg" />
        </div>
        <Chip color="accent" variant="soft" size="sm" className="mt-5">
          Preparando o Centro
        </Chip>
        <h2 className="mt-4 text-2xl font-semibold tracking-[-0.04em] text-[#203856]">
          Carregando dados institucionais
        </h2>
        <p className="mt-2 max-w-md text-sm leading-6 text-[#365B86]">
          O shell já está disponível enquanto o snapshot autorizado é preparado.
        </p>
      </div>
      <div className="relative z-10 mt-3 grid gap-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(280px,.55fr)]">
        <Skeleton className="stagger-item min-h-64 rounded-3xl" />
        <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-1">
          <Skeleton className="stagger-item h-24 rounded-3xl" />
          <Skeleton className="stagger-item h-24 rounded-3xl" />
          <Skeleton className="stagger-item h-24 rounded-3xl" />
        </div>
      </div>
      <Skeleton className="stagger-item relative z-10 mt-4 h-60 rounded-3xl" />
    </Surface>
  );
}
