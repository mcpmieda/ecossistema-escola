import * as React from 'react';
import { Avatar as HeroAvatar } from '@heroui/react';
import { cn } from '@/lib/utils';

type AvatarSize = 'default' | 'sm' | 'lg';

function Avatar({
  className,
  size = 'default',
  ...props
}: Omit<React.ComponentProps<typeof HeroAvatar>, 'size'> & { size?: AvatarSize }) {
  return (
    <HeroAvatar
      data-slot="avatar"
      size={size === 'lg' ? 'md' : 'sm'}
      className={cn(size === 'sm' && 'size-6', className)}
      {...props}
    />
  );
}

function AvatarImage({ className, ...props }: React.ComponentProps<typeof HeroAvatar.Image>) {
  return <HeroAvatar.Image data-slot="avatar-image" className={className} {...props} />;
}

function AvatarFallback({ className, ...props }: React.ComponentProps<typeof HeroAvatar.Fallback>) {
  return (
    <HeroAvatar.Fallback
      data-slot="avatar-fallback"
      className={cn('font-medium tracking-[-0.02em]', className)}
      {...props}
    />
  );
}

function AvatarBadge({ className, ...props }: React.ComponentProps<'span'>) {
  return (
    <span
      data-slot="avatar-badge"
      className={cn(
        'absolute bottom-0 right-0 z-10 inline-flex size-2.5 items-center justify-center rounded-full bg-accent ring-2 ring-background',
        className,
      )}
      {...props}
    />
  );
}

function AvatarGroup({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="avatar-group" className={cn('flex -space-x-2', className)} {...props} />;
}

function AvatarGroupCount({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="avatar-group-count"
      className={cn(
        'relative flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-secondary text-sm text-muted ring-2 ring-background',
        className,
      )}
      {...props}
    />
  );
}

export { Avatar, AvatarImage, AvatarFallback, AvatarGroup, AvatarGroupCount, AvatarBadge };
