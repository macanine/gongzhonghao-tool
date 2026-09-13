import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Settings } from '@/lib/settings';

/** 极小的 localStorage 替身：store 只用到这三个方法。 */
function fakeStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
    dump: () => Object.fromEntries(data),
  };
}

async function loadStore(storage = fakeStorage()) {
  vi.stubGlobal('window', { localStorage: storage });
  vi.stubGlobal('localStorage', storage);
  vi.resetModules();
  const store = await import('@/lib/store');
  const settings = await import('@/lib/settings');
  return { store, settings, storage };
}

describe('设置 store', () => {
  beforeEach(() => vi.unstubAllGlobals());

  it('初次打开使用默认值，并写回一份带版本号的配置', async () => {
    const { store, settings, storage } = await loadStore();
    store.hydrate();
    expect(store.getState().settings).toEqual(settings.DEFAULT_SETTINGS);

    const saved = JSON.parse(storage.dump()[settings.STORAGE_KEY]!);
    expect(saved.version).toBe(settings.CONFIG_VERSION);
    expect(saved.settings.header.ratio).toBe('4:5');
  });

  it('读取本地配置并跑迁移', async () => {
    const storage = fakeStorage({
      'paper-workbench-settings-v3': JSON.stringify({
        version: 5,
        settings: { header: { ratio: '4:3', colorA: '#e7ece5', width: 1600 } },
      }),
    });
    const { store } = await loadStore(storage);
    store.hydrate();
    expect(store.getState().settings.header.ratio).toBe('4:5');
    expect(store.getState().settings.header.width).toBe(1600);
  });

  it('patchSettings 深合并并立即持久化', async () => {
    const { store, settings, storage } = await loadStore();
    store.hydrate();
    store.patchSettings({ header: { accent: '#123456' } });
    expect(store.getState().settings.header.accent).toBe('#123456');
    // 同层的其它字段不受影响
    expect(store.getState().settings.header.colorA).toBe(settings.DEFAULT_SETTINGS.header.colorA);

    const saved = JSON.parse(storage.dump()[settings.STORAGE_KEY]!);
    expect(saved.settings.header.accent).toBe('#123456');
  });

  it('替换整份配置（导入用）', async () => {
    const { store } = await loadStore();
    store.hydrate();
    const next = structuredClone((await import('@/lib/settings')).DEFAULT_SETTINGS) as Settings;
    next.cover.title = '导入的标题';
    store.replaceSettings(next);
    expect(store.getState().settings.cover.title).toBe('导入的标题');
  });

  it('恢复默认配置', async () => {
    const { store, settings } = await loadStore();
    store.hydrate();
    store.patchSettings({ header: { ratio: '16:9' } });
    store.resetSettings();
    expect(store.getState().settings).toEqual(settings.DEFAULT_SETTINGS);
  });

  it('页数不变时不通知订阅者', async () => {
    const { store } = await loadStore();
    store.hydrate();
    let notified = 0;
    const unsubscribe = store.subscribe(() => {
      notified += 1;
    });

    store.setPageCount(3);
    expect(store.getState().pageCount).toBe(3);
    expect(notified).toBe(1);

    store.setPageCount(3);
    expect(notified).toBe(1);

    unsubscribe();
  });

  it('背景图不进入持久化的配置里', async () => {
    const { store, settings, storage } = await loadStore();
    store.hydrate();
    store.setPosterImage('header', { source: {} as CanvasImageSource, width: 10, height: 10 });
    expect(store.getState().images.header?.width).toBe(10);
    const saved = JSON.parse(storage.dump()[settings.STORAGE_KEY]!);
    expect(JSON.stringify(saved)).not.toContain('images');
  });
});
