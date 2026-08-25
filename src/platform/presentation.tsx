import { Chip, Link } from '@heroui/react';
import { ArrowRight, Boxes, Sparkles, type LucideIcon } from 'lucide-react';
import type { CoreModuleContract } from '../../shared/platform-contract';
import { AmbientConstellation } from './ambient';
import { platformHref, routeIcons } from './routes';

export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={`hero-brand-mark shrink-0 ${compact ? 'size-9 rounded-xl text-[0.68rem]' : 'size-12 rounded-2xl text-sm'}`}
      aria-hidden="true"
    >
      <span className="relative z-10 font-black tracking-[-0.08em]">IA</span>
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
    <div className="relative flex min-h-64 flex-col items-center justify-center overflow-hidden px-6 py-12 text-center">
      <AmbientConstellation intensity="soft" />
      <div className="relative z-10 flex max-w-md flex-col items-center">
        <div className="hero-glass grid size-12 place-items-center rounded-2xl">
          <Icon className="size-5 text-accent" />
        </div>
        <h3 className="mt-5 text-base font-semibold tracking-[-0.02em]">{title}</h3>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
      </div>
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
    <section className="living-surface hero-page-enter mb-7 rounded-[1.7rem] px-6 py-7 sm:px-8 sm:py-8">
      <AmbientConstellation intensity="strong" parallax />
      <div className="living-surface__content max-w-3xl">
        <div className="hero-kicker">
          <Sparkles className="size-3.5" />
          {eyebrow}
        </div>
        <h2 className="hero-gradient-text mt-3 text-3xl font-semibold tracking-[-0.045em] sm:text-[2.5rem] sm:leading-[1.05]">
          {title}
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-[0.95rem]">
          {description}
        </p>
      </div>
    </section>
  );
}

export function ModuleStatus({ state }: { state: CoreModuleContract['state'] }) {
  return (
    <Chip
      size="sm"
      color={state === 'validation' ? 'accent' : 'default'}
      variant={state === 'validation' ? 'soft' : 'tertiary'}
      className="font-medium"
    >
      {state === 'validation' ? 'Em validação' : 'Planejado'}
    </Chip>
  );
}

export function ModuleRow({ module }: { module: CoreModuleContract }) {
  const Icon = routeIcons[module.route];
  return (
    <Link
      href={platformHref(module.route)}
      className="group flex w-full items-center gap-4 px-5 py-4 text-foreground no-underline transition-colors hover:bg-accent/5 sm:px-6"
    >
      <div className="hero-glass--quiet grid size-11 shrink-0 place-items-center rounded-2xl transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:scale-[1.03] motion-reduce:transform-none">
        <Icon className="size-4.5 text-accent" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold tracking-[-0.015em]">{module.name}</h3>
          <ModuleStatus state={module.state} />
        </div>
        <p className="mt-1 line-clamp-2 text-sm leading-5 text-muted-foreground">
          {module.description}
        </p>
      </div>
      <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-all duration-300 group-hover:translate-x-1 group-hover:text-accent motion-reduce:transform-none" />
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
