'use client';

/**
 * PDF 解析与页面渲染。
 *
 * pdf.js 只在浏览器里跑，解析结果也只在内存中；文件不会被上传到任何地方。
 *
 * pdfjs-dist 用动态 import 加载：它是纯浏览器库，如果放在模块顶层，
 * 静态预渲染时会把它在 Node 里求值一遍（还会打印环境警告）。
 */

import type * as PdfjsModule from 'pdfjs-dist';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { MAX_OUTPUT_PIXELS, type WatermarkSettings } from '../settings';

export type { PDFDocumentProxy };

/** 预览用的渲染宽度：比正文宽一些，缩下来仍然清晰。 */
export const PREVIEW_WIDTH = 880;

let pdfjsPromise: Promise<typeof PdfjsModule> | null = null;

function getPdfjs(): Promise<typeof PdfjsModule> {
  pdfjsPromise ??= import('pdfjs-dist').then((module) => {
    module.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url,
    ).toString();
    return module;
  });
  return pdfjsPromise;
}

export interface LoadedPdf {
  name: string;
  pdf: PDFDocumentProxy;
  /** 释放 worker 与缓存。pdf.js v6 把 destroy 挪到了 loadingTask 上。 */
  release: () => Promise<void>;
}

export async function loadPdf(file: File): Promise<LoadedPdf> {
  const pdfjs = await getPdfjs();
  const bytes = new Uint8Array(await file.arrayBuffer());
  const task = pdfjs.getDocument({ data: bytes });
  const pdf = await task.promise;
  return { name: file.name, pdf, release: () => task.destroy() };
}

export const isPdf = (file: File): boolean =>
  file.type === 'application/pdf' || /\.pdf$/i.test(file.name);

/** 已导入的一份 PDF：文档句柄 + 释放方法。 */
export interface DocRecord {
  pdf: PDFDocumentProxy;
  release: () => Promise<void>;
}

export interface PageRender {
  blob: Blob;
  width: number;
  height: number;
  /** 页面过大、被降采样保护过。 */
  capped: boolean;
}

export interface RenderOptions {
  purpose: 'preview' | 'output';
  scale: number;
  format: 'png' | 'jpeg';
  quality: number;
  watermark: WatermarkSettings;
}

function paintWatermark(canvas: HTMLCanvasElement, config: WatermarkSettings): void {
  const text = config.text.trim();
  if (!config.enabled || !text) return;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const fontSize = Math.max(24, Math.round((canvas.height * Number(config.size)) / 100));
  ctx.save();
  ctx.globalAlpha = Number(config.opacity) / 100;
  ctx.fillStyle = config.color;
  ctx.font = `700 ${fontSize}px -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate(-Math.PI / 4);
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('浏览器无法生成图片'))),
      type,
      quality,
    );
  });
}

export async function renderPage(
  pdf: PDFDocumentProxy,
  pageNumber: number,
  options: RenderOptions,
): Promise<PageRender> {
  const page = await pdf.getPage(pageNumber);
  const base = page.getViewport({ scale: 1 });
  const isPreview = options.purpose === 'preview';
  let scale = isPreview ? Math.max(0.4, PREVIEW_WIDTH / base.width) : options.scale;

  let viewport = page.getViewport({ scale });
  let capped = false;
  if (!isPreview && viewport.width * viewport.height > MAX_OUTPUT_PIXELS) {
    // 超大页面按面积等比缩回去，避免一次性申请几百 MB 的画布。
    scale *= Math.sqrt(MAX_OUTPUT_PIXELS / (viewport.width * viewport.height));
    viewport = page.getViewport({ scale });
    capped = true;
  }

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.floor(viewport.width));
  canvas.height = Math.max(1, Math.floor(viewport.height));
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('无法获取画布上下文');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  try {
    await page.render({ canvas, viewport, background: '#ffffff' }).promise;
    paintWatermark(canvas, options.watermark);
    const format = isPreview || options.format === 'jpeg' ? 'image/jpeg' : 'image/png';
    const quality = isPreview ? 0.82 : options.quality / 100;
    const blob = await toBlob(canvas, format, quality);
    return { blob, width: canvas.width, height: canvas.height, capped };
  } finally {
    page.cleanup();
    canvas.width = 1;
    canvas.height = 1;
  }
}
