import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  ArrowRight,
  BookOpenText,
  Boxes,
  CheckCircle2,
  CircleGauge,
  Database,
  FileText,
  LayoutDashboard,
  LoaderCircle,
  LockKeyhole,
  LogOut,
  Menu,
  Settings2,
  ShieldCheck,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import {
  normalizePlatformRoute,
  type CoreModuleContract,
  type PlatformRoute,
  type PlatformSnapshotContract,
} from '../shared/platform-contract';

type Identity = { authenticated: boolean; name?: string; roles?: string[] };

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; snapshot: PlatformSnapshotContract }
  | { status: 'error'; message: string; correlationId?: string };

const routeLabels: Record<PlatformRoute, string> = {
  'visao-geral': 'Visão geral',
  publicacoes: 'Publicações',
  paginas: 'Páginas',
  sistemas: 'Sistemas',
  auditoria: 'Auditoria',
  configuracoes: 'Configurações',
};

const routeIcons: Record<PlatformRoute, LucideIcon> = {
  'visao-geral': LayoutDashboard,
  publicacoes: BookOpenText,
  paginas: FileText,
  sistemas: Boxes,
  auditoria: ShieldCheck,
  configuracoes: Settings2,
};

function routeFromHash(): PlatformRoute {
  return normalizePlatformRoute(window.location.hash.replace(/^#\/?/u, ''));
}

function usePlatformRoute(): PlatformRoute {
  const [route, setRoute] = useState<PlatformRoute>(() => routeFromHash());

  useEffect(() => {
    const onHashChange = () => setRoute(routeFromHash());
    window.addEventListener('hashchange', onHashChange);
    if (!window.location.hash) window.history.replaceState(null, '', '#/visao-geral');
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  return route;
}

function MicrosoftMark() {
  return (
    <span className="grid size-4 grid-cols-2 gap-px" aria-hidden="true">
      <span className="bg-current" />
      <span className="bg-current" />
      <span className="bg-current" />
      <span className="bg-current" />
    </span>
  );
}

function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={cn(
        'grid shrink-0 place-items-center rounded-xl bg-primary font-semibold tracking-tight text-primary-foreground shadow-sm',
        compact ? 'size-9 text-xs' : 'size-11 text-sm',
      )}
      aria-hidden="true"
    >
      IA
    </div>
  );
}

function LoginExperience({ loading }: { loading: boolean }) {
  return (
    <main className="relative min-h-svh overflow-hidden bg-muted/35 px-4 py-8 sm:px-6 lg:px-8">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_15%,color-mix(in_oklch,var(--primary)_9%,transparent),transparent_28rem)]" />
      <div className="relative mx-auto flex min-h-[calc(100svh-4rem)] max-w-6xl items-center justify-center">
        <Card className="w-full max-w-5xl gap-0 overflow-hidden p-0 shadow-2xl shadow-primary/5 ring-foreground/10 lg:grid lg:grid-cols-[1.05fr_.95fr]">
          <section className="relative hidden min-h-[640px] overflow-hidden bg-primary p-12 text-primary-foreground lg:flex lg:flex-col lg:justify-between">
            <div className="absolute -right-28 -top-28 size-80 rounded-full border border-white/10" />
            <div className="absolute -right-10 -top-10 size-44 rounded-full border border-white/10" />
            <div className="relative">
              <BrandMark />
              <p className="mt-10 text-xs font-medium uppercase tracking-[0.18em] text-primary-foreground/65">
                Escola Iêda Alves de Oliveira MCPM
              </p>
              <h1 className="mt-5 max-w-md text-5xl font-semibold tracking-[-0.045em]">
                Centro de Administração
              </h1>
              <p className="mt-5 max-w-lg text-base leading-7 text-primary-foreground/72">
                Um único ambiente para operar, acompanhar e integrar os sistemas administrativos da
                escola.
              </p>
            </div>

            <div className="relative grid gap-3 text-sm text-primary-foreground/80">
              <div className="flex items-center gap-3">
                <ShieldCheck className="size-4" />
                <span>Acesso institucional protegido</span>
              </div>
              <div className="flex items-center gap-3">
                <Boxes className="size-4" />
                <span>Módulos integrados em uma única plataforma</span>
              </div>
              <div className="flex items-center gap-3">
                <Activity className="size-4" />
                <span>Operações rastreáveis e evolutivas</span>
              </div>
            </div>
          </section>

          <section className="flex min-h-[560px] items-center bg-card px-6 py-12 sm:px-12 lg:min-h-[640px]">
            <div className="mx-auto w-full max-w-sm">
              <div className="mb-10 flex items-center gap-3 lg:hidden">
                <BrandMark compact />
                <div>
                  <p className="text-sm font-semibold">Centro de Administração</p>
                  <p className="text-xs text-muted-foreground">Escola Iêda Alves de Oliveira</p>
                </div>
              </div>

              <Badge variant="secondary" className="mb-5">
                Acesso institucional
              </Badge>
              <h2 className="text-3xl font-semibold tracking-[-0.035em]">
                {loading ? 'Verificando sua sessão' : 'Entre para continuar'}
              </h2>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                Use sua conta institucional. A autenticação é realizada pelo Microsoft Entra ID.
              </p>

              {loading ? (
                <div
                  className="mt-8 flex h-11 items-center justify-center gap-2 rounded-lg border bg-muted/35 text-sm font-medium text-muted-foreground"
                  role="status"
                >
                  <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" />
                  Verificando acesso…
                </div>
              ) : (
                <Button asChild size="lg" className="mt-8 h-11 w-full">
                  <a href="/auth/login">
                    <MicrosoftMark />
                    Entrar com conta institucional
                  </a>
                </Button>
              )}

              <div className="mt-8 flex items-start gap-3 rounded-xl border bg-muted/25 p-4 text-xs leading-5 text-muted-foreground">
                <LockKeyhole className="mt-0.5 size-4 shrink-0 text-foreground/65" />
                <p>O Centro não solicita nem armazena sua senha institucional.</p>
              </div>
            </div>
          </section>
        </Card>
      </div>
    </main>
  );
}

