import { Chip, ScrollShadow, Separator, Skeleton, Surface } from '@heroui/react';
import type { CoreModuleContract, PlatformRoute } from '../../shared/platform-contract';
import { BrandMark } from './presentation';
import { platformHref, routeIcons } from './routes';

const notesModule: CoreModuleContract = {
  id: 'content.notes',
  name: 'Banco de notas',
  description: '',
  route: 'banco-de-notas',
  state: 'ready',
  requiredRole: 'ADMINISTRADOR',
  capabilities: [],
};

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
      <div className="grid gap-2 px-4">
        {Array.from({ length: 7 }).map((_, index) => (
          <Skeleton className="h-12 w-full rounded-2xl" key={index} />
        ))}
      </div>
    );
  }

  return (
    <nav aria-label="Navegação principal" className="platform-nav px-3">
      <ul className="grid gap-[0.3rem]">
        {[...modules, notesModule].map((module) => {
          const Icon = routeIcons[module.route];
          const isSelected = route === module.route;
          return (
            <li key={module.id}>
              <a
                href={platformHref(module.route)}
                aria-current={isSelected ? 'page' : undefined}
                data-selected={isSelected ? 'true' : undefined}
                className="platform-nav__item flex w-full items-center no-underline"
                onClick={onNavigate}
              >
                <Surface
                  variant={isSelected ? 'tertiary' : 'transparent'}
                  className="platform-nav__icon grid size-9 shrink-0 place-items-center rounded-xl"
                >
                  <Icon className="size-4" />
                </Surface>
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{module.name}</span>
                {module.state === 'planned' ? (
                  <Chip variant="soft" size="sm" className="platform-nav__planned">
                    Em breve
                  </Chip>
                ) : null}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
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
  return (
    <Surface
      variant="default"
      className="sidebar-surface flex h-dvh min-h-dvh w-[min(88vw,320px)] flex-col rounded-none border-0 text-foreground lg:h-full lg:min-h-0 lg:w-auto"
    >
      <div className="flex h-[72px] min-h-[72px] items-center gap-3 px-5">
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
        <div className="mb-3 px-6">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-muted">
            Plataforma
          </p>
        </div>
        <Navigation route={route} modules={modules} loading={loading} onNavigate={onNavigate} />
      </ScrollShadow>
    </Surface>
  );
}
