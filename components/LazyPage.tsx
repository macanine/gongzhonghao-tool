'use client';

import { memo, useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { WatermarkSettings } from '@/lib/settings';
import { renderPage } from '@/lib/article/pdf';
import { serialize } from '@/lib/article/queue';

type Status = 'idle' | 'loading' | 'ready' | 'error';

interface LazyPageProps {
  doc: PDFDocumentProxy;
  pageNumber: number;
  aspect: number;
  watermark: WatermarkSettings;
}

/**
 * 一页预览。
 *
 * 用 IntersectionObserver 做懒加载：进入视口前不渲染，离开后再进来也不会重排，
 * 因为结果以 blob URL 的形式留着。「什么时候渲染」由这一页自己决定，
 * 不需要一个全局的队列管理器。
 *
 * 外面套 memo：面板里改水印以外的东西时，几十个页面不必跟着重渲染。
 */
export const LazyPage = memo(function LazyPage({
  doc,
  pageNumber,
  aspect,
  watermark,
}: LazyPageProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [status, setStatus] = useState<Status>('idle');
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    const node = hostRef.current;
    if (!node || visible) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '600px 0px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    let alive = true;
    setStatus('loading');
    serialize(() =>
      renderPage(doc, pageNumber, {
        purpose: 'preview',
        scale: 1,
        format: 'jpeg',
        quality: 82,
        watermark,
      }),
    )
      .then((result) => {
        if (!alive) return;
        const objectUrl = URL.createObjectURL(result.blob);
        setUrl((previous) => {
          if (previous) URL.revokeObjectURL(previous);
          return objectUrl;
        });
        setStatus('ready');
      })
      .catch((error) => {
        if (!alive) return;
        console.warn('预览渲染失败', error);
        setStatus('error');
      });
    return () => {
      alive = false;
    };
  }, [visible, doc, pageNumber, watermark]);

  useEffect(
    () => () => {
      setUrl((previous) => {
        if (previous) URL.revokeObjectURL(previous);
        return null;
      });
    },
    [],
  );

  return (
    <div
      ref={hostRef}
      className={`preview-page${status === 'loading' || status === 'idle' ? ' is-loading' : ''}${
        status === 'error' ? ' is-error' : ''
      }`}
      style={{ ['--page-aspect' as string]: `${Math.max(0.2, aspect) * 100}%` }}
    >
      {url ? <img src={url} alt={`第 ${pageNumber} 页`} draggable={false} /> : null}
    </div>
  );
});
