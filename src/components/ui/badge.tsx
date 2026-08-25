import * as React from 'react';
import { Chip } from '@heroui/react';
import { cn } from '@/lib/utils';

type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline' | 'ghost' | 'link';

function chipConfig(variant: BadgeVariant) {
  switch (variant) {
    case 'destructive':
      return { variant: 'soft' as const, color: 'danger' as const };
    case 'default':
      return { variant: 'primary' as const, color: 'accent' as const };
    case 'secondary':
      return { variant: 'soft' as const, color: 'default' as const };
    case 'ghost':
    case 'link':
      return { variant: 'tertiary' as const, color: 'accent' as const };
    default:
      return { variant: 'secondary' as const, color: 'default' as const };
  }
}

function badgeVariants({
  variant = 'default',
  className,
}: {
  variant?: BadgeVariant | null;
  className?: string;
} = {}) {
  const resolved = variant ?? 'default';
  const config = chipConfig(resolved);
  return cn(
    'chip',
    `chip--${config.variant}`,
    `chip--${config.color}`,
    'chip--sm',
    resolved === 'link' && 'underline underline-offset-4',
    className,
  );
}

type BadgeProps = Omit<React.ComponentProps<typeof Chip>, 'variant' | 'color'> & {
  variant?: BadgeVariant;
  asChild?: boolean;
};

function Badge({
  className,
  variant = 'default',
  asChild = false,
  children,
  ...props
}: BadgeProps) {
  if (asChild && React.isValidElement(children)) {
    const child = children as React.ReactElement<{ className?: string }>;
    return React.cloneElement(child, {
      className: cn(badgeVariants({ variant }), child.props.className, className),
    });
  }

  const config = chipConfig(variant);
  return (
    <Chip
      data-slot="badge"
      className={cn(variant === 'link' && 'underline underline-offset-4', className)}
      color={config.color}
      variant={config.variant}
      size="sm"
      {...props}
    >
      {children}
    </Chip>
  );
}

export { Badge, badgeVariants };
