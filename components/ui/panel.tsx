'use client';

/** 分区容器：左栏里的每一段设置都用 Section 包起来，标题带一条强调色竖线。 */

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function Rail({
  side = 'left',
  className,
  children,
}: {
  side?: 'left' | 'right';
  className?: string;
  children: ReactNode;
}) {
  return (
    <aside
      className={cn(
        'min-h-0 min-w-0 overflow-hidden bg-paper',
        side === 'left' ? 'border-r border-line' : 'border-l border-line max-[1200px]:hidden',
        className,
      )}
    >
      <div
        data-scroll="rail"
        className={cn(
          'scrollbar-slim h-full overflow-y-auto overscroll-contain',
          side === 'left' ? 'px-5 pt-6 pb-10 max-[768px]:px-4 max-[768px]:pt-5' : 'p-6',
        )}
      >
        {children}
      </div>
    </aside>
  );
}

export function Section({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <section
      className={cn(
        'mb-6 border-b border-line pb-6 last:mb-0 last:border-b-0 last:pb-0',
        className,
      )}
    >
      {children}
    </section>
  );
}

export function SectionHeading({
  children,
  trailing,
}: {
  children: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <div className="mb-4 flex min-h-6.5 items-center gap-2">
      <span
        aria-hidden="true"
        className="h-4 w-1 shrink-0 rounded-full bg-accent"
      />
      <h2 className="mr-auto text-[13px] font-bold tracking-tight text-ink">{children}</h2>
      {trailing}
    </div>
  );
}

export function SectionNote({ children }: { children: ReactNode }) {
  return <p className="-mt-1.5 mb-3.5 text-[11px] leading-relaxed text-muted">{children}</p>;
}

export function CountBadge({ children }: { children: ReactNode }) {
  return (
    <span className="grid h-6 min-w-6.5 place-items-center rounded-full bg-accent-soft px-2 text-[11px] font-semibold tabular-nums text-accent-strong">
      {children}
    </span>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="mb-1 text-[10px] font-bold tracking-[0.14em] text-accent uppercase">{children}</p>
  );
}

export function StatusDot({
  state = 'idle',
  children,
}: {
  state?: 'idle' | 'working' | 'ready';
  children: ReactNode;
}) {
  const tone = {
    idle: 'bg-faint ring-3 ring-faint/20',
    working: 'bg-warn animate-blink',
    ready: 'bg-accent ring-3 ring-accent/16',
  }[state];

  return (
    <span className="inline-flex items-center gap-2 text-[11px] whitespace-nowrap text-muted">
      <span aria-hidden="true" className={cn('size-1.75 rounded-full', tone)} />
      {children}
    </span>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <section
      className={cn(
        'rounded-xl border border-line bg-paper p-5 shadow-card',
        className,
      )}
    >
      {children}
    </section>
  );
}

export function InfoRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex justify-between gap-3 border-b border-line/70 py-2.5 text-[11px] text-muted last:border-b-0">
      <span>{label}</span>
      <strong className="text-right font-semibold text-ink">{value}</strong>
    </div>
  );
}

export function FixedRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between rounded-sm border border-line bg-panel px-3 py-2.5 text-[11px] text-muted">
      <span>{label}</span>
      <strong className="text-xs font-semibold text-ink">{value}</strong>
    </div>
  );
}

/** 中栏：一条工具条 + 下面可滚动的工作区。三个工作区共用。 */
export function StageColumn({
  eyebrow,
  title,
  status,
  statusState = 'idle',
  children,
}: {
  eyebrow: string;
  title: string;
  status: ReactNode;
  statusState?: 'idle' | 'working' | 'ready';
  children: ReactNode;
}) {
  return (
    <section className="flex min-h-0 min-w-0 flex-col bg-canvas">
      <div
        className={cn(
          'flex items-center justify-between gap-4 border-b border-line bg-paper',
          'min-h-22 px-[clamp(20px,3vw,42px)] py-5',
          'max-[768px]:min-h-17.5 max-[768px]:px-4 max-[768px]:py-3.5',
        )}
      >
        <div className="min-w-0">
          <Eyebrow>{eyebrow}</Eyebrow>
          <h1 className="text-[clamp(17px,2vw,22px)] font-bold tracking-tight text-ink max-[768px]:text-[17px]">
            {title}
          </h1>
        </div>
        <StatusDot state={statusState}>{status}</StatusDot>
      </div>
      {children}
    </section>
  );
}
