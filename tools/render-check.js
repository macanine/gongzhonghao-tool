/*
 * 头图 / 封面排版冒烟测试（纯 Node，无需浏览器）
 *
 * 用最小 DOM + canvas 替身加载 app.js，然后：
 *   1. 校验绘制结果 —— 标题/提示都排进两行、不越出画布；
 *   2. 校验 id 覆盖 —— 脚本查询过的每个 #id 都必须真实存在于 index.html，
 *      避免出现「绑定了页面上不存在的元素」这类静默失效。
 *
 * 用法：node tools/render-check.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const SOURCE = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const SETTINGS_KEY = 'paper-workbench-settings-v3';
const CONFIG_VERSION = 6;

/** index.html 中真实存在的元素 id。 */
const HTML_IDS = new Set(Array.from(HTML.matchAll(/\bid="([^"]+)"/g), (match) => match[1]));
/** 脚本运行期自行创建、无需出现在 HTML 中的 id。 */
const RUNTIME_IDS = new Set(['header-preview', 'anon', 'created']);
/** 整轮测试中脚本查询过的所有 id。 */
const queriedIds = new Set();

const round = (value) => Math.round(value * 10) / 10;

/* ---------- canvas 替身：按当前字号估算宽度 ---------- */
function createContext(canvas, calls) {
  let font = '400 16px sans-serif';
  const fontSize = () => Number((font.match(/(\d+(?:\.\d+)?)px/) || [0, 16])[1]);
  const measure = (text) => {
    let width = 0;
    for (const char of String(text)) width += (/[\x00-\xff]/.test(char) ? 0.55 : 1) * fontSize();
    return width * (font.includes('700') ? 1.04 : 1);
  };
  return {
    canvas,
    globalAlpha: 1,
    textAlign: 'left',
    textBaseline: 'alphabetic',
    get font() { return font; },
    set font(value) { font = value; },
    fillRect(x, y, w, h) { calls.push({ type: 'rect', x, y, w, h, fill: this.fillStyle }); },
    fillText(text, x, y) {
      const width = measure(text);
      calls.push({ type: 'text', text, x, y, width, size: fontSize() });
      if (x < -0.5 || x + width > canvas.width + 0.5) {
        throw new Error(`「${text}」横向越界：${round(x)} → ${round(x + width)}（画布宽 ${canvas.width}）`);
      }
      if (y < -0.5 || y > canvas.height + 0.5) {
        throw new Error(`「${text}」纵向越界：y=${round(y)}（画布高 ${canvas.height}）`);
      }
    },
    save() {}, restore() {}, beginPath() {}, arc() {}, fill() {}, translate() {}, rotate() {},
    rect() {}, roundRect() {}, closePath() {}, stroke() {},
    createLinearGradient: () => ({ stops: [], addColorStop(offset, color) { this.stops.push(color); } }),
    measureText: (text) => ({ width: measure(text) })
  };
}

/* ---------- 最小 DOM（记录监听器，便于事后统一触发） ---------- */
function makeElement(tag) {
  const element = {
    tagName: String(tag || 'div').toUpperCase(),
    id: '', value: '', textContent: '', checked: false, disabled: false, innerHTML: '',
    files: null, dataset: {}, children: [], _listeners: new Map(),
    style: { setProperty() {}, cssText: '' },
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    addEventListener(type, handler) {
      if (!this._listeners.has(type)) this._listeners.set(type, []);
      this._listeners.get(type).push(handler);
    },
    dispatch(type) {
      (this._listeners.get(type) || []).forEach((handler) => handler({
        target: this,
        preventDefault() {},
        stopPropagation() {},
        dataTransfer: { files: [], getData: () => '', setData() {}, effectAllowed: '' },
        clientY: 0
      }));
    },
    setAttribute() {}, remove() {},
    click() { this.dispatch('click'); },
    appendChild(child) { this.children.push(child); return child; },
    append(...items) { this.children.push(...items); },
    replaceChildren(...items) { this.children = items; },
    getBoundingClientRect: () => ({ top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0 })
  };
  return element;
}

class FakeImage {
  constructor() { this.naturalWidth = 0; this.naturalHeight = 0; this.onload = null; this.onerror = null; }
}

function segment(tag, dataKey, values) {
  return values.map((value) => {
    const element = makeElement(tag);
    element.dataset[dataKey] = value;
    return element;
  });
}

/** 页面上的「已存在的集合」，供 querySelectorAll 使用。 */
const COLLECTIONS = {
  '.mode-tab': () => segment('button', 'mode', ['article', 'header', 'cover']),
  '[data-header-bg]': () => segment('button', 'headerBg', ['color', 'gradient', 'image']),
  '[data-cover-bg]': () => segment('button', 'coverBg', ['color', 'gradient', 'image'])
};

function run(scene) {
  const calls = { header: [], cover: [] };
  const canvases = {
    'header-canvas': Object.assign(makeElement('canvas'), { getContext: () => canvasContext('header-canvas'), toDataURL: () => 'data:image/png;base64,', toBlob: (cb) => cb({ type: 'image/png' }) }),
    'cover-canvas': Object.assign(makeElement('canvas'), { getContext: () => canvasContext('cover-canvas'), toDataURL: () => 'data:image/png;base64,', toBlob: (cb) => cb({ type: 'image/png' }) })
  };
  Object.values(canvases).forEach((canvas) => { canvas.width = 0; canvas.height = 0; });

  function canvasContext(id) {
    const kind = id.startsWith('header') ? 'header' : 'cover';
    const canvas = canvases[id];
    if (!canvas._context) canvas._context = createContext(canvas, calls[kind]);
    return canvas._context;
  }

  const elements = new Map();
  const element = (id) => {
    if (!elements.has(id)) {
      const created = makeElement(/canvas$/.test(id) ? 'canvas' : 'div');
      created.id = id;
      elements.set(id, created);
    }
    return elements.get(id);
  };
  const allElements = () => Array.from(elements.values()).concat(Object.values(canvases));

  const settings = JSON.parse(JSON.stringify(scene.settings));
  const stored = scene.stored || { version: CONFIG_VERSION, settings };
  const sandbox = {
    console: { log() {}, warn() {}, info() {}, error: console.error },
    Date, Math, JSON, Number, String, Array, Object, Promise, Uint8Array, Error, Set, Map,
    setTimeout: () => 0, clearTimeout() {},
    requestAnimationFrame: (fn) => { fn(); return 1; },
    cancelAnimationFrame() {},
    Image: FakeImage,
    Blob: class { constructor(parts, options) { this.parts = parts; this.type = (options || {}).type || ''; } },
    FileReader: class { readAsDataURL() { this.onload && this.onload(); } },
    confirm: () => false,
    localStorage: { getItem: (key) => (key === SETTINGS_KEY ? JSON.stringify(stored) : null), setItem() {}, removeItem() {} },
    location: { protocol: 'http:' },
    navigator: {},
    pdfjsLib: null,
    addEventListener() {},
    IntersectionObserver: class { observe() {} unobserve() {} disconnect() {} },
    ClipboardItem: class {},
    document: {
      querySelector: (selector) => {
        if (!selector.startsWith('#')) return null;
        const id = selector.slice(1);
        queriedIds.add(id);
        return canvases[id] || element(id);
      },
      querySelectorAll: (selector) => {
        const make = COLLECTIONS[selector];
        return make ? make() : [];
      },
      createElement: (tag) => makeElement(tag),
      addEventListener() {},
      body: makeElement('body'),
      execCommand: () => true
    }
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.URL = { createObjectURL: () => 'blob:stub', revokeObjectURL() {} };

  vm.createContext(sandbox);
  vm.runInContext(SOURCE, sandbox, { filename: 'app.js' });

  // 启动阶段的绘制结果先留档，再统一触发所有事件（事件会触发再次重绘）。
  const bootCalls = { header: calls.header.slice(), cover: calls.cover.slice() };
  allElements().forEach((item) => ['input', 'change', 'click', 'drop'].forEach((type) => item.dispatch(type)));

  return { bootCalls, settings, preview: element('article-preview'), status: element('header-status') };
}

/* ---------- 断言 ---------- */
let failures = 0;
function check(label, condition, detail) {
  if (condition) console.log(`  ✓ ${label}${detail ? `（${detail}）` : ''}`);
  else {
    failures += 1;
    console.log(`  ✗ ${label}${detail ? `（${detail}）` : ''}`);
  }
}

/** 逐字绘制（字距）会产生大量 fillText，按基线 y 归并成「行」。 */
function toLines(calls) {
  const rows = new Map();
  calls.filter((call) => call.type === 'text').forEach((call) => {
    const key = Math.round(call.y);
    if (!rows.has(key)) rows.set(key, { y: call.y, size: call.size, text: '' });
    rows.get(key).text += call.text;
  });
  return Array.from(rows.values()).sort((a, b) => a.y - b.y);
}

/** DEBUG_LINES=1 时打印每个场景排出来的实际行，方便调版式。 */
const DEBUG = Boolean(process.env.DEBUG_LINES);
function dumpLines(lines, width, height) {
  lines.forEach((line) => {
    console.log(`    y=${String(round(line.y)).padStart(7)}  ${String(line.size).padStart(3)}px  ` +
      `${(line.size / width * 100).toFixed(1).padStart(4)}%  ${line.text}`);
  });
  console.log(`    画布 ${width} × ${height}`);
}

/* ---------- 场景 ---------- */
const RATIOS = { '4:5': 4 / 5, '3:4': 3 / 4, '1:1': 1, '4:3': 4 / 3, '3:2': 3 / 2, '16:9': 16 / 9 };
const heightOf = (settings) => Math.round(settings.header.width / (RATIOS[settings.header.ratio] || 4 / 5));

const base = (info) => ({
  article: {
    header: Object.assign({
      enabled: true, title: '七年级数学 · 期中模拟卷', date: '2026.09',
      difficulty: '中等', pages: '共 8 页', hint: '需要完整电子版？评论区留言获取链接'
    }, info)
  },
  header: {
    width: 1200, ratio: '4:5', bgMode: 'gradient', colorA: '#06372e', colorB: '#0f8a68',
    dim: 40, font: 'serif', textColor: '#f0fdf8', accent: '#7ff0c4'
  },
  cover: { title: '手写笔记', subtitle: '阅读、摘录与思考', bgMode: 'color', colorA: '#e7ece5', colorB: '#c7d9cf', dim: 32, font: 'serif', width: 900, textColor: '#202522' }
});

const scenes = [
  ['默认文案', base({})],
  ['超长标题 + 长提示', base({
    title: '八年级物理第一学期期末考试模拟试卷（含答案与详细解析）',
    hint: '关注公众号后，在评论区回复「试卷」两个字，即可获取完整电子版下载链接'
  })],
  ['标题手动换行', base({ title: '高三语文\n古诗文默写专项训练' })],
  ['极短文案', base({ title: '数学', date: '2026.09', difficulty: '易', pages: '共 1 页', hint: '评论区自取' })],
  ['无提示', base({ hint: '' })],
  ['无信息行', base({ date: '', difficulty: '', pages: '' })],
  ['只有标题', base({ date: '', difficulty: '', pages: '', hint: '' })],
  ['头图关闭', base({ enabled: false })],
  ['无衬线 + 3:4', base({})],
  ['扁比例 16:9 塞满长文案', base({
    title: '八年级物理第一学期期末考试模拟试卷（含答案与解析）',
    hint: '关注公众号后在评论区回复试卷获取完整电子版下载链接'
  })],
  ['颜色被清空', base({})],
  ['60 字极限提示', base({ hint: '关注公众号后在评论区回复试卷两个字即可获取本次考试完整电子版试卷及答案解析的下载链接' })],
  ['2000px 宽度', base({})]
];

scenes.forEach(([name, settings]) => {
  if (name === '无衬线 + 3:4') { settings.header.font = 'sans'; settings.header.ratio = '3:4'; }
  if (name === '扁比例 16:9 塞满长文案') settings.header.ratio = '16:9';
  if (name === '颜色被清空') { delete settings.header.accent; settings.header.colorA = ''; }
  if (name === '2000px 宽度') settings.header.width = 2000;

  console.log(`\n【${name}】`);
  let result;
  try {
    result = run({ settings });
  } catch (error) {
    failures += 1;
    console.log(`  ✗ 运行抛错：${error.message}`);
    return;
  }

  const lines = toLines(result.bootCalls.header).filter((line) => line.text.trim());
  const info = settings.article.header;
  const width = settings.header.width;
  const height = heightOf(settings);
  const hasHeaderNode = result.preview.children.some((child) => child.id === 'header-preview');

  if (!info.enabled) {
    check('头图关闭时预览里不加头图', !hasHeaderNode, hasHeaderNode ? '仍然插入了' : '已跳过');
    return;
  }
  check('头图开启时插到推文最前面', result.preview.children[0] && result.preview.children[0].id === 'header-preview');
  if (DEBUG) dumpLines(lines, width, height);

  // 标题按「文字是标题的子串」识别：超长标题会被缩到比信息值还小，
  // 不能简单拿最大字号当标题。
  const titleKey = info.title.replace(/\s/g, '');
  const titleLines = lines.filter((line) => line.text && titleKey.includes(line.text.replace(/\s/g, '')));
  const titleSize = Math.max(...titleLines.map((line) => line.size));
  const presentLabels = ['时间', '难度', '页数'].filter((label) => lines.some((line) => line.text.includes(label)));
  const expectedLabels = [info.date, info.difficulty, info.pages].filter((item) => item.trim()).length;

  const valueKey = [info.date, info.difficulty, info.pages]
    .map((item) => item.replace(/\s/g, '')).filter(Boolean).join('');
  const valueLine = valueKey ? lines.find((line) => line.text.replace(/\s/g, '') === valueKey) : null;

  // 提示永远是最后一块：从末尾往上数同字号的连续行。信息值可能和提示同号，
  // 所以碰到信息值那一行就停。
  const last = lines[lines.length - 1];
  const hintKey = info.hint.replace(/\s/g, '');
  const hintLines = [];
  if (hintKey) {
    for (let i = lines.length - 1; i >= 0 && lines[i].size === last.size && lines[i] !== valueLine; i -= 1) {
      hintLines.unshift(lines[i]);
    }
  }

  // 超长标题允许排到三行，宁可多一行也不截断。
  const maxTitleLines = titleKey.length > 24 ? 3 : 2;
  check(`标题排进 ${maxTitleLines} 行以内`, titleLines.length >= 1 && titleLines.length <= maxTitleLines,
    `${titleLines.length} 行，字号 ${titleSize}`);

  // 层级：标题必须大于信息值，否则一眼看过去主次就反了。
  check('标题不小于信息值', !valueLine || titleSize >= valueLine.size,
    valueLine ? `标题 ${titleSize}px / 信息值 ${valueLine.size}px` : '无信息行');

  check('标题占画布宽 5%–10%', titleSize >= width * 0.045 && titleSize <= width * 0.105,
    `${titleSize}px = ${(titleSize / width * 100).toFixed(1)}%`);
  check('信息组标签齐全', presentLabels.length === expectedLabels,
    `${presentLabels.join('/') || '无'}（应 ${expectedLabels} 个）`);
  const maxHintLines = hintKey.length > 32 ? 3 : 2;
  check(`提示排进 ${maxHintLines} 行以内`, hintLines.length <= maxHintLines, `${hintLines.length} 行`);
  // 超长文案只允许缩小，不允许悄悄截断。
  const drawnHint = hintLines.map((line) => line.text.replace(/\s/g, '')).join('');
  check('提示未被截断', !hintKey || hintKey === drawnHint, `${drawnHint.length}/${hintKey.length} 字`);
  const drawnTitle = titleLines.map((line) => line.text.replace(/\s/g, '')).join('');
  check('标题未被截断', drawnTitle === titleKey, `${drawnTitle.length}/${titleKey.length} 字`);

  // 手机上图片会被压到屏幕宽度（约 350px），这一条直接换算成手机上的字号。
  const smallest = Math.min(...lines.map((line) => line.size));
  const phonePx = smallest / width * 350;
  check('移动端可读性 ≥ 12px', phonePx >= 12, `最小字号 ${smallest}px → 手机上约 ${phonePx.toFixed(1)}px`);

  const highest = lines.reduce((min, line) => Math.min(min, line.y), Infinity);
  const lowest = lines.reduce((max, line) => Math.max(max, line.y), 0);
  // 「元素之间空的太少」就是这条：跨块（字号变化处）的行距不得小于画布高的 10%。
  // 只有标题时没有块间距可比，跳过。
  const blockSteps = lines.slice(1)
    .map((line, index) => (line.size !== lines[index].size ? line.y - lines[index].y : 0))
    .filter((step) => step > 0);
  if (blockSteps.length) {
    const maxStep = Math.max(...blockSteps);
    check('元素之间有留白', maxStep >= height * 0.1, `块间距 ${round(maxStep)}px = 画布高 ${(maxStep / height * 100).toFixed(0)}%`);
  }
  check('文字全部落在画布内', lowest < height - 10, `基线 ${round(highest)} – ${round(lowest)} / 高 ${height}`);

  const cover = toLines(result.bootCalls.cover);
  check('封面同帧已绘制', cover.length > 0, `${cover.length} 行文字`);
});

/* ---------- 配置迁移 ---------- */
console.log('\n【配置迁移】');
const OLD_HEADER = { ratio: '4:3', width: 1200, bgMode: 'color', colorA: '#e7ece5', colorB: '#c7d9cf', dim: 32, font: 'serif', textColor: '#202522' };
const NEW_HEADER = { ratio: '4:3', width: 1200, bgMode: 'gradient', colorA: '#0b3d34', colorB: '#12715c', dim: 32, font: 'serif', textColor: '#f2fbf7', accent: '#7ee0b8' };

const firstFill = (calls) => calls.header.find((call) => call.type === 'rect');

[
  ['v5 旧配置 → 升到新版默认（4:5 + 青竹）', { version: 5, settings: { header: OLD_HEADER } }, '4:5', '#06372e'],
  ['v6 配置 → 保留 4:3 与自选颜色', { version: 6, settings: { header: NEW_HEADER } }, '4:3', '#0b3d34']
].forEach(([name, stored, ratio, color]) => {
  let result;
  try {
    result = run({ settings: base({}), stored });
  } catch (error) {
    failures += 1;
    console.log(`  ✗ ${name}：${error.message}`);
    return;
  }
  const status = result.status.textContent;
  check(`${name}：比例 ${ratio}`, status.includes(ratio), status);
  const fill = firstFill(result.bootCalls);
  const stops = fill && fill.fill && fill.fill.stops;
  check(`${name}：底色 ${color}`, Boolean(stops) && stops[0] === color, stops ? stops.join(' → ') : String(fill && fill.fill));
});

/* ---------- 每种比例都要排得下 ---------- */
console.log('\n【各比例】');
Object.keys(RATIOS).forEach((ratio) => {
  const settings = base({});
  settings.header.ratio = ratio;
  try {
    const calls = run({ settings });
    const width = settings.header.width;
    const height = heightOf(settings);
    const lines = toLines(calls.bootCalls.header).filter((line) => line.text.trim());
    const lowest = lines.reduce((max, line) => Math.max(max, line.y), 0);
    const phone = Math.min(...lines.map((line) => line.size)) / width * 350;
    if (DEBUG) dumpLines(lines, width, height);
    check(`${ratio} 排得下且可读`, lowest < height - 10 && phone >= 12,
      `${width} × ${height}，最小字号手机上 ${phone.toFixed(1)}px`);
  } catch (error) {
    failures += 1;
    console.log(`  ✗ ${ratio}：${error.message}`);
  }
});

/* ---------- id 覆盖 ---------- */
console.log('\n【id 覆盖】');
const missing = Array.from(queriedIds).filter((id) => !HTML_IDS.has(id) && !RUNTIME_IDS.has(id));
check('脚本查询的 #id 都存在于 index.html', missing.length === 0, missing.length ? `缺失：${missing.join(', ')}` : `共核对 ${queriedIds.size} 个 id`);

console.log(`\n${failures ? `✗ ${failures} 项未通过` : '✓ 全部通过'}`);
process.exit(failures ? 1 : 0);
