import * as React from 'react';
import { Card as HeroCard } from '@heroui/react';
import { cn } from '@/lib/utils';

type CardProps = Omit<React.ComponentProps<typeof HeroCard>, 'variant'> & {
  size?: 'default' | 'sm';
};

function Card({ className, size = 'default', ...props }: CardProps) {
  return (
    <HeroCard
      data-slot="card"
      data-size={size}
      className={cn('dense-island', size === 'sm' && 'gap-2', className)}
      {...props}
    />
  );
}

function CardHeader({ className, ...props }: React.ComponentProps<typeof HeroCard.Header>) {
  return (
    <HeroCard.Header
      data-slot="card-header"
      className={cn(
        'relative grid auto-rows-min items-start gap-1 px-5 pt-5 has-data-[slot=card-action]:grid-cols-[1fr_auto] has-data-[slot=card-description]:grid-rows-[auto_auto] data-[size=sm]:px-4 data-[size=sm]:pt-4',
        className,
      )}
      {...props}
    />
  );
}

function CardTitle({ className, ...props }: React.ComponentProps<typeof HeroCard.Title>) {
  return (
    <HeroCard.Title
      data-slot="card-title"
      className={cn(
        'font-heading text-base font-semibold leading-snug tracking-[-0.015em]',
        className,
      )}
      {...props}
    />
  );
}

function CardDescription({
  className,
  ...props
}: React.ComponentProps<typeof HeroCard.Description>) {
  return (
    <HeroCard.Description
      data-slot="card-description"
      className={cn('text-sm leading-6 text-muted', className)}
      {...props}
    />
  );
}

function CardAction({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-action"
      className={cn('col-start-2 row-span-2 row-start-1 self-start justify-self-end', className)}
      {...props}
    />
  );
}

function CardContent({ className, ...props }: React.ComponentProps<typeof HeroCard.Content>) {
  return (
    <HeroCard.Content data-slot="card-content" className={cn('px-5 pb-5', className)} {...props} />
  );
}

function CardFooter({ className, ...props }: React.ComponentProps<typeof HeroCard.Footer>) {
  return (
    <HeroCard.Footer
      data-slot="card-footer"
      className={cn('border-t border-border/70 px-5 py-4', className)}
      {...props}
    />
  );
}

export { Card, CardHeader, CardFooter, CardTitle, CardAction, CardDescription, CardContent };
