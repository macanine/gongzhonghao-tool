import { describe, expect, it } from 'vitest';
import {
  blockSummary,
  countBlocks,
  describeBlocks,
  dividerHtml,
  escapeHtml,
  inlineStyle,
  insertAt,
  moveBlock,
  plainText,
  removeBlock,
  shiftBlock,
  textHtml,
  updateText,
  withId,
  type Block,
  type TextBlock,
} from '@/lib/article/blocks';

const page = (pageNumber: number, name = 'a.pdf'): Block =>
  withId({ kind: 'page', docId: 'doc', name, pageNumber, aspect: 1.414 });
const text = (value: string, style: TextBlock['style'] = 'paragraph'): TextBlock =>
  withId({ kind: 'text', style, text: value }) as TextBlock;

const ids = (blocks: Block[]) => blocks.map((block) => block.id);

describe('内容块排序', () => {
  const [a, b, c, d] = [page(1), page(2), page(3), page(4)] as [Block, Block, Block, Block];
  const list = [a, b, c, d];

  it('每个块拿到不同的 id', () => {
    expect(new Set(ids(list)).size).toBe(4);
  });

  it('拖到目标前面 / 后面', () => {
    expect(ids(moveBlock(list, a.id, c.id, true))).toEqual(ids([b, a, c, d]));
    expect(ids(moveBlock(list, a.id, c.id, false))).toEqual(ids([b, c, a, d]));
    expect(ids(moveBlock(list, d.id, a.id, true))).toEqual(ids([d, a, b, c]));
    expect(ids(moveBlock(list, d.id, b.id, false))).toEqual(ids([a, b, d, c]));
  });

  it('拖到自己或找不到目标时原样返回', () => {
    expect(moveBlock(list, a.id, a.id, true)).toBe(list);
    expect(moveBlock(list, 'nope', a.id, true)).toBe(list);
  });

  it('上移下移到边上为止', () => {
    expect(ids(shiftBlock(list, b.id, -1))).toEqual(ids([b, a, c, d]));
    expect(ids(shiftBlock(list, b.id, 1))).toEqual(ids([a, c, b, d]));
    expect(shiftBlock(list, a.id, -1)).toBe(list);
    expect(shiftBlock(list, d.id, 1)).toBe(list);
  });

  it('插入位置越界时夹到两端', () => {
    const x = text('x');
    expect(ids(insertAt(list, 2, [x]))).toEqual(ids([a, b, x, c, d]));
    expect(ids(insertAt(list, -5, [x]))[0]).toBe(x.id);
    expect(ids(insertAt(list, Number.POSITIVE_INFINITY, [x])).at(-1)).toBe(x.id);
  });

  it('删除与改文字不动其他块的引用', () => {
    const x = text('旧');
    const blocks = [a, x, b];
    expect(ids(removeBlock(blocks, x.id))).toEqual(ids([a, b]));
    const updated = updateText(blocks, x.id, { text: '新', style: 'heading' });
    expect(updated[0]).toBe(a);
    expect(updated[1]).toMatchObject({ text: '新', style: 'heading' });
    // 只改文字块，对页面块传同样的补丁不生效
    expect(updateText(blocks, a.id, { text: 'x' })[0]).toBe(a);
  });
});

describe('统计与摘要', () => {
  it('空白文字块不计数', () => {
    const blocks = [page(1), page(2), text('你好'), text('   '), withId({ kind: 'divider' })];
    expect(countBlocks(blocks)).toEqual({ pages: 2, texts: 1, images: 0 });
    expect(describeBlocks(blocks)).toBe('2 页 · 1 段文字');
    expect(describeBlocks([])).toBe('');
  });

  it('目录摘要取文字首行，空白时显示类型', () => {
    expect(blockSummary(text('\n 第一行 \n第二行'))).toBe('第一行');
    expect(blockSummary(text('', 'heading'))).toBe('空白小标题');
    expect(blockSummary(withId({ kind: 'divider' }))).toBe('分隔线');
  });
});

describe('HTML 生成', () => {
  it('驼峰样式转成内联 style', () => {
    expect(inlineStyle({ fontSize: '16px', borderLeft: '3px solid red' })).toBe(
      'font-size:16px;border-left:3px solid red;',
    );
  });

  it('文字要转义，换行变 <br>，结尾空白去掉', () => {
    const html = textHtml(text('a < b & "c"\n第二行\n\n'));
    expect(html).toMatch(/^<p style="margin:0 0 16px;font-size:16px;/);
    expect(html).toContain('a &lt; b &amp; &quot;c&quot;<br>第二行</p>');
    expect(escapeHtml("<script>'x'")).toBe('&lt;script&gt;&#39;x&#39;');
  });

  it('空白文字块不输出', () => {
    expect(textHtml(text('  \n '))).toBe('');
  });

  it('三种文字样式各不相同', () => {
    const styles = (['heading', 'paragraph', 'note'] as const).map((style) =>
      textHtml(text('x', style)),
    );
    expect(new Set(styles).size).toBe(3);
    expect(styles[0]).toContain('font-weight:700;');
    expect(styles[2]).toContain('border-left:');
  });

  it('分隔线带块间距', () => {
    expect(dividerHtml()).toMatch(/^<section style="margin:0 0 16px;"><hr style="/);
  });

  it('纯文本版本按顺序拼接', () => {
    const blocks = [
      text('标题', 'heading'),
      page(3, '卷.pdf'),
      text(''),
      withId({ kind: 'divider' }),
      text('结尾'),
    ];
    expect(plainText(blocks)).toBe('标题\n\n[第 3 页 · 卷.pdf]\n\n————\n\n结尾');
  });
});
