import { Link, ScrollShadow, Separator, Skeleton, Surface } from '@heroui/react';
import { cn } from '@/lib/utils';
import type { CoreModuleContract, PlatformRoute } from '../../shared/platform-contract';
import { BrandMark } from './presentation';
import { platformHref, routeIcons } from './routes';

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
      <div className="grid gap-2 px-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton className="h-11 w-full rounded-2xl" key={index} />
        ))}
      </div>
    );
  }

  return (
    <nav className="grid gap-1.5 px-3" aria-label="Navegação principal">
      {modules.map((module) => {
        const Icon = routeIcons[module.route];
        const active = route === module.route;
        return (
          <Link
            key={module.id}
            href={platformHref(module.route)}
            onPress={onNavigate}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'nav-link-living group flex min-h-11 w-full items-center gap-3 rounded-2xl px-3 text-sm font-medium no-underline',
              active
                ? 'bg-accent-soft text-accent shadow-sm'
                : 'text-muted hover:bg-surface-secondary hover:text-foreground',
            )}
          >
            <Surface
              variant={active ? 'tertiary' : 'secondary'}
              className={cn(
                'grid size-8 shrink-0 place-items-center rounded-xl border border-border/55 transition-[background-color,color,transform]',
                active ? 'text-accent' : 'text-muted group-hover:text-foreground',
              )}
            >
              <Icon className="size-3.5" />
            </Surface>
            <span className="min-w-0 flex-1 truncate">{module.name}</span>
            {module.state === 'planned' && (
              <span className="size-1.5 rounded-full bg-muted/45" aria-label="Planejado" />
            )}
          </Link>
        );
      })}
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
      variant="transparent"
      className="sidebar-surface flex h-full min-h-0 flex-col text-foreground"
    >
      <div className="flex h-20 items-center gap-3 px-5">
        <BrandMark compact />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold tracking-[-0.02em]">
            Centro de Administração
          </p>
          <p className="truncate text-xs text-muted">Escola Iêda Alves de Oliveira</p>
        </div>
      </div>
      <Separator />
      <ScrollShadow className="flex-1 py-5">
        <p className="mb-3 px-6 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-muted">
          Plataforma
        </p>
        <Navigation route={route} modules={modules} loading={loading} onNavigate={onNavigate} />
      </ScrollShadow>
      <div className="p-4">
        <Surface variant="secondary" className="rounded-3xl border border-border/65 p-4">
          <div className="flex items-center gap-2">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full rounded-full bg-warning/30 motion-safe:animate-ping" />
              <span className="relative inline-flex size-2 rounded-full bg-warning" />
            </span>
            <span className="text-xs font-semibold">Ambiente de validação</span>
          </div>
          <p className="mt-2 text-xs leading-5 text-muted">
            Acesso controlado. A liberação oficial permanece bloqueada.
          </p>
        </Surface>
      </div>
    </Surface>
  );
}
