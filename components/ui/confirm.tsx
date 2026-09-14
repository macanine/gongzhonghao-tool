'use client';

/**
 * 确认弹窗：把两处 window.confirm 换成应用内对话框。
 *
 * 用法和 toast 一样是「谁都能喊一声」，所以同样做成极小的外部 store，
 * 只多了一步——返回 Promise<boolean> 让调用处继续用 await 写。
 */

import * as AlertDialogPrimitive from '@radix-ui/react-alert-dialog';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { cn } from '@/lib/utils';
import { Button } from './button';

const dialogStyles = cn(
  'animate-fade-in fixed top-1/2 left-1/2 z-91 w-[min(92vw,420px)] -translate-x-1/2 -translate-y-1/2',
  'rounded-lg border border-line bg-paper p-5 shadow-lift',
);

interface ConfirmRequest {
  id: number;
  message: string;
  confirmLabel: string;
  resolve: (confirmed: boolean) => void;
}

let current: ConfirmRequest | null = null;
let seed = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

export function confirm(message: string, confirmLabel = '确定'): Promise<boolean> {
  // 上一个还没答完就被顶掉时，先按「取消」结算，免得那个 Promise 永远悬着。
  current?.resolve(false);
  return new Promise<boolean>((resolve) => {
    seed += 1;
    current = { id: seed, message, confirmLabel, resolve };
    emit();
  });
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};

/** 关闭动画期间仍要显示原文，所以内容单独留一份快照。 */
export function Confirmer() {
  const request = useSyncExternalStore(
    subscribe,
    () => current,
    () => null,
  );
  const [shown, setShown] = useState<ConfirmRequest | null>(null);

  useEffect(() => {
    if (request) setShown(request);
  }, [request]);

  const answer = (confirmed: boolean) => {
    const active = current;
    current = null;
    emit();
    active?.resolve(confirmed);
  };

  return (
    <AlertDialogPrimitive.Root
      open={Boolean(request)}
      onOpenChange={(next) => {
        if (!next) answer(false);
      }}
    >
      <AlertDialogPrimitive.Portal>
        <AlertDialogPrimitive.Overlay className="animate-fade-in fixed inset-0 z-90 bg-ink/35 backdrop-blur-sm" />
        <AlertDialogPrimitive.Content className={dialogStyles}>
          <AlertDialogPrimitive.Title className="mb-2 text-base font-bold tracking-tight text-ink">
            请确认
          </AlertDialogPrimitive.Title>
          <AlertDialogPrimitive.Description className="mb-5 text-[13px] leading-relaxed text-muted">
            {shown?.message ?? ''}
          </AlertDialogPrimitive.Description>
          <div className="flex justify-end gap-2">
            <AlertDialogPrimitive.Cancel asChild>
              <Button variant="secondary" onClick={() => answer(false)}>
                取消
              </Button>
            </AlertDialogPrimitive.Cancel>
            <AlertDialogPrimitive.Action asChild>
              <Button variant="primary" onClick={() => answer(true)}>
                {shown?.confirmLabel ?? '确定'}
              </Button>
            </AlertDialogPrimitive.Action>
          </div>
        </AlertDialogPrimitive.Content>
      </AlertDialogPrimitive.Portal>
    </AlertDialogPrimitive.Root>
  );
}
