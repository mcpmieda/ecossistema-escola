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
import { Activity, Boxes, ChevronDown, LockKeyhole, LogOut, Menu, ShieldCheck } from 'lucide-react';
import {
  normalizePlatformRoute,
  type PlatformCapability,
  type PlatformRoute,
  type PlatformSnapshotContract,
} from '../shared/platform-contract';
import { AuditWorkspacePage } from './features/gradebook/audit-workspace/audit-workspace-page';
import { OperationalWorkspacePage } from './features/gradebook/operational-workspace/operational-workspace-page';
import { SidebarContent } from './platform/navigation';
import { LoadingWorkspace, PageContent } from './platform/pages';
import { BrandMark, formatDate, initials } from './platform/presentation';
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

type AuthFailure = { correlationId?: string };

function authFailureFromUrl(): AuthFailure | null {
  const params = new URLSearchParams(window.location.search);
  if (params.get('authError') !== '1') return null;
  const correlationId = params.get('correlationId')?.trim();
  return { correlationId: correlationId || undefined };
}

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

function SessionCheckExperience() {
  return (
    <main
      className="platform-shell grid min-h-svh place-items-center p-6"
      aria-busy="true"
      aria-label="Carregando Centro de Administração"
    >
      <div className="flex items-center gap-3 text-muted">
        <BrandMark compact />
        <Spinner size="sm" color="accent" />
      </div>
    </main>
  );
}

function LoginExperience({ loading }: { loading: boolean }) {
  return (
    <main className="platform-shell grid min-h-svh place-items-center px-4 py-6 sm:px-6 lg:px-8">
      <Surface className="login-stage grid w-full max-w-5xl overflow-hidden rounded-[2rem] border border-border/70 lg:grid-cols-[1.08fr_.92fr]">
        <Surface
          variant="secondary"
          className="login-intro hidden min-h-[600px] flex-col justify-between rounded-none border-0 p-10 shadow-none lg:flex"
        >
          <div>
            <BrandMark />
            <Chip className="mt-10" variant="soft" color="accent" size="sm">
              Escola Iêda Alves de Oliveira MCPM
            </Chip>
            <h1 className="mt-6 max-w-xl text-4xl font-semibold tracking-[-0.05em]">
              Centro de Administração
            </h1>
            <p className="mt-4 max-w-xl text-base leading-7 text-muted">
              Uma plataforma administrativa modular e protegida para operar os sistemas da escola em
              uma única experiência.
            </p>
          </div>

          <div className="grid max-w-xl gap-3 text-sm">
            {[
              [ShieldCheck, 'Acesso institucional protegido'],
              [Boxes, 'Módulos integrados à mesma experiência'],
              [Activity, 'Operação rastreável e evolutiva'],
            ].map(([Icon, label]) => {
              const FeatureIcon = Icon as typeof ShieldCheck;
              return (
                <Surface
                  key={label as string}
                  variant="default"
                  className="stagger-item flex items-center gap-3 rounded-2xl border border-border/70 px-4 py-3"
                >
                  <FeatureIcon className="size-4 text-muted" />
                  <span>{label as string}</span>
                </Surface>
              );
            })}
          </div>
        </Surface>

        <Surface
          variant="default"
          className="flex min-h-[560px] items-center rounded-none border-0 px-6 py-12 shadow-none sm:px-12 lg:min-h-[600px]"
        >
          <div className="mx-auto w-full max-w-sm">
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
              Use sua conta institucional da escola para continuar.
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
    </main>
  );
}

function AuthErrorExperience({ correlationId }: AuthFailure) {
  return (
    <main className="platform-shell grid min-h-svh place-items-center p-4 sm:p-6">
      <Surface
        variant="default"
        className="platform-card-surface w-full max-w-xl rounded-[2rem] p-6 sm:p-8"
      >
        <Chip color="danger" variant="soft" size="sm">
          Entrada não concluída
        </Chip>
        <Alert status="danger" className="mt-5">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>Não foi possível concluir sua entrada.</Alert.Title>
            <Alert.Description>
              A tentativa anterior foi encerrada com segurança. Inicie uma nova entrada para
              continuar.
            </Alert.Description>
          </Alert.Content>
        </Alert>
        <Button
          variant="primary"
          size="lg"
          fullWidth
          className="mt-6"
          onPress={() => window.location.assign('/auth/login')}
        >
          <MicrosoftMark />
          Entrar novamente
        </Button>
        {correlationId && (
          <p className="mt-5 break-all text-xs leading-5 text-muted">
            Correlação: <span className="font-mono">{correlationId}</span>
          </p>
        )}
      </Surface>
    </main>
  );
}

