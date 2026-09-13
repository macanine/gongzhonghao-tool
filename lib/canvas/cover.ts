import { COVER_RATIO, heightFor, type CoverContent, type PosterStyle } from '../settings';
import { paintBackdrop, type BackdropImage } from './backdrop';
import { drawTrackedText, fitLines, hexToRgba, roundRect, typeface } from './kit';

export interface CoverInput {
  style: PosterStyle;
  content: CoverContent;
  image?: BackdropImage | null;
}

export interface CoverLayout {
  family: string;
  titleSize: number;
  titleLines: string[];
  lineHeight: number;
  subtitleSize: number;
  underline: { x: number; y: number; width: number; height: number } | null;
}

export function coverSize(style: PosterStyle): { width: number; height: number; ratio: number } {
  const width = style.width;
  return { width, height: heightFor(width, COVER_RATIO), ratio: COVER_RATIO };
}

/**
 * 微信封面：2.35:1，主标题居中，可选副标题 + 一条强调色短线。
 * 和头图共用背景系统，所以「霓虹 / 极光 / 熔岩」这些主题直接可用。
 */
export function drawCover(
  ctx: CanvasRenderingContext2D,
  input: CoverInput,
  width: number,
  height: number,
): CoverLayout {
  const { style, content } = input;
  paintBackdrop(ctx, style, width, height, input.image);

  const family = typeface(style.font);
  const anchor = width / 2;
  const tracking = Math.max(0, width * 0.004);

  const titleFit = fitLines(ctx, content.title.trim() || '手写笔记', {
    family,
    weight: 700,
    tracking,
    maxWidth: width * 0.84,
    maxSize: Math.round(width * 0.108),
    minSize: Math.max(26, Math.round(width * 0.04)),
    maxLines: 2,
  });
  const titleSize = titleFit.size;
  const titleLines = titleFit.lines;
  const lineHeight = Math.round(titleSize * 1.18);

  const subtitle = content.subtitle.trim();
  const subtitleSize = Math.max(14, Math.round(width * 0.028));
  const underlineHeight = Math.max(2, Math.round(width * 0.006));
  const underlineGap = Math.round(titleSize * 0.34);
  const underlineWidth = Math.round(width * 0.09);
  const subtitleGap = subtitle ? Math.round(titleSize * 0.4) : 0;

  const titleBlock = titleSize + lineHeight * (titleLines.length - 1);
  const blockHeight =
    titleBlock + underlineGap + underlineHeight + (subtitle ? subtitleGap + subtitleSize : 0);
  const firstBaseline = (height - blockHeight) / 2 + titleSize * 0.82;

  ctx.fillStyle = style.textColor;
  ctx.font = `700 ${titleSize}px ${family}`;
  titleLines.forEach((line, index) => {
    drawTrackedText(ctx, line, anchor, firstBaseline + lineHeight * index, tracking, 'center');
  });

  const lastBaseline = firstBaseline + lineHeight * (titleLines.length - 1);
  const underlineY = lastBaseline + underlineGap;
  ctx.fillStyle = style.accent || style.textColor;
  roundRect(ctx, anchor - underlineWidth / 2, underlineY, underlineWidth, underlineHeight, underlineHeight / 2);
  ctx.fill();

  if (subtitle) {
    ctx.fillStyle = hexToRgba(style.textColor, 0.68);
    ctx.font = `500 ${subtitleSize}px ${family}`;
    drawTrackedText(
      ctx,
      subtitle,
      anchor,
      underlineY + underlineHeight + subtitleGap + subtitleSize * 0.78,
      Math.max(1, width * 0.001),
      'center',
    );
  }

  return {
    family,
    titleSize,
    titleLines,
    lineHeight,
    subtitleSize,
    underline: { x: anchor - underlineWidth / 2, y: underlineY, width: underlineWidth, height: underlineHeight },
  };
}

export function renderCover(canvas: HTMLCanvasElement, input: CoverInput): CoverLayout {
  const { width, height } = coverSize(input.style);
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('无法获取画布上下文');
  return drawCover(ctx, input, width, height);
}
