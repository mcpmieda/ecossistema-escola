import { Chip, Link, Surface } from '@heroui/react';
import { ArrowRight, Boxes, type LucideIcon } from 'lucide-react';
import { AmbientConstellation } from '@/components/ambient-constellation';
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
    <Surface
      variant="transparent"
      className="living-empty-state flex flex-col items-center justify-center px-5 py-12 text-center"
    >
      <AmbientConstellation intensity="medium" placement="center" />
      <div className="living-aura living-aura--right" />
      <div className="living-icon">
        <Icon className="size-4 text-accent" />
      </div>
      <Chip color="accent" variant="soft" size="sm" className="mt-5">
        Estado disponível
      </Chip>
      <h3 className="mt-4 text-base font-semibold tracking-[-0.02em]">{title}</h3>
      <p className="mt-2 max-w-md text-sm leading-6 text-muted">{description}</p>
    </Surface>
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
    <Surface variant="transparent" className="living-page-header">
      <AmbientConstellation intensity="medium" placement="right" />
      <div className="living-page-header__content">
        <Chip color="accent" variant="soft" size="sm">
          {eyebrow}
        </Chip>
        <h2 className="mt-4 text-2xl font-semibold tracking-[-0.045em] sm:text-3xl">{title}</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">{description}</p>
      </div>
    </Surface>
  );
}

export function ModuleStatus({ state }: { state: CoreModuleContract['state'] }) {
  return (
    <Chip color={state === 'validation' ? 'accent' : 'default'} variant="soft" size="sm">
      {state === 'validation' ? 'Em validação' : 'Planejado'}
    </Chip>
  );
}

export function ModuleRow({ module }: { module: CoreModuleContract }) {
  const Icon = routeIcons[module.route];
  return (
    <Link
      href={platformHref(module.route)}
      className="group flex w-full items-center gap-4 px-4 py-4 text-foreground no-underline transition-[background-color,transform] hover:bg-surface-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35 active:translate-y-px motion-reduce:transform-none sm:px-5"
    >
      <Surface
        variant="secondary"
        className="grid size-10 shrink-0 place-items-center rounded-2xl border border-border/70"
      >
        <Icon className="size-4 text-muted transition-colors group-hover:text-accent" />
      </Surface>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold">{module.name}</h3>
          <ModuleStatus state={module.state} />
        </div>
        <p className="mt-1 line-clamp-2 text-sm text-muted">{module.description}</p>
      </div>
      <ArrowRight className="size-4 shrink-0 text-muted transition-[transform,color] group-hover:translate-x-1 group-hover:text-accent motion-reduce:transform-none" />
    </Link>
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