function RestrictedExperience({ name }: { name?: string }) {
  return (
    <main className="platform-shell grid min-h-svh place-items-center p-4">
      <Surface
        variant="default"
        className="platform-card-surface w-full max-w-2xl rounded-[2rem] p-6 sm:p-8"
      >
        <Chip color="warning" variant="soft" size="sm">
          Acesso restrito
        </Chip>
        <Alert status="warning" className="mt-5">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>Você não tem acesso a esta área</Alert.Title>
            <Alert.Description>
              {name ? `${name}, sua conta está autenticada.` : 'Sua conta está autenticada.'} Seu
              perfil não possui as permissões necessárias para acessar o Centro de Administração.
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
      <aside className="sticky top-0 z-20 hidden h-svh border-r border-border/60 lg:block">
        <SidebarContent
          route={route}
          modules={modules}
          loading={loadState.status === 'loading'}
        />
      </aside>

      <div className="min-w-0">
        <Surface variant="default" className="platform-topbar sticky top-0 z-30 rounded-none">
          <div className="flex min-h-[72px] flex-wrap items-center gap-3 px-4 py-2 sm:px-6 lg:h-[72px] lg:px-8 lg:py-0">
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

            <Breadcrumbs className="min-w-0 flex-1 overflow-hidden">
              <Breadcrumbs.Item href="#/visao-geral">Centro</Breadcrumbs.Item>
              <Breadcrumbs.Item>{routeLabels[route]}</Breadcrumbs.Item>
            </Breadcrumbs>

            <PlatformSearch snapshot={snapshot} />

            <form ref={logoutFormRef} method="post" action="/auth/logout" className="hidden" />
            <Dropdown>
              <Button
                variant="ghost"
                size="md"
                className="profile-menu-trigger shrink-0 gap-2 px-2.5"
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
                  <span className="block max-w-40 truncate text-xs font-normal text-muted">
                    Administrador
                  </span>
                </span>
                <ChevronDown className="hidden size-4 text-muted sm:block" />
              </Button>
              <Dropdown.Popover className="min-w-72">
                <Dropdown.Menu
                  aria-label="Conta e sessão"
                  onAction={(key) => {
                    if (key === 'logout') logoutFormRef.current?.requestSubmit();
                  }}
                >
                  <Dropdown.Item
                    id="identity"
                    textValue="Perfil atual"
                    isDisabled
                    className="profile-menu-identity"
                  >
                    <div className="profile-menu-item-content">
                      <Avatar size="sm" color="accent" variant="soft">
                        <Avatar.Fallback>{initials(identity.name)}</Avatar.Fallback>
                      </Avatar>
                      <div className="profile-menu-copy">
                        <Label className="max-w-52 truncate">
                          {identity.name || 'Administrador'}
                        </Label>
                        <Description className="max-w-52 truncate">
                          Administrador · sessão institucional
                        </Description>
                      </div>
                    </div>
                  </Dropdown.Item>
                  <Separator />
                  <Dropdown.Item id="logout" textValue="Sair" variant="danger">
                    <div className="profile-menu-item-content">
                      <LogOut className="size-4 shrink-0" />
                      <div className="profile-menu-copy">
                        <Label>Sair</Label>
                        <Description>Encerrar a sessão institucional</Description>
                      </div>
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
              variant="default"
              className="platform-card-surface max-w-3xl rounded-[2rem] p-5 sm:p-7"
            >
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
                  <ShieldCheck className="size-4" />
                  Olá, {firstName}. O Centro de Administração está disponível.
                </Chip>
              )}
              <PageContent route={route} snapshot={loadState.snapshot} />
              {route === 'banco-de-notas' && <OperationalWorkspacePage />}
              {route === 'banco-de-notas' && <AuditWorkspacePage />}
              <Separator className="mt-8" />
              <footer className="grid gap-2 pt-5 text-xs text-muted sm:grid-cols-2 sm:items-center">
                <span>Centro de Administração · Escola Iêda Alves de Oliveira</span>
                <span className="sm:text-right">
                  Atualizado em {formatDate(loadState.snapshot.generatedAt)}
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
  const authFailure = authFailureFromUrl();

  useEffect(() => {
    fetch('/api/me', { credentials: 'same-origin', cache: 'no-store' })
      .then(async (response) =>
        response.ok ? ((await response.json()) as Identity) : { authenticated: false },
      )
      .then(setIdentity)
      .catch(() => setIdentity({ authenticated: false }));
  }, []);

  if (identity === null) return <SessionCheckExperience />;
  if (authFailure && !identity.authenticated) {
    return <AuthErrorExperience correlationId={authFailure.correlationId} />;
  }
  if (!identity.authenticated) return <LoginExperience loading={false} />;
  if (!identity.capabilities?.includes('platform.snapshot.read')) {
    return <RestrictedExperience name={identity.name} />;
  }
  return <AdminShell identity={identity} />;
}