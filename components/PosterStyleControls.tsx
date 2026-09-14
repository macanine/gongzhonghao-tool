'use client';

import type { CSSProperties, ReactNode } from 'react';
import { toast } from '@/lib/feedback';
import { matchedPalette, PALETTES, type Palette } from '@/lib/palettes';
import { patchSettings, setPosterImage, useStore, type PosterKind } from '@/lib/store';
import { RATIO_OPTIONS, type Backdrop, type BackdropMode, type FontKind, type PosterRatio } from '@/lib/settings';
import { cn } from '@/lib/utils';
import {
  ColorInput,
  Field,
  FieldGrid,
  FileButton,
  Section,
  SectionHeading,
  Segmented,
  Select,
  SliderField,
} from './ui';

const BACKDROP_MODES: { value: BackdropMode; label: string }[] = [
  { value: 'solid', label: '纯色' },
  { value: 'gradient', label: '渐变' },
  { value: 'glow', label: '光晕' },
  { value: 'image', label: '图片' },
];

const FONTS: { value: FontKind; label: string }[] = [
  { value: 'serif', label: '衬线' },
  { value: 'sans', label: '无衬线' },
];

/** 配色：点一格整组换掉渐变色、文字色与强调色。 */
export function PaletteSection({ kind }: { kind: PosterKind }) {
  const style = useStore((state) => state.settings[kind]);
  const apply = (palette: Palette) =>
    patchSettings({
      [kind]: {
        mode: palette.mode,
        colorA: palette.colorA,
        colorB: palette.colorB,
        accent: palette.accent,
        textColor: palette.textColor,
      },
    });

  return (
    <Section>
      <SectionHeading
        trailing={<span className="text-[11px] font-semibold text-faint">{PALETTES.length} 组</span>}
      >
        配色主题
      </SectionHeading>
      <PaletteGrid backdrop={style} onPick={apply} />

      <Segmented
        ariaLabel="背景类型"
        value={style.mode}
        options={BACKDROP_MODES}
        onChange={(mode) => patchSettings({ [kind]: { mode } })}
      />

      <Field label="强调色">
        <ColorInput
          value={style.accent}
          onChange={(event) => patchSettings({ [kind]: { accent: event.target.value } })}
        />
      </Field>

      <FieldGrid>
        <Field label={style.mode === 'gradient' ? '起始色' : '底色'}>
          <ColorInput
            value={style.colorA}
            onChange={(event) => patchSettings({ [kind]: { colorA: event.target.value } })}
          />
        </Field>
        {style.mode === 'gradient' || style.mode === 'glow' ? (
          <Field label="第二色">
            <ColorInput
              value={style.colorB}
              onChange={(event) => patchSettings({ [kind]: { colorB: event.target.value } })}
            />
          </Field>
        ) : null}
      </FieldGrid>

      {style.mode === 'gradient' ? (
        <SliderField
          label="渐变角度"
          suffix="°"
          value={style.angle}
          min={0}
          max={360}
          step={5}
          onValueChange={(angle) => patchSettings({ [kind]: { angle } })}
        />
      ) : null}

      {style.mode === 'image' ? (
        <>
          <Field label="背景图片">
            <FileButton accept="image/*" onPick={(file) => loadBackground(kind, file)}>
              选择图片
            </FileButton>
          </Field>
          <SliderField
            label="遮罩"
            suffix="%"
            value={style.dim}
            min={0}
            max={76}
            onValueChange={(dim) => patchSettings({ [kind]: { dim } })}
          />
        </>
      ) : null}

      <Field label="文字色">
        <ColorInput
          value={style.textColor}
          onChange={(event) => patchSettings({ [kind]: { textColor: event.target.value } })}
        />
      </Field>
    </Section>
  );
}

/** 18 组主题各占一格，用该组的渐变做底、强调色做一道短横线。 */
function PaletteGrid({ backdrop, onPick }: { backdrop: Backdrop; onPick: (palette: Palette) => void }) {
  const active = matchedPalette(backdrop);
  return (
    <div role="group" aria-label="配色主题" className="mb-3.5 grid grid-cols-6 gap-1.5">
      {PALETTES.map((palette) => {
        const isActive = active?.id === palette.id;
        return (
          <button
            key={palette.id}
            type="button"
            title={palette.name}
            aria-label={`配色：${palette.name}`}
            aria-pressed={isActive}
            onClick={() => onPick(palette)}
            style={
              {
                '--chip-a': palette.colorA,
                '--chip-b': palette.colorB,
                '--chip-accent': palette.accent,
              } as CSSProperties
            }
            className={cn(
              'relative h-8.5 rounded-sm border-2 border-black/6',
              'bg-[linear-gradient(135deg,var(--chip-a),var(--chip-b))]',
              'transition-[transform,box-shadow] duration-150',
              "before:absolute before:right-[22%] before:bottom-[7px] before:left-[22%] before:h-0.75 before:rounded-full before:bg-[var(--chip-accent)] before:content-['']",
              'hover:-translate-y-0.5 hover:shadow-card',
              isActive && 'border-ink ring-2 ring-ink ring-offset-2 ring-offset-paper',
            )}
          />
        );
      })}
    </div>
  );
}

function loadBackground(kind: PosterKind, file: File): void {
  const url = URL.createObjectURL(file);
  const image = new Image();
  image.onload = () => {
    setPosterImage(kind, {
      source: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
    });
    URL.revokeObjectURL(url);
    toast('背景图片已载入');
  };
  image.onerror = () => {
    URL.revokeObjectURL(url);
    toast('背景图片无法读取', true);
  };
  image.src = url;
}

/** 版式：尺寸、比例、字体，外加各面板自己的补充项。 */
export function StyleSection({ kind, children }: { kind: PosterKind; children?: ReactNode }) {
  const style = useStore((state) => state.settings[kind]);
  const ratios = RATIO_OPTIONS.map((option) => ({ value: option.value, label: option.label }));

  return (
    <Section>
      <SectionHeading>尺寸与版式</SectionHeading>
      <FieldGrid>
        <Field label="宽度">
          <Select
            value={String(style.width)}
            onChange={(event) => patchSettings({ [kind]: { width: Number(event.target.value) } })}
          >
            <option value="900">900 px</option>
            <option value="1200">1200 px</option>
            <option value="1600">1600 px</option>
            <option value="2000">2000 px</option>
          </Select>
        </Field>
        {kind === 'header' ? (
          <Field label="比例">
            <Select
              value={style.ratio}
              onChange={(event) =>
                patchSettings({ [kind]: { ratio: event.target.value as PosterRatio } })
              }
            >
              {ratios.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
      </FieldGrid>
      <Field label="字体">
        <Select
          value={style.font}
          onChange={(event) => patchSettings({ [kind]: { font: event.target.value as FontKind } })}
        >
          {FONTS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </Field>
      {children}
    </Section>
  );
}
