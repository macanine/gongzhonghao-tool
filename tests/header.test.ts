import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  RATIOS,
  type HeaderContent,
  type PosterRatio,
  type PosterStyle,
} from '@/lib/settings';
import { drawHeader, headerFields, headerSize } from '@/lib/canvas/header';
import { createStubContext, type StubContext } from './helpers/canvas';

const PHONE_WIDTH = 350;
const phonePx = (size: number, width: number) => (size / width) * PHONE_WIDTH;

const makeStyle = (over: Partial<PosterStyle> = {}): PosterStyle => ({
  ...structuredClone(DEFAULT_SETTINGS.header),
  ...over,
});

const makeContent = (over: Partial<HeaderContent> = {}): HeaderContent => ({
  ...structuredClone(DEFAULT_SETTINGS.article.header),
  ...over,
});

function render(style: PosterStyle, content: HeaderContent, pageCount = 0) {
  const { width, height } = headerSize(style);
  const stub: StubContext = createStubContext(width, height);
  const layout = drawHeader(stub.ctx, { style, content, pageCount }, width, height);
  const lines = stub.lines().filter((line) => line.text.trim());
  const titleKey = content.title.replace(/\s/g, '');
  const titleLines = lines.filter((line) => line.text && titleKey.includes(line.text.replace(/\s/g, '')));
  const valueKey = [content.date, content.difficulty, content.pages]
    .map((item) => item.replace(/\s/g, ''))
    .filter(Boolean)
    .join('');
  return { stub, layout, width, height, lines, titleLines, titleKey, valueKey };
}

const scenes: [string, HeaderContent][] = [
  ['默认文案', makeContent({})],
  [
    '超长标题 + 长提示',
    makeContent({
      title: '八年级物理第一学期期末考试模拟试卷（含答案与详细解析）',
      hint: '关注公众号后，在评论区回复「试卷」两个字，即可获取完整电子版下载链接',
    }),
  ],
  ['标题手动换行', makeContent({ title: '高三语文\n古诗文默写专项训练' })],
  ['极短文案', makeContent({ title: '数学', difficulty: '易', pages: '共 1 页', hint: '评论区自取' })],
  ['无提示', makeContent({ hint: '' })],
  ['无信息行', makeContent({ date: '', difficulty: '', pages: '' })],
  ['只有标题', makeContent({ date: '', difficulty: '', pages: '', hint: '' })],
  [
    '60 字极限提示',
    makeContent({ hint: '关注公众号后在评论区回复试卷两个字即可获取本次考试完整电子版试卷及答案解析的下载链接' }),
  ],
];

