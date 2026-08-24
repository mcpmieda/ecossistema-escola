import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Boxes,
  LoaderCircle,
  LockKeyhole,
  LogOut,
  Menu,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import {
  normalizePlatformRoute,
  type PlatformCapability,
  type PlatformRoute,
  type PlatformSnapshotContract,
} from '../shared/platform-contract';
import { SidebarContent } from './platform/navigation';
import { LoadingWorkspace, PageContent } from './platform/pages';
import { BrandMark, formatDate, initials, shortCorrelation } from './platform/presentation';
import { routeLabels } from './platform/routes';
import { PlatformSearch } from './platform/search';

type Identity = {
  authenticated: boolean;
  name?: string;
  roles?: string[];
  capabilities?: PlatformCapability[];
};

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; snapshot: PlatformSnapshotContract }
  | { status: 'error'; message: string; correlationId?: string };

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
            {name ? `${name}, sua conta está autenticada.` : 'Sua conta está autenticada.'} A sessão
            atual não possui as capabilities administrativas necessárias para abrir esta candidata.
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
  const snapshot = loadState.status === 'ready' ? loadState.snapshot : null;

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

            <div className="min-w-0 flex-1 md:max-w-48">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>Centro</span>
                <span>/</span>
                <span className="truncate text-foreground">{routeLabels[route]}</span>
              </div>
            </div>

            <PlatformSearch snapshot={snapshot} />

            <div className="flex shrink-0 items-center gap-3">
              <div className="hidden text-right xl:block">
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
  if (!identity.capabilities?.includes('platform.snapshot.read')) {
    return <RestrictedExperience name={identity.name} />;
  }
  return <AdminShell identity={identity} />;
}
