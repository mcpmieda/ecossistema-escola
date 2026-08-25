import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Avatar,
  Breadcrumbs,
  Button,
  Chip,
  Description,
  Drawer,
  Dropdown,
  Label,
  Separator,
  Spinner,
  Surface,
  useOverlayState,
} from '@heroui/react';
import {
  Activity,
  Boxes,
  ChevronDown,
  LockKeyhole,
  LogOut,
  Menu,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { AmbientConstellation } from '@/components/ambient-constellation';
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
    <main className="platform-shell min-h-svh px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
      <AmbientConstellation className="fixed" intensity="strong" placement="center" />
      <div className="relative z-10 mx-auto flex min-h-[calc(100svh-2.5rem)] max-w-7xl items-center justify-center lg:min-h-[calc(100svh-3.5rem)]">
        <Surface className="login-stage grid w-full max-w-6xl overflow-hidden rounded-[2rem] border border-border/65 shadow-2xl lg:grid-cols-[1.16fr_.84fr]">
          <Surface
            variant="transparent"
            className="living-surface pro-spectrum relative hidden min-h-[660px] flex-col justify-between rounded-none border-0 p-12 text-[#203856] shadow-none lg:flex"
          >
            <AmbientConstellation intensity="strong" placement="center" />
            <div className="relative z-10">
              <BrandMark />
              <Chip className="mt-10" variant="soft" color="accent" size="sm">
                Escola Iêda Alves de Oliveira MCPM
              </Chip>
              <h1 className="mt-6 max-w-xl text-5xl font-semibold tracking-[-0.055em]">
                Centro de Administração
              </h1>
              <p className="mt-5 max-w-xl text-base leading-7 text-[#365B86]">
                Uma plataforma administrativa viva, modular e protegida para operar os sistemas da
                escola em uma única experiência.
              </p>
            </div>

            <div className="relative z-10 grid max-w-xl gap-3 text-sm text-[#365b86]">
              {[
                [ShieldCheck, 'Acesso institucional protegido'],
                [Boxes, 'Módulos integrados à mesma experiência'],
                [Activity, 'Operação rastreável e evolutiva'],
              ].map(([Icon, label]) => {
                const FeatureIcon = Icon as typeof ShieldCheck;
                return (
                  <Surface
                    key={label as string}
                    variant="transparent"
                    className="stagger-item flex items-center gap-3 rounded-2xl border border-white/45 bg-white/72 px-4 py-3"
                  >
                    <FeatureIcon className="size-4" />
                    <span>{label as string}</span>
                  </Surface>
                );
              })}
            </div>
          </Surface>

          <Surface
            variant="default"
            className="relative flex min-h-[620px] items-center overflow-hidden rounded-none border-0 px-6 py-12 shadow-none sm:px-12 lg:min-h-[660px]"
          >
            <AmbientConstellation intensity="medium" placement="right" />
            <div className="relative z-10 mx-auto w-full max-w-sm">
              <div className="mb-10 flex items-center gap-3 lg:hidden">
                <BrandMark compact />
                <div>
                  <p className="text-sm font-semibold">Centro de Administração</p>
                  <p className="text-xs text-muted">Escola Iêda Alves de Oliveira</p>
                </div>
              </div>

              <Chip color="accent" variant="soft" size="sm">
                Acesso institucional
              </Chip>
              <h2 className="mt-5 text-3xl font-semibold tracking-[-0.045em]">
                {loading ? 'Preparando seu acesso' : 'Entre para continuar'}
              </h2>
              <p className="mt-3 text-sm leading-6 text-muted">
                Use sua conta institucional. A autenticação continua sendo realizada pelo Microsoft
                Entra ID.
              </p>

              {loading ? (
                <Alert status="accent" className="mt-8">
                  <Alert.Indicator>
                    <Spinner size="sm" color="accent" />
                  </Alert.Indicator>
                  <Alert.Content>
                    <Alert.Title>Verificando sua sessão</Alert.Title>
                    <Alert.Description>
                      Estamos confirmando identidade e permissões administrativas.
                    </Alert.Description>
                  </Alert.Content>
                </Alert>
              ) : (
                <Button
                  variant="primary"
                  size="lg"
                  fullWidth
                  className="mt-8"
                  onPress={() => window.location.assign('/auth/login')}
                >
                  <MicrosoftMark />
                  Entrar com conta institucional
                </Button>
              )}

              <Surface
                variant="secondary"
                className="mt-8 flex items-start gap-3 rounded-2xl p-4 text-xs leading-5 text-muted"
              >
                <LockKeyhole className="mt-0.5 size-4 shrink-0 text-foreground/70" />
                <p>O Centro não solicita nem armazena sua senha institucional.</p>
              </Surface>
            </div>
          </Surface>
        </Surface>
      </div>
    </main>
  );
}

function RestrictedExperience({ name }: { name?: string }) {
  return (
    <main className="platform-shell grid min-h-svh place-items-center p-4">
      <AmbientConstellation className="fixed" intensity="strong" placement="center" />
      <Surface
        variant="default"
        className="living-surface relative z-10 w-full max-w-2xl rounded-[2rem] p-6 sm:p-8"
      >
        <AmbientConstellation intensity="strong" placement="right" />
        <Chip color="warning" variant="soft" size="sm">
          Validação restrita
        </Chip>
        <Alert status="warning" className="mt-5">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>Acesso ainda não liberado</Alert.Title>
            <Alert.Description>
              {name ? `${name}, sua conta está autenticada.` : 'Sua conta está autenticada.'} A
              sessão atual não possui as capabilities administrativas necessárias para abrir esta
              candidata.
            </Alert.Description>
          </Alert.Content>
        </Alert>
        <form method="post" action="/auth/logout" className="mt-6">
          <Button variant="outline" type="submit">
            <LogOut />
            Sair
          </Button>
        </form>
      </Surface>
    </main>
  );
}