describe('头图排版', () => {
  it.each(scenes)('%s：排得下、不截断、手机上看得清', (_name, content) => {
    const { lines, titleLines, titleKey, valueKey, stub, width, height } = render(makeStyle(), content);

    // 标题：只允许缩小，不允许截断
    const drawnTitle = titleLines.map((line) => line.text.replace(/\s/g, '')).join('');
    expect(drawnTitle).toBe(titleKey);

    // 标题最多两行；超长标题允许排到三行，宁可多一行也不丢字
    const maxTitleLines = titleKey.length > 24 ? 3 : 2;
    expect(titleLines.length).toBeGreaterThanOrEqual(1);
    expect(titleLines.length).toBeLessThanOrEqual(maxTitleLines);

    // 层级：标题必须大于信息值
    const valueLine = valueKey
      ? lines.find((line) => line.text.replace(/\s/g, '') === valueKey)
      : undefined;
    if (valueLine) {
      expect(Math.max(...titleLines.map((line) => line.size))).toBeGreaterThanOrEqual(valueLine.size);
    }

    // 移动端可读性：最小字号换算到 350px 宽的手机上
    const smallest = Math.min(...lines.map((line) => line.size));
    expect(phonePx(smallest, width)).toBeGreaterThanOrEqual(12);

    // 不越界（假的 context 会在越界时抛错，这里再兜一层）
    const lowest = Math.max(...lines.map((line) => line.y));
    expect(lowest).toBeLessThan(height);
    expect(stub.calls.length).toBeGreaterThan(0);
  });

  it.each(Object.keys(RATIOS) as PosterRatio[])('%s 比例排得下且可读', (ratio) => {
    const style = makeStyle({ ratio });
    const { lines, width, height } = render(style, makeContent({}));
    const lowest = Math.max(...lines.map((line) => line.y));
    const smallest = Math.min(...lines.map((line) => line.size));
    expect(lowest).toBeLessThan(height);
    expect(phonePx(smallest, width)).toBeGreaterThanOrEqual(12);
  });

  it('提示只缩小不截断', () => {
    const hint = '关注公众号后在评论区回复试卷两个字即可获取完整电子版及答案解析的下载链接';
    const { lines } = render(makeStyle(), makeContent({ hint, title: '数学' }));
    const hintKey = hint.replace(/\s/g, '');
    const drawn = lines
      .filter((line) => hintKey.includes(line.text.replace(/\s/g, '')))
      .map((line) => line.text.replace(/\s/g, ''))
      .join('');
    expect(drawn).toBe(hintKey);
  });

  it('信息组标签与留空字段一致', () => {
    const full = render(makeStyle(), makeContent({})).layout;
    expect(full.fields.map((f) => f.label)).toEqual(['时间', '难度', '页数']);

    const partial = render(makeStyle(), makeContent({ difficulty: '' })).layout;
    expect(partial.fields.map((f) => f.label)).toEqual(['时间', '页数']);
  });

  it('页数留空时按 PDF 页数生成，填了就听用户的', () => {
    expect(headerFields(makeContent({ pages: '' }), 12)).toContainEqual({ label: '页数', value: '共 12 页' });
    expect(headerFields(makeContent({ pages: '' }), 0).map((f) => f.label)).not.toContain('页数');
    expect(headerFields(makeContent({ pages: '共 3 页' }), 12)).toContainEqual({ label: '页数', value: '共 3 页' });
  });

  it('元素之间有留白', () => {
    const { lines, height } = render(makeStyle(), makeContent({}));
    const blockSteps = lines
      .slice(1)
      .map((line, index) => (line.size !== lines[index].size ? line.y - lines[index].y : 0))
      .filter((step) => step > 0);
    expect(blockSteps.length).toBeGreaterThan(0);
    expect(Math.max(...blockSteps)).toBeGreaterThanOrEqual(height * 0.1);
  });

  it('只有标题时不画信息组和提示', () => {
    const { layout } = render(makeStyle(), makeContent({ date: '', difficulty: '', pages: '', hint: '' }));
    expect(layout.rows.map((row) => row.kind)).toEqual(['bar', 'title']);
    expect(layout.fields).toEqual([]);
    expect(layout.hintLines).toEqual([]);
  });
});

describe('换行质量', () => {
  const renderTitle = (style: PosterStyle, title: string) => {
    const { width, height } = headerSize(style);
    const stub = createStubContext(width, height);
    const layout = drawHeader(stub.ctx, { style, content: makeContent({ title }), pageCount: 0 }, width, height);
    return { stub, layout, width, height };
  };

  it('优先在空格 / 标点处断行，不劈开词组', () => {
    // 「七年级数学 · 期中模拟卷」在 900px 宽的画布里排不下，
    // 应该断在「· 」之后，而不是把「期中模拟卷」切成「期 / 中模拟卷」。
    const { layout } = renderTitle(makeStyle({ width: 900 }), '七年级数学 · 期中模拟卷');
    expect(layout.titleLines.length).toBeGreaterThan(1);
    expect(layout.titleLines[0]?.trimEnd()).toBe('七年级数学 ·');
    expect(layout.titleLines[1]?.startsWith('期中模拟卷')).toBe(true);
  });

  it('断行后不残留行首行尾空格', () => {
    const { layout } = renderTitle(makeStyle(), '一二三四五六七八 · 九十');
    for (const line of layout.titleLines) {
      expect(line).toBe(line.trim());
    }
  });
});
