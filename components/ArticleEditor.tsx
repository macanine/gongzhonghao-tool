'use client';

/**
 * 中栏的推文编辑器：头图 + 按顺序排列的内容块。
 *
 * 文字块就地编辑；块与块之间悬停出现插入条，可以插小标题、正文、提示、
 * 图片和分隔线；每块右侧有上移 / 下移 / 删除。PDF 和图片也可以直接拖进来。
 */

import {
  Fragment,
  memo,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
  type ReactNode,
} from 'react';
import {
  ArrowDown,
  ArrowUp,
  Heading2,
  ImagePlus,
  MessageSquareQuote,
  Minus,
  Pilcrow,
  Trash2,
  Upload,
  type LucideIcon,
} from 'lucide-react';
import {
  BLOCK_GAP,
  DIVIDER_STYLE,
  TEXT_STYLE_LABELS,
  TEXT_STYLES,
  type Block,
  type NewBlock,
  type TextBlock,
  type TextStyle,
} from '@/lib/article/blocks';
import type { WatermarkSettings } from '@/lib/settings';
import { cn } from '@/lib/utils';
import { LazyPage } from './LazyPage';
import type { ArticleState } from './useArticle';
import { Button } from './ui';

type InsertKind = TextStyle | 'image' | 'divider';

const INSERT_OPTIONS: { kind: InsertKind; label: string; icon: LucideIcon }[] = [
  { kind: 'heading', label: '小标题', icon: Heading2 },
  { kind: 'paragraph', label: '正文', icon: Pilcrow },
  { kind: 'note', label: '提示', icon: MessageSquareQuote },
  { kind: 'image', label: '图片', icon: ImagePlus },
  { kind: 'divider', label: '分隔线', icon: Minus },
];

const STYLE_OPTIONS: { style: TextStyle; icon: LucideIcon }[] = [
  { style: 'heading', icon: Heading2 },
  { style: 'paragraph', icon: Pilcrow },
  { style: 'note', icon: MessageSquareQuote },
];

const PLACEHOLDERS: Record<TextStyle, string> = {
  heading: '输入小标题',
  paragraph: '输入正文，回车换行',
  note: '输入提示，例如资料的获取方式',
};

const hasFiles = (event: DragEvent) => event.dataTransfer.types.includes('Files');

export function ArticleEditor({
  article,
  watermark,
  header,
  onPickPdf,
}: {
  article: ArticleState;
  watermark: WatermarkSettings;
  /** 头图预览，关闭头图时为 null。 */
  header: ReactNode;
  onPickPdf: () => void;
}) {
  const { blocks, docs, focusId, insert, importFiles, update, remove, shift } = article;
  const imageInput = useRef<HTMLInputElement>(null);
  const pendingIndex = useRef(0);
  const [dropping, setDropping] = useState(false);

  const insertKind = (index: number, kind: InsertKind) => {
    if (kind === 'image') {
      pendingIndex.current = index;
      imageInput.current?.click();
      return;
    }
    const block: NewBlock =
      kind === 'divider' ? { kind: 'divider' } : { kind: 'text', style: kind, text: '' };
    insert(index, [block]);
  };

  return (
    <div
      data-scroll="preview"
      className={cn(
        'scrollbar-slim min-h-0 flex-1 overflow-y-auto overscroll-contain transition-colors duration-150',
        'px-[clamp(10px,5vw,76px)] pt-[clamp(18px,4vw,48px)] pb-17.5',
        'max-[768px]:px-2 max-[768px]:pt-3.5 max-[768px]:pb-10.5',
        dropping && 'bg-accent-wash',
      )}
      onDragOver={(event) => {
        if (!hasFiles(event)) return;
        event.preventDefault();
        setDropping(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropping(false);
      }}
      onDrop={(event) => {
        if (!hasFiles(event)) return;
        event.preventDefault();
        setDropping(false);
        void importFiles(event.dataTransfer.files);
      }}
    >
      <article
        className={cn(
          'mx-auto min-h-86 w-[min(100%,677px)] rounded-xl border bg-paper shadow-lift',
          'p-[clamp(16px,2.5vw,30px)] max-[768px]:rounded-lg max-[768px]:p-3',
          dropping ? 'border-accent' : 'border-line',
        )}
      >
        {header}

        {blocks.length === 0 ? (
          <EmptyState
            onPickPdf={onPickPdf}
            onWrite={() => insert(0, [{ kind: 'text', style: 'paragraph', text: '' }])}
          />
        ) : (
          blocks.map((block, index) => (
            <Fragment key={block.id}>
              {index > 0 || header ? (
                <Inserter onInsert={(kind) => insertKind(index, kind)} />
              ) : null}
              <BlockFrame
                block={block}
                first={index === 0}
                last={index === blocks.length - 1}
                onShift={shift}
                onRemove={remove}
                onRestyle={update}
              >
                {block.kind === 'page' ? (
                  docs.current.get(block.docId) ? (
                    <LazyPage
                      doc={docs.current.get(block.docId)!.pdf}
                      pageNumber={block.pageNumber}
                      aspect={block.aspect}
                      watermark={watermark}
                    />
                  ) : null
                ) : block.kind === 'text' ? (
                  <TextEditor
                    block={block}
                    autoFocus={block.id === focusId}
                    onChange={update}
                    onRemove={remove}
                  />
                ) : block.kind === 'image' ? (
                  <InsetImage blob={block.blob} name={block.name} />
                ) : (
                  <div className="py-2">
                    <hr style={DIVIDER_STYLE as CSSProperties} />
                  </div>
                )}
              </BlockFrame>
            </Fragment>
          ))
        )}

        {blocks.length ? (
          <Inserter persistent onInsert={(kind) => insertKind(blocks.length, kind)} />
        ) : null}
      </article>

      <input
        ref={imageInput}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(event) => {
          void importFiles(event.target.files, pendingIndex.current);
          event.target.value = '';
        }}
      />
    </div>
  );
}

