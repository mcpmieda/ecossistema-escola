import { Avatar, Button, Card, Chip, Drawer, Spinner, useOverlayState } from '@heroui/react';
import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Boxes,
  Command,
  LockKeyhole,
  LogOut,
  Menu,
  Orbit,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import {
  normalizePlatformRoute,
  type PlatformCapability,
  type PlatformRoute,
  type PlatformSnapshotContract,
} from '../shared/platform-contract';
import { AmbientConstellation, LivingSurface } from './platform/ambient';
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
    <main className="hero-shell relative min-h-svh overflow-hidden px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
      <AmbientConstellation intensity="strong" parallax />
      <div className="pointer-events-none absolute left-[8%] top-[18%] size-52 rounded-full border border-accent/10 sm:size-72" />
      <div className="pointer-events-none absolute bottom-[8%] right-[5%] size-72 rounded-full border border-white/5 sm:size-[28rem]" />

      <div className="relative z-10 mx-auto flex min-h-[calc(100svh-2.5rem)] max-w-7xl items-center justify-center lg:min-h-[calc(100svh-4rem)]">
        <div className="hero-glass hero-page-enter grid w-full max-w-6xl overflow-hidden rounded-[2rem] lg:grid-cols-[1.15fr_.85fr]">
          <section className="relative hidden min-h-[690px] overflow-hidden border-r border-border/70 p-12 lg:flex lg:flex-col lg:justify-between xl:p-14">
            <AmbientConstellation intensity="strong" parallax />
            <div className="relative z-10">
              <div className="flex items-center gap-3">
                <BrandMark />
                <div>
                  <p className="text-sm font-semibold tracking-[-0.02em]">Escola Iêda Alves</p>
                  <p className="text-xs text-muted-foreground">Ecossistema administrativo</p>
                </div>
              </div>

              <div className="mt-16 max-w-2xl">
                <Chip variant="soft" color="accent" size="sm" className="mb-5">
                  <Sparkles className="mr-1 size-3" />
                  Centro de Administração
                </Chip>
                <h1 className="hero-gradient-text text-6xl font-semibold leading-[0.96] tracking-[-0.065em] xl:text-7xl">
                  Gestão com presença. Controle com clareza.
                </h1>
                <p className="mt-7 max-w-xl text-base leading-7 text-muted-foreground">
                  Uma experiência institucional única para operar, acompanhar e evoluir o núcleo
                  administrativo da escola.
                </p>
              </div>
            </div>

            <div className="relative z-10 grid grid-cols-3 gap-3">
              {[
                { icon: ShieldCheck, label: 'Protegido', detail: 'Entra + BFF' },
                { icon: Boxes, label: 'Modular', detail: 'Contratos versionados' },
                { icon: Activity, label: 'Observável', detail: 'Operação rastreável' },
              ].map(({ icon: Icon, label, detail }) => (
                <div key={label} className="hero-glass--quiet living-card rounded-2xl p-4">
                  <Icon className="size-4 text-accent" />
                  <p className="mt-5 text-sm font-semibold">{label}</p>
                  <p className="mt-1 text-[0.7rem] text-muted-foreground">{detail}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="relative flex min-h-[620px] items-center overflow-hidden px-6 py-10 sm:px-12 lg:min-h-[690px]">
            <AmbientConstellation intensity="soft" />
            <div className="relative z-10 mx-auto w-full max-w-sm">
              <div className="mb-10 flex items-center gap-3 lg:hidden">
                <BrandMark />
                <div>
                  <p className="text-sm font-semibold">Centro de Administração</p>
                  <p className="text-xs text-muted-foreground">Escola Iêda Alves de Oliveira</p>
                </div>
              </div>

              <div className="hero-kicker">
                <Orbit className="size-3.5" />
                Acesso institucional
              </div>
              <h2 className="mt-4 text-4xl font-semibold tracking-[-0.05em]">
                {loading ? 'Sincronizando sua sessão' : 'Entre no seu espaço'}
              </h2>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                Sua conta institucional abre o Centro com as capabilities atribuídas à sua sessão.
              </p>

              {loading ? (
                <div
                  className="hero-glass--quiet hero-loading-bar mt-8 flex h-12 items-center justify-center gap-2 rounded-xl text-sm font-medium text-muted-foreground"
                  role="status"
                >
                  <Spinner size="sm" />
                  Verificando acesso…
                </div>
              ) : (
                <a
                  href="/auth/login"
                  className="button button--primary button--lg mt-8 flex h-12 w-full items-center justify-center gap-2 rounded-xl no-underline"
                >
                  <MicrosoftMark />
                  Entrar com conta institucional
                </a>
              )}

              <div className="hero-glass--quiet mt-6 flex items-start gap-3 rounded-2xl p-4 text-xs leading-5 text-muted-foreground">
                <LockKeyhole className="mt-0.5 size-4 shrink-0 text-accent" />
                <p>O Centro não solicita nem armazena sua senha institucional.</p>
              </div>

              <div className="mt-8 flex items-center gap-2 text-[0.68rem] text-muted-foreground">
                <span className="hero-status-orb" />
                Ambiente de validação protegido
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

function RestrictedExperience({ name }: { name?: string }) {
  return (
    <main className="hero-shell relative grid min-h-svh place-items-center overflow-hidden p-4">
      <AmbientConstellation intensity="strong" parallax />
      <Card variant="secondary" className="hero-glass hero-page-enter relative z-10 w-full max-w-xl rounded-[1.8rem]">
        <Card.Header className="p-7 pb-3 sm:p-8 sm:pb-3">
          <Chip variant="soft" color="warning" size="sm" className="mb-4 w-fit">
            Validação restrita
          </Chip>
          <Card.Title className="text-3xl tracking-[-0.045em]">Acesso ainda não liberado</Card.Title>
          <Card.Description className="mt-3 max-w-lg leading-6">
            {name ? `${name}, sua conta está autenticada.` : 'Sua conta está autenticada.'} A sessão
            atual não possui as capabilities administrativas necessárias para abrir esta candidata.
          </Card.Description>
        </Card.Header>
        <Card.Content className="px-7 pb-7 pt-4 sm:px-8 sm:pb-8">
          <form method="post" action="/auth/logout">
            <Button variant="outline" type="submit">
              <LogOut className="size-4" />
              Sair
            </Button>
          </form>
        </Card.Content>
      </Card>
    </main>
  );
}

function AdminShell({ identity }: { identity: Identity }) {
  const route = usePlatformRoute();
  const [loadState, setLoadState] = useState<LoadState>({ status: 'loading' });
  const mobileNavigation = useOverlayState();

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
            { correlationId: payload.correlationId },
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
    <div className="hero-shell min-h-svh lg:grid lg:grid-cols-[280px_minmax(0,1fr)]">
      <AmbientConstellation intensity="soft" parallax />

      <aside className="sticky top-0 z-20 hidden h-svh lg:block">
        <SidebarContent route={route} modules={modules} loading={loadState.status === 'loading'} />
      </aside>

      <div className="relative z-10 min-w-0">
        <header className="hero-topbar sticky top-0 z-30">
          <div className="flex h-[76px] items-center gap-3 px-4 sm:px-6 lg:px-8">
            <Drawer state={mobileNavigation}>
              <Button
                variant="outline"
                isIconOnly
                className="lg:hidden"
                aria-label="Abrir navegação"
              >
                <Menu className="size-4" />
              </Button>
              <Drawer.Backdrop variant="blur">
                <Drawer.Content placement="left">
                  <Drawer.Dialog className="h-full w-[min(88vw,320px)] overflow-hidden rounded-r-[1.8rem] border-r border-border bg-background p-0">
                    <Drawer.CloseTrigger />
                    <Drawer.Header className="sr-only">
                      <Drawer.Heading>Navegação</Drawer.Heading>
                    </Drawer.Header>
                    <Drawer.Body className="h-full p-0">
                      <SidebarContent
                        route={route}
                        modules={modules}
                        loading={loadState.status === 'loading'}
                        onNavigate={() => mobileNavigation.close()}
                      />
                    </Drawer.Body>
                  </Drawer.Dialog>
                </Drawer.Content>
              </Drawer.Backdrop>
            </Drawer>

            <div className="min-w-0 flex-1 md:max-w-52">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Command className="size-3.5 text-accent" />
                <span>Centro</span>
                <span className="text-border">/</span>
                <span className="truncate font-medium text-foreground">{routeLabels[route]}</span>
              </div>
            </div>

            <PlatformSearch snapshot={snapshot} />

            <div className="flex shrink-0 items-center gap-2 sm:gap-3">
              <div className="hidden text-right xl:block">
                <p className="max-w-48 truncate text-sm font-semibold tracking-[-0.02em]">
                  {identity.name || 'Administrador'}
                </p>
                <p className="text-[0.68rem] text-muted-foreground">Administrador</p>
              </div>
              <Avatar size="sm" variant="soft" color="accent" className="ring-1 ring-accent/20">
                <Avatar.Fallback className="text-[0.68rem] font-bold">{initials(identity.name)}</Avatar.Fallback>
              </Avatar>
              <form method="post" action="/auth/logout">
                <Button variant="ghost" size="sm" type="submit" aria-label="Sair">
                  <LogOut className="size-4" />
                  <span className="hidden sm:inline">Sair</span>
                </Button>
              </form>
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {loadState.status === 'loading' && <LoadingWorkspace />}

          {loadState.status === 'error' && (
            <Card variant="secondary" className="hero-glass hero-page-enter max-w-2xl rounded-[1.7rem]">
              <Card.Header className="p-7 pb-3">
                <div className="hero-glass--quiet mb-4 grid size-11 place-items-center rounded-2xl">
                  <Activity className="size-4 text-danger" />
                </div>
                <Card.Title className="text-2xl tracking-[-0.035em]">Não foi possível carregar o Centro</Card.Title>
                <Card.Description className="mt-2 leading-6">{loadState.message}</Card.Description>
              </Card.Header>
              <Card.Content className="flex flex-wrap items-center gap-3 px-7 pb-7 pt-3">
                <Button variant="outline" onPress={() => window.location.reload()}>
                  Tentar novamente
                </Button>
                {loadState.correlationId && (
                  <span className="font-mono text-xs text-muted-foreground">
                    Correlação: {loadState.correlationId}
                  </span>
                )}
              </Card.Content>
            </Card>
          )}

          {loadState.status === 'ready' && (
            <div key={route} className="hero-page-enter">
              {route === 'visao-geral' && (
                <LivingSurface className="mb-6 rounded-2xl px-4 py-3.5" parallax>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-2 text-sm">
                      <Sparkles className="size-4 text-accent" />
                      <span>
                        Olá, <strong className="font-semibold text-foreground">{firstName}</strong>. O
                        núcleo administrativo está em validação.
                      </span>
                    </div>
                    <Chip variant="soft" color="success" size="sm">
                      <span className="mr-1.5 hero-status-orb" />
                      Núcleo disponível
                    </Chip>
                  </div>
                </LivingSurface>
              )}

              <PageContent route={route} snapshot={loadState.snapshot} />

              <footer className="mt-9 flex flex-col gap-2 border-t border-border/70 pt-5 text-[0.68rem] text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                <span>Núcleo {loadState.snapshot.version}</span>
                <span>Dados consultados em {formatDate(loadState.snapshot.generatedAt)}</span>
                <span className="font-mono">{shortCorrelation(loadState.snapshot.correlationId)}</span>
              </footer>
            </div>
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
