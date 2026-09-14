'use client';

import { useEffect, useRef, useState } from 'react';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  FileText,
  Image as ImageIcon,
  Menu,
  Palette,
  RotateCcw,
  Settings2,
  type LucideIcon,
} from 'lucide-react';
import { cancelJob, toast } from '@/lib/feedback';
import { migrateSettings, CONFIG_VERSION, type Settings } from '@/lib/settings';
import { hydrate, replaceSettings, resetSettings, useSettings } from '@/lib/store';
import { downloadBlob, stamp } from '@/lib/canvas/kit';
import { cn } from '@/lib/utils';
import { ArticlePanel } from './ArticlePanel';
import { CoverPanel } from './CoverPanel';
import { HeaderPanel } from './HeaderPanel';
import { JobOverlay } from './Feedback';
import {
  Button,
  Confirmer,
  Sheet,
  SheetAction,
  SheetActions,
  SheetFootnote,
  SheetLabel,
  SheetModeButton,
  SheetModeGrid,
  SheetSection,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Toaster,
  confirm,
} from './ui';

type Mode = 'article' | 'header' | 'cover';

const TABS: { value: Mode; label: string; icon: LucideIcon }[] = [
  { value: 'article', label: '排版', icon: FileText },
  { value: 'header', label: '头图', icon: ImageIcon },
  { value: 'cover', label: '封面', icon: Palette },
];

/** 三个工作区共用的三栏骨架：窄屏收掉右栏，手机上下叠成两段。 */
const PANEL_GRID = cn(
  'grid h-full min-h-0',
  'grid-cols-[minmax(270px,300px)_minmax(0,1fr)_minmax(240px,286px)]',
  'max-[1200px]:grid-cols-[minmax(260px,286px)_minmax(0,1fr)]',
  'max-[768px]:grid-cols-1 max-[768px]:grid-rows-[minmax(180px,43dvh)_minmax(0,1fr)]',
);

export function Workbench() {
  const [mode, setMode] = useState<Mode>('article');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
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

  const reset = async () => {
    const confirmed = await confirm(
      '恢复默认配置？当前水印、导出、头图和封面设置会被覆盖。',
      '恢复默认',
    );
    if (!confirmed) return;
    resetSettings();
    toast('已恢复默认配置');
  };

  return (
    <Tabs
      value={mode}
      onValueChange={(next) => setMode(next as Mode)}
      className="flex h-dvh w-full flex-col overflow-hidden bg-canvas bg-[radial-gradient(circle_at_75%_-18%,#e6f5ed_0,transparent_38%)]"
    >
      <header
        className={cn(
          'relative z-10 flex items-center border-b border-line-strong/80 bg-paper/85 backdrop-blur-xl',
          'min-h-19 gap-[clamp(16px,4vw,54px)] px-[clamp(16px,3vw,42px)] py-3',
          'max-[768px]:min-h-15.5 max-[768px]:gap-2.5 max-[768px]:px-3 max-[768px]:py-2',
        )}
      >
        <div className="inline-flex min-w-max items-center gap-2.75">
          <span
            aria-hidden="true"
            className="grid size-9.5 place-items-center rounded-md bg-ink font-serif text-lg leading-none text-white shadow-[0_5px_12px_rgba(24,34,29,0.16)] max-[768px]:size-8.5 max-[768px]:text-base"
          >
            页
          </span>
          <span className="grid gap-px">
            <span className="text-[15px] font-bold tracking-tight text-ink max-[768px]:text-sm">
              纸页工作台
            </span>
            <span className="text-[10px] tracking-[0.04em] text-muted max-[768px]:hidden">
              PDF → 公众号内容
            </span>
          </span>
        </div>

        <TabsList
          aria-label="工作模式"
          className={cn(
            'max-[768px]:flex-1 max-[768px]:justify-end max-[768px]:overflow-x-auto',
            'max-[768px]:[scrollbar-width:none] max-[768px]:[&::-webkit-scrollbar]:hidden',
          )}
        >
          {TABS.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value} className="max-[400px]:px-0 max-[400px]:w-9 max-[400px]:justify-center">
              <tab.icon aria-hidden="true" className="size-4 max-[768px]:size-3.5" />
              <span className="max-[400px]:hidden">{tab.label}</span>
            </TabsTrigger>
          ))}
        </TabsList>

        <div className="ml-auto flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="icon"
            aria-label="打开更多操作"
            title="打开更多操作"
            className="hidden max-[768px]:grid"
            onClick={() => setMobileMenuOpen(true)}
          >
            <Menu aria-hidden="true" className="size-4.5" />
          </Button>
          <div className="flex items-center gap-1 max-[768px]:hidden">
            <Button
              variant="ghost"
              size="icon"
              title="恢复默认配置"
              aria-label="恢复默认配置"
              onClick={() => void reset()}
            >
              <RotateCcw aria-hidden="true" className="size-4.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              title="导入配置"
              aria-label="导入配置"
              onClick={() => configInput.current?.click()}
            >
              <ArrowDownToLine aria-hidden="true" className="size-4.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              title="导出配置"
              aria-label="导出配置"
              onClick={exportConfig}
            >
              <ArrowUpFromLine aria-hidden="true" className="size-4.5" />
            </Button>
          </div>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-hidden">
        {/* 三个面板都保持挂载：切回来时 PDF 页与预览不会重来一遍。 */}
        <TabsContent value="article" forceMount className={PANEL_GRID}>
          <ArticlePanel />
        </TabsContent>
        <TabsContent value="header" forceMount className={PANEL_GRID}>
          <HeaderPanel />
        </TabsContent>
        <TabsContent value="cover" forceMount className={PANEL_GRID}>
          <CoverPanel />
        </TabsContent>
      </main>

      <Sheet
        open={mobileMenuOpen}
        onOpenChange={setMobileMenuOpen}
        title="工作台菜单"
        description="切换工作区或管理你的本地配置"
      >
        <SheetSection>
          <SheetLabel icon={Settings2}>工作区</SheetLabel>
          <SheetModeGrid>
            {TABS.map((tab) => (
              <SheetModeButton
                key={tab.value}
                active={mode === tab.value}
                icon={tab.icon}
                onClick={() => {
                  setMode(tab.value);
                  setMobileMenuOpen(false);
                }}
              >
                {tab.label}
              </SheetModeButton>
            ))}
          </SheetModeGrid>
        </SheetSection>
        <SheetSection>
          <SheetLabel icon={RotateCcw}>配置管理</SheetLabel>
          <SheetActions>
            <SheetAction
              onClick={() => {
                setMobileMenuOpen(false);
                void reset();
              }}
            >
              恢复默认配置
            </SheetAction>
            <SheetAction
              onClick={() => {
                setMobileMenuOpen(false);
                configInput.current?.click();
              }}
            >
              导入配置文件
            </SheetAction>
            <SheetAction
              onClick={() => {
                setMobileMenuOpen(false);
                exportConfig();
              }}
            >
              导出当前配置
            </SheetAction>
          </SheetActions>
        </SheetSection>
        <SheetFootnote>所有文件都在浏览器本地处理，不会上传到服务器。</SheetFootnote>
      </Sheet>

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
      <Confirmer />
    </Tabs>
  );
}
