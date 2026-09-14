'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { Copy, Download, Trash2, Upload, X } from 'lucide-react';
import { isPdf, loadPdf, type DocRecord } from '@/lib/article/pdf';
import { buildArticleHtml, buildZip, copyHtml, renderHeaderBlob } from '@/lib/article/export';
import { runJob, toast } from '@/lib/feedback';
import { ARTICLE_WIDTH, ratioOf, type WatermarkSettings } from '@/lib/settings';
import { patchSettings, setPageCount, useStore } from '@/lib/store';
import { cn } from '@/lib/utils';
import { LazyPage } from './LazyPage';
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

interface PageRecord {
  id: string;
  docId: string;
  name: string;
  pageNumber: number;
  aspect: number;
}

let seed = 0;
const nextId = () => `page-${(seed += 1)}`;

export function ArticlePanel() {
  // 整份设置都要用（复制 / 打包），所以这里订阅它；背景图另取，避免和页数、
  // 头图设置互相牵动。
  const settings = useStore((state) => state.settings);
  const headerImage = useStore((state) => state.images.header);
  const { watermark, output, header } = settings.article;
  const [pages, setPages] = useState<PageRecord[]>([]);
  const docs = useRef(new Map<string, DocRecord>());
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [draggingOver, setDraggingOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => setPageCount(pages.length), [pages.length]);
  useEffect(
    () => () => {
      docs.current.forEach((doc) => doc.release().catch(() => undefined));
      docs.current.clear();
    },
    [],
  );

  const importFiles = useCallback(async (fileList: FileList | null) => {
    const selected = Array.from(fileList ?? []);
    const files = selected.filter(isPdf);
    if (!files.length) {
      toast('请选择 PDF 文件', true);
      return;
    }
    await runJob('正在导入 PDF', async (detail) => {
      let added = 0;
      for (const file of files) {
        detail(`读取 ${file.name}`);
        const { pdf, release } = await loadPdf(file);
        const docId = `doc-${(seed += 1)}`;
        docs.current.set(docId, { pdf, release });
        const records: PageRecord[] = [];
        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
          detail(`${file.name} · 第 ${pageNumber}/${pdf.numPages} 页`);
          const page = await pdf.getPage(pageNumber);
          const viewport = page.getViewport({ scale: 1 });
          page.cleanup();
          records.push({
            id: nextId(),
            docId,
            name: file.name,
            pageNumber,
            aspect: viewport.height / viewport.width,
          });
        }
        setPages((previous) => [...previous, ...records]);
        added += records.length;
      }
      const ignored = selected.length - files.length;
      toast(`已导入 ${added} 页 PDF${ignored ? `，已忽略 ${ignored} 个非 PDF 文件` : ''}`);
    });
  }, []);

  const clearPages = useCallback(async () => {
    if (!pages.length) return;
    const confirmed = await confirm(
      `清空当前 ${pages.length} 页 PDF？此操作不会影响已保存的配置。`,
      '清空',
    );
    if (!confirmed) return;
    docs.current.forEach((doc) => doc.release().catch(() => undefined));
    docs.current.clear();
    setPages([]);
  }, [pages.length]);

  const movePage = useCallback((fromId: string, targetId: string, before: boolean) => {
    setPages((previous) => {
      const from = previous.findIndex((page) => page.id === fromId);
      const target = previous.findIndex((page) => page.id === targetId);
      if (from < 0 || target < 0 || from === target) return previous;
      const next = [...previous];
      const [record] = next.splice(from, 1);
      let insertAt = target;
      if (from < target) insertAt -= 1;
      if (!before) insertAt += 1;
      next.splice(insertAt, 0, record!);
      return next;
    });
  }, []);

  const snapshot = useCallback(
    () => pages.map(({ docId, pageNumber, name }) => ({ docId, pageNumber, name })),
    [pages],
  );

  const headerInput = useCallback(
    () => ({
      style: settings.header,
      content: header,
      pageCount: pages.length,
      image: headerImage,
    }),
    [settings.header, header, pages.length, headerImage],
  );

  const copyAll = useCallback(() => {
    if (!pages.length) {
      toast('请先导入 PDF', true);
      return;
    }
    void runJob('正在准备公众号内容', async (detail) => {
      const html = buildArticleHtml({
        snapshot: snapshot(),
        docs: docs.current,
        settings,
        headerInput: headerInput(),
        onProgress: detail,
      });
      await copyHtml(html, pages.length);
      toast(`已复制 ${pages.length} 页图片`);
    });
  }, [pages.length, settings, snapshot, headerInput]);

  const downloadZip = useCallback(() => {
    if (!pages.length) {
      toast('请先导入 PDF', true);
      return;
    }
    void runJob('正在打包高清图片', async (detail) => {
      await buildZip({
        snapshot: snapshot(),
        docs: docs.current,
        settings,
        headerInput: headerInput(),
        extension: output.format === 'jpeg' ? 'jpg' : 'png',
        includeHeader: header.enabled,
        onProgress: detail,
      });
      toast(`已下载 ${pages.length} 张图片`);
    });
  }, [pages.length, settings, snapshot, headerInput, output.format, header.enabled]);

  const headerPreviewUrl = useHeaderPreview(header.enabled);

  return (
    <>
      <Rail>
        <Section>
          <SectionHeading trailing={<CountBadge>{pages.length}</CountBadge>}>PDF 页面</SectionHeading>
          <Button
            variant="secondary"
            onClick={() => fileInput.current?.click()}
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
              'grid w-full justify-items-center gap-1.5 rounded-md border border-dashed px-3.5 py-5',
              'bg-gradient-to-b from-paper to-accent-wash',
              'transition-[border-color,background-color,transform,box-shadow] duration-150',
              draggingOver
                ? '-translate-y-px border-accent bg-accent-soft shadow-card'
                : 'border-line-strong hover:-translate-y-px hover:border-accent hover:bg-accent-soft hover:shadow-card',
            )}
          >
            <Upload aria-hidden="true" className="size-5 text-accent" />
            <span className="text-[13px] font-semibold">导入 PDF</span>
          </Button>
          <input
            ref={fileInput}
            type="file"
            accept="application/pdf,.pdf"
            multiple
            hidden
            onChange={(event) => {
              void importFiles(event.target.files);
              event.target.value = '';
            }}
          />

          <div className="mt-3 grid gap-1.5">
            {pages.map((page, index) => (
              <div
                key={page.id}
                draggable
                onDragStart={() => setDragging(page.id)}
                onDragEnd={() => {
                  setDragging(null);
                  setDropTarget(null);
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  if (dragging && dragging !== page.id) {
                    event.dataTransfer.dropEffect = 'move';
                    setDropTarget(page.id);
                  }
                }}
                onDragLeave={() => setDropTarget((current) => (current === page.id ? null : current))}
                onDrop={(event) => {
                  event.preventDefault();
                  if (dragging && dragging !== page.id) {
                    const rect = event.currentTarget.getBoundingClientRect();
                    movePage(dragging, page.id, event.clientY < rect.top + rect.height / 2);
                  }
                  setDragging(null);
                  setDropTarget(null);
                }}
                className={cn(
                  'grid grid-cols-[10px_38px_minmax(0,1fr)_30px] items-center gap-2 rounded-md border p-1.75',
                  'transition-[background-color,border-color,opacity] duration-150',
                  dragging === page.id
                    ? 'border-transparent opacity-40'
                    : dropTarget === page.id
                      ? 'border-accent bg-accent-soft'
                      : 'border-transparent hover:border-line hover:bg-panel',
                )}
              >
                <span
                  aria-hidden="true"
                  className="rotate-90 text-base tracking-[-2px] text-faint select-none"
                >
                  ···
                </span>
                <span className="grid h-12 w-9.5 place-items-center rounded-xs border border-line bg-[#edf2ee] text-[10px] font-bold text-muted">
                  {page.pageNumber}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[11px] font-semibold text-ink" title={page.name}>
                    {page.name}
                  </span>
                  <span className="mt-0.5 block text-[10px] text-faint">
                    第 {page.pageNumber} 页 · {index + 1}
                  </span>
                </span>
                <Button
                  variant="ghost"
                  size="iconSm"
                  title="删除此页"
                  aria-label="删除此页"
                  className="hover:bg-danger-soft hover:text-danger"
                  onClick={() =>
                    setPages((previous) => previous.filter((item) => item.id !== page.id))
                  }
                >
                  <X aria-hidden="true" className="size-3.5" />
                </Button>
              </div>
            ))}
            {pages.length === 0 ? (
              <p className="py-5 text-center text-[11px] text-faint">
                暂无页面 · 导入 PDF 后开始排版
              </p>
            ) : null}
          </div>
        </Section>

        <WatermarkSection watermark={watermark} />
        <OutputSection output={output} onClear={clearPages} disabled={!pages.length} />
      </Rail>

      <StageColumn
        eyebrow="公众号内容"
        title="HTML 预览"
        statusState={pages.length ? 'ready' : 'idle'}
        status={pages.length ? `${pages.length} 页已就绪` : '等待 PDF'}
      >
        <div
          data-scroll="preview"
          className="scrollbar-slim min-h-0 flex-1 overflow-y-auto overscroll-contain px-[clamp(10px,5vw,76px)] pt-[clamp(18px,4vw,48px)] pb-17.5 max-[768px]:px-2 max-[768px]:pt-3.5 max-[768px]:pb-10.5"
        >
          <article className="mx-auto min-h-86 w-[min(100%,677px)] rounded-[3px] border border-line-strong/70 bg-paper p-[clamp(14px,2.5vw,28px)] shadow-card max-[768px]:rounded-[2px] max-[768px]:p-3">
            {header.enabled && headerPreviewUrl ? (
              <div
                className="aspect-box mb-5 rounded-[2px] bg-[#eceee9]"
                style={{ '--page-aspect': `${100 / ratioOf(settings.header)}%` } as CSSProperties}
              >
                <img
                  src={headerPreviewUrl}
                  alt="试卷信息头图"
                  className="absolute inset-0 size-full object-fill"
                />
              </div>
            ) : null}
            {pages.length === 0 ? (
              <div className="grid min-h-80 place-content-center justify-items-center gap-3.5 text-center text-faint">
                <div className="grid h-16.5 w-13.5 place-items-center rounded-md border border-[#b9dbc7] bg-accent-wash text-[11px] font-bold tracking-[0.08em] text-accent-strong">
                  PDF
                </div>
                <p className="text-[13px]">导入手写 PDF 后在这里预览</p>
              </div>
            ) : (
              pages.map((page) => {
                const doc = docs.current.get(page.docId);
                if (!doc) return null;
                return (
                  <LazyPage
                    key={page.id}
                    doc={doc.pdf}
                    pageNumber={page.pageNumber}
                    aspect={page.aspect}
                    watermark={watermark}
                  />
                );
              })
            )}
          </article>
        </div>
      </StageColumn>

      <Rail side="right">
        <Card>
          <Eyebrow>发布</Eyebrow>
          <h2 className="mt-1 mb-2 text-lg font-bold tracking-tight text-ink">复制到公众号</h2>
          <p className="mb-4.5 text-xs leading-relaxed text-muted">
            {pages.length
              ? `${header.enabled ? '头图 + ' : ''}${pages.length} 页将按当前顺序转为高清图片。`
              : '图片会以 HTML 富文本形式复制。'}
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
          <InfoRow label="页面顺序" value="拖动调整" />
          <InfoRow label="正文宽度" value={`${ARTICLE_WIDTH} px`} />
        </div>
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
        清空全部页面
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
