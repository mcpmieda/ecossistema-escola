import { Card, Chip, Skeleton } from '@heroui/react';
import {
  Activity,
  BookOpenText,
  Boxes,
  CheckCircle2,
  CircleGauge,
  Database,
  FileText,
  Orbit,
  Settings2,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import type {
  ModuleIntegrationState,
  PlatformRoute,
  PlatformSnapshotContract,
} from '../../shared/platform-contract';
import { AmbientConstellation, LivingSurface } from './ambient';
import { OperationsPage } from './operations-page';
import { EmptyState, formatDate, ModuleRow, PageHeader, shortCorrelation } from './presentation';

function integrationStateLabel(state: ModuleIntegrationState): string {
  switch (state) {
    case 'ready':
      return 'Pronto';
    case 'registry-only':
      return 'Somente registro';
    case 'contract-mismatch':
      return 'Contrato divergente';
    case 'disabled':
      return 'Desabilitado';
    case 'deprecated':
      return 'Depreciado';
    default:
      return 'Registro inválido';
  }
}

function integrationChip(state: ModuleIntegrationState) {
  if (state === 'ready') return { color: 'success' as const, variant: 'soft' as const };
  if (state === 'contract-mismatch' || state === 'invalid-registry') {
    return { color: 'danger' as const, variant: 'soft' as const };
  }
  return { color: 'default' as const, variant: 'tertiary' as const };
}

function StatCard({
  label,
  value,
  detail,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  detail: string;
  icon: typeof Database;
}) {
  return (
    <Card variant="secondary" className="living-card hero-glass--quiet rounded-2xl">
      <Card.Content className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium text-muted-foreground">{label}</p>
            <p className="mt-2 text-3xl font-semibold tracking-[-0.05em]">{value}</p>
          </div>
          <div className="grid size-10 place-items-center rounded-xl bg-accent/10 text-accent">
            <Icon className="size-4" />
          </div>
        </div>
        <p className="mt-3 text-[0.7rem] leading-5 text-muted-foreground">{detail}</p>
      </Card.Content>
    </Card>
  );
}

function OverviewPage({ snapshot }: { snapshot: PlatformSnapshotContract }) {
  const activeConfigurations = snapshot.configurations.filter(
    (configuration) => configuration.active,
  ).length;
  const validationModules = snapshot.coreModules.filter(
    (module) => module.state === 'validation',
  ).length;
  const recoveryVerified = snapshot.operational?.recoveryStatus === 'verified';

  return (
    <>
      <div className="hero-glass--quiet mb-6 flex flex-col gap-3 rounded-2xl px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 text-sm">
          <span className="hero-status-orb" />
          <span className="font-semibold tracking-[-0.015em]">Centro v0.8 em validação controlada</span>
        </div>
        <Chip size="sm" variant="soft" color="accent">
          Skin HeroUI • Living
        </Chip>
      </div>

      <PageHeader
        eyebrow="Visão geral"
        title="Um núcleo que parece vivo"
        description="A mesma fundação administrativa segura, agora apresentada por uma experiência imersiva HeroUI com hierarquia, profundidade e movimento sem interferir nos dados."
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(330px,.55fr)]">
        <LivingSurface className="min-h-[360px] rounded-[1.8rem] p-7 sm:p-9" parallax>
          <div className="flex min-h-[300px] flex-col justify-between">
            <div>
              <div className="hero-kicker">
                <CircleGauge className="size-3.5" />
                Fundação institucional
              </div>
              <h3 className="hero-gradient-text mt-5 max-w-2xl text-4xl font-semibold tracking-[-0.055em] sm:text-5xl">
                {snapshot.foundation.status === 'ok'
                  ? 'Estrutura disponível. Fluxos sob controle.'
                  : 'Estrutura degradada. Atenção direcionada.'}
              </h3>
              <p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
                O estado deriva da presença real das estruturas obrigatórias e dos sinais autorizados
                pelo snapshot. A camada visual não modifica nenhuma regra operacional.
              </p>
            </div>

            <div className="mt-8 grid gap-2 sm:grid-cols-3">
              {[
                { label: 'Sessão autenticada', ok: true },
                { label: 'Capabilities aplicadas', ok: true },
                {
                  label: recoveryVerified ? 'Recovery verificado' : 'Recovery não verificado',
                  ok: recoveryVerified,
                },
              ].map((item) => (
                <div
                  key={item.label}
                  className="hero-glass--quiet flex items-center gap-2 rounded-xl px-3.5 py-3 text-xs"
                >
                  {item.ok ? (
                    <CheckCircle2 className="size-3.5 text-success" />
                  ) : (
                    <Orbit className="size-3.5 text-warning" />
                  )}
                  <span className="font-medium">{item.label}</span>
                </div>
              ))}
            </div>
          </div>
        </LivingSurface>

        <div className="grid gap-4 sm:grid-cols-3 xl:grid-cols-1">
          <StatCard
            label="Persistência"
            value={snapshot.foundation.sharePointListCount}
            detail="listas institucionais observadas"
            icon={Database}
          />
          <StatCard
            label="Núcleo disponível"
            value={validationModules}
            detail="áreas atualmente em validação"
            icon={Boxes}
          />
          <StatCard
            label="Configurações"
            value={activeConfigurations}
            detail="registros ativos no snapshot autorizado"
            icon={Settings2}
          />
        </div>
      </div>

      <Card variant="secondary" className="hero-data-island mt-5 rounded-[1.6rem]">
        <Card.Header className="border-b border-border/70 px-6 py-5">
          <div className="flex items-center gap-2 text-accent">
            <Sparkles className="size-4" />
            <Card.Title className="text-base tracking-[-0.02em]">Áreas do Centro</Card.Title>
          </div>
          <Card.Description className="mt-1">Navegação do núcleo preservada, com nova presença visual.</Card.Description>
        </Card.Header>
        <Card.Content className="divide-y divide-border/60 p-0">
          {snapshot.coreModules.map((module) => (
            <ModuleRow key={module.id} module={module} />
          ))}
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
        description="O registro institucional continua sendo inventário; o Centro só considera integração real quando o contrato versionado e as capabilities permitem."
      />

      <Card variant="secondary" className="hero-data-island rounded-[1.6rem]">
        <Card.Header className="border-b border-border/70 px-6 py-5">
          <Card.Title className="text-base">Módulos do núcleo</Card.Title>
          <Card.Description>{snapshot.coreModules.length} áreas definidas por contrato.</Card.Description>
        </Card.Header>
        <Card.Content className="divide-y divide-border/60 p-0">
          {snapshot.coreModules.map((module) => (
            <ModuleRow key={module.id} module={module} />
          ))}
        </Card.Content>
      </Card>

      <Card variant="secondary" className="hero-data-island mt-5 rounded-[1.6rem]">
        <Card.Header className="border-b border-border/70 px-6 py-5">
          <Card.Title className="text-base">Registro e integração</Card.Title>
          <Card.Description>
            Estado calculado entre o inventário SharePoint e o manifesto versionado reconhecido pelo Centro.
          </Card.Description>
        </Card.Header>
        <Card.Content className="p-0">
          {snapshot.registeredModules.length === 0 ? (
            <EmptyState
              title="Nenhum sistema independente registrado"
              description="O catálogo está preparado para receber novos sistemas sem duplicar autenticação, sessão ou infraestrutura compartilhada."
            />
          ) : (
            <div className="hero-table-wrap">
              <table className="hero-table">
                <thead>
                  <tr>
                    <th>Sistema</th>
                    <th>Versão</th>
                    <th>Registro</th>
                    <th>Integração</th>
                    <th>Capabilities</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshot.registeredModules.map((module) => {
                    const chip = integrationChip(module.integrationState);
                    return (
                      <tr key={module.id}>
                        <td>
                          <div className="font-semibold">{module.name}</div>
                          <div className="mt-1 font-mono text-xs text-muted-foreground">{module.key}</div>
                        </td>
                        <td className="whitespace-nowrap">
                          {module.version || '—'}
                          {module.contractVersion !== null && (
                            <div className="mt-1 text-xs text-muted-foreground">contrato v{module.contractVersion}</div>
                          )}
                        </td>
                        <td>
                          <Chip size="sm" variant="tertiary">{module.status}</Chip>
                        </td>
                        <td>
                          <div className="flex flex-col items-start gap-2">
                            <Chip size="sm" {...chip}>{integrationStateLabel(module.integrationState)}</Chip>
                            {module.integrationIssues.length > 0 && (
                              <span className="text-xs text-muted-foreground">
                                Divergência: {module.integrationIssues.join(', ')}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="min-w-60">
                          {module.requiredCapabilities.length > 0 ? (
                            <div className="flex flex-wrap gap-1.5">
                              {module.requiredCapabilities.map((capability) => (
                                <Chip key={capability} size="sm" variant="soft" color="accent" className="font-mono text-[0.63rem]">
                                  {capability}
                                </Chip>
                              ))}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">Sem manifesto integrado</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
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
        description="Eventos administrativos disponíveis para consulta, preservando a minimização de dados e a rastreabilidade do núcleo."
      />
      <Card variant="secondary" className="hero-data-island rounded-[1.6rem]">
        <Card.Header className="border-b border-border/70 px-6 py-5">
          <Card.Title className="text-base">Atividade recente</Card.Title>
          <Card.Description>Somente leitura nesta candidata.</Card.Description>
        </Card.Header>
        <Card.Content className="p-0">
          {snapshot.recentAudit.length === 0 ? (
            <EmptyState
              icon={Activity}
              title="Nenhum evento administrativo registrado"
              description="A estrutura de auditoria está pronta; novos eventos aparecerão quando operações auditáveis forem ativadas."
            />
          ) : (
            <div className="hero-table-wrap">
              <table className="hero-table">
                <thead>
                  <tr>
                    <th>Quando</th>
                    <th>Módulo</th>
                    <th>Ação</th>
                    <th>Resultado</th>
                    <th>Correlação</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshot.recentAudit.map((entry) => (
                    <tr key={entry.id}>
                      <td className="whitespace-nowrap">{formatDate(entry.occurredAt)}</td>
                      <td>{entry.module}</td>
                      <td>{entry.action}</td>
                      <td><Chip size="sm" variant="tertiary">{entry.result || '—'}</Chip></td>
                      <td className="font-mono text-xs text-muted-foreground">{shortCorrelation(entry.correlationId)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
        description="Somente metadados autorizados chegam ao navegador. A nova skin não altera o limite de exposição de valores protegidos."
      />

      <Card variant="secondary" className="hero-data-island rounded-[1.6rem]">
        <Card.Header className="border-b border-border/70 px-6 py-5">
          <Card.Title className="text-base">Registro de configurações</Card.Title>
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
            <div className="hero-table-wrap">
              <table className="hero-table">
                <thead>
                  <tr>
                    <th>Chave</th>
                    <th>Escopo</th>
                    <th>Versão</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshot.configurations.map((configuration) => (
                    <tr key={configuration.id}>
                      <td className="font-semibold">{configuration.key}</td>
                      <td className="text-muted-foreground">{configuration.scope}</td>
                      <td>{configuration.version || '—'}</td>
                      <td>
                        <Chip
                          size="sm"
                          variant="soft"
                          color={configuration.active ? 'success' : 'default'}
                        >
                          {configuration.active ? 'Ativa' : 'Inativa'}
                        </Chip>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card.Content>
      </Card>

      <Card variant="secondary" className="hero-data-island mt-5 rounded-[1.6rem]">
        <Card.Header className="border-b border-border/70 px-6 py-5">
          <Card.Title className="text-base">Migrações registradas</Card.Title>
          <Card.Description>{snapshot.migrations.length} registro(s) encontrado(s).</Card.Description>
        </Card.Header>
        <Card.Content className="p-0">
          {snapshot.migrations.length === 0 ? (
            <EmptyState
              icon={Database}
              title="Nenhuma migração registrada"
              description="Esta candidata somente leitura não exigiu migração de módulo."
            />
          ) : (
            <div className="divide-y divide-border/60">
              {snapshot.migrations.map((migration) => (
                <div
                  key={migration.id}
                  className="flex flex-col gap-2 px-6 py-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="text-sm font-semibold">{migration.version || 'Versão não informada'}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{migration.module}</p>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>{formatDate(migration.appliedAt)}</span>
                    <Chip size="sm" variant="tertiary">{migration.result || '—'}</Chip>
                  </div>
                </div>
              ))}
            </div>
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
            'A gestão editorial será construída como uma fatia própria, com revisão, programação, publicação e rollback.',
          icon: BookOpenText,
        }
      : {
          title: 'Páginas',
          description:
            'A edição controlada de páginas será incorporada ao Centro sem transportar código legado ou criar caminhos paralelos.',
          icon: FileText,
        };
  const Icon = copy.icon;

  return (
    <>
      <PageHeader
        eyebrow="Escopo adiado"
        title={copy.title}
        description="A área permanece reservada no Centro, mas sua construção funcional foi adiada por decisão de produto."
      />
      <LivingSurface className="rounded-[1.8rem] p-8 sm:p-12" parallax>
        <AmbientConstellation intensity="strong" />
        <div className="relative z-10 flex min-h-[340px] flex-col items-center justify-center text-center">
          <div className="hero-glass grid size-16 place-items-center rounded-[1.4rem]">
            <Icon className="size-6 text-accent" />
          </div>
          <Chip variant="soft" color="accent" size="sm" className="mt-6">Planejado</Chip>
          <h3 className="hero-gradient-text mt-5 text-2xl font-semibold tracking-[-0.04em] sm:text-3xl">
            {copy.title} já tem lugar no ecossistema
          </h3>
          <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">{copy.description}</p>
          <div className="hero-glass--quiet mt-7 flex items-center gap-2 rounded-xl px-4 py-3 text-xs text-muted-foreground">
            <ShieldCheck className="size-3.5 text-accent" />
            Nenhuma escrita foi ativada nesta candidata.
          </div>
        </div>
      </LivingSurface>
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
    <div className="hero-page-enter space-y-5" role="status" aria-label="Carregando dados institucionais">
      <div className="living-surface relative overflow-hidden rounded-[1.7rem] p-7">
        <AmbientConstellation intensity="soft" />
        <div className="relative z-10 space-y-3">
          <Skeleton className="h-3 w-24 rounded-lg" />
          <Skeleton className="h-10 w-80 max-w-full rounded-xl" />
          <Skeleton className="h-4 w-[32rem] max-w-full rounded-lg" />
        </div>
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(330px,.55fr)]">
        <Skeleton className="min-h-[360px] rounded-[1.8rem]" />
        <div className="grid gap-4 sm:grid-cols-3 xl:grid-cols-1">
          <Skeleton className="h-28 rounded-2xl" />
          <Skeleton className="h-28 rounded-2xl" />
          <Skeleton className="h-28 rounded-2xl" />
        </div>
      </div>
      <Skeleton className="h-72 rounded-[1.6rem]" />
    </div>
  );
}
