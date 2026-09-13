import { heightFor, ratioOf, type HeaderContent, type PosterStyle } from '../settings';
import { paintBackdrop, paintDecor, type BackdropImage } from './backdrop';
import {
  drawTrackedText,
  fitLines,
  fitOneLine,
  hexToRgba,
  roundRect,
  typeface,
  wrapTrackedText,
} from './kit';

export interface HeaderInput {
  style: PosterStyle;
  content: HeaderContent;
  /** 导入的 PDF 页数，用于「页数」留空时自动填充。 */
  pageCount: number;
  image?: BackdropImage | null;
}

export type HeaderRowKind = 'bar' | 'title' | 'meta' | 'hint';

export interface HeaderRow {
  kind: HeaderRowKind;
  top: number;
  height: number;
}

export interface HeaderField {
  label: string;
  value: string;
}

export interface HeaderLayout {
  family: string;
  pad: number;
  inner: number;
  tracking: number;
  fits: boolean;
  titleSize: number;
  titleLines: string[];
  titleLineHeight: number;
  fields: HeaderField[];
  fieldWidth: number;
  fieldSizes: number[];
  labelSize: number;
  labelGap: number;
  valueSize: number;
  hintSize: number;
  hintPadX: number;
  hintPadY: number;
  hintLines: string[];
  hintLineHeight: number;
  hintWidth: number;
  rows: HeaderRow[];
}

export function headerSize(style: PosterStyle): { width: number; height: number; ratio: number } {
  const ratio = ratioOf(style);
  return { width: style.width, height: heightFor(style.width, ratio), ratio };
}

/** 「页数」留空时按真实页数生成，填了就用用户写的。 */
export function headerFields(content: HeaderContent, pageCount: number): HeaderField[] {
  const autoPages = pageCount > 0 ? `共 ${pageCount} 页` : '';
  return [
    { label: '时间', value: content.date.trim() },
    { label: '难度', value: content.difficulty.trim() },
    { label: '页数', value: content.pages.trim() || autoPages },
  ].filter((field) => field.value);
}

/**
 * 头图排版。
 *
 * 手机上图片会被压到屏幕宽度（约 350px），所以每块字号都按画布宽度的
 * 百分比给，而不是固定像素——缩到手机上才还看得清：
 *   标题 9.5%，信息值 6.2%，信息标签 4%，获取提示 4.5%。
 *
 * 纵向排布先量出各块高度，再把剩余空间平摊到块与块之间，
 * 所以画布越高、内容越少，留白越大，而不会挤在中间。
 * 内容超出可用高度时由调用方按 scale 整体缩号。
 */
export function measureHeader(
  ctx: CanvasRenderingContext2D,
  style: PosterStyle,
  content: HeaderContent,
  pageCount: number,
  width: number,
  height: number,
  scale: number,
): HeaderLayout {
  const family = typeface(style.font);
  const px = (ratio: number, floor = 1) => Math.max(floor, Math.round(width * ratio * scale));
  const pad = Math.round(width * 0.07);
  const inner = width - pad * 2;
  const tracking = Math.round(width * 0.004);

  // —— 标题：最多两行，右侧留出安全区 ——
  const titleText = content.title.trim() || '试卷标题';
  const titleFit = fitLines(ctx, titleText, {
    family,
    weight: 700,
    tracking,
    maxWidth: inner * 0.92,
    maxSize: px(0.095),
    minSize: px(0.05, 24),
    maxLines: 2,
  });
  // 已经缩到最小字号还放不下时，宁可多排一行，也不把标题截掉。
  const titleLines = titleFit.overflow
    ? wrapTrackedText(ctx, titleText, inner * 0.92, tracking).slice(0, 3)
    : titleFit.lines;
  const titleLineHeight = Math.round(titleFit.size * 1.26);
  const titleHeight = titleFit.size + titleLineHeight * (titleLines.length - 1);

  // —— 信息组：时间 / 难度 / 页数，各占一列 ——
  const fields = headerFields(content, pageCount);
  const labelSize = Math.max(Math.round(width * 0.0355), px(0.04, 13));
  // 数值不能盖过标题，否则层级就反了。
  const valueSize = Math.min(px(0.062, 18), Math.round(titleFit.size * 0.85));
  const fieldWidth = fields.length ? inner / fields.length : 0;
  const fieldSizes = fields.map((field) =>
    fitOneLine(ctx, field.value, family, 700, valueSize, px(0.036, 12), fieldWidth * 0.88),
  );
  const labelGap = Math.round(width * 0.024 * scale);
  const metaHeight = fields.length ? labelSize + labelGap + valueSize : 0;

  // —— 获取提示：做成胶囊 ——
  // 标签和提示带一个不随 scale 下降的下限：扁比例 + 超长文案时宁可标题小一点，
  // 也不能把这两行缩到手机上读不出来（0.0355 ≈ 350px 手机上的 12.4px）。
  const hintBase = Math.max(Math.round(width * 0.039), px(0.045, 14));
  const hintPadX = Math.round(width * 0.042 * scale);
  const hintPadY = Math.round(width * 0.028 * scale);
  const hintText = content.hint.trim();
  const hintMaxWidth = inner - hintPadX * 2;
  const hintFit = hintText
    ? fitLines(ctx, hintText, {
        family,
        weight: 600,
        tracking: 0,
        maxWidth: hintMaxWidth,
        maxSize: hintBase,
        minSize: Math.round(width * 0.032),
        maxLines: 2,
      })
    : { size: hintBase, lines: [] as string[], overflow: false };
  // 同上：缩到最小还放不下就多排一行，不做截断。
  const hintLines = hintFit.overflow
    ? wrapTrackedText(ctx, hintText, hintMaxWidth, 0).slice(0, 3)
    : hintFit.lines;
  const hintSize = hintFit.size;
  const hintLineHeight = Math.round(hintSize * 1.4);
  const hintHeight = hintLines.length ? hintLineHeight * hintLines.length + hintPadY * 2 : 0;
  const hintWidth = hintLines.length
    ? Math.min(inner, Math.max(...hintLines.map((line) => ctx.measureText(line).width)) + hintPadX * 2)
    : 0;

  // —— 纵向排布：块之间尽量撑开，块数少时留白更大 ——
  const rows: HeaderRow[] = [
    { kind: 'bar', top: 0, height: px(0.013, 4) },
    { kind: 'title', top: 0, height: titleHeight },
  ];
  if (metaHeight) rows.push({ kind: 'meta', top: 0, height: metaHeight });
  if (hintHeight) rows.push({ kind: 'hint', top: 0, height: hintHeight });

  const available = height - pad * 2;
  const contentHeight = rows.reduce((sum, row) => sum + row.height, 0);
  const gapCount = rows.length - 1;
  const minGap = Math.round(height * 0.025);
  let gap = Math.round(height * 0.05);
  if (gapCount > 0 && available > contentHeight) {
    // 上限 18%：竖版画布上空间够就尽量铺开，但内容很少时也不至于散架。
    // 向下取整：宁可少留 1px，也不要因为进位而排不下、白白触发缩号。
    gap = Math.max(minGap, Math.min(Math.round(height * 0.18), Math.floor((available - contentHeight) / gapCount)));
  }
  const total = contentHeight + gap * gapCount;
  let cursor = pad + Math.max(0, Math.round((available - total) / 2));
  rows.forEach((row, index) => {
    row.top = cursor;
    cursor += row.height + (index < gapCount ? gap : 0);
  });

  return {
    family,
    pad,
    inner,
    tracking,
    fits: total <= available,
    titleSize: titleFit.size,
    titleLines,
    titleLineHeight,
    fields,
    fieldWidth,
    fieldSizes,
    labelSize,
    labelGap,
    valueSize,
    hintSize,
    hintPadX,
    hintPadY,
    hintLines,
    hintLineHeight,
    hintWidth,
    rows,
  };
}

