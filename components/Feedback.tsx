'use client';

import { useJob, useToast } from '@/lib/feedback';

export function JobOverlay({ onCancel }: { onCancel: () => void }) {
  const job = useJob();
  if (!job) return null;
  return (
    <div className="job-overlay">
      <div className="job-dialog" role="status" aria-live="polite">
        <div className="progress-ring" aria-hidden="true" />
        <div>
          <strong>{job.title}</strong>
          <p>{job.detail}</p>
        </div>
        <button className="job-cancel" type="button" onClick={onCancel}>
          取消
        </button>
      </div>
    </div>
  );
}

export function Toaster() {
  const toast = useToast();
  return (
    <div className={`toast${toast ? ' is-showing' : ''}${toast?.error ? ' is-error' : ''}`} role="status" aria-live="polite">
      {toast?.message ?? ''}
    </div>
  );
}
