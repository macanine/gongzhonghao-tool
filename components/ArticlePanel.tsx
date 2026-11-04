'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { Copy, Download, Trash2, Upload } from 'lucide-react';
import { describeBlocks } from '@/lib/article/blocks';
import { buildArticleHtml, buildZip, copyArticle, renderHeaderBlob } from '@/lib/article/export';
import { runJob, toast } from '@/lib/feedback';
import { ARTICLE_WIDTH, ratioOf, type WatermarkSettings } from '@/lib/settings';
import { getState, patchSettings, useStore } from '@/lib/store';
import { cn } from '@/lib/utils';
import { ArticleEditor } from './ArticleEditor';
import { ArticleOutline } from './ArticleOutline';
import { useArticle } from './useArticle';
import {
  Button,
  Card,
  ColorInput,
  CountBadge,
  Eyebrow,
  Field,
  FieldGrid,
  FixedRow,
  InfoRow,
  Input,
  Rail,
  Section,
  SectionHeading,
  Select,
  SliderField,
  StageColumn,
  Switch,
  confirm,
} from './ui';

export function ArticlePanel() {
  // 只订阅正文相关的设置：封面那边改字不会让这里跟着重渲染。
  // 导出时要用整份设置，到点击那一刻再从 store 里取。
  const { watermark, output, header } = useStore((state) => state.settings.article);
  const headerStyle = useStore((state) => state.settings.header);
  const article = useArticle();
  const { blocks, docs, importFiles, clear } = article;
  const [draggingOver, setDraggingOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const pickPdf = useCallback(() => fileInput.current?.click(), []);

  // 拖滑块时水印每帧都在变；预览停手后再重画，导出始终用最新值。
  const previewWatermark = useDebounced(watermark, 240);
  const summary = describeBlocks(blocks);
  const pageCount = blocks.filter((block) => block.kind === 'page').length;

  const clearAll = useCallback(async () => {
    if (!blocks.length) return;
    const confirmed = await confirm(
      `清空正文里的 ${summary || '空白内容'}？此操作不会影响已保存的配置。`,
      '清空',
    );
    if (confirmed) clear();
  }, [blocks.length, summary, clear]);

  const exportOptions = () => {
    const state = getState();
    return {
      blocks,
      docs: docs.current,
      settings: state.settings,
      headerInput: {
        style: state.settings.header,
        content: state.settings.article.header,
        pageCount,
        image: state.images.header,
      },
    };
  };

  const copyAll = () => {
    if (!blocks.length) {
      toast('正文还是空的，先导入 PDF 或写点文字', true);
      return;
    }
    void runJob('正在准备公众号内容', async (detail) => {
      const options = exportOptions();
      await copyArticle(buildArticleHtml({ ...options, onProgress: detail }), options.blocks);
      toast(`已复制：${summary}`);
    });
  };

  const downloadZip = () => {
    if (!pageCount && !blocks.some((block) => block.kind === 'image')) {
      toast('没有可打包的图片，先导入 PDF 或插图', true);
      return;
    }
    void runJob('正在打包高清图片', async (detail) => {
      await buildZip({
        ...exportOptions(),
        extension: output.format === 'jpeg' ? 'jpg' : 'png',
        includeHeader: header.enabled,
        onProgress: detail,
      });
      toast('图片包已下载');
    });
  };

  const headerPreviewUrl = useHeaderPreview(header.enabled);

  return (
    <>
      <Rail>
        <Section>
          <SectionHeading trailing={<CountBadge>{blocks.length}</CountBadge>}>正文内容</SectionHeading>
          <Button
            variant="secondary"
            onClick={pickPdf}
            onDragOver={(event) => {
              event.preventDefault();
              setDraggingOver(true);
            }}
            onDragLeave={() => setDraggingOver(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDraggingOver(false);
              void importFiles(event.dataTransfer.files);
            }}
            className={cn(
              'grid w-full justify-items-center gap-1 rounded-md border border-dashed px-3.5 py-4.5',
              'bg-accent-wash/60',
              'transition-[border-color,background-color,transform,box-shadow] duration-150',
              draggingOver
                ? '-translate-y-px border-accent bg-accent-soft shadow-card'
                : 'border-line-strong hover:-translate-y-px hover:border-accent hover:bg-accent-soft hover:shadow-card',
            )}
          >
            <Upload aria-hidden="true" className="size-5 text-accent" />
            <span className="text-[13px] font-semibold">导入 PDF</span>
            <span className="text-[10px] font-normal text-muted">也可拖入 PDF 或图片</span>
          </Button>
          <input
            ref={fileInput}
            type="file"
            accept="application/pdf,.pdf,image/*"
            multiple
            hidden
            onChange={(event) => {
              void importFiles(event.target.files);
              event.target.value = '';
            }}
          />
          <ArticleOutline blocks={blocks} onMove={article.move} onRemove={article.remove} />
        </Section>

        <WatermarkSection watermark={watermark} />
        <OutputSection output={output} onClear={clearAll} disabled={!blocks.length} />
      </Rail>

      <StageColumn
        eyebrow="公众号内容"
        title="正文编辑"
        statusState={blocks.length ? 'ready' : 'idle'}
        status={summary || '等待内容'}
      >
        <ArticleEditor
          article={article}
          watermark={previewWatermark}
          onPickPdf={pickPdf}
          header={
            header.enabled && headerPreviewUrl ? (
              <div
                className="aspect-box rounded-[2px] bg-panel"
                style={{ '--page-aspect': `${100 / ratioOf(headerStyle)}%` } as CSSProperties}
              >
                <img
                  src={headerPreviewUrl}
                  alt="试卷信息头图"
                  className="absolute inset-0 size-full object-fill"
                />
              </div>
            ) : null
          }
        />
      </StageColumn>

      <Rail side="right">
        <Card>
          <Eyebrow>发布</Eyebrow>
          <h2 className="mt-1 mb-2 text-lg font-bold tracking-tight text-ink">复制到公众号</h2>
          <p className="mb-4.5 text-xs leading-relaxed text-muted">
            {blocks.length
              ? `${header.enabled ? '头图 + ' : ''}${summary}，按当前顺序转为公众号富文本。`
              : '图片和文字会以 HTML 富文本形式复制，直接粘贴进公众号编辑器。'}
          </p>
          <Button variant="primary" size="block" onClick={copyAll}>
            <Copy aria-hidden="true" className="size-4" />
            一键复制全部
          </Button>
          <Button variant="secondary" size="block" className="mt-2.5" onClick={downloadZip}>
            <Download aria-hidden="true" className="size-4" />
            下载图片包
          </Button>
        </Card>
        <div className="mt-6 px-1">
          <InfoRow label="头图" value={header.enabled ? '附在推文开头' : '已关闭'} />
          <InfoRow label="处理方式" value="仅本地" />
          <InfoRow label="添加内容" value="悬停块间插入" />
          <InfoRow label="正文宽度" value={`${ARTICLE_WIDTH} px`} />
        </div>
        <p className="mt-4 px-1 text-[11px] leading-relaxed text-faint">
          正文只保存在当前页面，刷新前记得复制或下载。
        </p>
      </Rail>
    </>
  );
}

/* ---------------- 子区块 ---------------- */

function WatermarkSection({ watermark }: { watermark: WatermarkSettings }) {
  const set = (patch: Partial<WatermarkSettings>) => patchSettings({ article: { watermark: patch } });
  return (
    <Section>
      <SectionHeading
        trailing={
          <Switch
            label="启用水印"
            checked={watermark.enabled}
            onCheckedChange={(enabled) => set({ enabled })}
          />
        }
      >
        文字水印
      </SectionHeading>
      <Field label="内容">
        <Input
          type="text"
          maxLength={40}
          value={watermark.text}
          placeholder="内部资料 · 请勿外传"
          disabled={!watermark.enabled}
          onChange={(event) => set({ text: event.target.value })}
        />
      </Field>
      <FieldGrid>
        <SliderField
          label="字号"
          suffix="%"
          value={watermark.size}
          min={4}
          max={16}
          step={0.5}
          onValueChange={(size) => set({ size })}
        />
        <SliderField
          label="透明度"
          suffix="%"
          value={watermark.opacity}
          min={4}
          max={38}
          onValueChange={(opacity) => set({ opacity })}
        />
      </FieldGrid>
      <Field label="颜色">
        <ColorInput
          value={watermark.color}
          disabled={!watermark.enabled}
          onChange={(event) => set({ color: event.target.value })}
        />
      </Field>
      <FixedRow label="位置与倾斜" value="居中 · 45°" />
    </Section>
  );
}

function OutputSection({
  output,
  onClear,
  disabled,
}: {
  output: { scale: number; format: 'png' | 'jpeg'; quality: number };
  onClear: () => void;
  disabled: boolean;
}) {
  const set = (patch: Partial<typeof output>) => patchSettings({ article: { output: patch } });
  return (
    <Section>
      <SectionHeading>输出图片</SectionHeading>
      <FieldGrid>
        <Field label="清晰度">
          <Select
            value={String(output.scale)}
            onChange={(event) => set({ scale: Number(event.target.value) })}
          >
            <option value="4">4 倍</option>
            <option value="3">3 倍</option>
            <option value="2">2 倍</option>
          </Select>
        </Field>
        <Field label="格式">
          <Select
            value={output.format}
            onChange={(event) => set({ format: event.target.value as 'png' | 'jpeg' })}
          >
            <option value="png">PNG</option>
            <option value="jpeg">JPEG</option>
          </Select>
        </Field>
      </FieldGrid>
      {output.format === 'jpeg' ? (
        <SliderField
          label="JPEG 质量"
          suffix="%"
          value={output.quality}
          min={50}
          max={100}
          onValueChange={(quality) => set({ quality })}
        />
      ) : null}
      <Button
        variant="danger"
        size="sm"
        className="mt-1 w-full justify-start px-0 hover:bg-transparent"
        disabled={disabled}
        onClick={onClear}
      >
        <Trash2 aria-hidden="true" className="size-3.5" />
        清空正文
      </Button>
    </Section>
  );
}

/* ---------------- 头图预览 ---------------- */

/** 头图小图：设置或页数一变就重画，并换成 blob URL 显示在推文开头。 */
function useHeaderPreview(enabled: boolean): string | null {
  const style = useStore((state) => state.settings.header);
  const content = useStore((state) => state.settings.article.header);
  const pageCount = useStore((state) => state.pageCount);
  const image = useStore((state) => state.images.header);
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      setUrl(null);
      return;
    }
    let alive = true;
    let objectUrl: string | null = null;
    const timer = setTimeout(() => {
      renderHeaderBlob({ style, content, pageCount, image })
        .then((blob) => {
          if (!alive) return;
          objectUrl = URL.createObjectURL(blob);
          setUrl(objectUrl);
        })
        .catch(() => undefined);
    }, 160);

    return () => {
      alive = false;
      clearTimeout(timer);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [enabled, style, content, pageCount, image]);

  return url;
}

/** 值停止变化 delay 毫秒后才跟上，用来给预览重绘降频。 */
function useDebounced<T>(value: T, delay: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return settled;
}
