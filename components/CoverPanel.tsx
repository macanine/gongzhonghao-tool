'use client';

import { Copy, Download } from 'lucide-react';
import { patchSettings, useStore } from '@/lib/store';
import { PaletteSection, StyleSection } from './PosterStyleControls';
import { usePoster } from './usePoster';
import { Button, Card, Eyebrow, Field, InfoRow, Input, Rail, Section, SectionHeading, StageColumn, Textarea } from './ui';

export function CoverPanel() {
  const cover = useStore((state) => state.settings.cover);
  const { canvasRef, size, download, copy } = usePoster('cover');
  const set = (patch: Partial<{ title: string; subtitle: string }>) =>
    patchSettings({ cover: patch });

  return (
    <>
      <Rail>
        <Section>
          <SectionHeading>文案</SectionHeading>
          <Field label="主标题（支持两行）">
            <Textarea
              rows={2}
              maxLength={32}
              value={cover.title}
              placeholder={'手写笔记\n可在这里换行'}
              onChange={(event) => set({ title: event.target.value })}
            />
          </Field>
          <Field label="副标题（可选）">
            <Input
              type="text"
              maxLength={46}
              value={cover.subtitle}
              placeholder="阅读、摘录与思考"
              onChange={(event) => set({ subtitle: event.target.value })}
            />
          </Field>
        </Section>

        <PaletteSection kind="cover" />
        <StyleSection kind="cover" />
      </Rail>

      <StageColumn
        eyebrow="微信封面"
        title="文字封面"
        statusState="ready"
        status={`${size.width} × ${size.height} px · 2.35:1`}
      >
        <div className="scrollbar-slim grid min-h-0 flex-1 place-items-center overflow-auto overscroll-contain px-[clamp(18px,5vw,82px)] py-9.5 max-[768px]:min-h-85 max-[768px]:px-3.5 max-[768px]:py-6">
          <canvas
            ref={canvasRef}
            width={size.width}
            height={size.height}
            className="block h-auto w-[min(100%,900px)] rounded-sm bg-[#e9ece7] shadow-lift"
          />
        </div>
      </StageColumn>

      <Rail side="right">
        <Card>
          <Eyebrow>导出</Eyebrow>
          <h2 className="mt-1 mb-2 text-lg font-bold tracking-tight text-ink">封面成品</h2>
          <p className="mb-4.5 text-xs leading-relaxed text-muted">
            公众号头条封面的标准比例，直接替换原有封面即可。
          </p>
          <Button variant="primary" size="block" onClick={download}>
            <Download aria-hidden="true" className="size-4" />
            下载 PNG
          </Button>
          <Button variant="secondary" size="block" className="mt-2.5" onClick={copy}>
            <Copy aria-hidden="true" className="size-4" />
            复制封面
          </Button>
        </Card>
        <div className="mt-6 px-1">
          <InfoRow label="默认尺寸" value="900 × 383" />
          <InfoRow label="比例" value="2.35 : 1" />
          <InfoRow label="配色主题" value="与头图同一套" />
        </div>
      </Rail>
    </>
  );
}
