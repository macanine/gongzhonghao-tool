/**
 * 全部配置的类型、默认值与版本迁移。
 *
 * 这里刻意不依赖任何框架或 DOM：设置就是一份纯数据，
 * 迁移逻辑可以单独跑单元测试。
 */

export type PosterRatio = '4:5' | '3:4' | '1:1' | '4:3' | '3:2' | '16:9';
export type BackdropMode = 'solid' | 'gradient' | 'glow' | 'image';
export type FontKind = 'serif' | 'sans';
export type OutputFormat = 'png' | 'jpeg';

/** 头图与封面共用的背景设定。 */
export interface Backdrop {
  mode: BackdropMode;
  colorA: string;
  colorB: string;
  accent: string;
  /** 渐变角度（度）。 */
  angle: number;
  /** 图片背景的压暗程度（0-100）。 */
  dim: number;
}

/** 头图与封面共用的版式设定。 */
export interface PosterStyle extends Backdrop {
  width: number;
  ratio: PosterRatio;
  font: FontKind;
  textColor: string;
}

/** 头图上那几行字。 */
export interface HeaderContent {
  enabled: boolean;
  title: string;
  date: string;
  difficulty: string;
  /** 留空时按导入的 PDF 页数自动生成。 */
  pages: string;
  hint: string;
}

export interface WatermarkSettings {
  enabled: boolean;
  text: string;
  /** 相对整页高度的百分比。 */
  size: number;
  opacity: number;
  color: string;
}

export interface OutputSettings {
  /** 渲染倍率。 */
  scale: number;
  format: OutputFormat;
  quality: number;
}

export interface ArticleSettings {
  header: HeaderContent;
  watermark: WatermarkSettings;
  output: OutputSettings;
}

export interface CoverContent {
  title: string;
  subtitle: string;
}

export interface Settings {
  article: ArticleSettings;
  header: PosterStyle;
  cover: PosterStyle & CoverContent;
}

/** 结构版本：每次改动默认值形态时 +1，迁移逻辑据此判断要不要跑。 */
export const CONFIG_VERSION = 6;

export const STORAGE_KEY = 'paper-workbench-settings-v3';

export const RATIOS: Record<PosterRatio, number> = {
  '4:5': 4 / 5,
  '3:4': 3 / 4,
  '1:1': 1,
  '4:3': 4 / 3,
  '3:2': 3 / 2,
  '16:9': 16 / 9,
};

export const RATIO_OPTIONS: { value: PosterRatio; label: string }[] = [
  { value: '4:5', label: '4 : 5 竖版' },
  { value: '3:4', label: '3 : 4 竖版' },
  { value: '1:1', label: '1 : 1 方版' },
  { value: '4:3', label: '4 : 3 横版' },
  { value: '3:2', label: '3 : 2 横版' },
  { value: '16:9', label: '16 : 9 横幅' },
];

export const COVER_RATIO = 2.35;
export const MAX_OUTPUT_PIXELS = 40_000_000;
/** 公众号正文宽度：复制出去的 HTML 与预览都按这个宽度排版。 */
export const ARTICLE_WIDTH = 677;

export function ratioOf(style: Pick<PosterStyle, 'ratio'>): number {
  return RATIOS[style.ratio] ?? RATIOS['4:5'];
}

export function heightFor(width: number, ratio: number): number {
  return Math.round(width / ratio);
}

export const DEFAULT_SETTINGS: Settings = {
  article: {
    header: {
      enabled: true,
      title: '七年级数学 · 期中模拟卷',
      date: '2026.09',
      difficulty: '中等',
      pages: '共 8 页',
      hint: '需要完整电子版？评论区留言获取链接',
    },
    watermark: {
      enabled: true,
      text: '内部资料 · 请勿外传',
      size: 8,
      opacity: 16,
      color: '#202522',
    },
    output: { scale: 4, format: 'png', quality: 94 },
  },
  header: {
    width: 1200,
    ratio: '4:5',
    mode: 'glow',
    colorA: '#06372e',
    colorB: '#0f8a68',
    accent: '#7ff0c4',
    angle: 135,
    dim: 40,
    font: 'serif',
    textColor: '#f0fdf8',
  },
  cover: {
    width: 900,
    ratio: '4:3',
    mode: 'glow',
    colorA: '#1a0b2e',
    colorB: '#d946ef',
    accent: '#22d3ee',
    angle: 135,
    dim: 32,
    font: 'serif',
    textColor: '#fdf4ff',
    title: '手写笔记',
    subtitle: '阅读、摘录与思考',
  },
};

/* ------------------------------------------------------------------ */
/* 深合并 + 迁移                                                        */
/* ------------------------------------------------------------------ */

type Json = Record<string, unknown>;

const isPlainObject = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** 以 defaults 为骨架合并 incoming，缺字段用默认值补齐（不覆盖 undefined）。 */
export function merge<T>(defaults: T, incoming: unknown): T {
  if (!isPlainObject(incoming)) return structuredClone(defaults);
  if (!isPlainObject(defaults)) return structuredClone(defaults);
  const out: Json = { ...(defaults as Json) };
  for (const [key, value] of Object.entries(incoming)) {
    if (value === undefined) continue;
    const base = out[key];
    out[key] = isPlainObject(base) && isPlainObject(value) ? merge(base, value) : value;
  }
  return out as T;
}

interface LegacyShape extends Json {
  watermark?: Json;
  export?: Json;
  cover?: Json;
}

/**
 * 把任意来源的配置（本地存储 / 导入的 JSON）整理成当前结构。
 *
 * version 决定要不要跑升级逻辑——关键点：迁移必须只发生一次，
 * 否则用户每次打开都会被打回默认值，连自己选的比例都存不住。
 */
export function migrateSettings(value: unknown): Settings {
  if (!isPlainObject(value)) return structuredClone(DEFAULT_SETTINGS);

  const version = typeof value.version === 'number' ? value.version : 0;
  const wrapped = isPlainObject(value.settings) ? value.settings : value;
  const payload = wrapped as LegacyShape;

  // 更早的版本把水印 / 导出设置平铺在顶层。
  if (payload.watermark || payload.export) {
    const old = payload.watermark ?? {};
    const oldExport = payload.export ?? {};
    return merge(DEFAULT_SETTINGS, {
      article: {
        watermark: {
          enabled: old.enabled,
          text: old.text,
          size: old.size,
          opacity: old.alpha,
          color: old.color,
        },
        output: { scale: oldExport.scale, format: oldExport.format },
      },
      cover: payload.cover ?? {},
    });
  }

  const merged = merge(DEFAULT_SETTINGS, payload);

  // v6：头图改版 —— 换掉旧版柔和配色，并把旧默认比例 4:3 换成竖版。
  // 只在升级时跑一次，之后用户想选回 4:3 也能存住。
  if (version < 6) {
    const header = payload.header;
    if (!isPlainObject(header) || header.accent === undefined) {
      Object.assign(merged.header, {
        mode: DEFAULT_SETTINGS.header.mode,
        colorA: DEFAULT_SETTINGS.header.colorA,
        colorB: DEFAULT_SETTINGS.header.colorB,
        accent: DEFAULT_SETTINGS.header.accent,
        textColor: DEFAULT_SETTINGS.header.textColor,
      });
    }
    if (merged.header.ratio === '4:3') merged.header.ratio = DEFAULT_SETTINGS.header.ratio;
  }

  return merged;
}
