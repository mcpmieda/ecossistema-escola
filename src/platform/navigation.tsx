import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
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
            href={platformHref(module.route)}
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
