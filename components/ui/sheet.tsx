'use client';

/** 移动端从右侧滑出的菜单。桌面端不出现，那里直接把操作放在顶栏。 */

import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X, type LucideIcon } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Button } from './button';

export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="animate-fade-in fixed inset-0 z-80 bg-ink/35 backdrop-blur-sm" />
        <DialogPrimitive.Content
          className={cn(
            'animate-sheet-in fixed inset-y-0 right-0 z-81 flex w-[min(88vw,390px)] flex-col',
            'scrollbar-slim overflow-y-auto overscroll-contain bg-paper px-5 py-6 shadow-lift',
            'focus:outline-none',
          )}
        >
          <div className="flex items-start justify-between gap-4 border-b border-line pb-5">
            <div className="min-w-0">
              <DialogPrimitive.Title className="mb-1 text-lg font-bold tracking-tight text-ink">
                {title}
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="text-xs text-muted">
                {description}
              </DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close asChild>
              <Button variant="ghost" size="icon" aria-label="关闭菜单">
                <X aria-hidden="true" className="size-4.5" />
              </Button>
            </DialogPrimitive.Close>
          </div>
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export function SheetSection({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('border-b border-line py-5 last:border-b-0', className)}>{children}</div>;
}

export function SheetLabel({ icon: IconComponent, children }: { icon?: LucideIcon; children: ReactNode }) {
  return (
    <span className="mb-3 flex items-center gap-2 text-[11px] font-bold tracking-[0.08em] text-muted uppercase">
      {IconComponent ? <IconComponent aria-hidden="true" className="size-3.5 text-accent" /> : null}
      {children}
    </span>
  );
}

export function SheetModeGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-3 gap-2">{children}</div>;
}

export function SheetModeButton({
  active,
  icon: IconComponent,
  children,
  ...props
}: ComponentProps<'button'> & { active: boolean; icon: LucideIcon }) {
  return (
    <button
      type="button"
      className={cn(
        'grid min-h-18 place-items-center gap-1.5 rounded-md border px-2 py-2.5 text-xs font-semibold',
        'transition-colors duration-150',
        active
          ? 'border-accent/40 bg-accent-soft text-accent-strong'
          : 'border-line bg-panel text-muted hover:text-ink',
      )}
      {...props}
    >
      <IconComponent aria-hidden="true" className="size-5" />
      <span>{children}</span>
    </button>
  );
}

export function SheetActions({ children }: { children: ReactNode }) {
  return <div className="grid gap-1.5">{children}</div>;
}

export function SheetAction(props: ComponentProps<'button'>) {
  return (
    <button
      type="button"
      className={cn(
        'min-h-10 rounded-sm bg-panel px-3 py-2.5 text-left text-[13px] font-semibold text-ink-soft',
        'transition-colors duration-150 hover:bg-accent-soft hover:text-accent-strong',
      )}
      {...props}
    />
  );
}

export function SheetFootnote({ children }: { children: ReactNode }) {
  return <p className="mt-5 text-[11px] leading-relaxed text-faint">{children}</p>;
}
