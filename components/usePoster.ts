'use client';

import { useCallback, useRef } from 'react';
import { renderCover, coverSize } from '@/lib/canvas/cover';
import { renderHeader, headerSize } from '@/lib/canvas/header';
import { canvasToBlob } from '@/lib/canvas/kit';
import { copyImage, downloadPng } from '@/lib/article/export';
import { toast } from '@/lib/feedback';
import { useCanvasRenderer, useStore, type PosterKind } from '@/lib/store';

/**
 * 头图 / 封面共用的画布与导出逻辑。
 *
 * 绘制是命令式的、由设置驱动，所以放在 hook 里；两个面板只需要
 * 拿到 ref 和「下载 / 复制」两个动作。
 */
export function usePoster(kind: PosterKind) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // 只订阅参与绘制的那几份数据：改水印、或改另一张图的设置，都不该重画这里。
  const headerStyle = useStore((state) => state.settings.header);
  const headerContent = useStore((state) => state.settings.article.header);
  const coverStyle = useStore((state) => state.settings.cover);
  const image = useStore((state) => state.images[kind]);
  const pageCount = useStore((state) => state.pageCount);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (kind === 'header') {
      renderHeader(canvas, { style: headerStyle, content: headerContent, pageCount, image });
    } else {
      renderCover(canvas, {
        style: coverStyle,
        content: { title: coverStyle.title, subtitle: coverStyle.subtitle },
        image,
      });
    }
  }, [kind, headerStyle, headerContent, coverStyle, pageCount, image]);

  // 依赖按 kind 各列各的，否则头图设置一变、封面画布也会跟着重画一遍。
  useCanvasRenderer(
    draw,
    kind === 'header' ? [headerStyle, headerContent, pageCount, image] : [coverStyle, image],
  );

  const size = kind === 'header' ? headerSize(headerStyle) : coverSize(coverStyle);
  const label = kind === 'header' ? '头图' : '封面';

  const toBlob = useCallback(async () => {
    draw();
    const canvas = canvasRef.current;
    if (!canvas) throw new Error('画布还没准备好');
    return canvasToBlob(canvas, 'image/png');
  }, [draw]);

  const download = useCallback(async () => {
    try {
      downloadPng(await toBlob(), label);
      toast(`已下载${label}`);
    } catch (error) {
      console.error(error);
      toast('导出失败', true);
    }
  }, [toBlob, label]);

  const copy = useCallback(async () => {
    try {
      await copyImage(await toBlob());
      toast(`已复制${label}`);
    } catch (error) {
      console.error(error);
      toast(error instanceof Error ? error.message : `复制${label}失败`, true);
    }
  }, [toBlob, label]);

  return { canvasRef, size, label, download, copy };
}
