'use client';

/** 一组共用的表单控件与图标，统一各面板的观感。 */

import type { ComponentType, ReactNode } from 'react';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Copy,
  Download,
  RefreshCcw,
  Upload,
  X,
  type LucideProps,
} from 'lucide-react';
import { PALETTES, matchedPalette, type Palette } from '@/lib/palettes';
import type { Backdrop } from '@/lib/settings';

export function Icon({ path, viewBox = '0 0 24 24' }: { path: string; viewBox?: string }) {
  const IconComponent = iconForPath(path);
  if (IconComponent) return <IconComponent aria-hidden="true" />;
  return (
    <svg viewBox={viewBox} aria-hidden="true" focusable="false">
      <path d={path} />
    </svg>
  );
}

export const ICONS = {
  upload: 'ui-upload',
  download: 'ui-download',
  copy: 'ui-copy',
  reset: 'ui-reset',
  importConfig: 'ui-import',
  exportConfig: 'ui-export',
  close: 'ui-close',
} as const;

function iconForPath(path: string): ComponentType<LucideProps> | null {
  switch (path) {
    case ICONS.upload:
      return Upload;
    case ICONS.download:
      return Download;
    case ICONS.copy:
      return Copy;
    case ICONS.reset:
      return RefreshCcw;
    case ICONS.importConfig:
      return ArrowDownToLine;
    case ICONS.exportConfig:
      return ArrowUpFromLine;
    case ICONS.close:
      return X;
    default:
      return null;
  }
}

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
