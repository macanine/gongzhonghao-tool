'use client';

/**
 * 全局状态：一份设置 + 两张背景图。
 *
 * 用 useSyncExternalStore 而不是 Context/状态库——数据只有一份、
 * 更新就是整体替换，几十行就够，也不用把 provider 铺满组件树。
 */

import { useEffect, useRef, useSyncExternalStore } from 'react';
import type { BackdropImage } from './canvas/backdrop';
import {
  CONFIG_VERSION,
  DEFAULT_SETTINGS,
  merge,
  migrateSettings,
  STORAGE_KEY,
  type Settings,
} from './settings';

export type PosterKind = 'header' | 'cover';

export interface StoreState {
  settings: Settings;
  /** 背景图不持久化，刷新即失效，所以单独放。 */
  images: Record<PosterKind, BackdropImage | null>;
  /** 已导入的 PDF 页数：头图的「页数」留空时要用它。 */
  pageCount: number;
}

let state: StoreState = {
  settings: structuredClone(DEFAULT_SETTINGS),
  images: { header: null, cover: null },
  pageCount: 0,
};

let hydrated = false;
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((listener) => listener());

export const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};

export const getState = (): StoreState => state;

/**
 * 服务端预渲染时只能用默认值，客户端首帧与之保持一致后再读本地存储。
 *
 * 这里必须是个常量：useSyncExternalStore 每次渲染都会拿它和上一次的结果比
 * 引用，返回新对象会被当成「数据一直在变」，直接无限重渲染。
 */
const serverState: StoreState = {
  settings: structuredClone(DEFAULT_SETTINGS),
  images: { header: null, cover: null },
  pageCount: 0,
};

const getServerState = (): StoreState => serverState;

function persist(): void {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: CONFIG_VERSION, settings: state.settings }),
    );
  } catch (error) {
    console.warn('配置保存失败', error);
  }
}

export function hydrate(): void {
  if (hydrated || typeof window === 'undefined') return;
  hydrated = true;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) state = { ...state, settings: migrateSettings(JSON.parse(raw)) };
  } catch (error) {
    console.warn('配置读取失败，使用默认值', error);
  }
  persist();
  emit();
}

/** 深合并一份补丁进设置（传对象，例如 { header: { ratio: '1:1' } }）。 */
export function patchSettings(patch: unknown): void {
  state = { ...state, settings: merge(state.settings, patch) };
  persist();
  emit();
}

export function resetSettings(): void {
  state = { ...state, settings: structuredClone(DEFAULT_SETTINGS) };
  persist();
  emit();
}

export function replaceSettings(settings: Settings): void {
  state = { ...state, settings };
  persist();
  emit();
}

export function setPosterImage(kind: PosterKind, image: BackdropImage | null): void {
  state = { ...state, images: { ...state.images, [kind]: image } };
  emit();
}

export function setPageCount(pageCount: number): void {
  if (state.pageCount === pageCount) return;
  state = { ...state, pageCount };
  emit();
}

/**
 * 订阅 store 的一个切片。
 *
 * selector 要直接取自 state 上的字段（`(s) => s.settings.header`），这样
 * 值只在相关字段变化时才换引用，React 自会跳过多余的重渲染——改水印不会
 * 重画头图、改页数不会重排面板，靠的都是这一条。
 *
 * 注意别在 selector 里新建对象（`(s) => ({ a: s.a })`）：那样每次取值都是
 * 新引用，等于永远「有变化」，正是上面那个报错的成因。
 */
export function useStore<T>(selector: (state: StoreState) => T): T {
  // 缓存是 useSyncExternalStore 的硬要求：数据没变时必须返回同一个引用。
  // 客户端快照与服务端快照是两个不同的对象，各自留一份槽位。
  const client = useRef<Selection<T> | null>(null);
  const server = useRef<Selection<T> | null>(null);

  return useSyncExternalStore(
    subscribe,
    () => select(client, getState(), selector),
    () => select(server, getServerState(), selector),
  );
}

interface Selection<T> {
  source: StoreState;
  pick: (state: StoreState) => T;
  value: T;
}

function select<T>(
  slot: { current: Selection<T> | null },
  source: StoreState,
  pick: (state: StoreState) => T,
): T {
  const cached = slot.current;
  if (cached && cached.source === source && cached.pick === pick) return cached.value;
  const value = pick(source);
  slot.current = { source, pick, value };
  return value;
}

export function useSettings(): Settings {
  return useStore((state) => state.settings);
}

/**
 * 设置变化后重新渲染画布。
 *
 * 画布尺寸由设置决定、绘制又是命令式的，所以用 effect 驱动而不是每次
 * render 都画——顺带天然合并了同一帧内的多次改动（rAF 会在下一帧才执行）。
 */
export function useCanvasRenderer(draw: () => void, deps: unknown[], enabled = true): void {
  useEffect(() => {
    if (!enabled) return;
    const frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, enabled ? [...deps, enabled] : [enabled]);
}