function RestrictedExperience({ name }: { name?: string }) {
  return (
    <main className="grid min-h-svh place-items-center bg-muted/35 p-4">
      <Card className="w-full max-w-xl">
        <CardHeader>
          <Badge variant="outline" className="mb-3">
            Validação restrita
          </Badge>
          <CardTitle className="text-2xl tracking-tight">Acesso ainda não liberado</CardTitle>
          <CardDescription className="max-w-lg leading-6">
            {name ? `${name}, sua conta está autenticada.` : 'Sua conta está autenticada.'} Nesta
            fase, somente administradores autorizados podem testar a nova plataforma.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form method="post" action="/auth/logout">
            <Button variant="outline" type="submit">
              <LogOut />
              Sair
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}

function EmptyState({
  icon: Icon = Boxes,
  title,
  description,
}: {
  icon?: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <div className="flex min-h-56 flex-col items-center justify-center px-5 py-10 text-center">
      <div className="grid size-10 place-items-center rounded-xl border bg-muted/35">
        <Icon className="size-4 text-muted-foreground" />
      </div>
      <h3 className="mt-4 text-sm font-semibold">{title}</h3>
      <p className="mt-1.5 max-w-md text-sm leading-6 text-muted-foreground">{description}</p>
    </div>
  );
}

function PageHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="mb-6">
      <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
        {eyebrow}
      </p>
      <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">{title}</h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p>
    </div>
  );
}

function ModuleStatus({ state }: { state: CoreModuleContract['state'] }) {
  return (
    <Badge variant={state === 'validation' ? 'outline' : 'secondary'}>
      {state === 'validation' ? 'Em validação' : 'Planejado'}
    </Badge>
  );
}

