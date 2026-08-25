import { useEffect } from 'react';
import {
  Alert,
  Chip,
  Label,
  ListBox,
  ScrollShadow,
  Separator,
  Skeleton,
  Surface,
} from '@heroui/react';
import type { CoreModuleContract, PlatformRoute } from '../../shared/platform-contract';
import { BrandMark } from './presentation';
import { platformHref, routeIcons } from './routes';

function Navigation({
  route,
  modules,
  loading,
}: {
  route: PlatformRoute;
  modules: CoreModuleContract[];
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="grid gap-2 px-4">
        {Array.from({ length: 7 }).map((_, index) => (
          <Skeleton className="h-12 w-full rounded-2xl" key={index} />
        ))}
      </div>
    );
  }

  return (
    <ListBox
      aria-label="Navegação principal"
      className="platform-nav px-3"
      selectionMode="single"
      selectedKeys={new Set([route])}
    >
      {modules.map((module) => {
        const Icon = routeIcons[module.route];
        return (
          <ListBox.Item
            id={module.route}
            key={module.id}
            href={platformHref(module.route)}
            textValue={module.name}
            className="platform-nav__item"
          >
            {({ isSelected }) => (
              <>
                <Surface
                  variant={isSelected ? 'tertiary' : 'transparent'}
                  className="platform-nav__icon grid size-9 shrink-0 place-items-center rounded-xl"
                >
                  <Icon className="size-4" />
                </Surface>
                <Label className="min-w-0 flex-1 truncate">{module.name}</Label>
                {module.state === 'planned' ? (
                  <Chip variant="soft" size="sm" className="platform-nav__planned">
                    Em breve
                  </Chip>
                ) : null}
              </>
            )}
          </ListBox.Item>
        );
      })}
    </ListBox>
  );
}

export function SidebarContent({
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
  useEffect(() => {
    if (!onNavigate) return;
    const closeAfterNavigation = () => onNavigate();
    window.addEventListener('hashchange', closeAfterNavigation);
    return () => window.removeEventListener('hashchange', closeAfterNavigation);
  }, [onNavigate]);

  return (
    <Surface
      variant="default"
      className="sidebar-surface flex h-full min-h-0 flex-col rounded-none border-0 text-foreground"
    >
      <div className="flex min-h-24 items-center gap-3 px-5 py-5">
        <BrandMark compact />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold tracking-[-0.025em]">
            Centro de Administração
          </p>
          <p className="mt-0.5 truncate text-xs text-muted">Escola Iêda Alves de Oliveira</p>
        </div>
      </div>

      <Separator />

      <ScrollShadow className="flex-1 py-5">
        <div className="mb-3 flex items-center justify-between px-6">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-muted">
            Plataforma
          </p>
          <Chip color="accent" variant="soft" size="sm">
            v1
          </Chip>
        </div>
        <Navigation route={route} modules={modules} loading={loading} />
      </ScrollShadow>

      <div className="p-4 pt-2">
        <Alert status="warning" className="sidebar-validation-alert">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>Ambiente de validação</Alert.Title>
            <Alert.Description>
              Acesso controlado. A liberação oficial permanece bloqueada.
            </Alert.Description>
          </Alert.Content>
        </Alert>
      </div>
    </Surface>
  );
}
