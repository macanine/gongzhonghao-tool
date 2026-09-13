'use client';

/**
 * 把成品送出浏览器：复制富文本、打包图片、导出 PNG。
 */

import JSZip from 'jszip';
import { ARTICLE_WIDTH, type Settings } from '../settings';
import { blobToDataUrl, canvasToBlob, downloadBlob, stamp } from '../canvas/kit';
import { assertNotCancelled } from '../feedback';
import { renderHeader, type HeaderInput } from '../canvas/header';
import { renderPage, type DocRecord } from './pdf';

export interface PageSnapshot {
  docId: string;
  pageNumber: number;
  name: string;
}

export function escapeHtml(value: string): string {
  return String(value).replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&#39;';
    }
  });
}

const imageTag = (dataUrl: string, alt: string, margin: number): string =>
  `<p style="margin:0 0 ${margin}px;line-height:0;">` +
  `<img src="${dataUrl}" alt="${escapeHtml(alt)}" style="display:block;width:100%;height:auto;border:0;"></p>`;

/** 头图渲染到离屏画布，供复制 / 打包 / 预览共用。 */
export function renderHeaderBlob(input: HeaderInput): Promise<Blob> {
  const canvas = document.createElement('canvas');
  renderHeader(canvas, input);
  return canvasToBlob(canvas, 'image/png');
}

export interface ArticleHtmlOptions {
  snapshot: PageSnapshot[];
  docs: Map<string, DocRecord>;
  settings: Settings;
  headerInput: HeaderInput;
  onProgress?: (detail: string) => void;
}

/** 头图 + 全部页面 → 一段可直接粘进公众号编辑器的 HTML。 */
export async function buildArticleHtml(options: ArticleHtmlOptions): Promise<string> {
  const { snapshot, docs, settings, headerInput, onProgress } = options;
  const parts = [`<section style="margin:0;padding:0;width:100%;max-width:${ARTICLE_WIDTH}px;">`];
  const { watermark, output } = settings.article;

  if (settings.article.header.enabled) {
    assertNotCancelled();
    onProgress?.('生成头图');
    const blob = await renderHeaderBlob(headerInput);
    parts.push(imageTag(await blobToDataUrl(blob), '试卷信息头图', 18));
  }

  for (const [index, page] of snapshot.entries()) {
    // 每页之间给取消按钮一个响应点：单页渲染没法中断，逐页检查已经够用。
    assertNotCancelled();
    onProgress?.(`生成高清图片 ${index + 1} / ${snapshot.length}`);
    const doc = docs.get(page.docId);
    if (!doc) continue;
    const result = await renderPage(doc.pdf, page.pageNumber, {
      purpose: 'output',
      scale: output.scale,
      format: output.format,
      quality: output.quality,
      watermark,
    });
    parts.push(imageTag(await blobToDataUrl(result.blob), `第 ${index + 1} 页`, 16));
  }

  parts.push('</section>');
  return parts.join('');
}

/** 兼容复制：把 HTML 塞进一个隐藏的可编辑层再走 execCommand。 */
function legacyCopyHtml(html: string): boolean {
  const host = document.createElement('div');
  host.contentEditable = 'true';
  host.style.cssText = `position:fixed;left:-10000px;top:0;width:${ARTICLE_WIDTH}px;opacity:0;pointer-events:none;`;
  host.innerHTML = html;
  document.body.appendChild(host);
  const range = document.createRange();
  range.selectNodeContents(host);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
  let copied = false;
  try {
    copied = document.execCommand('copy');
  } catch {
    copied = false;
  }
  selection?.removeAllRanges();
  host.remove();
  return copied;
}

/**
 * 复制富文本。
 *
 * Chromium 支持把 Promise 放进 ClipboardItem：点击的瞬间就申请剪贴板权限，
 * 之后再慢慢生成大图，避免渲染太久丢掉用户激活状态。
 */
export async function copyHtml(htmlPromise: Promise<string>, pageCount: number): Promise<void> {
  if (navigator.clipboard && window.ClipboardItem) {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': htmlPromise.then((html) => new Blob([html], { type: 'text/html' })),
          'text/plain': htmlPromise.then(
            () => new Blob([`${pageCount} 张公众号图片`], { type: 'text/plain' }),
          ),
        }),
      ]);
      return;
    } catch (error) {
      console.info('系统剪贴板不可用，改用兼容复制', error);
    }
  }
  if (!legacyCopyHtml(await htmlPromise)) {
    throw new Error('浏览器拒绝了剪贴板访问，请使用 Chrome 并通过 localhost 打开页面');
  }
}

export async function copyImage(blob: Blob): Promise<void> {
  if (navigator.clipboard && window.ClipboardItem) {
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      return;
    } catch {
      /* 落到兼容复制 */
    }
  }
  const dataUrl = await blobToDataUrl(blob);
  if (!legacyCopyHtml(`<img src="${dataUrl}" alt="图片" style="display:block;max-width:100%;">`)) {
    throw new Error('浏览器拒绝了剪贴板访问');
  }
}

export interface ZipOptions extends ArticleHtmlOptions {
  extension: string;
  /** 头图放最前面，命名 00-头图.png。 */
  includeHeader: boolean;
}

export async function buildZip(options: ZipOptions): Promise<void> {
  const { snapshot, docs, settings, headerInput, extension, includeHeader, onProgress } = options;
  const { watermark, output } = settings.article;
  const zip = new JSZip();

  if (includeHeader) {
    assertNotCancelled();
    onProgress?.('生成头图');
    zip.file('00-头图.png', await renderHeaderBlob(headerInput));
  }

  for (const [index, page] of snapshot.entries()) {
    assertNotCancelled();
    onProgress?.(`生成高清图片 ${index + 1} / ${snapshot.length}`);
    const doc = docs.get(page.docId);
    if (!doc) continue;
    const result = await renderPage(doc.pdf, page.pageNumber, {
      purpose: 'output',
      scale: output.scale,
      format: output.format,
      quality: output.quality,
      watermark,
    });
    const label = String(index + 1).padStart(2, '0');
    zip.file(`${label}-${safeName(page.name)}.${extension}`, result.blob);
  }

  onProgress?.('正在压缩图片包');
  const blob = await zip.generateAsync({ type: 'blob' }, (meta) =>
    onProgress?.(`正在压缩图片包 ${Math.round(meta.percent)}%`),
  );
  downloadBlob(blob, `公众号图片-${stamp()}.zip`);
}

export function safeName(name: string): string {
  return name.replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|]/g, '-').slice(0, 58) || 'page';
}

export function downloadPng(blob: Blob, label: string): void {
  downloadBlob(blob, `公众号${label}-${stamp()}.png`);
}