function ModuleRow({ module }: { module: CoreModuleContract }) {
  const Icon = routeIcons[module.route];
  return (
    <a
      href={`#/${module.route}`}
      className="group flex items-center gap-4 px-4 py-4 transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 sm:px-5"
    >
      <div className="grid size-10 shrink-0 place-items-center rounded-xl border bg-background shadow-xs">
        <Icon className="size-4 text-muted-foreground transition-colors group-hover:text-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold">{module.name}</h3>
          <ModuleStatus state={module.state} />
        </div>
        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{module.description}</p>
      </div>
      <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground motion-reduce:transform-none" />
    </a>
  );
}

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
          <span className="font-medium">Candidata visual v0.3 em validação controlada</span>
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
              {snapshot.foundation.status === 'ok' ? 'Operacional' : 'Requer atenção'}
            </CardTitle>
            <CardDescription className="max-w-xl text-primary-foreground/70">
              Autenticação, sessão, acesso institucional e leitura administrativa continuam usando a
              fundação já implantada.
            </CardDescription>
          </CardHeader>
          <CardContent className="mt-auto grid gap-2 sm:grid-cols-3">
            {['Identidade protegida', 'Dados institucionais', 'Sessão validada'].map((item) => (
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

function PageContent({
  route,
  snapshot,
}: {
  route: PlatformRoute;
  snapshot: PlatformSnapshotContract;
}) {
  switch (route) {
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

function formatDate(value: string): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '—'
    : new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(date);
}

function shortCorrelation(value: string): string {
  return value ? `${value.slice(0, 8)}…` : '—';
}

function initials(value?: string): string {
  if (!value?.trim()) return 'AD';
  return value
    .trim()
    .split(/\s+/u)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('');
}

function Navigation({
  route,
  modules,
  loading,
  onNavigate,
}: {
  route: PlatformRoute;
  modules: CoreModuleContract[];
  loading: boolean;
  onNavigate?: () => void;
}) {
  if (loading) {
    return (
      <div className="grid gap-2 px-2">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton className="h-9 w-full" key={index} />
        ))}
      </div>
    );
  }

  return (
    <nav className="grid gap-1 px-2" aria-label="Navegação principal">
      {modules.map((module) => {
        const Icon = routeIcons[module.route];
        const active = route === module.route;
        return (
          <a
            key={module.id}
            href={`#/${module.route}`}
            onClick={onNavigate}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'group flex min-h-9 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
              active
                ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                : 'text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground',
            )}
          >
            <Icon className={cn('size-4', active ? 'text-primary' : 'text-muted-foreground')} />
            <span className="min-w-0 flex-1 truncate">{module.name}</span>
            {module.state === 'planned' && (
              <span
                className="size-1.5 rounded-full bg-muted-foreground/35"
                aria-label="Planejado"
              />
            )}
          </a>
        );
      })}
    </nav>
  );
}

function SidebarContent({
  route,
  modules,
  loading,
  onNavigate,
}: {
  route: PlatformRoute;
  modules: CoreModuleContract[];
  loading: boolean;
  onNavigate?: () => void;
}) {
  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex h-16 items-center gap-3 px-4">
        <BrandMark compact />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">Centro de Administração</p>
          <p className="truncate text-xs text-muted-foreground">Escola Iêda Alves de Oliveira</p>
        </div>
      </div>
      <Separator />
      <div className="flex-1 py-4">
        <p className="mb-2 px-5 text-[0.68rem] font-medium uppercase tracking-[0.15em] text-muted-foreground">
          Plataforma
        </p>
        <Navigation route={route} modules={modules} loading={loading} onNavigate={onNavigate} />
      </div>
      <div className="p-4">
        <div className="rounded-xl border bg-background/65 p-3">
          <div className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-primary" />
            <span className="text-xs font-medium">Ambiente de validação</span>
          </div>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            Acesso controlado. A liberação oficial permanece bloqueada.
          </p>
        </div>
      </div>
    </div>
  );
}

