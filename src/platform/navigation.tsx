import { Chip, Skeleton } from '@heroui/react';
import { Sparkles } from 'lucide-react';
import type { CoreModuleContract, PlatformRoute } from '../../shared/platform-contract';
import { AmbientConstellation } from './ambient';
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
          <Skeleton className="h-10 w-full rounded-xl" key={index} />
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
            data-active={active ? 'true' : 'false'}
            className="hero-nav-item group flex min-h-10 items-center gap-3 rounded-xl px-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
          >
            <span
              className={`grid size-7 place-items-center rounded-lg transition-colors ${active ? 'bg-accent/15 text-accent' : 'bg-surface-secondary/45 text-muted-foreground group-hover:text-accent'}`}
            >
              <Icon className="size-4" />
            </span>
            <span className="min-w-0 flex-1 truncate">{module.name}</span>
            {module.state === 'planned' && (
              <span className="size-1.5 rounded-full bg-muted-foreground/35" aria-label="Planejado" />
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
    <div className="hero-sidebar relative flex h-full flex-col overflow-hidden text-foreground">
      <AmbientConstellation intensity="soft" />
      <div className="relative z-10 flex h-[76px] items-center gap-3 border-b border-border/70 px-4">
        <BrandMark compact />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold tracking-[-0.02em]">Centro de Administração</p>
          <p className="truncate text-[0.7rem] text-muted-foreground">Escola Iêda Alves de Oliveira</p>
        </div>
      </div>

      <div className="relative z-10 flex-1 py-5">
        <div className="mb-3 flex items-center justify-between px-5">
          <p className="text-[0.66rem] font-bold uppercase tracking-[0.16em] text-muted-foreground">
            Plataforma
          </p>
          <Sparkles className="size-3 text-accent/70" />
        </div>
        <Navigation route={route} modules={modules} loading={loading} onNavigate={onNavigate} />
      </div>

      <div className="relative z-10 p-4">
        <div className="hero-glass--quiet rounded-2xl p-3.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="hero-status-orb" />
              <span className="text-xs font-semibold">Validação ativa</span>
            </div>
            <Chip size="sm" variant="soft" color="accent">
              v0.8
            </Chip>
          </div>
          <p className="mt-2 text-[0.7rem] leading-5 text-muted-foreground">
            Acesso controlado. A liberação oficial permanece bloqueada.
          </p>
        </div>
      </div>
    </div>
  );
}
