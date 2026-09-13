'use client';

/** 一组共用的表单控件与图标，统一各面板的观感。 */

import type { ReactNode } from 'react';
import { PALETTES, matchedPalette, type Palette } from '@/lib/palettes';
import type { Backdrop } from '@/lib/settings';

export function Icon({ path, viewBox = '0 0 24 24' }: { path: string; viewBox?: string }) {
  return (
    <svg viewBox={viewBox} aria-hidden="true">
      <path d={path} />
    </svg>
  );
}

export const ICONS = {
  upload: 'M12 16V3m0 0L8 7m4-4 4 4M4 14v5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5',
  download: 'M12 3v12m0 0 4-4m-4 4-4-4M5 21h14',
  copy: 'M8 8h12v12H8zM16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2',
  reset: 'M4 12a8 8 0 1 0 2.3-5.6L4 8.7M4 4v4.7h4.7',
  importConfig: 'M12 3v12m0 0 4-4m-4 4-4-4M5 21h14',
  exportConfig: 'M12 15V3m0 0 4 4m-4-4-4 4M5 21h14',
  close: 'M5 5l14 14M19 5 5 19',
} as const;

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span>
        {label}
        {hint}
      </span>
      {children}
    </label>
  );
}

export function FieldGrid({ children }: { children: ReactNode }) {
  return <div className="field-grid">{children}</div>;
}

export function Switch({
  checked,
  onChange,
  title,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  title: string;
}) {
  return (
    <span className="switch" title={title}>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span />
    </span>
  );
}

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T;
  options: SegmentOption<T>[];
  onChange: (value: T) => void;
  ariaLabel: string;
}) {
  return (
    <div className="segmented" role="group" aria-label={ariaLabel}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={`segment${option.value === value ? ' is-active' : ''}`}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Slider({
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  return (
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(event) => onChange(Number(event.target.value))}
    />
  );
}

export function ColorField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <input type="color" value={value} onChange={(event) => onChange(event.target.value)} />
  );
}

export function SelectField<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: SegmentOption<T>[];
  onChange: (value: T) => void;
}) {
  return (
    <select value={value} onChange={(event) => onChange(event.target.value as T)}>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

export function FixedRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="fixed-setting">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function PrimaryButton({
  icon,
  children,
  onClick,
  disabled,
}: {
  icon?: string;
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button className="primary-button" type="button" onClick={onClick} disabled={disabled}>
      {icon ? <Icon path={icon} /> : null}
      {children}
    </button>
  );
}

export function SecondaryButton({
  icon,
  children,
  onClick,
  disabled,
}: {
  icon?: string;
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button className="secondary-button" type="button" onClick={onClick} disabled={disabled}>
      {icon ? <Icon path={icon} /> : null}
      {children}
    </button>
  );
}

export function TextButton({
  children,
  onClick,
  danger,
}: {
  children: ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      className={`text-button${danger ? ' danger' : ''}`}
      type="button"
      onClick={onClick}
    >
      {children}
    </button>
  );
}

/** 多色系色板：一格一组主题，显示该组的渐变与强调色。 */
export function PaletteGrid({
  backdrop,
  onPick,
}: {
  backdrop: Backdrop;
  onPick: (palette: Palette) => void;
}) {
  const active = matchedPalette(backdrop);
  return (
    <div className="palette-grid" role="group" aria-label="配色主题">
      {PALETTES.map((palette) => (
        <button
          key={palette.id}
          type="button"
          title={palette.name}
          aria-label={`配色：${palette.name}`}
          aria-pressed={active?.id === palette.id}
          className={`palette-chip${active?.id === palette.id ? ' is-active' : ''}`}
          style={
            {
              '--chip-a': palette.colorA,
              '--chip-b': palette.colorB,
              '--chip-accent': palette.accent,
            } as React.CSSProperties
          }
          onClick={() => onPick(palette)}
        />
      ))}
    </div>
  );
}