function AdminShell({ identity }: { identity: Identity }) {
  const route = usePlatformRoute();
  const [loadState, setLoadState] = useState<LoadState>({ status: 'loading' });
  const mobileNavigationState = useOverlayState();
  const logoutFormRef = useRef<HTMLFormElement>(null);

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
    <div className="platform-shell min-h-svh lg:grid lg:grid-cols-[280px_minmax(0,1fr)]">
      <AmbientConstellation className="fixed" intensity="strong" placement="right" />

      <aside className="sticky top-0 z-20 hidden h-svh border-r border-border/60 lg:block">
        <SidebarContent route={route} modules={modules} loading={loadState.status === 'loading'} />
      </aside>

      <div className="relative z-10 min-w-0">
        <Surface variant="transparent" className="glass-bar sticky top-0 z-30 rounded-none">
          <div className="flex min-h-17 items-center gap-3 px-4 py-2 sm:px-6 lg:px-8">
            <Drawer state={mobileNavigationState}>
              <Button
                variant="outline"
                size="md"
                isIconOnly
                className="lg:hidden"
                aria-label="Abrir navegação"
              >
                <Menu />
              </Button>
              <Drawer.Backdrop variant="blur">
                <Drawer.Content placement="left" className="max-w-[320px]">
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
                        onNavigate={mobileNavigationState.close}
                      />
                    </Drawer.Body>
                  </Drawer.Dialog>
                </Drawer.Content>
              </Drawer.Backdrop>
            </Drawer>

            <Breadcrumbs className="min-w-0 flex-1">
              <Breadcrumbs.Item href="#/visao-geral">Centro</Breadcrumbs.Item>
              <Breadcrumbs.Item>{routeLabels[route]}</Breadcrumbs.Item>
            </Breadcrumbs>

            <PlatformSearch snapshot={snapshot} />

            <form ref={logoutFormRef} method="post" action="/auth/logout" className="hidden" />
            <Dropdown>
              <Dropdown.Trigger>
                <Button
                  variant="ghost"
                  size="md"
                  className="profile-menu-trigger shrink-0 px-2 sm:px-3"
                  aria-label="Abrir menu do perfil"
                >
                  <Avatar size="sm" color="accent" variant="soft">
                    <Avatar.Fallback className="text-xs font-medium">
                      {initials(identity.name)}
                    </Avatar.Fallback>
                  </Avatar>
                  <span className="hidden min-w-0 text-left lg:block">
                    <span className="block max-w-40 truncate text-sm font-medium">
                      {identity.name || 'Administrador'}
                    </span>
                    <span className="block text-xs font-normal text-muted">Administrador</span>
                  </span>
                  <ChevronDown className="hidden size-4 text-muted sm:block" />
                </Button>
              </Dropdown.Trigger>
              <Dropdown.Popover>
                <Dropdown.Menu
                  aria-label="Conta e sessão"
                  onAction={(key) => {
                    if (key === 'logout') logoutFormRef.current?.requestSubmit();
                  }}
                >
                  <Dropdown.Item id="identity" textValue="Perfil atual" isDisabled>
                    <Avatar size="sm" color="accent" variant="soft">
                      <Avatar.Fallback>{initials(identity.name)}</Avatar.Fallback>
                    </Avatar>
                    <div className="min-w-0">
                      <Label className="max-w-52 truncate">
                        {identity.name || 'Administrador'}
                      </Label>
                      <Description>Administrador · sessão institucional</Description>
                    </div>
                  </Dropdown.Item>
                  <Separator />
                  <Dropdown.Item id="logout" textValue="Sair" variant="danger">
                    <LogOut className="size-4" />
                    <div>
                      <Label>Sair</Label>
                      <Description>Encerrar a sessão institucional</Description>
                    </div>
                  </Dropdown.Item>
                </Dropdown.Menu>
              </Dropdown.Popover>
            </Dropdown>
          </div>
        </Surface>

        <main className="mx-auto w-full max-w-[1480px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {loadState.status === 'loading' && <LoadingWorkspace />}

          {loadState.status === 'error' && (
            <Surface
              variant="secondary"
              className="living-surface max-w-3xl rounded-[2rem] p-5 sm:p-7"
            >
              <AmbientConstellation intensity="strong" placement="right" />
              <Alert status="danger">
                <Alert.Indicator />
                <Alert.Content>
                  <Alert.Title>Não foi possível carregar o Centro</Alert.Title>
                  <Alert.Description>{loadState.message}</Alert.Description>
                </Alert.Content>
              </Alert>
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <Button variant="outline" onPress={() => window.location.reload()}>
                  Tentar novamente
                </Button>
                {loadState.correlationId && (
                  <Chip variant="soft" size="sm" className="font-mono">
                    Correlação: {loadState.correlationId}
                  </Chip>
                )}
              </div>
            </Surface>
          )}

          {loadState.status === 'ready' && (
            <div key={route} className="route-stage">
              {route === 'visao-geral' && (
                <Chip color="accent" variant="soft" className="mb-5">
                  <Sparkles className="size-4" />
                  Olá, {firstName}. O núcleo administrativo está ativo em validação.
                </Chip>
              )}
              <PageContent route={route} snapshot={loadState.snapshot} />
              <Separator className="mt-8" />
              <footer className="flex flex-col gap-1 pt-5 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
                <span>Núcleo {loadState.snapshot.version}</span>
                <span>Dados consultados em {formatDate(loadState.snapshot.generatedAt)}</span>
                <span className="font-mono">
                  {shortCorrelation(loadState.snapshot.correlationId)}
                </span>
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
