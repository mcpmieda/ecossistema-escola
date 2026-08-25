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
      <div className="grid gap-2 px-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton className="h-10 w-full rounded-2xl" key={index} />
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
          <a
            key={module.id}
            href={platformHref(module.route)}
            onClick={onNavigate}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'group flex min-h-10 items-center gap-3 rounded-2xl px-3 text-sm font-medium transition-[background-color,color,transform,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35 active:translate-y-px motion-reduce:transform-none',
              active
                ? 'bg-accent-soft text-accent shadow-sm'
                : 'text-muted hover:bg-surface-secondary hover:text-foreground',
            )}
          >
            <span
              className={cn(
                'grid size-7 shrink-0 place-items-center rounded-xl transition-colors',
                active ? 'bg-accent text-accent-foreground' : 'bg-surface-secondary text-muted',
              )}
            >
              <Icon className="size-3.5" />
            </span>
            <span className="min-w-0 flex-1 truncate">{module.name}</span>
            {module.state === 'planned' && (
              <span className="size-1.5 rounded-full bg-muted/40" aria-label="Planejado" />
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
    <div className="flex h-full min-h-0 flex-col bg-surface/94 text-foreground">
      <div className="flex h-20 items-center gap-3 px-5">
        <BrandMark compact />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold tracking-[-0.015em]">Centro de Administração</p>
          <p className="truncate text-xs text-muted">Escola Iêda Alves de Oliveira</p>
        </div>
      </div>
      <Separator />
      <div className="flex-1 overflow-y-auto py-5">
        <p className="mb-3 px-6 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-muted">
          Plataforma
        </p>
        <Navigation route={route} modules={modules} loading={loading} onNavigate={onNavigate} />
      </div>
      <div className="p-4">
        <div className="rounded-3xl border border-border bg-surface-secondary p-4">
          <div className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-warning" />
            <span className="text-xs font-semibold">Ambiente de validação</span>
          </div>
          <p className="mt-2 text-xs leading-5 text-muted">
            Acesso controlado. A liberação oficial permanece bloqueada.
          </p>
        </div>
      </div>
    </div>
  );
}