/* ---------------- 空状态 ---------------- */

function EmptyState({ onPickPdf, onWrite }: { onPickPdf: () => void; onWrite: () => void }) {
  return (
    <div className="grid min-h-80 place-content-center justify-items-center gap-3.5 text-center">
      <div className="grid h-16.5 w-13.5 place-items-center rounded-md border border-accent/30 bg-accent-wash text-[11px] font-bold tracking-[0.08em] text-accent-strong">
        PDF
      </div>
      <p className="text-[13px] text-muted">导入 PDF，或者先写点文字</p>
      <div className="flex flex-wrap justify-center gap-2">
        <Button variant="primary" size="sm" onClick={onPickPdf}>
          <Upload aria-hidden="true" className="size-3.5" />
          导入 PDF
        </Button>
        <Button variant="secondary" size="sm" onClick={onWrite}>
          <Pilcrow aria-hidden="true" className="size-3.5" />
          写一段文字
        </Button>
      </div>
      <p className="text-[11px] text-faint">也可以把 PDF 或图片直接拖到这里</p>
    </div>
  );
}

/* ---------------- 插入条 ---------------- */

/**
 * 块之间的插入条，高度正好等于导出时的块间距，所以预览的节奏和成品一致。
 * 平时隐形，悬停或键盘聚焦时浮出一排按钮；末尾那条（persistent）一直显示。
 */
function Inserter({
  onInsert,
  persistent = false,
}: {
  onInsert: (kind: InsertKind) => void;
  persistent?: boolean;
}) {
  if (persistent) {
    return (
      <div className="mt-4 flex flex-wrap items-center justify-center gap-1 rounded-lg border border-dashed border-line-strong p-1.5">
        {INSERT_OPTIONS.map((option) => (
          <InsertButton key={option.kind} option={option} onInsert={onInsert} />
        ))}
      </div>
    );
  }
  return (
    <div
      className="group/insert relative z-10 before:absolute before:inset-x-0 before:-inset-y-1.5"
      style={{ height: BLOCK_GAP }}
    >
      <div
        className={cn(
          'pointer-events-none absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-150',
          'group-hover/insert:pointer-events-auto group-hover/insert:opacity-100',
          'group-focus-within/insert:pointer-events-auto group-focus-within/insert:opacity-100',
          '[@media(hover:none)]:hidden',
        )}
      >
        <span aria-hidden="true" className="absolute inset-x-0 top-1/2 h-px bg-accent/40" />
        <span className="relative flex gap-0.5 rounded-full border border-line bg-paper p-0.5 shadow-card">
          {INSERT_OPTIONS.map((option) => (
            <InsertButton key={option.kind} option={option} onInsert={onInsert} compact />
          ))}
        </span>
      </div>
    </div>
  );
}

function InsertButton({
  option,
  onInsert,
  compact = false,
}: {
  option: (typeof INSERT_OPTIONS)[number];
  onInsert: (kind: InsertKind) => void;
  compact?: boolean;
}) {
  return (
    <Button
      variant="ghost"
      size="sm"
      title={`插入${option.label}`}
      aria-label={`插入${option.label}`}
      className={cn('gap-1 text-[11px]', compact && 'min-h-6.5 rounded-full px-2')}
      onClick={() => onInsert(option.kind)}
    >
      <option.icon aria-hidden="true" className="size-3.5" />
      {option.label}
    </Button>
  );
}

/* ---------------- 块外框与工具条 ---------------- */

/**
 * 每个块外面的一层：悬停 / 聚焦时描一圈边，并在右侧露出工具条。
 * 宽屏时工具条放在正文外侧的留白里，手机上收进块的右上角。
 * tabIndex 让图片块在触屏上点一下也能「选中」并露出工具条。
 */
