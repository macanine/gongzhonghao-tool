'use client';

import { useEffect, useRef, useState } from 'react';
import { cancelJob, toast } from '@/lib/feedback';
import { migrateSettings, CONFIG_VERSION, type Settings } from '@/lib/settings';
import { hydrate, replaceSettings, resetSettings, useSettings } from '@/lib/store';
import { downloadBlob, stamp } from '@/lib/canvas/kit';
import { ArticlePanel } from './ArticlePanel';
import { CoverPanel } from './CoverPanel';
import { HeaderPanel } from './HeaderPanel';
import { JobOverlay, Toaster } from './Feedback';
import { ICONS, Icon } from './ui';

type Mode = 'article' | 'header' | 'cover';

const TABS: { value: Mode; label: string }[] = [
  { value: 'article', label: '排版' },
  { value: 'header', label: '头图' },
  { value: 'cover', label: '封面' },
];

export function Workbench() {
  const [mode, setMode] = useState<Mode>('article');
  const settings = useSettings();
  const configInput = useRef<HTMLInputElement>(null);

  // 首帧用默认值渲染（与服务端一致），挂载后再读本地存储，避免 hydration 不一致。
  useEffect(() => hydrate(), []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') cancelJob();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const exportConfig = () => {
    const payload = {
      version: CONFIG_VERSION,
      exportedAt: new Date().toISOString(),
      settings,
    };
    downloadBlob(
      new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }),
      `纸页工作台配置-${stamp()}.json`,
    );
    toast('已导出配置');
  };

  const importConfig = async (file: File) => {
    try {
      const parsed: unknown = JSON.parse(await file.text());
      replaceSettings(migrateSettings(parsed) as Settings);
      toast('已导入配置');
    } catch (error) {
      console.error('配置导入失败', error);
      toast('配置文件无法读取', true);
    }
  };

  const reset = () => {
    if (!window.confirm('恢复默认配置？当前水印、导出、头图和封面设置会被覆盖。')) return;
    resetSettings();
    toast('已恢复默认配置');
  };

  return (
    <div className="app-shell">
      <header className="app-header">
        <span className="brand" aria-label="纸页工作台">
          <span className="brand-mark">页</span>
          <span className="brand-name">纸页工作台</span>
        </span>

        <nav className="mode-tabs" aria-label="工作模式">
          {TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              className={`mode-tab${mode === tab.value ? ' is-active' : ''}`}
              aria-pressed={mode === tab.value}
              onClick={() => setMode(tab.value)}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        <div className="header-actions">
          <button className="icon-button" type="button" title="恢复默认配置" onClick={reset}>
            <Icon path={ICONS.reset} />
          </button>
          <button
            className="icon-button"
            type="button"
            title="导入配置"
            onClick={() => configInput.current?.click()}
          >
            <Icon path={ICONS.importConfig} />
          </button>
          <button className="icon-button" type="button" title="导出配置" onClick={exportConfig}>
            <Icon path={ICONS.exportConfig} />
          </button>
        </div>
      </header>

      <main className="workspace">
        {/* 三个面板都保持挂载：切回来时 PDF 页与预览不会重来一遍。 */}
        <section className={`tool-view${mode === 'article' ? ' is-active' : ''}`}>
          <ArticlePanel />
        </section>
        <section className={`tool-view${mode === 'header' ? ' is-active' : ''}`}>
          <HeaderPanel />
        </section>
        <section className={`tool-view${mode === 'cover' ? ' is-active' : ''}`}>
          <CoverPanel />
        </section>
      </main>

      <input
        ref={configInput}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void importConfig(file);
          event.target.value = '';
        }}
      />

      <JobOverlay onCancel={cancelJob} />
      <Toaster />
    </div>
  );
}
