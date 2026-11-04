'use client';

/**
 * 左栏的正文目录：每个内容块一行，拖动排序，点一下跳到中栏对应位置。
 */

import { useState, type ReactNode } from 'react';
import { Heading2, Image as ImageIcon, MessageSquareQuote, Minus, Pilcrow, X } from 'lucide-react';
import { blockSummary, TEXT_STYLE_LABELS, type Block, type TextStyle } from '@/lib/article/blocks';
import { cn } from '@/lib/utils';
import { Button } from './ui';

const TEXT_ICONS: Record<TextStyle, typeof Pilcrow> = {
  heading: Heading2,
  paragraph: Pilcrow,
  note: MessageSquareQuote,
};

/** 滚到中栏里的那一块并聚焦（文字块直接进入编辑）。 */
function reveal(id: string) {
  const frame = document.querySelector<HTMLElement>(`[data-block-id="${CSS.escape(id)}"]`);
  if (!frame) return;
  frame.scrollIntoView({ block: 'center', behavior: 'smooth' });
  (frame.querySelector('textarea') ?? frame).focus({ preventScroll: true });
}

export function ArticleOutline({
  blocks,
  onMove,
  onRemove,
}: {
  blocks: Block[];
  onMove: (fromId: string, targetId: string, before: boolean) => void;
  onRemove: (id: string) => void;
}) {
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  let pageIndex = 0;
  return (
    <div className="mt-3 grid gap-1">
      {blocks.map((block) => {
        if (block.kind === 'page') pageIndex += 1;
        return (
          <div
            key={block.id}
            draggable
            onDragStart={(event) => {
              event.dataTransfer.effectAllowed = 'move';
              setDragging(block.id);
            }}
            onDragEnd={() => {
              setDragging(null);
              setDropTarget(null);
            }}
            onDragOver={(event) => {
              if (!dragging) return;
              event.preventDefault();
              if (dragging !== block.id) {
                event.dataTransfer.dropEffect = 'move';
                setDropTarget(block.id);
              }
            }}
            onDragLeave={() => setDropTarget((current) => (current === block.id ? null : current))}
            onDrop={(event) => {
              if (!dragging) return;
              event.preventDefault();
              if (dragging !== block.id) {
                const rect = event.currentTarget.getBoundingClientRect();
                onMove(dragging, block.id, event.clientY < rect.top + rect.height / 2);
              }
              setDragging(null);
              setDropTarget(null);
            }}
            className={cn(
              'group grid cursor-grab grid-cols-[34px_minmax(0,1fr)_28px] items-center gap-2.5 rounded-md border p-1.5',
              'transition-[background-color,border-color,opacity] duration-150 active:cursor-grabbing',
              dragging === block.id
                ? 'border-transparent opacity-40'
                : dropTarget === block.id
                  ? 'border-accent bg-accent-soft'
                  : 'border-transparent hover:border-line hover:bg-panel',
            )}
          >
            <button
              type="button"
              className="col-span-2 grid cursor-pointer grid-cols-subgrid items-center text-left"
              title="在编辑器中定位"
              onClick={() => reveal(block.id)}
            >
              <Thumb block={block} />
              <span className="min-w-0">
                <span className="block truncate text-[11px] font-semibold text-ink">
                  {blockSummary(block)}
                </span>
                <span className="mt-0.5 block text-[10px] text-faint">{caption(block, pageIndex)}</span>
              </span>
            </button>
            <Button
              variant="danger"
              size="iconSm"
              title="删除"
              aria-label={`删除：${blockSummary(block)}`}
              className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
              onClick={() => onRemove(block.id)}
            >
              <X aria-hidden="true" className="size-3.5" />
            </Button>
          </div>
        );
      })}
      {blocks.length === 0 ? (
        <p className="py-5 text-center text-[11px] text-faint">暂无内容 · 导入 PDF 后开始排版</p>
      ) : null}
    </div>
  );
}

function caption(block: Block, pageIndex: number): string {
  switch (block.kind) {
    case 'page':
      return `第 ${block.pageNumber} 页 · 正文第 ${pageIndex} 张`;
    case 'text':
      return TEXT_STYLE_LABELS[block.style];
    case 'image':
      return '插图';
    case 'divider':
      return '分隔';
  }
}

function Thumb({ block }: { block: Block }) {
  let content: ReactNode;
  if (block.kind === 'page') content = block.pageNumber;
  else if (block.kind === 'text') {
    const Icon = TEXT_ICONS[block.style];
    content = <Icon aria-hidden="true" className="size-3.5" />;
  } else if (block.kind === 'image') content = <ImageIcon aria-hidden="true" className="size-3.5" />;
  else content = <Minus aria-hidden="true" className="size-3.5" />;

  return (
    <span
      className={cn(
        'grid w-8.5 place-items-center rounded-xs border text-[10px] font-bold',
        block.kind === 'page'
          ? 'h-11 border-line bg-panel text-muted'
          : 'h-8.5 border-accent/20 bg-accent-wash text-accent-strong',
      )}
    >
      {content}
    </span>
  );
}