export function drawHeader(
  ctx: CanvasRenderingContext2D,
  input: HeaderInput,
  width: number,
  height: number,
): HeaderLayout {
  const { style, content, pageCount } = input;
  paintBackdrop(ctx, style, width, height, input.image);
  paintDecor(ctx, style, width, height);

  // 内容排不下时（超长文案 + 扁比例）整体缩号，最多缩到 7 成。
  let layout = measureHeader(ctx, style, content, pageCount, width, height, 1);
  for (let scale = 1; scale >= 0.7; scale -= 0.05) {
    layout = measureHeader(ctx, style, content, pageCount, width, height, scale);
    if (layout.fits) break;
  }

  const ink = style.textColor;
  const accent = style.accent || style.textColor;
  const row = (kind: HeaderRowKind) => layout.rows.find((item) => item.kind === kind)!;

  // 强调条
  const bar = row('bar');
  ctx.fillStyle = accent;
  roundRect(ctx, layout.pad, bar.top, Math.round(width * 0.09), bar.height, bar.height / 2);
  ctx.fill();

  // 标题
  const titleRow = row('title');
  ctx.fillStyle = ink;
  ctx.font = `700 ${layout.titleSize}px ${layout.family}`;
  layout.titleLines.forEach((line, index) => {
    drawTrackedText(
      ctx,
      line,
      layout.pad,
      titleRow.top + layout.titleSize * 0.82 + layout.titleLineHeight * index,
      layout.tracking,
      'left',
    );
  });

  // 信息组：小标签 + 大数值
  const metaRow = layout.rows.find((item) => item.kind === 'meta');
  if (metaRow) {
    layout.fields.forEach((field, index) => {
      const x = layout.pad + layout.fieldWidth * index;
      ctx.fillStyle = hexToRgba(ink, 0.55);
      ctx.font = `600 ${layout.labelSize}px ${layout.family}`;
      ctx.fillText(field.label, x, metaRow.top + layout.labelSize * 0.82);
      ctx.fillStyle = ink;
      ctx.font = `700 ${layout.fieldSizes[index]}px ${layout.family}`;
      ctx.fillText(field.value, x, metaRow.top + metaRow.height - layout.valueSize * 0.18);
    });
  }

  // 获取提示胶囊
  const hintRow = layout.rows.find((item) => item.kind === 'hint');
  if (hintRow) {
    ctx.fillStyle = hexToRgba(accent, 0.16);
    roundRect(ctx, layout.pad, hintRow.top, layout.hintWidth, hintRow.height, Math.round(layout.hintSize * 0.5));
    ctx.fill();
    ctx.fillStyle = accent;
    ctx.font = `600 ${layout.hintSize}px ${layout.family}`;
    layout.hintLines.forEach((line, index) => {
      ctx.fillText(
        line,
        layout.pad + layout.hintPadX,
        hintRow.top + layout.hintPadY + layout.hintSize * 0.82 + layout.hintLineHeight * index,
      );
    });
  }

  return layout;
}

/** 给一个 canvas 元素，按当前设置尺寸渲染头图。 */
export function renderHeader(canvas: HTMLCanvasElement, input: HeaderInput): HeaderLayout {
  const { width, height } = headerSize(input.style);
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('无法获取画布上下文');
  return drawHeader(ctx, input, width, height);
}
