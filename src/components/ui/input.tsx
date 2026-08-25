import * as React from 'react';
import { Input as HeroInput } from '@heroui/react';
import { cn } from '@/lib/utils';

type InputProps = React.ComponentProps<typeof HeroInput>;

const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, ...props },
  ref,
) {
  return (
    <HeroInput
      ref={ref}
      data-slot="input"
      className={cn('w-full', className)}
      variant="secondary"
      {...props}
    />
  );
});

export { Input };
