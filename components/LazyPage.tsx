'use client';

import { memo, useEffect, useRef, useState, type CSSProperties } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { WatermarkSettings } from '@/lib/settings';
import { renderPage } from '@/lib/article/pdf';
import { serialize } from '@/lib/article/queue';
import { cn } from '@/lib/utils';

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
 * 水印由外层防抖后再传进来，拖滑块时不会每一帧都排一次重绘。
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
  const urlRef = useRef<string | null>(null);

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
    // 排队期间参数又变了（或这页被删了）就直接跳过，不渲染一张注定被丢掉的图。
    serialize(() =>
      alive
        ? renderPage(doc, pageNumber, {
            purpose: 'preview',
            scale: 1,
            format: 'jpeg',
            quality: 82,
            watermark,
          })
        : Promise.resolve(null),
    )
      .then((result) => {
        if (!alive || !result) return;
        const objectUrl = URL.createObjectURL(result.blob);
        if (urlRef.current) URL.revokeObjectURL(urlRef.current);
        urlRef.current = objectUrl;
        setUrl(objectUrl);
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
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    },
    [],
  );

  return (
    <div
      ref={hostRef}
      className="aspect-box rounded-[2px] bg-panel"
      style={{ '--page-aspect': `${Math.max(0.2, aspect) * 100}%` } as CSSProperties}
    >
      {url ? (
        <img
          src={url}
          alt={`第 ${pageNumber} 页`}
          draggable={false}
          className="absolute inset-0 size-full object-fill"
        />
      ) : null}
      {status === 'error' ? (
        <p className="absolute inset-0 grid place-items-center text-[11px] text-danger">
          该页无法生成预览
        </p>
      ) : null}
      {!url && status !== 'error' ? (
        <p
          className={cn(
            'absolute inset-0 grid animate-shimmer place-items-center',
            'bg-[linear-gradient(110deg,var(--color-panel)_35%,var(--color-paper)_50%,var(--color-panel)_65%)] bg-[length:200%_100%]',
            'text-[11px] tracking-[0.04em] text-faint',
          )}
        >
          正在生成预览
        </p>
      ) : null}
    </div>
  );
});
