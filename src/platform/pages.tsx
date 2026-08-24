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
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { PlatformRoute, PlatformSnapshotContract } from '../../shared/platform-contract';
import { OperationsPage } from './operations-page';
import { EmptyState, formatDate, ModuleRow, PageHeader, shortCorrelation } from './presentation';

function OverviewPage({ snapshot }: { snapshot: PlatformSnapshotContract }) {
  const activeConfigurations = snapshot.configurations.filter(
    (configuration) => configuration.active,
  ).length;
  const validationModules = snapshot.coreModules.filter(
    (module) => module.state === 'validation',
  ).length;

  return (
    <>
      <div className="mb-6 flex flex-col gap-3 rounded-xl border border-primary/15 bg-primary/[0.035] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 text-sm">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full rounded-full bg-primary/25 motion-safe:animate-ping" />
            <span className="relative inline-flex size-2 rounded-full bg-primary" />
          </span>
          <span className="font-medium">Centro v0.5 em validação controlada</span>
        </div>
        <span className="text-xs text-muted-foreground">Acesso restrito a administradores</span>
      </div>

      <PageHeader
        eyebrow="Visão geral"
        title="Operação da plataforma"
        description="Resumo do núcleo administrativo e das áreas já conectadas à fundação institucional."
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(280px,.55fr)]">
        <Card className="min-h-64 bg-primary text-primary-foreground ring-primary/15">
          <CardHeader>
            <div className="flex items-center gap-2 text-primary-foreground/70">
              <CircleGauge className="size-4" />
              <span className="text-xs font-medium uppercase tracking-[0.14em]">Fundação</span>
            </div>
            <CardTitle className="mt-4 text-3xl font-semibold tracking-[-0.04em] text-primary-foreground">
              {snapshot.foundation.status === 'ok' ? 'Estrutura disponível' : 'Estrutura degradada'}
            </CardTitle>
            <CardDescription className="max-w-xl text-primary-foreground/70">
              O estado agora deriva da presença real das estruturas obrigatórias. Sinais detalhados,
              cobertura de health checks e lacunas de recuperação ficam na área de Operação.
            </CardDescription>
          </CardHeader>
          <CardContent className="mt-auto grid gap-2 sm:grid-cols-3">
            {[
              'Sessão autenticada',
              'Acesso administrativo',
              snapshot.foundation.expectedPlatformListsPresent
                ? 'Estrutura completa'
                : 'Estrutura requer atenção',
            ].map((item) => (
              <div
                key={item}
                className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.055] px-3 py-2.5 text-xs text-primary-foreground/80"
              >
                <CheckCircle2 className="size-3.5" />
                {item}
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-1">
          <Card size="sm">
            <CardHeader>
              <CardDescription>Persistência</CardDescription>
              <CardTitle className="text-2xl">{snapshot.foundation.sharePointListCount}</CardTitle>
              <CardAction>
                <Database className="size-4 text-muted-foreground" />
              </CardAction>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              listas institucionais
            </CardContent>
          </Card>
          <Card size="sm">
            <CardHeader>
              <CardDescription>Núcleo disponível</CardDescription>
              <CardTitle className="text-2xl">{validationModules}</CardTitle>
              <CardAction>
                <Boxes className="size-4 text-muted-foreground" />
              </CardAction>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">áreas em validação</CardContent>
          </Card>
          <Card size="sm">
            <CardHeader>
              <CardDescription>Configurações</CardDescription>
              <CardTitle className="text-2xl">{activeConfigurations}</CardTitle>
              <CardAction>
                <Settings2 className="size-4 text-muted-foreground" />
              </CardAction>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">ativas no registro</CardContent>
          </Card>
        </div>
      </div>

      <Card className="mt-5 gap-0 py-0">
        <CardHeader className="border-b py-4">
          <CardTitle>Áreas do Centro</CardTitle>
          <CardDescription>Acesse o núcleo e acompanhe o estado de cada área.</CardDescription>
        </CardHeader>
        <div className="divide-y">
          {snapshot.coreModules.map((module) => (
            <ModuleRow key={module.id} module={module} />
          ))}
        </div>
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
        description="O núcleo é definido por contrato; sistemas incorporados aparecem no registro institucional."
      />

      <Card className="gap-0 py-0">
        <CardHeader className="border-b py-4">
          <CardTitle>Módulos do núcleo</CardTitle>
          <CardDescription>
            {snapshot.coreModules.length} áreas definidas por contrato.
          </CardDescription>
        </CardHeader>
        <div className="divide-y">
          {snapshot.coreModules.map((module) => (
            <ModuleRow key={module.id} module={module} />
          ))}
        </div>
      </Card>

      <Card className="mt-5 gap-0 py-0">
        <CardHeader className="border-b py-4">
          <CardTitle>Registro institucional</CardTitle>
          <CardDescription>
            Sistemas independentes passam a aparecer aqui quando seus contratos de integração forem
            registrados.
          </CardDescription>
        </CardHeader>
        {snapshot.registeredModules.length === 0 ? (
          <EmptyState
            title="Nenhum sistema independente registrado"
            description="O catálogo está preparado para receber novos sistemas sem duplicar autenticação, sessão ou infraestrutura compartilhada."
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sistema</TableHead>
                  <TableHead>Chave</TableHead>
                  <TableHead>Versão</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {snapshot.registeredModules.map((module) => (
                  <TableRow key={module.id}>
                    <TableCell className="font-medium">{module.name}</TableCell>
                    <TableCell className="text-muted-foreground">{module.key}</TableCell>
                    <TableCell>{module.version || '—'}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{module.status || 'sem estado'}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
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
      <Card className="gap-0 py-0">
        <CardHeader className="border-b py-4">
          <CardTitle>Atividade recente</CardTitle>
          <CardDescription>Somente leitura nesta candidata.</CardDescription>
        </CardHeader>
        {snapshot.recentAudit.length === 0 ? (
          <EmptyState
            icon={Activity}
            title="Nenhum evento administrativo registrado"
            description="A estrutura de auditoria está pronta; novos eventos aparecerão quando operações auditáveis forem ativadas."
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Quando</TableHead>
                  <TableHead>Módulo</TableHead>
                  <TableHead>Ação</TableHead>
                  <TableHead>Resultado</TableHead>
                  <TableHead>Correlação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {snapshot.recentAudit.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="whitespace-nowrap">
                      {formatDate(entry.occurredAt)}
                    </TableCell>
                    <TableCell>{entry.module}</TableCell>
                    <TableCell>{entry.action}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{entry.result || '—'}</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {shortCorrelation(entry.correlationId)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
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
        description="A interface mostra somente metadados de configuração. Valores protegidos não são enviados ao navegador."
      />

      <Card className="gap-0 py-0">
        <CardHeader className="border-b py-4">
          <CardTitle>Registro de configurações</CardTitle>
          <CardDescription>Chave, escopo, versão e estado de vigência.</CardDescription>
        </CardHeader>
        {snapshot.configurations.length === 0 ? (
          <EmptyState
            icon={Settings2}
            title="Nenhuma configuração cadastrada"
            description="O registro institucional está disponível para receber parâmetros versionados quando suas regras forem definidas."
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Chave</TableHead>
                  <TableHead>Escopo</TableHead>
                  <TableHead>Versão</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {snapshot.configurations.map((configuration) => (
                  <TableRow key={configuration.id}>
                    <TableCell className="font-medium">{configuration.key}</TableCell>
                    <TableCell className="text-muted-foreground">{configuration.scope}</TableCell>
                    <TableCell>{configuration.version || '—'}</TableCell>
                    <TableCell>
                      <Badge variant={configuration.active ? 'outline' : 'secondary'}>
                        {configuration.active ? 'Ativa' : 'Inativa'}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      <Card className="mt-5 gap-0 py-0">
        <CardHeader className="border-b py-4">
          <CardTitle>Migrações registradas</CardTitle>
          <CardDescription>{snapshot.migrations.length} registro(s) encontrado(s).</CardDescription>
        </CardHeader>
        {snapshot.migrations.length === 0 ? (
          <EmptyState
            icon={Database}
            title="Nenhuma migração registrada"
            description="Esta candidata somente leitura não exigiu migração de módulo."
          />
        ) : (
          <div className="divide-y">
            {snapshot.migrations.map((migration) => (
              <div
                key={migration.id}
                className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="text-sm font-medium">
                    {migration.version || 'Versão não informada'}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{migration.module}</p>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span>{formatDate(migration.appliedAt)}</span>
                  <Badge variant="outline">{migration.result || '—'}</Badge>
                </div>
              </div>
            ))}
          </div>
        )}
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
        eyebrow="Próxima fase"
        title={copy.title}
        description="Esta área já possui lugar definido no Centro, mas ainda não realiza operações de negócio."
      />
      <Card>
        <CardContent className="flex min-h-[360px] flex-col items-center justify-center py-12 text-center">
          <div className="grid size-12 place-items-center rounded-2xl border bg-muted/35">
            <Icon className="size-5 text-muted-foreground" />
          </div>
          <Badge variant="secondary" className="mt-5">
            Planejado
          </Badge>
          <h3 className="mt-4 text-lg font-semibold">{copy.title} será incorporado ao núcleo</h3>
          <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
            {copy.description}
          </p>
          <div className="mt-6 flex items-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="size-3.5" />
            Nenhuma escrita foi ativada nesta candidata.
          </div>
        </CardContent>
      </Card>
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
    <div className="space-y-5" role="status" aria-label="Carregando dados institucionais">
      <div className="space-y-2">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-8 w-72 max-w-full" />
        <Skeleton className="h-4 w-[28rem] max-w-full" />
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(280px,.55fr)]">
        <Skeleton className="min-h-64 rounded-xl" />
        <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-1">
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
        </div>
      </div>
      <Skeleton className="h-72 rounded-xl" />
    </div>
  );
}
