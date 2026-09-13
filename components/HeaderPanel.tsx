'use client';

import { patchSettings, useStore } from '@/lib/store';
import type { HeaderContent, PosterStyle } from '@/lib/settings';
import { PaletteSection, StyleSection } from './PosterStyleControls';
import { usePoster } from './usePoster';
import { Field, FieldGrid, PrimaryButton, SecondaryButton, Switch, ICONS, Icon } from './ui';

export function HeaderPanel() {
  const content = useStore((state) => state.settings.article.header);
  const ratio = useStore((state) => state.settings.header.ratio);
  const coverStyle = useStore((state) => state.settings.cover);
  const pageCount = useStore((state) => state.pageCount);
  const { canvasRef, size, download, copy } = usePoster('header');

  const set = (patch: Partial<HeaderContent>) =>
    patchSettings({ article: { header: patch } });

  return (
    <>
      <aside className="left-rail header-rail">
        <div className="rail-scroll">
          <section className="control-section">
            <div className="section-heading">
              <span>试卷信息</span>
              <Switch
                title="复制时带上头图"
                checked={content.enabled}
                onChange={(enabled) => set({ enabled })}
              />
            </div>
            <p className="section-note">
              头图拼在推文最前面，由标题、时间、难度、页数组成，下面是获取提示。
            </p>
            <Field label="标题（支持两行）">
              <textarea
                rows={2}
                maxLength={40}
                value={content.title}
                placeholder={'七年级数学\n期中模拟卷'}
                onChange={(event) => set({ title: event.target.value })}
              />
            </Field>
            <FieldGrid>
              <Field label="时间">
                <input
                  type="text"
                  maxLength={20}
                  value={content.date}
                  placeholder="2026.09"
                  onChange={(event) => set({ date: event.target.value })}
                />
              </Field>
              <Field label="难度">
                <input
                  type="text"
                  maxLength={12}
                  value={content.difficulty}
                  placeholder="中等"
                  onChange={(event) => set({ difficulty: event.target.value })}
                />
              </Field>
            </FieldGrid>
            <Field label="页数（留空按 PDF 页数）">
              <input
                type="text"
                maxLength={16}
                value={content.pages}
                placeholder={pageCount > 0 ? `共 ${pageCount} 页` : '共 8 页'}
                onChange={(event) => set({ pages: event.target.value })}
              />
            </Field>
            <Field label="获取提示">
              <textarea
                rows={2}
                maxLength={60}
                value={content.hint}
                placeholder="需要完整电子版？评论区留言获取链接"
                onChange={(event) => set({ hint: event.target.value })}
              />
            </Field>
          </section>

          <PaletteSection kind="header" />
          <StyleSection kind="header" />
        </div>
      </aside>

      <section className="canvas-column">
        <div className="column-toolbar">
          <div>
            <p className="eyebrow">公众号头图</p>
            <h1>试卷信息头图</h1>
          </div>
          <span className="status-dot is-ready">
            {size.width} × {size.height} px · {ratio}
          </span>
        </div>
        <div className="canvas-wrap header-canvas-wrap">
          <canvas ref={canvasRef} width={size.width} height={size.height} />
        </div>
      </section>

      <aside className="right-rail publish-rail">
        <section className="publish-card">
          <span className="eyebrow">导出</span>
          <h2>头图成品</h2>
          <p>拼在推文最前面，读者第一眼看到的画面。</p>
          <PrimaryButton icon={ICONS.download} onClick={download}>
            下载 PNG
          </PrimaryButton>
          <SecondaryButton icon={ICONS.copy} onClick={copy}>
            复制头图
          </SecondaryButton>
          <button
            className="text-button"
            type="button"
            onClick={() => patchSettings({ header: backdropOf(coverStyle) })}
          >
            <Icon path={ICONS.reset} /> 用封面配色
          </button>
        </section>
        <section className="publish-info">
          <div className="info-row">
            <span>比例</span>
            <strong>竖版 / 方版 / 横版</strong>
          </div>
          <div className="info-row">
            <span>排版里</span>
            <strong>附在推文开头</strong>
          </div>
          <div className="info-row">
            <span>处理方式</span>
            <strong>仅本地</strong>
          </div>
        </section>
      </aside>
    </>
  );
}

/** 只抄背景与配色，不把封面的文案带进头图配置。 */
function backdropOf(style: PosterStyle) {
  return {
    mode: style.mode,
    colorA: style.colorA,
    colorB: style.colorB,
    accent: style.accent,
    textColor: style.textColor,
    angle: style.angle,
    dim: style.dim,
  };
}
