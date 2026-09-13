import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, type Backdrop, type PosterStyle } from '@/lib/settings';
import { paintBackdrop, type BackdropImage } from '@/lib/canvas/backdrop';
import { createStubContext } from './helpers/canvas';
import { hexToRgba, wrapTrackedText, trackedWidth, fitLines } from '@/lib/canvas/kit';

const style = (over: Partial<PosterStyle> = {}): PosterStyle => ({
  ...structuredClone(DEFAULT_SETTINGS.header),
  ...over,
});

const backdrops: [string, Partial<Backdrop>][] = [
  ['纯色', { mode: 'solid' }],
  ['渐变', { mode: 'gradient', angle: 45 }],
  ['光晕', { mode: 'glow' }],
];

describe('背景绘制', () => {
  it.each(backdrops)('%s 铺满整块画布', (_name, over) => {
    const stub = createStubContext(400, 300);
    paintBackdrop(stub.ctx, style(over), 400, 300);
    const rects = stub.calls.filter((call) => call.type === 'rect');
    expect(rects.length).toBeGreaterThan(0);
    expect(rects[0]).toMatchObject({ x: 0, y: 0, width: 400, height: 300 });
  });

  it('渐变按两个颜色停靠', () => {
    const stub = createStubContext(400, 300);
    paintBackdrop(stub.ctx, style({ mode: 'gradient', colorA: '#111111', colorB: '#222222' }), 400, 300);
    expect(stub.gradients[0]?.stops).toEqual(['#111111', '#222222']);
  });

  it('光晕叠了多团彩色辉光', () => {
    const stub = createStubContext(400, 300);
    paintBackdrop(stub.ctx, style({ mode: 'glow', accent: '#22d3ee' }), 400, 300);
    expect(stub.gradients.length).toBeGreaterThanOrEqual(3);
    const allStops = stub.gradients.flatMap((gradient) => gradient.stops);
    expect(allStops.some((stop) => stop.includes('34, 211, 238'))).toBe(true);
  });

  it('图片：等比铺满并居中', () => {
    const stub = createStubContext(400, 300);
    const image: BackdropImage = {
      source: {} as CanvasImageSource,
      width: 100,
      height: 100,
    };
    paintBackdrop(stub.ctx, style({ mode: 'image', dim: 50 }), 400, 300, image);
    // 最后一块 rect 是压暗遮罩，必须铺满
    const rects = stub.calls.filter((call) => call.type === 'rect');
    expect(rects.at(-1)).toMatchObject({ x: 0, y: 0, width: 400, height: 300 });
  });

  it('图片没加载好时退回纯色，不会画空', () => {
    const stub = createStubContext(400, 300);
    paintBackdrop(stub.ctx, style({ mode: 'image', colorA: '#abcdef' }), 400, 300, null);
    const rects = stub.calls.filter((call) => call.type === 'rect');
    expect(rects.at(-1)?.fill).toBe('#abcdef');
  });
});

describe('画布工具', () => {
  it('hexToRgba 支持三位与六位', () => {
    expect(hexToRgba('#fff', 0.5)).toBe('rgba(255, 255, 255, 0.5)');
    expect(hexToRgba('#ff8800', 1)).toBe('rgba(255, 136, 0, 1)');
  });

  it('hexToRgba 遇到非法颜色不抛错', () => {
    expect(hexToRgba('', 0.2)).toBe('rgba(0, 0, 0, 0.2)');
    expect(hexToRgba('nope', 0.2)).toBe('rgba(0, 0, 0, 0.2)');
  });

  it('换行：中文按字符断行', () => {
    const stub = createStubContext(1000, 1000);
    stub.ctx.font = '400 10px sans-serif';
    const lines = wrapTrackedText(stub.ctx, '一二三四五六', 35, 0);
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) {
      expect(trackedWidth(stub.ctx, line, 0)).toBeLessThanOrEqual(35);
    }
  });

  it('字号自适应：缩到能排进指定行数', () => {
    const stub = createStubContext(1000, 1000);
    const fit = fitLines(stub.ctx, '一二三四五六七八九十', {
      family: 'sans-serif',
      weight: 700,
      tracking: 0,
      maxWidth: 60,
      maxSize: 40,
      minSize: 8,
      maxLines: 2,
    });
    expect(fit.lines.length).toBeLessThanOrEqual(2);
    expect(fit.size).toBeLessThan(40);
  });
});
