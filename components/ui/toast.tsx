'use client';

/** 底部提示条：成功是深墨色，失败是警示红。 */

import { useEffect, useState } from 'react';
import { useToast } from '@/lib/feedback';
import { cn } from '@/lib/utils';

export function Toaster() {
  const toast = useToast();
  // 退场动画期间 toast 已经变回 null，留一份副本让文字不要先消失。
  const [shown, setShown] = useState<{ message: string; error: boolean } | null>(null);

  useEffect(() => {
    if (toast) setShown(toast);
  }, [toast]);

  const display = toast ?? shown;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'pointer-events-none fixed bottom-6 left-1/2 z-60',
        'max-w-[min(500px,calc(100vw-32px))] rounded-md px-4 py-3 text-[13px] text-white shadow-lift',
        'transition-[opacity,transform] duration-200 ease-out',
        toast ? 'translate-y-0 opacity-100' : 'translate-y-2.5 opacity-0',
        display?.error ? 'bg-danger' : 'bg-ink',
      )}
    >
      {display?.message ?? ''}
    </div>
  );
}