function BlockFrame({
  block,
  first,
  last,
  onShift,
  onRemove,
  onRestyle,
  children,
}: {
  block: Block;
  first: boolean;
  last: boolean;
  onShift: (id: string, delta: -1 | 1) => void;
  onRemove: (id: string) => void;
  onRestyle: (id: string, patch: { style: TextStyle }) => void;
  children: ReactNode;
}) {
  return (
    <div
      data-block-id={block.id}
      tabIndex={-1}
      className={cn(
        'group/block relative -mx-1.5 rounded-sm px-1.5 outline-none',
        'ring-accent/30 transition-shadow duration-150 hover:ring-1 focus-within:ring-2',
      )}
    >
      {children}
      <div
        className={cn(
          'absolute top-0 left-full z-20 flex flex-col gap-0.5 pl-2 opacity-0 transition-opacity duration-150',
          'pointer-events-none group-hover/block:pointer-events-auto group-hover/block:opacity-100',
          'group-focus-within/block:pointer-events-auto group-focus-within/block:opacity-100',
          'max-[768px]:top-1.5 max-[768px]:right-1.5 max-[768px]:left-auto max-[768px]:flex-row max-[768px]:pl-0',
        )}
      >
        <span className="flex flex-col gap-0.5 rounded-md border border-line bg-paper p-0.5 shadow-card max-[768px]:flex-row">
          {block.kind === 'text'
            ? STYLE_OPTIONS.map(({ style, icon: Icon }) => (
                <ToolButton
                  key={style}
                  label={`改为${TEXT_STYLE_LABELS[style]}`}
                  pressed={block.style === style}
                  onClick={() => onRestyle(block.id, { style })}
                >
                  <Icon aria-hidden="true" className="size-3.5" />
                </ToolButton>
              ))
            : null}
          <ToolButton label="上移" disabled={first} onClick={() => onShift(block.id, -1)}>
            <ArrowUp aria-hidden="true" className="size-3.5" />
          </ToolButton>
          <ToolButton label="下移" disabled={last} onClick={() => onShift(block.id, 1)}>
            <ArrowDown aria-hidden="true" className="size-3.5" />
          </ToolButton>
          <ToolButton label="删除" danger onClick={() => onRemove(block.id)}>
            <Trash2 aria-hidden="true" className="size-3.5" />
          </ToolButton>
        </span>
      </div>
    </div>
  );
}

function ToolButton({
  label,
  pressed,
  danger = false,
  disabled,
  onClick,
  children,
}: {
  label: string;
  pressed?: boolean;
  danger?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Button
      variant={danger ? 'danger' : 'ghost'}
      size="iconSm"
      title={label}
      aria-label={label}
      aria-pressed={pressed}
      disabled={disabled}
      className={cn('size-6.5', pressed && 'bg-accent-soft text-accent-strong hover:bg-accent-soft')}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

/* ---------------- 各类块 ---------------- */

/**
 * 文字块：一个随内容长高的 textarea，套用与导出相同的内联样式。
 * 空块里按退格直接删掉这一块，和常见的块编辑器一致。
 */
const TextEditor = memo(function TextEditor({
  block,
  autoFocus,
  onChange,
  onRemove,
}: {
  block: TextBlock;
  autoFocus: boolean;
  onChange: (id: string, patch: { text: string }) => void;
  onRemove: (id: string) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useAutoHeight(ref, block.text, block.style);

  return (
    <textarea
      ref={ref}
      rows={1}
      value={block.text}
      autoFocus={autoFocus}
      aria-label={TEXT_STYLE_LABELS[block.style]}
      placeholder={PLACEHOLDERS[block.style]}
      spellCheck={false}
      className="block w-full resize-none overflow-hidden bg-transparent font-sans outline-none placeholder:text-faint"
      style={TEXT_STYLES[block.style] as CSSProperties}
      onChange={(event) => onChange(block.id, { text: event.target.value })}
      onKeyDown={(event) => {
        if (event.key === 'Backspace' && !block.text) {
          event.preventDefault();
          onRemove(block.id);
        }
      }}
    />
  );
});

/** 让 textarea 的高度贴合内容：内容变了、样式变了、宽度变了（换栏、切标签）都重算。 */
function useAutoHeight(ref: { current: HTMLTextAreaElement | null }, ...deps: unknown[]) {
  const fit = () => {
    const node = ref.current;
    if (!node) return;
    node.style.height = 'auto';
    node.style.height = `${node.scrollHeight}px`;
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(fit, deps);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    let width = node.clientWidth;
    const observer = new ResizeObserver(() => {
      if (node.clientWidth === width) return;
      width = node.clientWidth;
      fit();
    });
    observer.observe(node);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

/** 插图按原始尺寸居中、最宽铺满，与导出的样式一致。 */
const InsetImage = memo(function InsetImage({ blob, name }: { blob: Blob; name: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const objectUrl = URL.createObjectURL(blob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [blob]);
  return url ? (
    <img src={url} alt={name} draggable={false} className="mx-auto block h-auto max-w-full" />
  ) : null;
});
