import { ArrowRight, Boxes, type LucideIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { CoreModuleContract } from '../../shared/platform-contract';
import { platformHref, routeIcons } from './routes';

export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={cn(
        'grid shrink-0 place-items-center rounded-2xl bg-accent font-semibold tracking-tight text-accent-foreground shadow-sm',
        compact ? 'size-9 text-xs' : 'size-11 text-sm',
      )}
      aria-hidden="true"
    >
      IA
    </div>
  );
}

export function EmptyState({
  icon: Icon = Boxes,
  title,
  description,
}: {
  icon?: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <div className="flex min-h-56 flex-col items-center justify-center px-5 py-10 text-center">
      <div className="grid size-10 place-items-center rounded-2xl border border-border bg-surface-secondary">
        <Icon className="size-4 text-muted" />
      </div>
      <h3 className="mt-4 text-sm font-semibold">{title}</h3>
      <p className="mt-1.5 max-w-md text-sm leading-6 text-muted">{description}</p>
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="mb-6">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">{eyebrow}</p>
      <h2 className="mt-2 text-2xl font-semibold tracking-[-0.035em] sm:text-3xl">{title}</h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">{description}</p>
    </div>
  );
}

export function ModuleStatus({ state }: { state: CoreModuleContract['state'] }) {
  return (
    <Badge variant={state === 'validation' ? 'outline' : 'secondary'}>
      {state === 'validation' ? 'Em validação' : 'Planejado'}
    </Badge>
  );
}

export function ModuleRow({ module }: { module: CoreModuleContract }) {
  const Icon = routeIcons[module.route];
  return (
    <a
      href={platformHref(module.route)}
      className="group flex items-center gap-4 px-4 py-4 transition-[background-color,transform] hover:bg-surface-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35 active:translate-y-px motion-reduce:transform-none sm:px-5"
    >
      <div className="grid size-10 shrink-0 place-items-center rounded-2xl border border-border bg-surface shadow-sm">
        <Icon className="size-4 text-muted transition-colors group-hover:text-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold">{module.name}</h3>
          <ModuleStatus state={module.state} />
        </div>
        <p className="mt-1 line-clamp-2 text-sm text-muted">{module.description}</p>
      </div>
      <ArrowRight className="size-4 shrink-0 text-muted transition-[transform,color] group-hover:translate-x-0.5 group-hover:text-foreground motion-reduce:transform-none" />
    </a>
  );
}

export function formatDate(value: string): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '—'
    : new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(date);
}

export function shortCorrelation(value: string): string {
  return value ? `${value.slice(0, 8)}…` : '—';
}

export function initials(value?: string): string {
  if (!value?.trim()) return 'AD';
  return value
    .trim()
    .split(/\s+/u)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('');
}
