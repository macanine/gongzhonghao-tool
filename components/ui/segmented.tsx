'use client';

/**
 * 单选项组（背景类型、字体之类的互斥选择）。
 *
 * 用 radiogroup 语义而不是一排 aria-pressed 按钮：读屏会念成「三选一」，
 * 并且支持方向键在选项间移动，和原生 radio 一致。
 */

import type { KeyboardEvent, ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface SegmentOption<T extends string> {
  value: T;
  label: ReactNode;
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  className,
}: {
  value: T;
  options: SegmentOption<T>[];
  onChange: (value: T) => void;
  ariaLabel: string;
  className?: string;
}) {
  const move = (event: KeyboardEvent<HTMLDivElement>, delta: number) => {
    event.preventDefault();
    const index = options.findIndex((option) => option.value === value);
    const next = options[(index + delta + options.length) % options.length];
    if (!next) return;
    onChange(next.value);
    const host = event.currentTarget;
    requestAnimationFrame(() => {
      host.querySelector<HTMLButtonElement>(`[data-value="${next.value}"]`)?.focus();
    });
  };

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn(
        'mb-3.5 grid auto-cols-fr grid-flow-col gap-1 rounded-md border border-line bg-panel p-1',
        className,
      )}
      onKeyDown={(event) => {
        if (event.key === 'ArrowRight' || event.key === 'ArrowDown') move(event, 1);
        else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') move(event, -1);
      }}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            data-value={option.value}
            onClick={() => onChange(option.value)}
            className={cn(
              'min-h-8 rounded-sm px-1.5 py-1 text-[11px] font-semibold transition-all duration-150',
              active
                ? 'bg-paper text-accent-strong shadow-sm'
                : 'text-muted hover:text-ink',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
