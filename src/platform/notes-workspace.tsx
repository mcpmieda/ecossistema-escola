import { useRef } from 'react';
import {
  Alert,
  Avatar,
  Breadcrumbs,
  Button,
  Description,
  Drawer,
  Dropdown,
  Label,
  Separator,
  Surface,
  useOverlayState,
} from '@heroui/react';
import { ArrowLeft, ChevronDown, LogOut, Menu } from 'lucide-react';
import type { PlatformSnapshotContract } from '../../shared/platform-contract';
import { SidebarContent } from './navigation';
import { LoadingWorkspace } from './pages';
import { initials } from './presentation';
import { PlatformSearch } from './search';
import { NotesPage } from './notes-page';

type NotesWorkspaceProps = {
  identityName?: string;
  snapshot: PlatformSnapshotContract | null;
  loading: boolean;
  error?: { message: string; correlationId?: string };
};

export function NotesWorkspace({
  identityName,
  snapshot,
  loading,
  error,
}: NotesWorkspaceProps) {
  const logoutFormRef = useRef<HTMLFormElement>(null);
  const mobileNavigationState = useOverlayState();
  const modules = snapshot?.coreModules ?? [];

  const returnToCenter = () => {
    window.location.hash = '#/visao-geral';
  };

  return (
    <div className="platform-shell min-h-svh lg:grid lg:grid-cols-[280px_minmax(0,1fr)]">
      <aside className="sticky top-0 z-20 hidden h-svh border-r border-border/60 lg:block">
        <SidebarContent
          route="banco-de-notas"
          modules={modules}
          loading={loading}
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
                <Drawer.Content
                  placement="left"
                  className="h-dvh max-h-dvh w-[min(88vw,320px)] max-w-none rounded-none"
                >
                  <Drawer.Dialog
                    aria-label="Navegação do Centro"
                    className="h-dvh max-h-dvh rounded-none p-0"
                  >
                    <Drawer.CloseTrigger />
                    <Drawer.Body className="p-0">
                      <SidebarContent
                        route="banco-de-notas"
                        modules={modules}
                        loading={loading}
                        onNavigate={mobileNavigationState.close}
                      />
                    </Drawer.Body>
                  </Drawer.Dialog>
                </Drawer.Content>
              </Drawer.Backdrop>
            </Drawer>

            <Button
              variant="outline"
              size="md"
              isIconOnly
              className="sm:hidden"
              aria-label="Voltar ao Centro de Administração"
              onPress={returnToCenter}
            >
              <ArrowLeft />
            </Button>

            <Breadcrumbs className="min-w-0 flex-1 overflow-hidden">
              <Breadcrumbs.Item href="#/visao-geral">Centro</Breadcrumbs.Item>
              <Breadcrumbs.Item>Banco de notas</Breadcrumbs.Item>
            </Breadcrumbs>

            <Button
              variant="outline"
              size="sm"
              className="hidden shrink-0 sm:flex"
              onPress={returnToCenter}
            >
              <ArrowLeft className="size-4" />
              Voltar ao Centro
            </Button>

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
                    {initials(identityName)}
                  </Avatar.Fallback>
                </Avatar>
                <span className="hidden min-w-0 text-left lg:block">
                  <span className="block max-w-40 truncate text-sm font-medium">
                    {identityName || 'Administrador'}
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
                        <Avatar.Fallback>{initials(identityName)}</Avatar.Fallback>
                      </Avatar>
                      <div className="profile-menu-copy">
                        <Label className="max-w-52 truncate">
                          {identityName || 'Administrador'}
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
          {loading && <LoadingWorkspace />}

          {error && (
            <Surface
              variant="default"
              className="platform-card-surface max-w-3xl rounded-[2rem] p-5 sm:p-7"
            >
              <Alert status="danger">
                <Alert.Indicator />
                <Alert.Content>
                  <Alert.Title>Não foi possível carregar o Banco de notas</Alert.Title>
                  <Alert.Description>{error.message}</Alert.Description>
                </Alert.Content>
              </Alert>
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <Button variant="outline" onPress={() => window.location.reload()}>
                  Tentar novamente
                </Button>
                {error.correlationId && (
                  <span className="font-mono text-xs text-muted">
                    Correlação: {error.correlationId}
                  </span>
                )}
              </div>
            </Surface>
          )}

          {!loading && !error && snapshot && <NotesPage />}
        </main>
      </div>
    </div>
  );
}
