/**
 * 画布绘制工具箱：排字、换行、导出。
 *
 * 全部是纯函数（除了最后三个碰 Blob/URL 的），不读全局状态，
 * 因此可以在 Node 里喂一个假的 2D context 直接跑测试。
 */

import type { FontKind } from '../settings';

export const TYPEFACES: Record<FontKind, string> = {
  serif: '"Songti SC", "STSong", "Noto Serif SC", "SimSun", serif',
  sans: '"PingFang SC", "Microsoft YaHei", "Noto Sans SC", sans-serif',
};

export const typeface = (kind: FontKind): string => TYPEFACES[kind] ?? TYPEFACES.serif;

/** #rgb / #rrggbb → rgba(...)。颜色非法时返回透明。 */
export function hexToRgba(hex: string, alpha: number): string {
  const raw = (hex || '').replace('#', '').trim();
  const full = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return `rgba(0, 0, 0, ${alpha})`;
  const value = Number.parseInt(full, 16);
  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`;
}

export function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, width, height, radius);
  else ctx.rect(x, y, width, height);
}

/** 带字距的一行宽度。 */
export function trackedWidth(ctx: CanvasRenderingContext2D, text: string, tracking: number): number {
  if (!text) return 0;
  let width = 0;
  for (const char of text) width += ctx.measureText(char).width;
  return width + Math.max(0, text.length - 1) * tracking;
}

/** 逐字绘制以支持字距（部分环境的 letterSpacing 不可靠）。 */
export function drawTrackedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  tracking: number,
  align: 'left' | 'center',
): void {
  let cursor = align === 'center' ? x - trackedWidth(ctx, text, tracking) / 2 : x;
  ctx.textAlign = 'left';
  for (const char of text) {
    ctx.fillText(char, cursor, y);
    cursor += ctx.measureText(char).width + tracking;
  }
}

/** 可以在一行结束后断开的位置：空白与常见中英标点。 */
const BREAK_AFTER = /[\s·、，。；：！？）】」』%」,.;:!?)]/;

/**
 * 找最后一个合适的断行点。
 * 太靠前就直接放弃——断在行首反而更难看。
 */
function findBreak(line: string): number {
  for (let index = line.length; index > 1; index -= 1) {
    if (BREAK_AFTER.test(line[index - 1])) {
      return index >= Math.ceil(line.length * 0.4) ? index : 0;
    }
  }
  return 0;
}

/** 按字符换行（中文），同时把 \n 当强制换行。 */
export function wrapTrackedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  tracking: number,
): string[] {
  const lines: string[] = [];
  for (const paragraph of String(text ?? '').split(/\n+/)) {
    let line = '';
    for (const char of paragraph) {
      const candidate = line + char;
      if (line && trackedWidth(ctx, candidate, tracking) > maxWidth) {
        // 宁可早一点断在空格或标点后面，也不要把「期中模拟卷」劈成「期 / 中模拟卷」。
        const cut = findBreak(line);
        if (cut > 0) {
          lines.push(line.slice(0, cut).trimEnd());
          line = line.slice(cut) + char;
        } else {
          lines.push(line);
          line = char;
        }
      } else {
        line = candidate;
      }
    }
    if (line.trim()) lines.push(line.trim());
  }
  return lines.length ? lines : [''];
}

export interface FitOptions {
  family: string;
  weight: number;
  tracking: number;
  maxWidth: number;
  maxSize: number;
  minSize: number;
  maxLines: number;
}

export interface FitResult {
  size: number;
  lines: string[];
  /** 缩到最小字号仍超过 maxLines —— 调用方据此决定多排一行而不是截断。 */
  overflow: boolean;
}

/** 从 maxSize 往下缩，直到排进 maxLines 行。 */
export function fitLines(ctx: CanvasRenderingContext2D, text: string, options: FitOptions): FitResult {
  const { family, weight, tracking, maxWidth, maxSize, minSize, maxLines } = options;
  let size = maxSize;
  let lines: string[] = [];
  do {
    ctx.font = `${weight} ${size}px ${family}`;
    lines = wrapTrackedText(ctx, text, maxWidth, tracking);
    if (lines.length <= maxLines || size <= minSize) break;
    size -= Math.max(1, Math.round(size * 0.04));
  } while (size > 12);
  ctx.font = `${weight} ${size}px ${family}`;
  return { size, lines: lines.slice(0, maxLines), overflow: lines.length > maxLines };
}

/** 单行文本按可用宽度缩号。 */
export function fitOneLine(
  ctx: CanvasRenderingContext2D,
  text: string,
  family: string,
  weight: number,
  maxSize: number,
  minSize: number,
  maxWidth: number,
): number {
  let size = maxSize;
  ctx.font = `${weight} ${size}px ${family}`;
  while (size > minSize && ctx.measureText(text).width > maxWidth) {
    size -= 1;
    ctx.font = `${weight} ${size}px ${family}`;
  }
  return size;
}

export function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('浏览器无法生成图片'))),
      type,
      quality,
    );
  });
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('图片编码失败'));
    reader.readAsDataURL(blob);
  });
}

export function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** 时间戳后缀，用于文件名。 */
export function stamp(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `-${pad(date.getHours())}${pad(date.getMinutes())}`
  );
}

/** 把图片按 cover 规则（等比铺满并居中）算好摆放位置。 */
export function coverPlacement(
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
): { x: number; y: number; width: number; height: number } {
  const scale = Math.max(targetWidth / sourceWidth, targetHeight / sourceHeight);
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;
  return { x: (targetWidth - width) / 2, y: (targetHeight - height) / 2, width, height };
}
