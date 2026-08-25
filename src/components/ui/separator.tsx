import * as React from 'react';
import { Separator as HeroSeparator } from '@heroui/react';
import { cn } from '@/lib/utils';

function Separator({ className, ...props }: React.ComponentProps<typeof HeroSeparator>) {
  return <HeroSeparator data-slot="separator" className={cn('shrink-0', className)} {...props} />;
}

export { Separator };
