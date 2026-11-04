'use client';

/**
 * 推文正文的状态：内容块列表 + 已打开的 PDF 句柄。
 *
 * 块的增删改排都是 lib/article/blocks 里的纯函数，这里只负责把它们接到
 * React 状态上，并处理导入文件、释放 PDF 这类有副作用的事。
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  blockId,
  countBlocks,
  insertAt,
  moveBlock,
  removeBlock,
  shiftBlock,
  updateText,
  withId,
  type Block,
  type NewBlock,
  type TextBlock,
} from '@/lib/article/blocks';
import { isPdf, loadPdf, type DocRecord } from '@/lib/article/pdf';
import { runJob, toast } from '@/lib/feedback';
import { setPageCount } from '@/lib/store';

const isImage = (file: File): boolean => file.type.startsWith('image/');

export function useArticle() {
  const [blocks, setBlocks] = useState<Block[]>([]);
  const docs = useRef(new Map<string, DocRecord>());
  /** 刚插入的文字块：挂载时自动聚焦，方便直接开始打字。 */
  const [focusId, setFocusId] = useState<string | null>(null);

  const pageCount = countBlocks(blocks).pages;
  useEffect(() => setPageCount(pageCount), [pageCount]);

  // 某份 PDF 的页面全删光后就释放它，不必等到「清空全部」。
  useEffect(() => {
    const used = new Set(blocks.flatMap((block) => (block.kind === 'page' ? [block.docId] : [])));
    docs.current.forEach((doc, docId) => {
      if (used.has(docId)) return;
      doc.release().catch(() => undefined);
      docs.current.delete(docId);
    });
  }, [blocks]);

  useEffect(
    () => () => {
      docs.current.forEach((doc) => doc.release().catch(() => undefined));
      docs.current.clear();
    },
    [],
  );

  // 正文只在内存里：有内容时离开页面先确认一下。
  const hasContent = blocks.length > 0;
  useEffect(() => {
    if (!hasContent) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [hasContent]);

  const insert = useCallback((index: number, items: NewBlock[]) => {
    const created = items.map(withId);
    const firstText = created.find((block) => block.kind === 'text');
    if (firstText) setFocusId(firstText.id);
    setBlocks((previous) => insertAt(previous, index, created));
  }, []);

  /** PDF 拆成页面块、图片作为插图块，其余文件忽略。index 缺省时追加到末尾。 */
  const importFiles = useCallback(async (fileList: FileList | File[] | null, index?: number) => {
    const selected = Array.from(fileList ?? []);
    const pdfs = selected.filter(isPdf);
    const images = selected.filter(isImage);
    if (!pdfs.length && !images.length) {
      toast('请选择 PDF 或图片文件', true);
      return;
    }
    let at = index ?? Number.POSITIVE_INFINITY;
    const place = (items: Block[]) => {
      // updater 可能晚些才执行，位置要先定下来，不能读之后被改过的 at。
      const position = at;
      setBlocks((previous) => insertAt(previous, position, items));
      at += items.length;
    };

    await runJob('正在导入文件', async (detail) => {
      let pages = 0;
      for (const file of pdfs) {
        detail(`读取 ${file.name}`);
        const { pdf, release } = await loadPdf(file);
        const docId = blockId();
        const records: Block[] = [];
        try {
          for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
            detail(`${file.name} · 第 ${pageNumber}/${pdf.numPages} 页`);
            const page = await pdf.getPage(pageNumber);
            const viewport = page.getViewport({ scale: 1 });
            page.cleanup();
            records.push(
              withId({
                kind: 'page',
                docId,
                name: file.name,
                pageNumber,
                aspect: viewport.height / viewport.width,
              }),
            );
          }
        } catch (error) {
          await release().catch(() => undefined);
          throw error;
        }
        // 和页面块同时登记：提前登记的话，上面的释放逻辑会把还没放进正文的文档当成没人用。
        docs.current.set(docId, { pdf, release });
        place(records);
        pages += records.length;
      }
      if (images.length) place(images.map((file) => withId({ kind: 'image', name: file.name, blob: file })));

      const ignored = selected.length - pdfs.length - images.length;
      const parts = [pages ? `${pages} 页 PDF` : '', images.length ? `${images.length} 张图片` : '']
        .filter(Boolean)
        .join('、');
      toast(`已导入 ${parts}${ignored ? `，已忽略 ${ignored} 个其他文件` : ''}`);
    });
  }, []);

  const update = useCallback(
    (id: string, patch: Partial<Pick<TextBlock, 'text' | 'style'>>) =>
      setBlocks((previous) => updateText(previous, id, patch)),
    [],
  );
  const remove = useCallback((id: string) => setBlocks((previous) => removeBlock(previous, id)), []);
  const move = useCallback(
    (fromId: string, targetId: string, before: boolean) =>
      setBlocks((previous) => moveBlock(previous, fromId, targetId, before)),
    [],
  );
  const shift = useCallback(
    (id: string, delta: -1 | 1) => setBlocks((previous) => shiftBlock(previous, id, delta)),
    [],
  );
  const clear = useCallback(() => setBlocks([]), []);

  return { blocks, docs, focusId, insert, importFiles, update, remove, move, shift, clear };
}

export type ArticleState = ReturnType<typeof useArticle>;
