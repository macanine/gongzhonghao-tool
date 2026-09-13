import { describe, expect, it } from 'vitest';
import { COVER_RATIO, DEFAULT_SETTINGS, type CoverContent, type PosterStyle } from '@/lib/settings';
import { coverSize, drawCover } from '@/lib/canvas/cover';
import { createStubContext } from './helpers/canvas';

const makeStyle = (over: Partial<PosterStyle> = {}): PosterStyle => ({
  ...structuredClone(DEFAULT_SETTINGS.cover),
  ...over,
});

const makeContent = (over: Partial<CoverContent> = {}): CoverContent => ({
  title: DEFAULT_SETTINGS.cover.title,
  subtitle: DEFAULT_SETTINGS.cover.subtitle,
  ...over,
});

function render(style: PosterStyle, content: CoverContent) {
  const { width, height } = coverSize(style);
  const stub = createStubContext(width, height);
  const layout = drawCover(stub.ctx, { style, content }, width, height);
  return { stub, layout, lines: stub.lines(), gradients: stub.gradients, width, height };
}

describe('封面', () => {
  it('固定 2.35:1', () => {
    const size = coverSize(makeStyle({ width: 900 }));
    expect(size.ratio).toBe(COVER_RATIO);
    expect(size.height).toBe(Math.round(900 / COVER_RATIO));
  });

  it('主标题最多两行，且不超出画布', () => {
    const cases: [string, CoverContent][] = [
      ['默认', makeContent({})],
      ['超长标题', makeContent({ title: '八年级物理第一学期期末考试模拟试卷（含答案与解析）' })],
      ['手动换行', makeContent({ title: '手写笔记\n可以换行' })],
      ['无副标题', makeContent({ subtitle: '' })],
      ['全空', makeContent({ title: '', subtitle: '' })],
    ];
    for (const [name, content] of cases) {
      // 假的 context 一旦画出边界就抛错，所以能跑到这里就说明没越界。
      const { layout, lines, height } = render(makeStyle(), content);
      expect(layout.titleLines.length, name).toBeLessThanOrEqual(2);
      expect(layout.titleLines.length, name).toBeGreaterThanOrEqual(1);
      const lowest = Math.max(...lines.map((line) => line.y));
      expect(lowest, name).toBeLessThan(height);
    }
  });

  it('主题背景直接沿用，霓虹色能落到画布上', () => {
    const { gradients } = render(
      makeStyle({ mode: 'glow', colorA: '#1a0b2e', colorB: '#d946ef', accent: '#22d3ee' }),
      makeContent({}),
    );
    const stops = gradients.flatMap((gradient) => gradient.stops);
    expect(stops.some((stop) => stop.includes('217, 70, 239'))).toBe(true);
    expect(stops.some((stop) => stop.includes('34, 211, 238'))).toBe(true);
  });

  it('强调色短线用来做视觉落点', () => {
    const { layout } = render(makeStyle(), makeContent({}));
    expect(layout.underline).not.toBeNull();
    expect(layout.underline!.width).toBeGreaterThan(0);
  });

  it('副标题留空时不占位', () => {
    const { layout, lines } = render(makeStyle(), makeContent({ subtitle: '' }));
    expect(layout.underline).not.toBeNull();
    expect(lines.every((line) => !line.text.includes('阅读'))).toBe(true);
  });
});
