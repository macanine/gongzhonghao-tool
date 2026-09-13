import type { Backdrop } from './settings';

/**
 * 多色系主题。
 *
 * 每一组自带背景模式：深色组默认走「光晕」，因为暗底 + 彩色辉光最出效果；
 * 浅色组走「渐变」，保持纸感。用户可以再单独改背景模式。
 */
export interface Palette extends Omit<Backdrop, 'angle' | 'dim'> {
  id: string;
  name: string;
  textColor: string;
}

export const PALETTES: Palette[] = [
  // —— 深色 · 光晕 ——
  { id: 'neon', name: '霓虹', mode: 'glow', colorA: '#1a0b2e', colorB: '#d946ef', accent: '#22d3ee', textColor: '#fdf4ff' },
  { id: 'aurora', name: '极光', mode: 'glow', colorA: '#041f2b', colorB: '#0f766e', accent: '#a3e635', textColor: '#ecfeff' },
  { id: 'lava', name: '熔岩', mode: 'glow', colorA: '#2a0708', colorB: '#ea580c', accent: '#fbbf24', textColor: '#fff7ed' },
  { id: 'deepsea', name: '深海', mode: 'glow', colorA: '#020617', colorB: '#1e3a8a', accent: '#38bdf8', textColor: '#eff6ff' },
  { id: 'violet', name: '紫罗兰', mode: 'glow', colorA: '#2b0a4d', colorB: '#7c3aed', accent: '#e0b4ff', textColor: '#faf5ff' },
  { id: 'crimson', name: '朱砂', mode: 'glow', colorA: '#4a0b16', colorB: '#b31f3f', accent: '#ffb07a', textColor: '#fff4f1' },

  // —— 深色 · 渐变 ——
  { id: 'jade', name: '青竹', mode: 'gradient', colorA: '#06372e', colorB: '#0f8a68', accent: '#7ff0c4', textColor: '#f0fdf8' },
  { id: 'indigo', name: '靛蓝', mode: 'gradient', colorA: '#101a4d', colorB: '#2f4bd6', accent: '#8fd0ff', textColor: '#f2f5ff' },
  { id: 'amber', name: '琥珀', mode: 'gradient', colorA: '#4a2405', colorB: '#d97706', accent: '#ffd88a', textColor: '#fffaf0' },
  { id: 'ocean', name: '海蓝', mode: 'gradient', colorA: '#04283f', colorB: '#0284c7', accent: '#7dd3fc', textColor: '#f0f9ff' },
  { id: 'moss', name: '苔绿', mode: 'gradient', colorA: '#1c2f0a', colorB: '#4d7c0f', accent: '#c6f06a', textColor: '#f7fde8' },
  { id: 'brick', name: '砖红', mode: 'gradient', colorA: '#4a1006', colorB: '#c2410c', accent: '#fdba74', textColor: '#fff6f0' },
  { id: 'peach', name: '蜜桃', mode: 'gradient', colorA: '#701a3c', colorB: '#ec4899', accent: '#ffd1e6', textColor: '#fff5fa' },
  { id: 'ink', name: '松墨', mode: 'gradient', colorA: '#14181c', colorB: '#39424c', accent: '#9fb3c8', textColor: '#f5f7f8' },

  // —— 浅色 · 渐变 ——
  { id: 'paper', name: '素纸', mode: 'gradient', colorA: '#f7f3ea', colorB: '#e3d7bd', accent: '#b45309', textColor: '#231f19' },
  { id: 'snow', name: '初雪', mode: 'gradient', colorA: '#f5f8fc', colorB: '#d7e4f3', accent: '#2563eb', textColor: '#16222f' },
  { id: 'mint', name: '薄荷', mode: 'gradient', colorA: '#eefbf5', colorB: '#cdeee0', accent: '#0d9488', textColor: '#14322a' },
  { id: 'dawn', name: '晨曦', mode: 'gradient', colorA: '#fff6ec', colorB: '#ffe0c2', accent: '#ea580c', textColor: '#3a2410' },
];

/** 当前配色是否正好等于某一组主题——用来在色板里标出选中的那一格。 */
export function matchedPalette(backdrop: Pick<Backdrop, 'colorA' | 'accent'>): Palette | undefined {
  return PALETTES.find(
    (item) => item.colorA === backdrop.colorA && item.accent === backdrop.accent,
  );
}
