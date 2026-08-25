import * as React from 'react';
import { Button as HeroButton } from '@heroui/react';
import { cn } from '@/lib/utils';

type LegacyButtonVariant = 'default' | 'outline' | 'secondary' | 'ghost' | 'destructive' | 'link';
type LegacyButtonSize = 'default' | 'xs' | 'sm' | 'lg' | 'icon' | 'icon-xs' | 'icon-sm' | 'icon-lg';

function heroVariant(variant: LegacyButtonVariant) {
  switch (variant) {
    case 'outline':
      return 'outline' as const;
    case 'secondary':
      return 'secondary' as const;
    case 'ghost':
    case 'link':
      return 'ghost' as const;
    case 'destructive':
      return 'danger' as const;
    default:
      return 'primary' as const;
  }
}

function heroSize(size: LegacyButtonSize) {
  if (size === 'lg' || size === 'icon-lg') return 'lg' as const;
  if (size === 'xs' || size === 'sm' || size === 'icon-xs' || size === 'icon-sm') {
    return 'sm' as const;
  }
  return 'md' as const;
}

function isIconSize(size: LegacyButtonSize) {
  return size.startsWith('icon');
}

function buttonVariants({
  variant = 'default',
  size = 'default',
  className,
}: {
  variant?: LegacyButtonVariant | null;
  size?: LegacyButtonSize | null;
  className?: string;
} = {}) {
  const resolvedVariant = variant ?? 'default';
  const resolvedSize = size ?? 'default';
  const variantClass = `button--${heroVariant(resolvedVariant)}`;
  const sizeClass = `button--${heroSize(resolvedSize)}`;
  return cn(
    'button',
    variantClass,
    sizeClass,
    isIconSize(resolvedSize) && 'button--icon-only',
    resolvedVariant === 'link' && 'underline underline-offset-4',
    className,
  );
}

type ButtonProps = Omit<
  React.ComponentProps<typeof HeroButton>,
  'variant' | 'size' | 'isDisabled'
> & {
  variant?: LegacyButtonVariant;
  size?: LegacyButtonSize;
  asChild?: boolean;
  disabled?: boolean;
};

function Button({
  className,
  variant = 'default',
  size = 'default',
  asChild = false,
  disabled,
  children,
  ...props
}: ButtonProps) {
  if (asChild && React.isValidElement(children)) {
    const child = children as React.ReactElement<{ className?: string }>;
    return React.cloneElement(child, {
      className: cn(buttonVariants({ variant, size }), child.props.className, className),
    });
  }

  return (
    <HeroButton
      data-slot="button"
      className={cn(variant === 'link' && 'underline underline-offset-4', className)}
      variant={heroVariant(variant)}
      size={heroSize(size)}
      isIconOnly={isIconSize(size)}
      isDisabled={disabled}
      {...props}
    >
      {children}
    </HeroButton>
  );
}

export { Button, buttonVariants };
