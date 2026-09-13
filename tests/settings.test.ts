import { describe, expect, it } from 'vitest';
import {
  CONFIG_VERSION,
  DEFAULT_SETTINGS,
  migrateSettings,
  merge,
  type Settings,
} from '@/lib/settings';

const legacyHeader = {
  ratio: '4:3',
  width: 1200,
  mode: 'solid',
  colorA: '#e7ece5',
  colorB: '#c7d9cf',
  accent: undefined,
  angle: 135,
  dim: 32,
  font: 'serif',
  textColor: '#202522',
};

describe('配置迁移', () => {
  it('空值回落到默认配置', () => {
    expect(migrateSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(migrateSettings('nonsense')).toEqual(DEFAULT_SETTINGS);
  });

  it('缺字段用默认值补齐', () => {
    const migrated = migrateSettings({ settings: { article: { watermark: { text: 'X' } } } });
    expect(migrated.article.watermark.text).toBe('X');
    expect(migrated.article.watermark.size).toBe(DEFAULT_SETTINGS.article.watermark.size);
    expect(migrated.header).toEqual(DEFAULT_SETTINGS.header);
  });

  it('v5 旧配置升级到新版默认（竖版 + 新配色）', () => {
    const migrated = migrateSettings({ version: 5, settings: { header: legacyHeader } });
    expect(migrated.header.ratio).toBe('4:5');
    expect(migrated.header.colorA).toBe(DEFAULT_SETTINGS.header.colorA);
    expect(migrated.header.accent).toBe(DEFAULT_SETTINGS.header.accent);
    // 与配色无关的键保留用户设置
    expect(migrated.header.width).toBe(1200);
    expect(migrated.header.font).toBe('serif');
  });

  it('v6 配置原样保留，包括用户主动选的 4:3', () => {
    // 这是关键回归点：迁移如果没带版本号，用户每次打开都会被重置。
    const current = {
      version: CONFIG_VERSION,
      settings: { header: { ...legacyHeader, ratio: '4:3', colorA: '#0b3d34', accent: '#7ee0b8' } },
    };
    const migrated = migrateSettings(current);
    expect(migrated.header.ratio).toBe('4:3');
    expect(migrated.header.colorA).toBe('#0b3d34');
    expect(migrated.header.accent).toBe('#7ee0b8');
  });

  it('没带版本号的裸配置视为最老版本，会跑一次迁移', () => {
    const migrated = migrateSettings({ header: legacyHeader });
    expect(migrated.header.ratio).toBe('4:5');
  });

  it('兼容更早的平铺结构（水印 / 导出在顶层）', () => {
    const migrated = migrateSettings({
      watermark: { enabled: true, text: '内部', size: 9, alpha: 22, color: '#111111' },
      export: { scale: 3, format: 'jpeg' },
    });
    expect(migrated.article.watermark.text).toBe('内部');
    expect(migrated.article.watermark.opacity).toBe(22);
    expect(migrated.article.output.scale).toBe(3);
    expect(migrated.article.output.format).toBe('jpeg');
  });

  it('迁移结果是一份完整可用的 Settings', () => {
    const migrated: Settings = migrateSettings({ version: 5, settings: { header: legacyHeader } });
    expect(migrated.article.output.scale).toBeGreaterThan(0);
    expect(migrated.cover.title.length).toBeGreaterThan(0);
  });
});

describe('merge', () => {
  it('不覆盖未提供的字段', () => {
    const base = { a: 1, b: { c: 2, d: 3 } };
    expect(merge(base, { b: { c: 9 } })).toEqual({ a: 1, b: { c: 9, d: 3 } });
  });

  it('undefined 不覆盖已有值', () => {
    expect(merge({ a: 1 }, { a: undefined })).toEqual({ a: 1 });
  });

  it('不修改入参', () => {
    const base = { a: { b: 1 } };
    merge(base, { a: { b: 2 } });
    expect(base.a.b).toBe(1);
  });

  it('非对象入参回落为默认值的深拷贝', () => {
    const base = { a: { b: 1 } };
    const result = merge(base, null);
    expect(result).toEqual(base);
    expect(result.a).not.toBe(base.a);
  });
});
