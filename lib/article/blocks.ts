/**
 * 推文正文：一串按顺序排列的内容块。
 *
 * PDF 页、文字、插图、分隔线都是块；预览逐块渲染，复制时逐块转成 HTML。
 * 这里不依赖 React 与 DOM，排序、增删和 HTML 生成都能在 Node 里测试。
 */

export type TextStyle = 'heading' | 'paragraph' | 'note';

export interface PageBlock {
  id: string;
  kind: 'page';
  docId: string;
  name: string;
  pageNumber: number;
  /** 高 / 宽，预览占位用。 */
  aspect: number;
}

export interface TextBlock {
  id: string;
  kind: 'text';
  style: TextStyle;
  text: string;
}

export interface ImageBlock {
  id: string;
  kind: 'image';
  name: string;
  blob: Blob;
}

export interface DividerBlock {
  id: string;
  kind: 'divider';
}

export type Block = PageBlock | TextBlock | ImageBlock | DividerBlock;

/** 新建块时不用自己编 id。条件类型让 Omit 分别作用在联合的每个成员上。 */
type OmitEach<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
export type NewBlock = OmitEach<Block, 'id'>;

let seed = 0;
export const blockId = (): string => `block-${(seed += 1)}`;

export const withId = (block: NewBlock): Block => ({ ...block, id: blockId() }) as Block;

/* ---------------- 增删改排 ---------------- */

/** 在 index 处插入（越界时夹到两端）。 */
export function insertAt(blocks: Block[], index: number, items: Block[]): Block[] {
  const at = Math.max(0, Math.min(blocks.length, index));
  return [...blocks.slice(0, at), ...items, ...blocks.slice(at)];
}

export function removeBlock(blocks: Block[], id: string): Block[] {
  return blocks.filter((block) => block.id !== id);
}

export function updateText(blocks: Block[], id: string, patch: Partial<Omit<TextBlock, 'id' | 'kind'>>): Block[] {
  return blocks.map((block) => (block.id === id && block.kind === 'text' ? { ...block, ...patch } : block));
}

/** 拖拽排序：把 fromId 放到 targetId 的前面或后面。 */
export function moveBlock(blocks: Block[], fromId: string, targetId: string, before: boolean): Block[] {
  const from = blocks.findIndex((block) => block.id === fromId);
  const target = blocks.findIndex((block) => block.id === targetId);
  if (from < 0 || target < 0 || from === target) return blocks;
  const next = [...blocks];
  const [record] = next.splice(from, 1);
  let insertAt = target;
  if (from < target) insertAt -= 1;
  if (!before) insertAt += 1;
  next.splice(insertAt, 0, record!);
  return next;
}

/** 上移 / 下移一格；已在边上就原样返回。 */
export function shiftBlock(blocks: Block[], id: string, delta: -1 | 1): Block[] {
  const from = blocks.findIndex((block) => block.id === id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= blocks.length) return blocks;
  const next = [...blocks];
  [next[from], next[to]] = [next[to]!, next[from]!];
  return next;
}

/* ---------------- 统计 ---------------- */

export interface BlockCounts {
  pages: number;
  texts: number;
  images: number;
}

export function countBlocks(blocks: Block[]): BlockCounts {
  const counts: BlockCounts = { pages: 0, texts: 0, images: 0 };
  for (const block of blocks) {
    if (block.kind === 'page') counts.pages += 1;
    else if (block.kind === 'image') counts.images += 1;
    else if (block.kind === 'text' && block.text.trim()) counts.texts += 1;
  }
  return counts;
}

/** 「8 页 · 2 段文字 · 1 张插图」，空文字块不计。 */
export function describeBlocks(blocks: Block[]): string {
  const { pages, texts, images } = countBlocks(blocks);
  const parts = [
    pages ? `${pages} 页` : '',
    texts ? `${texts} 段文字` : '',
    images ? `${images} 张插图` : '',
  ].filter(Boolean);
  return parts.join(' · ');
}

