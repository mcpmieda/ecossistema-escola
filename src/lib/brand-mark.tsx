import { cn } from './utils';

/** Existing institutional monogram, shared by the two browser applications. */
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
