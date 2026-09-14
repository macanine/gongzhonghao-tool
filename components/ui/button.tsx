'use client';

import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

const buttonStyles = cva(
  [
    'inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap',
    'font-semibold transition-[background-color,border-color,color,box-shadow,transform] duration-150',
    'disabled:pointer-events-none disabled:opacity-45 active:translate-y-px',
  ],
  {
    variants: {
      variant: {
        primary:
          'border border-accent bg-accent text-white shadow-glow hover:border-accent-strong hover:bg-accent-strong',
        secondary: 'border border-line-strong bg-paper text-ink hover:border-faint hover:bg-panel',
        ghost: 'border border-transparent text-muted hover:border-line hover:bg-panel hover:text-ink',
        bare: 'text-muted hover:text-ink',
        danger: 'text-muted hover:text-danger',
      },
      size: {
        md: 'min-h-11 rounded-md px-3.5 text-[13px]',
        sm: 'min-h-8 rounded-sm px-2.5 text-xs',
        block: 'min-h-11 w-full rounded-md px-4 text-[13px]',
        icon: 'size-9.5 rounded-sm',
        iconSm: 'size-7.5 rounded-sm',
      },
    },
    defaultVariants: { variant: 'secondary', size: 'md' },
  },
);

export interface ButtonProps extends ComponentProps<'button'>, VariantProps<typeof buttonStyles> {
  asChild?: boolean;
}

export function Button({ className, variant, size, asChild, type, ...props }: ButtonProps) {
  const Component = asChild ? Slot : 'button';
  return (
    <Component
      className={cn(buttonStyles({ variant, size }), className)}
      {...(asChild ? {} : { type: type ?? 'button' })}
      {...props}
    />
  );
}
