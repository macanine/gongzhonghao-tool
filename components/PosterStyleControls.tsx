'use client';

import type { ReactNode } from 'react';
import { toast } from '@/lib/feedback';
import { PALETTES, type Palette } from '@/lib/palettes';
import { patchSettings, setPosterImage, useStore, type PosterKind } from '@/lib/store';
import { RATIO_OPTIONS, type BackdropMode, type FontKind, type PosterRatio } from '@/lib/settings';
import { ColorField, Field, FieldGrid, PaletteGrid, Segmented, SelectField, Slider } from './ui';

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
    <section className="control-section">
      <div className="section-heading">
        <span>配色主题</span>
        <span className="section-note-inline">{PALETTES.length} 组</span>
      </div>
      <PaletteGrid backdrop={style} onPick={apply} />

      <Segmented
        ariaLabel="背景类型"
        value={style.mode}
        options={BACKDROP_MODES}
        onChange={(mode) => patchSettings({ [kind]: { mode } })}
      />

      <Field label="强调色">
        <ColorField value={style.accent} onChange={(accent) => patchSettings({ [kind]: { accent } })} />
      </Field>

      <FieldGrid>
        <Field label={style.mode === 'gradient' ? '起始色' : '底色'}>
          <ColorField value={style.colorA} onChange={(colorA) => patchSettings({ [kind]: { colorA } })} />
        </Field>
        {style.mode === 'gradient' || style.mode === 'glow' ? (
          <Field label="第二色">
            <ColorField value={style.colorB} onChange={(colorB) => patchSettings({ [kind]: { colorB } })} />
          </Field>
        ) : null}
      </FieldGrid>

      {style.mode === 'gradient' ? (
        <Field label="渐变角度" hint={<output>{style.angle}°</output>}>
          <Slider
            value={style.angle}
            min={0}
            max={360}
            step={5}
            onChange={(angle) => patchSettings({ [kind]: { angle } })}
          />
        </Field>
      ) : null}

      {style.mode === 'image' ? (
        <>
          <Field label="背景图片">
            <input
              type="file"
              accept="image/*"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) loadBackground(kind, file);
                event.target.value = '';
              }}
            />
          </Field>
          <Field label="遮罩" hint={<output>{style.dim}%</output>}>
            <Slider
              value={style.dim}
              min={0}
              max={76}
              onChange={(dim) => patchSettings({ [kind]: { dim } })}
            />
          </Field>
        </>
      ) : null}

      <Field label="文字色">
        <ColorField
          value={style.textColor}
          onChange={(textColor) => patchSettings({ [kind]: { textColor } })}
        />
      </Field>
    </section>
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
    <section className="control-section">
      <div className="section-heading">
        <span>尺寸与版式</span>
      </div>
      <FieldGrid>
        <Field label="宽度">
          <SelectField
            value={String(style.width)}
            options={[
              { value: '900', label: '900 px' },
              { value: '1200', label: '1200 px' },
              { value: '1600', label: '1600 px' },
              { value: '2000', label: '2000 px' },
            ]}
            onChange={(width) => patchSettings({ [kind]: { width: Number(width) } })}
          />
        </Field>
        {kind === 'header' ? (
          <Field label="比例">
            <SelectField
              value={style.ratio}
              options={ratios}
              onChange={(ratio: PosterRatio) => patchSettings({ [kind]: { ratio } })}
            />
          </Field>
        ) : null}
      </FieldGrid>
      <Field label="字体">
        <SelectField
          value={style.font}
          options={FONTS}
          onChange={(font) => patchSettings({ [kind]: { font } })}
        />
      </Field>
      {children}
    </section>
  );
}
