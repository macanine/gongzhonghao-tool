'use client';

/**
 * 把成品送出浏览器：复制富文本、打包图片、导出 PNG。
 */

import { ARTICLE_WIDTH, type Settings } from '../settings';
import { blobToDataUrl, canvasToBlob, downloadBlob, stamp } from '../canvas/kit';
import { assertNotCancelled } from '../feedback';
import { renderHeader, type HeaderInput } from '../canvas/header';
import {
  dividerHtml,
  fullImageHtml,
  insetImageHtml,
  plainText,
  textHtml,
  type Block,
  type PageBlock,
} from './blocks';
import { renderPage, type DocRecord } from './pdf';

/** 头图渲染到离屏画布，供复制 / 打包 / 预览共用。 */
export function renderHeaderBlob(input: HeaderInput): Promise<Blob> {
  const canvas = document.createElement('canvas');
  renderHeader(canvas, input);
  return canvasToBlob(canvas, 'image/png');
}

export interface ArticleOptions {
  blocks: Block[];
  docs: Map<string, DocRecord>;
  settings: Settings;
  headerInput: HeaderInput;
  onProgress?: (detail: string) => void;
}

/**
 * 按输出设置逐页渲染高清图。
 * 每页之间给取消按钮一个响应点：单页渲染没法中断，逐页检查已经够用。
 */
async function renderOutputPage(
  page: PageBlock,
  index: number,
  total: number,
  { docs, settings, onProgress }: ArticleOptions,
): Promise<Blob | null> {
  assertNotCancelled();
  onProgress?.(`生成高清图片 ${index} / ${total}`);
  const doc = docs.get(page.docId);
  if (!doc) return null;
  const { watermark, output } = settings.article;
  const result = await renderPage(doc.pdf, page.pageNumber, {
    purpose: 'output',
    scale: output.scale,
    format: output.format,
    quality: output.quality,
    watermark,
  });
  return result.blob;
}

/** 头图 + 全部内容块 → 一段可直接粘进公众号编辑器的 HTML。 */
export async function buildArticleHtml(options: ArticleOptions): Promise<string> {
  const { blocks, settings, headerInput, onProgress } = options;
  const parts = [`<section style="margin:0;padding:0;width:100%;max-width:${ARTICLE_WIDTH}px;">`];

  if (settings.article.header.enabled) {
    assertNotCancelled();
    onProgress?.('生成头图');
    const blob = await renderHeaderBlob(headerInput);
    parts.push(fullImageHtml(await blobToDataUrl(blob), '试卷信息头图'));
  }

  const total = blocks.filter((block) => block.kind === 'page').length;
  let rendered = 0;
  for (const block of blocks) {
    if (block.kind === 'page') {
      rendered += 1;
      const blob = await renderOutputPage(block, rendered, total, options);
      if (blob) parts.push(fullImageHtml(await blobToDataUrl(blob), `第 ${rendered} 页`));
    } else if (block.kind === 'image') {
      parts.push(insetImageHtml(await blobToDataUrl(block.blob), block.name));
    } else if (block.kind === 'text') {
      parts.push(textHtml(block));
    } else {
      parts.push(dividerHtml());
    }
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
export async function copyArticle(htmlPromise: Promise<string>, blocks: Block[]): Promise<void> {
  if (navigator.clipboard && window.ClipboardItem) {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': htmlPromise.then((html) => new Blob([html], { type: 'text/html' })),
          'text/plain': htmlPromise.then(
            () => new Blob([plainText(blocks)], { type: 'text/plain' }),
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

export interface ZipOptions extends ArticleOptions {
  extension: string;
  /** 头图放最前面，命名 00-头图.png。 */
  includeHeader: boolean;
}

/** 图片按正文顺序编号；有文字时另附一份「正文.txt」。 */
export async function buildZip(options: ZipOptions): Promise<void> {
  const { blocks, headerInput, extension, includeHeader, onProgress } = options;
  // jszip 只有打包时才用得到，按需加载，不占首屏体积。
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();

  if (includeHeader) {
    assertNotCancelled();
    onProgress?.('生成头图');
    zip.file('00-头图.png', await renderHeaderBlob(headerInput));
  }

  const total = blocks.filter((block) => block.kind === 'page').length;
  let rendered = 0;
  let index = 0;
  for (const block of blocks) {
    if (block.kind === 'page') {
      rendered += 1;
      const blob = await renderOutputPage(block, rendered, total, options);
      if (!blob) continue;
      index += 1;
      zip.file(`${serial(index)}-${safeName(block.name)}.${extension}`, blob);
    } else if (block.kind === 'image') {
      index += 1;
      zip.file(`${serial(index)}-${safeName(block.name)}${extensionOf(block.name)}`, block.blob);
    }
  }

  if (blocks.some((block) => block.kind === 'text' && block.text.trim())) {
    zip.file('正文.txt', plainText(blocks));
  }

  onProgress?.('正在压缩图片包');
  const blob = await zip.generateAsync({ type: 'blob' }, (meta) =>
    onProgress?.(`正在压缩图片包 ${Math.round(meta.percent)}%`),
  );
  downloadBlob(blob, `公众号图片-${stamp()}.zip`);
}

const serial = (index: number): string => String(index).padStart(2, '0');

const extensionOf = (name: string): string => /\.[a-z0-9]+$/i.exec(name)?.[0].toLowerCase() ?? '.png';

export function safeName(name: string): string {
  return name.replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|]/g, '-').slice(0, 58) || 'page';
}

export function downloadPng(blob: Blob, label: string): void {
  downloadBlob(blob, `公众号${label}-${stamp()}.png`);
}