/** 左侧目录里显示的一行摘要。 */
export function blockSummary(block: Block): string {
  switch (block.kind) {
    case 'page':
      return block.name;
    case 'image':
      return block.name;
    case 'divider':
      return '分隔线';
    case 'text': {
      const line = block.text.trim().split('\n')[0]?.trim();
      return line || `空白${TEXT_STYLE_LABELS[block.style]}`;
    }
  }
}

export const TEXT_STYLE_LABELS: Record<TextStyle, string> = {
  heading: '小标题',
  paragraph: '正文',
  note: '提示',
};

/* ---------------- 输出样式 ---------------- */

/**
 * 正文的内联样式。公众号会丢掉 class，只认 style，所以样式写成对象：
 * 导出时拼成 style 字符串，预览时直接作为 React 的 style 使用——两边
 * 用的是同一份数据，所见即所得。
 *
 * 块与块之间统一由外层的 BLOCK_GAP 隔开，这里不写外边距。
 */
export const BLOCK_GAP = 16;

const NOTE_ACCENT = '#2f6fed';

export const TEXT_STYLES: Record<TextStyle, Record<string, string>> = {
  heading: {
    paddingTop: '8px',
    fontSize: '19px',
    fontWeight: '700',
    lineHeight: '1.5',
    color: '#1f2329',
  },
  paragraph: {
    fontSize: '16px',
    lineHeight: '1.8',
    letterSpacing: '0.02em',
    color: '#3f3f3f',
  },
  note: {
    padding: '12px 16px',
    borderLeft: `3px solid ${NOTE_ACCENT}`,
    borderRadius: '4px',
    background: '#f3f7ff',
    fontSize: '15px',
    lineHeight: '1.75',
    color: '#4a5568',
  },
};

export const DIVIDER_STYLE: Record<string, string> = {
  margin: '8px 0',
  border: '0',
  borderTop: '1px solid #dfe3ea',
};

/** { fontSize: '16px' } → "font-size:16px;" */
export function inlineStyle(style: Record<string, string>): string {
  return Object.entries(style)
    .map(([key, value]) => `${key.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`)}:${value};`)
    .join('');
}

/* ---------------- HTML ---------------- */

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

const GAP = `margin:0 0 ${BLOCK_GAP}px;`;

/** 一段文字 → 一个 <p>，换行转成 <br>。空白文字返回空串。 */
export function textHtml(block: TextBlock): string {
  const text = block.text.replace(/\s+$/, '');
  if (!text.trim()) return '';
  const body = escapeHtml(text).replace(/\r?\n/g, '<br>');
  return `<p style="${GAP}${inlineStyle(TEXT_STYLES[block.style])}">${body}</p>`;
}

export const dividerHtml = (): string =>
  `<section style="${GAP}"><hr style="${inlineStyle(DIVIDER_STYLE)}"></section>`;

/** 铺满正文宽度的成品图（PDF 页、头图）。 */
export const fullImageHtml = (src: string, alt: string): string =>
  `<p style="${GAP}line-height:0;">` +
  `<img src="${src}" alt="${escapeHtml(alt)}" style="display:block;width:100%;height:auto;border:0;"></p>`;

/** 插图按原始尺寸居中，最宽不超过正文：二维码之类的小图不会被拉大。 */
export const insetImageHtml = (src: string, alt: string): string =>
  `<p style="${GAP}line-height:0;text-align:center;">` +
  `<img src="${src}" alt="${escapeHtml(alt)}" style="display:inline-block;max-width:100%;height:auto;border:0;"></p>`;

/** 剪贴板的纯文本版本：按顺序拼出文字，图片用占位符。 */
export function plainText(blocks: Block[]): string {
  const lines: string[] = [];
  for (const block of blocks) {
    if (block.kind === 'text') {
      const text = block.text.trim();
      if (text) lines.push(text);
    } else if (block.kind === 'page') lines.push(`[第 ${block.pageNumber} 页 · ${block.name}]`);
    else if (block.kind === 'image') lines.push(`[图片 · ${block.name}]`);
    else lines.push('————');
  }
  return lines.join('\n\n');
}
