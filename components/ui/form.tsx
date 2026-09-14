'use client';

/** 表单控件：原生 input/textarea/select 统一外观，Switch/Slider 用 Radix 保证键盘与读屏可用。 */

import * as SwitchPrimitive from '@radix-ui/react-switch';
import * as SliderPrimitive from '@radix-ui/react-slider';
import { ChevronDown, Upload, type LucideIcon } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/utils';

const controlBase = [
  'w-full min-w-0 rounded-sm border border-line-strong bg-paper px-3 py-2.5 text-[13px] text-ink',
  'placeholder:text-faint transition-[border-color,box-shadow,background-color] duration-150',
  'hover:border-faint',
  'focus:border-accent focus:ring-4 focus:ring-accent/15 focus:outline-none',
  'disabled:cursor-not-allowed disabled:bg-panel disabled:text-muted disabled:hover:border-line-strong',
].join(' ');

/* ---------------- 布局 ---------------- */

export function Field({
  label,
  hint,
  children,
  className,
  as,
}: {
  label: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
  /** 包住 Slider 这类非表单控件时传 'div'，避免用 <label> 包一个没有可关联控件的东西。 */
  as?: 'div';
}) {
  const Tag = as === 'div' ? 'div' : 'label';
  return (
    <Tag className={cn('mb-3.5 flex min-w-0 flex-col gap-2', className)}>
      <span className="flex items-baseline justify-between gap-2 text-[11px] font-medium text-muted">
        <span>{label}</span>
        {hint}
      </span>
      {children}
    </Tag>
  );
}

export function FieldGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-2.5">{children}</div>;
}

/** 滑块右边的当前值。 */
export function ValueHint({ children }: { children: ReactNode }) {
  return <output className="font-semibold tabular-nums text-ink">{children}</output>;
}

/* ---------------- 原生控件 ---------------- */

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return <input className={cn(controlBase, className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return <textarea className={cn(controlBase, 'min-h-[78px] resize-y', className)} {...props} />;
}

export function Select({ className, children, ...props }: ComponentProps<'select'>) {
  return (
    <div className="relative">
      <select className={cn(controlBase, 'appearance-none pr-9', className)} {...props}>
        {children}
      </select>
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-muted"
      />
    </div>
  );
}

/** 色块 + 十六进制值。原生取色器只画一个色块，边框保证浅色也能看见。 */
export function ColorInput({ className, value, ...props }: ComponentProps<'input'>) {
  return (
    <span className={cn('flex items-center gap-2.5', className)}>
      <input
        type="color"
        value={value}
        className={cn(
          'size-9.5 shrink-0 cursor-pointer rounded-sm border border-line-strong bg-paper p-0.5',
          '[&::-webkit-color-swatch-wrapper]:p-0',
          '[&::-webkit-color-swatch]:rounded-[3px] [&::-webkit-color-swatch]:border-none',
          'disabled:cursor-not-allowed disabled:opacity-45',
        )}
        {...props}
      />
      <span className="min-w-0 truncate font-mono text-[11px] tracking-tight text-muted uppercase">
        {typeof value === 'string' ? value : ''}
      </span>
    </span>
  );
}

/* ---------------- Radix 控件 ---------------- */

export function Switch({
  checked,
  onCheckedChange,
  label,
  disabled,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <SwitchPrimitive.Root
      checked={checked}
      onCheckedChange={onCheckedChange}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={cn(
        'relative h-6 w-10.5 shrink-0 rounded-full transition-colors duration-150',
        'data-[state=unchecked]:bg-line-strong data-[state=checked]:bg-accent',
        'disabled:opacity-45',
      )}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          'absolute top-1/2 left-[3px] size-4.5 -translate-y-1/2 rounded-full bg-white shadow-sm',
          'transition-transform duration-150',
          'data-[state=unchecked]:translate-x-0 data-[state=checked]:translate-x-[18px]',
        )}
      />
    </SwitchPrimitive.Root>
  );
}

export function Slider({
  value,
  min,
  max,
  step = 1,
  onValueChange,
  label,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onValueChange: (value: number) => void;
  label: string;
}) {
  return (
    <SliderPrimitive.Root
      className="relative flex h-5 w-full touch-none items-center select-none"
      value={[value]}
      min={min}
      max={max}
      step={step}
      aria-label={label}
      onValueChange={([next]) => {
        if (next !== undefined) onValueChange(next);
      }}
    >
      <SliderPrimitive.Track className="relative h-1.5 grow rounded-full bg-line-strong">
        <SliderPrimitive.Range className="absolute h-full rounded-full bg-accent" />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb className="block size-4 rounded-full border-2 border-accent bg-paper shadow-sm transition-transform duration-150 hover:scale-110 active:scale-110" />
    </SliderPrimitive.Root>
  );
}

/** 带标题与当前值的滑块。Slider 本身不是表单控件，所以外层用 div 而不是 label。 */
export function SliderField({
  label,
  value,
  min,
  max,
  step,
  suffix = '',
  onValueChange,
  className,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  onValueChange: (value: number) => void;
  className?: string;
}) {
  return (
    <Field
      as="div"
      label={label}
      className={className}
      hint={
        <ValueHint>
          {value}
          {suffix}
        </ValueHint>
      }
    >
      <Slider
        label={label}
        value={value}
        min={min}
        max={max}
        step={step}
        onValueChange={onValueChange}
      />
    </Field>
  );
}

/* ---------------- 文件选择 ---------------- */

/** 小号的虚线文件按钮，用于换背景图这类单文件场景。 */
export function FileButton({
  accept,
  onPick,
  children,
  icon: IconComponent = Upload,
  className,
}: {
  accept: string;
  onPick: (file: File) => void;
  children: ReactNode;
  icon?: LucideIcon;
  className?: string;
}) {
  return (
    <label
      className={cn(
        'flex w-full cursor-pointer items-center justify-center gap-2 rounded-sm border border-dashed border-line-strong',
        'bg-paper px-3 py-2.5 text-xs font-semibold text-ink-soft transition-colors',
        'hover:border-accent hover:bg-accent-wash',
        className,
      )}
    >
      <input
        type="file"
        accept={accept}
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onPick(file);
          event.target.value = '';
        }}
      />
      <IconComponent aria-hidden="true" className="size-4 text-accent" />
      {children}
    </label>
  );
}
