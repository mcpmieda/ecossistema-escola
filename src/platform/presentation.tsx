import { Chip, Description, Label, ListBox, Surface } from '@heroui/react';
import { Boxes, type LucideIcon } from 'lucide-react';
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
      <AmbientConstellation intensity="strong" placement="center" />
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
    <Surface variant="transparent" className="living-page-header pro-spectrum">
      <AmbientConstellation intensity="strong" placement="right" />
      <div className="living-page-header__content">
        <Chip color="accent" variant="soft" size="sm">
          {eyebrow}
        </Chip>
        <h2 className="mt-4 text-2xl font-semibold tracking-[-0.045em] text-[#203856] sm:text-3xl">
          {title}
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[#365B86]">{description}</p>
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

export function ModuleList({ modules }: { modules: CoreModuleContract[] }) {
  return (
    <ListBox aria-label="Áreas do Centro" selectionMode="none" className="module-list">
      {modules.map((module) => {
        const Icon = routeIcons[module.route];
        return (
          <ListBox.Item
            id={module.id}
            key={module.id}
            href={platformHref(module.route)}
            textValue={module.name}
            className="module-list__item"
          >
            <Surface
              variant="secondary"
              className="grid size-10 shrink-0 place-items-center rounded-2xl"
            >
              <Icon className="size-4 text-muted" />
            </Surface>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Label className="text-sm font-semibold">{module.name}</Label>
                <ModuleStatus state={module.state} />
              </div>
              <Description className="mt-1 line-clamp-2">{module.description}</Description>
            </div>
            <span aria-hidden="true" className="module-list__chevron">
              →
            </span>
          </ListBox.Item>
        );
      })}
    </ListBox>
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