function LoadingWorkspace() {
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

function AdminShell({ identity }: { identity: Identity }) {
  const route = usePlatformRoute();
  const [loadState, setLoadState] = useState<LoadState>({ status: 'loading' });
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/platform/snapshot', {
      credentials: 'same-origin',
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          const payload = (await response.json().catch(() => ({}))) as {
            error?: string;
            correlationId?: string;
          };
          throw Object.assign(
            new Error(payload.error || 'Não foi possível carregar a plataforma.'),
            {
              correlationId: payload.correlationId,
            },
          );
        }
        return (await response.json()) as PlatformSnapshotContract;
      })
      .then((snapshot) => setLoadState({ status: 'ready', snapshot }))
      .catch((error: Error & { correlationId?: string }) => {
        if (error.name === 'AbortError') return;
        setLoadState({
          status: 'error',
          message: error.message || 'Não foi possível carregar a plataforma.',
          correlationId: error.correlationId,
        });
      });
    return () => controller.abort();
  }, []);

  const firstName = useMemo(
    () => identity.name?.trim().split(/\s+/u)[0] || 'Administrador',
    [identity.name],
  );
  const modules = loadState.status === 'ready' ? loadState.snapshot.coreModules : [];

  return (
    <div className="min-h-svh bg-muted/25 lg:grid lg:grid-cols-[264px_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-svh border-r lg:block">
        <SidebarContent route={route} modules={modules} loading={loadState.status === 'loading'} />
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-30 border-b bg-background/92 backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <div className="flex h-16 items-center gap-3 px-4 sm:px-6 lg:px-8">
            <Sheet open={mobileNavigationOpen} onOpenChange={setMobileNavigationOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="lg:hidden"
                  aria-label="Abrir navegação"
                >
                  <Menu />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-[290px] p-0 sm:max-w-[290px]">
                <SheetHeader className="sr-only">
                  <SheetTitle>Navegação</SheetTitle>
                  <SheetDescription>Áreas do Centro de Administração</SheetDescription>
                </SheetHeader>
                <SidebarContent
                  route={route}
                  modules={modules}
                  loading={loadState.status === 'loading'}
                  onNavigate={() => setMobileNavigationOpen(false)}
                />
              </SheetContent>
            </Sheet>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>Centro</span>
                <span>/</span>
                <span className="truncate text-foreground">{routeLabels[route]}</span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="hidden text-right sm:block">
                <p className="max-w-48 truncate text-sm font-medium">
                  {identity.name || 'Administrador'}
                </p>
                <p className="text-xs text-muted-foreground">Administrador</p>
              </div>
              <Avatar className="size-8">
                <AvatarFallback className="text-xs">{initials(identity.name)}</AvatarFallback>
              </Avatar>
              <form method="post" action="/auth/logout">
                <Button variant="outline" size="sm" type="submit">
                  <LogOut />
                  <span className="hidden sm:inline">Sair</span>
                </Button>
              </form>
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {loadState.status === 'loading' && <LoadingWorkspace />}

          {loadState.status === 'error' && (
            <Card className="max-w-2xl">
              <CardHeader>
                <div className="mb-3 grid size-10 place-items-center rounded-xl border bg-muted/35">
                  <Activity className="size-4 text-muted-foreground" />
                </div>
                <CardTitle>Não foi possível carregar o Centro</CardTitle>
                <CardDescription className="leading-6">{loadState.message}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap items-center gap-3">
                <Button variant="outline" onClick={() => window.location.reload()}>
                  Tentar novamente
                </Button>
                {loadState.correlationId && (
                  <span className="font-mono text-xs text-muted-foreground">
                    Correlação: {loadState.correlationId}
                  </span>
                )}
              </CardContent>
            </Card>
          )}

          {loadState.status === 'ready' && (
            <>
              {route === 'visao-geral' && (
                <div className="mb-6 flex items-center gap-2 text-sm text-muted-foreground">
                  <Sparkles className="size-4 text-primary" />
                  <span>Olá, {firstName}. Este é o núcleo administrativo em validação.</span>
                </div>
              )}
              <PageContent route={route} snapshot={loadState.snapshot} />
              <footer className="mt-8 flex flex-col gap-1 border-t pt-5 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                <span>Núcleo {loadState.snapshot.version}</span>
                <span>Dados consultados em {formatDate(loadState.snapshot.generatedAt)}</span>
                <span className="font-mono">
                  {shortCorrelation(loadState.snapshot.correlationId)}
                </span>
              </footer>
            </>
          )}
        </main>
      </div>
    </div>
  );
}

export function App() {
  const [identity, setIdentity] = useState<Identity | null>(null);

  useEffect(() => {
    fetch('/api/me', { credentials: 'same-origin', cache: 'no-store' })
      .then(async (response) =>
        response.ok ? ((await response.json()) as Identity) : { authenticated: false },
      )
      .then(setIdentity)
      .catch(() => setIdentity({ authenticated: false }));
  }, []);

  if (identity === null) return <LoginExperience loading />;
  if (!identity.authenticated) return <LoginExperience loading={false} />;
  if (!identity.roles?.includes('ADMINISTRADOR')) {
    return <RestrictedExperience name={identity.name} />;
  }
  return <AdminShell identity={identity} />;
}
