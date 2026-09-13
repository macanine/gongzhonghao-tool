'use client';

import { patchSettings, useStore } from '@/lib/store';
import { PaletteSection, StyleSection } from './PosterStyleControls';
import { usePoster } from './usePoster';
import { Field, PrimaryButton, SecondaryButton, ICONS } from './ui';

export function CoverPanel() {
  const cover = useStore((state) => state.settings.cover);
  const { canvasRef, size, download, copy } = usePoster('cover');
  const set = (patch: Partial<{ title: string; subtitle: string }>) =>
    patchSettings({ cover: patch });

  return (
    <>
      <aside className="left-rail cover-rail">
        <div className="rail-scroll">
          <section className="control-section">
            <div className="section-heading">
              <span>文案</span>
            </div>
            <Field label="主标题（支持两行）">
              <textarea
                rows={2}
                maxLength={32}
                value={cover.title}
                placeholder={'手写笔记\n可在这里换行'}
                onChange={(event) => set({ title: event.target.value })}
              />
            </Field>
            <Field label="副标题（可选）">
              <input
                type="text"
                maxLength={46}
                value={cover.subtitle}
                placeholder="阅读、摘录与思考"
                onChange={(event) => set({ subtitle: event.target.value })}
              />
            </Field>
          </section>

          <PaletteSection kind="cover" />
          <StyleSection kind="cover" />
        </div>
      </aside>

      <section className="canvas-column">
        <div className="column-toolbar">
          <div>
            <p className="eyebrow">微信封面</p>
            <h1>文字封面</h1>
          </div>
          <span className="status-dot is-ready">
            {size.width} × {size.height} px · 2.35:1
          </span>
        </div>
        <div className="canvas-wrap">
          <canvas ref={canvasRef} width={size.width} height={size.height} />
        </div>
      </section>

      <aside className="right-rail publish-rail">
        <section className="publish-card">
          <span className="eyebrow">导出</span>
          <h2>封面成品</h2>
          <p>公众号头条封面的标准比例，直接替换原有封面即可。</p>
          <PrimaryButton icon={ICONS.download} onClick={download}>
            下载 PNG
          </PrimaryButton>
          <SecondaryButton icon={ICONS.copy} onClick={copy}>
            复制封面
          </SecondaryButton>
        </section>
        <section className="publish-info">
          <div className="info-row">
            <span>默认尺寸</span>
            <strong>900 × 383</strong>
          </div>
          <div className="info-row">
            <span>比例</span>
            <strong>2.35 : 1</strong>
          </div>
          <div className="info-row">
            <span>配色主题</span>
            <strong>与头图同一套</strong>
          </div>
        </section>
      </aside>
    </>
  );
}
