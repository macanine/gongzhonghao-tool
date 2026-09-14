'use client';

import { Copy, Download, RotateCcw } from 'lucide-react';
import { patchSettings, useStore } from '@/lib/store';
import type { HeaderContent, PosterStyle } from '@/lib/settings';
import { PaletteSection, StyleSection } from './PosterStyleControls';
import { usePoster } from './usePoster';
import {
  Button,
  Card,
  Eyebrow,
  Field,
  FieldGrid,
  InfoRow,
  Input,
  Rail,
  Section,
  SectionHeading,
  SectionNote,
  StageColumn,
  Switch,
  Textarea,
} from './ui';

export function HeaderPanel() {
  const content = useStore((state) => state.settings.article.header);
  const ratio = useStore((state) => state.settings.header.ratio);
  const coverStyle = useStore((state) => state.settings.cover);
  const pageCount = useStore((state) => state.pageCount);
  const { canvasRef, size, download, copy } = usePoster('header');

  const set = (patch: Partial<HeaderContent>) => patchSettings({ article: { header: patch } });

  return (
    <>
      <Rail>
        <Section>
          <SectionHeading
            trailing={
              <Switch
                label="复制时带上头图"
                checked={content.enabled}
                onCheckedChange={(enabled) => set({ enabled })}
              />
            }
          >
            试卷信息
          </SectionHeading>
          <SectionNote>
            头图拼在推文最前面，由标题、时间、难度、页数组成，下面是获取提示。
          </SectionNote>
          <Field label="标题（支持两行）">
            <Textarea
              rows={2}
              maxLength={40}
              value={content.title}
              placeholder={'七年级数学\n期中模拟卷'}
              onChange={(event) => set({ title: event.target.value })}
            />
          </Field>
          <FieldGrid>
            <Field label="时间">
              <Input
                type="text"
                maxLength={20}
                value={content.date}
                placeholder="2026.09"
                onChange={(event) => set({ date: event.target.value })}
              />
            </Field>
            <Field label="难度">
              <Input
                type="text"
                maxLength={12}
                value={content.difficulty}
                placeholder="中等"
                onChange={(event) => set({ difficulty: event.target.value })}
              />
            </Field>
          </FieldGrid>
          <Field label="页数（留空按 PDF 页数）">
            <Input
              type="text"
              maxLength={16}
              value={content.pages}
              placeholder={pageCount > 0 ? `共 ${pageCount} 页` : '共 8 页'}
              onChange={(event) => set({ pages: event.target.value })}
            />
          </Field>
          <Field label="获取提示">
            <Textarea
              rows={2}
              maxLength={60}
              value={content.hint}
              placeholder="需要完整电子版？评论区留言获取链接"
              onChange={(event) => set({ hint: event.target.value })}
            />
          </Field>
        </Section>

        <PaletteSection kind="header" />
        <StyleSection kind="header" />
      </Rail>

      <StageColumn
        eyebrow="公众号头图"
        title="试卷信息头图"
        statusState="ready"
        status={`${size.width} × ${size.height} px · ${ratio}`}
      >
        <div className="scrollbar-slim grid min-h-0 flex-1 place-items-center overflow-auto overscroll-contain px-[clamp(18px,5vw,82px)] py-9.5 max-[768px]:min-h-85 max-[768px]:px-3.5 max-[768px]:py-6">
          <canvas
            ref={canvasRef}
            width={size.width}
            height={size.height}
            className="block h-auto max-h-[calc(100dvh-220px)] w-auto max-w-[min(100%,720px)] rounded-sm bg-[#e9ece7] shadow-lift max-[768px]:max-h-none"
          />
        </div>
      </StageColumn>

      <Rail side="right">
        <Card>
          <Eyebrow>导出</Eyebrow>
          <h2 className="mt-1 mb-2 text-lg font-bold tracking-tight text-ink">头图成品</h2>
          <p className="mb-4.5 text-xs leading-relaxed text-muted">
            拼在推文最前面，读者第一眼看到的画面。
          </p>
          <Button variant="primary" size="block" onClick={download}>
            <Download aria-hidden="true" className="size-4" />
            下载 PNG
          </Button>
          <Button variant="secondary" size="block" className="mt-2.5" onClick={copy}>
            <Copy aria-hidden="true" className="size-4" />
            复制头图
          </Button>
          <Button
            variant="bare"
            size="block"
            className="mt-1.5 justify-start text-xs"
            onClick={() => patchSettings({ header: backdropOf(coverStyle) })}
          >
            <RotateCcw aria-hidden="true" className="size-3.5" />
            用封面配色
          </Button>
        </Card>
        <div className="mt-6 px-1">
          <InfoRow label="比例" value="竖版 / 方版 / 横版" />
          <InfoRow label="排版里" value="附在推文开头" />
          <InfoRow label="处理方式" value="仅本地" />
        </div>
      </Rail>
    </>
  );
}

/** 只抄背景与配色，不把封面的文案带进头图配置。 */
function backdropOf(style: PosterStyle) {
  return {
    mode: style.mode,
    colorA: style.colorA,
    colorB: style.colorB,
    accent: style.accent,
    textColor: style.textColor,
    angle: style.angle,
    dim: style.dim,
  };
}
