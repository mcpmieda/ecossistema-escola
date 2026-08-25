import { useEffect, useMemo, useState } from 'react';
import { Drawer } from '@heroui/react';
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
import { AmbientConstellation } from '@/components/ambient-constellation';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
    <main className="platform-shell min-h-svh px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <AmbientConstellation className="fixed" intensity="strong" placement="right" />
      <div className="relative z-10 mx-auto flex min-h-[calc(100svh-3rem)] max-w-6xl items-center justify-center lg:min-h-[calc(100svh-4rem)]">
        <Card className="hero-surface w-full max-w-5xl gap-0 overflow-hidden p-0 lg:grid lg:grid-cols-[1.08fr_.92fr]">
          <section className="relative hidden min-h-[640px] overflow-hidden bg-accent p-12 text-accent-foreground lg:flex lg:flex-col lg:justify-between">
            <AmbientConstellation intensity="medium" placement="right" />
            <div className="relative z-10">
              <BrandMark />
              <p className="mt-10 text-xs font-semibold uppercase tracking-[0.18em] text-accent-foreground/65">
                Escola Iêda Alves de Oliveira MCPM
              </p>
              <h1 className="mt-5 max-w-md text-5xl font-semibold tracking-[-0.05em]">
                Centro de Administração
              </h1>
              <p className="mt-5 max-w-lg text-base leading-7 text-accent-foreground/76">
                Um único ambiente para operar, acompanhar e integrar os sistemas administrativos da
                escola.
              </p>
            </div>

            <div className="relative z-10 grid gap-3 text-sm text-accent-foreground/82">
              <div className="flex items-center gap-3 rounded-2xl border border-white/15 bg-white/8 px-4 py-3 backdrop-blur-sm">
                <ShieldCheck className="size-4" />
                <span>Acesso institucional protegido</span>
              </div>
              <div className="flex items-center gap-3 rounded-2xl border border-white/15 bg-white/8 px-4 py-3 backdrop-blur-sm">
                <Boxes className="size-4" />
                <span>Módulos integrados em uma única plataforma</span>
              </div>
              <div className="flex items-center gap-3 rounded-2xl border border-white/15 bg-white/8 px-4 py-3 backdrop-blur-sm">
                <Activity className="size-4" />
                <span>Operações rastreáveis e evolutivas</span>
              </div>
            </div>
          </section>

          <section className="flex min-h-[560px] items-center bg-surface/95 px-6 py-12 sm:px-12 lg:min-h-[640px]">
            <div className="mx-auto w-full max-w-sm">
              <div className="mb-10 flex items-center gap-3 lg:hidden">
                <BrandMark compact />
                <div>
                  <p className="text-sm font-semibold">Centro de Administração</p>
                  <p className="text-xs text-muted">Escola Iêda Alves de Oliveira</p>
                </div>
              </div>

              <Badge variant="secondary" className="mb-5">
                Acesso institucional
              </Badge>
              <h2 className="text-3xl font-semibold tracking-[-0.04em]">
                {loading ? 'Verificando sua sessão' : 'Entre para continuar'}
              </h2>
              <p className="mt-3 text-sm leading-6 text-muted">
                Use sua conta institucional. A autenticação é realizada pelo Microsoft Entra ID.
              </p>

              {loading ? (
                <div
                  className="mt-8 flex h-12 items-center justify-center gap-2 rounded-2xl border border-border bg-surface-secondary text-sm font-medium text-muted"
                  role="status"
                >
                  <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" />
                  Verificando acesso…
                </div>
              ) : (
                <Button asChild size="lg" className="mt-8 h-12 w-full">
                  <a href="/auth/login">
                    <MicrosoftMark />
                    Entrar com conta institucional
                  </a>
                </Button>
              )}

              <div className="mt-8 flex items-start gap-3 rounded-2xl border border-border bg-surface-secondary p-4 text-xs leading-5 text-muted">
                <LockKeyhole className="mt-0.5 size-4 shrink-0 text-foreground/70" />
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
    <main className="platform-shell grid min-h-svh place-items-center p-4">
      <AmbientConstellation className="fixed" intensity="medium" placement="right" />
      <Card className="hero-surface relative z-10 w-full max-w-xl">
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
    <div className="platform-shell min-h-svh lg:grid lg:grid-cols-[276px_minmax(0,1fr)]">
      <AmbientConstellation className="fixed" intensity="subtle" placement="right" />

      <aside className="dense-island sticky top-0 z-20 hidden h-svh border-y-0 border-l-0 bg-surface/94 lg:block">
        <SidebarContent route={route} modules={modules} loading={loadState.status === 'loading'} />
      </aside>

      <div className="relative z-10 min-w-0">
        <header className="glass-bar sticky top-0 z-30 border-b border-border/70">
          <div className="flex h-16 items-center gap-3 px-4 sm:px-6 lg:px-8">
            <Drawer>
              <Button
                variant="outline"
                size="icon"
                className="lg:hidden"
                aria-label="Abrir navegação"
                onPress={() => setMobileNavigationOpen(true)}
              >
                <Menu />
              </Button>
              <Drawer.Backdrop
                variant="blur"
                isOpen={mobileNavigationOpen}
                onOpenChange={setMobileNavigationOpen}
              >
                <Drawer.Content placement="left" className="max-w-[300px]">
                  <Drawer.Dialog
                    aria-label="Navegação do Centro"
                    className="h-full rounded-none p-0"
                  >
                    <Drawer.CloseTrigger />
                    <Drawer.Body className="p-0">
                      <SidebarContent
                        route={route}
                        modules={modules}
                        loading={loadState.status === 'loading'}
                        onNavigate={() => setMobileNavigationOpen(false)}
                      />
                    </Drawer.Body>
                  </Drawer.Dialog>
                </Drawer.Content>
              </Drawer.Backdrop>
            </Drawer>

            <div className="min-w-0 flex-1 md:max-w-52">
              <div className="flex items-center gap-2 text-xs text-muted">
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
                <p className="text-xs text-muted">Administrador</p>
              </div>
              <Avatar className="size-8" color="accent" variant="soft">
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
            <Card className="hero-surface max-w-2xl">
              <CardHeader>
                <div className="mb-3 grid size-10 place-items-center rounded-2xl border border-border bg-surface-secondary">
                  <Activity className="size-4 text-muted" />
                </div>
                <CardTitle>Não foi possível carregar o Centro</CardTitle>
                <CardDescription className="leading-6">{loadState.message}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap items-center gap-3">
                <Button variant="outline" onPress={() => window.location.reload()}>
                  Tentar novamente
                </Button>
                {loadState.correlationId && (
                  <span className="font-mono text-xs text-muted">
                    Correlação: {loadState.correlationId}
                  </span>
                )}
              </CardContent>
            </Card>
          )}

          {loadState.status === 'ready' && (
            <>
              {route === 'visao-geral' && (
                <div className="mb-6 flex items-center gap-2 text-sm text-muted">
                  <Sparkles className="size-4 text-accent" />
                  <span>Olá, {firstName}. Este é o núcleo administrativo em validação.</span>
                </div>
              )}
              <PageContent route={route} snapshot={loadState.snapshot} />
              <footer className="mt-8 flex flex-col gap-1 border-t border-border/70 pt-5 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
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
