'use client';

import { useJob } from '@/lib/feedback';
import { Button } from './ui';

export function JobOverlay({ onCancel }: { onCancel: () => void }) {
  const job = useJob();
  if (!job) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-canvas/75 p-5 backdrop-blur-md">
      <div
        role="status"
        aria-live="polite"
        className="grid w-[min(100%,430px)] grid-cols-[24px_minmax(0,1fr)_auto] items-center gap-3.5 rounded-lg border border-line bg-paper p-5 shadow-lift"
      >
        <span
          aria-hidden="true"
          className="size-6 animate-spin rounded-full border-2 border-line-strong border-t-accent"
        />
        <div className="min-w-0">
          <strong className="block text-sm font-semibold text-ink">{job.title}</strong>
          <p className="mt-0.5 truncate text-xs text-muted">{job.detail}</p>
        </div>
        <Button variant="secondary" size="sm" onClick={onCancel}>
          取消
        </Button>
      </div>
    </div>
  );
}
