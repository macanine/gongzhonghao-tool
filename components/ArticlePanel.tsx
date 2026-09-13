'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { isPdf, loadPdf, type DocRecord } from '@/lib/article/pdf';
import { buildArticleHtml, buildZip, copyHtml, renderHeaderBlob } from '@/lib/article/export';
import { runJob, toast } from '@/lib/feedback';
import { ARTICLE_WIDTH, ratioOf, type WatermarkSettings } from '@/lib/settings';
import { patchSettings, setPageCount, useStore } from '@/lib/store';
import { LazyPage } from './LazyPage';
import {
  Field,
  FieldGrid,
  FixedRow,
  ICONS,
  Icon,
  PrimaryButton,
  SecondaryButton,
  SelectField,
  Slider,
  Switch,
  TextButton,
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
  const { settings, pageCount, images } = useStore();
  const { watermark, output, header } = settings.article;
  const [pages, setPages] = useState<PageRecord[]>([]);
  const docs = useRef(new Map<string, DocRecord>());
  const [dragging, setDragging] = useState<string | null>(null);
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

  const clearPages = useCallback(() => {
    if (!pages.length) return;
    if (!window.confirm(`清空当前 ${pages.length} 页 PDF？此操作不会影响已保存的配置。`)) return;
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
      image: images.header,
    }),
    [settings.header, header, pages.length, images.header],
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
      <aside className="left-rail article-rail">
        <div className="rail-scroll">
          <section className="control-section">
            <div className="section-heading">
              <span>PDF 页面</span>
              <span className="count-badge">{pages.length}</span>
            </div>
            <button
              type="button"
              className={`upload-zone${draggingOver ? ' is-dragover' : ''}`}
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
            >
              <Icon path={ICONS.upload} />
              <span>导入 PDF</span>
            </button>
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
            <div className="page-list">
              {pages.map((page, index) => (
                <div
                  key={page.id}
                  className={`page-row${dragging === page.id ? ' is-dragging' : ''}`}
                  draggable
                  onDragStart={() => setDragging(page.id)}
                  onDragEnd={() => setDragging(null)}
                  onDragOver={(event) => {
                    event.preventDefault();
                    if (dragging && dragging !== page.id) event.dataTransfer.dropEffect = 'move';
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    if (dragging && dragging !== page.id) {
                      const rect = event.currentTarget.getBoundingClientRect();
                      movePage(dragging, page.id, event.clientY < rect.top + rect.height / 2);
                    }
                    setDragging(null);
                  }}
                >
                  <span className="page-grip">···</span>
                  <span className="page-thumb-placeholder">{page.pageNumber}</span>
                  <span className="page-meta">
                    <span className="page-name" title={page.name}>
                      {page.name}
                    </span>
                    <span className="page-sub">
                      第 {page.pageNumber} 页 · {index + 1}
                    </span>
                  </span>
                  <button
                    type="button"
                    className="row-icon-button"
                    title="删除此页"
                    aria-label="删除此页"
                    onClick={() => setPages((previous) => previous.filter((item) => item.id !== page.id))}
                  >
                    <Icon path={ICONS.close} />
                  </button>
                </div>
              ))}
            </div>
          </section>

          <WatermarkSection watermark={watermark} />
          <OutputSection output={output} onClear={clearPages} disabled={!pages.length} />
        </div>
      </aside>

      <section className="preview-column">
        <div className="column-toolbar">
          <div>
            <p className="eyebrow">公众号内容</p>
            <h1>HTML 预览</h1>
          </div>
          <span className={`status-dot${pages.length ? ' is-ready' : ''}`}>
            {pages.length ? `${pages.length} 页已就绪` : '等待 PDF'}
          </span>
        </div>
        <div className="preview-scroll">
          <article className="article-preview">
            {header.enabled && headerPreviewUrl ? (
              <div
                className="preview-page preview-header"
                style={{ ['--page-aspect' as string]: `${100 / ratioOf(settings.header)}%` }}
              >
                <img src={headerPreviewUrl} alt="试卷信息头图" />
              </div>
            ) : null}
            {pages.length === 0 ? (
              <div className="article-empty">
                <div className="empty-glyph">PDF</div>
                <p>导入手写 PDF 后在这里预览</p>
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
      </section>

      <aside className="right-rail publish-rail">
        <section className="publish-card">
          <span className="eyebrow">发布</span>
          <h2>复制到公众号</h2>
          <p>
            {pages.length
              ? `${header.enabled ? '头图 + ' : ''}${pages.length} 页将按当前顺序转为高清图片。`
              : '图片会以 HTML 富文本形式复制。'}
          </p>
          <PrimaryButton icon={ICONS.copy} onClick={copyAll}>
            一键复制全部
          </PrimaryButton>
          <SecondaryButton icon={ICONS.download} onClick={downloadZip}>
            下载图片包
          </SecondaryButton>
        </section>
        <section className="publish-info">
          <div className="info-row">
            <span>头图</span>
            <strong>{header.enabled ? '附在推文开头' : '已关闭'}</strong>
          </div>
          <div className="info-row">
            <span>处理方式</span>
            <strong>仅本地</strong>
          </div>
          <div className="info-row">
            <span>页面顺序</span>
            <strong>拖动调整</strong>
          </div>
          <div className="info-row">
            <span>正文宽度</span>
            <strong>{ARTICLE_WIDTH} px</strong>
          </div>
        </section>
      </aside>
    </>
  );
}

/* ---------------- 子区块 ---------------- */

function WatermarkSection({
  watermark,
}: {
  watermark: WatermarkSettings;
}) {
  const set = (patch: Partial<WatermarkSettings>) => patchSettings({ article: { watermark: patch } });
  return (
    <section className="control-section">
      <div className="section-heading">
        <span>文字水印</span>
        <Switch title="启用水印" checked={watermark.enabled} onChange={(enabled) => set({ enabled })} />
      </div>
      <Field label="内容">
        <input
          type="text"
          maxLength={40}
          value={watermark.text}
          placeholder="内部资料 · 请勿外传"
          disabled={!watermark.enabled}
          onChange={(event) => set({ text: event.target.value })}
        />
      </Field>
      <FieldGrid>
        <Field label="字号" hint={<output>{watermark.size}%</output>}>
          <Slider
            value={watermark.size}
            min={4}
            max={16}
            step={0.5}
            onChange={(size) => set({ size })}
          />
        </Field>
        <Field label="透明度" hint={<output>{watermark.opacity}%</output>}>
          <Slider
            value={watermark.opacity}
            min={4}
            max={38}
            onChange={(opacity) => set({ opacity })}
          />
        </Field>
      </FieldGrid>
      <Field label="颜色">
        <input
          type="color"
          value={watermark.color}
          disabled={!watermark.enabled}
          onChange={(event) => set({ color: event.target.value })}
        />
      </Field>
      <FixedRow label="位置与倾斜" value="居中 · 45°" />
    </section>
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
    <section className="control-section">
      <div className="section-heading">
        <span>输出图片</span>
      </div>
      <FieldGrid>
        <Field label="清晰度">
          <SelectField
            value={String(output.scale)}
            options={[
              { value: '4', label: '4 倍' },
              { value: '3', label: '3 倍' },
              { value: '2', label: '2 倍' },
            ]}
            onChange={(scale) => set({ scale: Number(scale) })}
          />
        </Field>
        <Field label="格式">
          <SelectField
            value={output.format}
            options={[
              { value: 'png', label: 'PNG' },
              { value: 'jpeg', label: 'JPEG' },
            ]}
            onChange={(format) => set({ format })}
          />
        </Field>
      </FieldGrid>
      {output.format === 'jpeg' ? (
        <Field label="JPEG 质量" hint={<output>{output.quality}%</output>}>
          <Slider value={output.quality} min={50} max={100} onChange={(quality) => set({ quality })} />
        </Field>
      ) : null}
      <TextButton danger onClick={onClear}>
        清空全部页面
      </TextButton>
    </section>
  );
}

/* ---------------- 头图预览 ---------------- */

/** 头图小图：设置或页数一变就重画，并换成 blob URL 显示在推文开头。 */
function useHeaderPreview(enabled: boolean): string | null {
  const { settings, pageCount, images } = useStore();
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      setUrl(null);
      return;
    }
    let alive = true;
    let objectUrl: string | null = null;
    const timer = setTimeout(() => {
      renderHeaderBlob({
        style: settings.header,
        content: settings.article.header,
        pageCount,
        image: images.header,
      })
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
  }, [enabled, settings.header, settings.article.header, pageCount, images.header]);

  return url;
}
