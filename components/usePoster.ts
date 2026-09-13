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
  const { settings, images, pageCount } = useStore();
  const image = images[kind];

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (kind === 'header') {
      renderHeader(canvas, {
        style: settings.header,
        content: settings.article.header,
        pageCount,
        image: images.header,
      });
    } else {
      renderCover(canvas, {
        style: settings.cover,
        content: { title: settings.cover.title, subtitle: settings.cover.subtitle },
        image: images.cover,
      });
    }
  }, [kind, settings, images, pageCount]);

  useCanvasRenderer(draw, [kind, settings, image, pageCount]);

  const size = kind === 'header' ? headerSize(settings.header) : coverSize(settings.cover);
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
