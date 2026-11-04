'use client';

import * as TabsPrimitive from '@radix-ui/react-tabs';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

/** 顶部工作区切换。Radix 负责方向键导航与 aria-controls 关联。 */

export const Tabs = TabsPrimitive.Root;

export function TabsList({ className, ...props }: ComponentProps<typeof TabsPrimitive.List>) {
  return <TabsPrimitive.List className={cn('flex min-w-0 items-center gap-1 rounded-xl border border-line bg-panel p-1', className)} {...props} />;
}

export function TabsTrigger({ className, ...props }: ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        'inline-flex min-h-10 items-center gap-2 rounded-lg border border-transparent px-4',
        'text-[13px] font-semibold text-muted transition-[color,background-color,border-color,transform] duration-150',
        'hover:bg-panel hover:text-ink active:scale-[0.98]',
        'data-[state=active]:border-line data-[state=active]:bg-paper data-[state=active]:text-accent-strong data-[state=active]:shadow-sm',
        className,
      )}
      {...props}
    />
  );
}

/**
 * 三个面板要一直挂在 DOM 里（切回来时 PDF 页与预览不重来），所以调用方传
 * forceMount；Radix 在 forceMount 下不会自己隐藏未选中的面板，得靠这里补上。
 */
export function TabsContent({ className, ...props }: ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      className={cn('min-h-0 outline-none data-[state=inactive]:hidden', className)}
      {...props}
    />
  );
}
