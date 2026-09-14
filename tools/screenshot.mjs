/*
 * 用本机缓存的 chrome-headless-shell 给三个标签页各截一张图。
 *
 * 不依赖 playwright：Node 22 自带 WebSocket，直接讲 DevTools 协议，
 * 顺带启动本地 Next.js 生产服务器。
 *
 * 用法：node tools/screenshot.mjs [输出目录]
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const TARGET = process.argv[2] ?? '/tmp/gzhelper-shots';
const PORT = Number(process.env.SCREENSHOT_PORT ?? 3471);

const CHROME_CANDIDATES = [
  process.env.CHROME_BIN,
  `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-mac-arm64/chrome-headless-shell`,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);

const chromeBin = CHROME_CANDIDATES.find((candidate) => existsSync(candidate));
if (!chromeBin) {
  console.error('找不到可用的无头浏览器，可用 CHROME_BIN 指定');
  process.exit(1);
}
if (!existsSync(join(ROOT, '.next'))) {
  console.error('先跑 npm run build 生成 .next/');
  process.exit(1);
}

/* ---------- 启动 Next.js 生产服务器 ---------- */
const nextServer = spawn('npm', ['run', 'start', '--', '--port', String(PORT)], {
  cwd: ROOT,
  stdio: 'ignore',
});
const origin = `http://127.0.0.1:${PORT}`;

async function waitForServer() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const response = await fetch(origin);
      if (response.ok) return;
    } catch {
      /* 还没起来 */
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Next.js 生产服务器没能在超时前启动');
}

await waitForServer();

/* ---------- 启动浏览器 ---------- */
const debugPort = 9333;
const chrome = spawn(
  chromeBin,
  [
    '--headless',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--hide-scrollbars',
    `--remote-debugging-port=${debugPort}`,
    '--window-size=1440,960',
    'about:blank',
  ],
  { stdio: 'ignore' },
);

async function waitForDevtools() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
      const targets = await response.json();
      const page = targets.find((target) => target.type === 'page');
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch {
      /* 还没起来 */
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('浏览器没能在超时前启动');
}

const wsUrl = await waitForDevtools();
const socket = new WebSocket(wsUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});

let nextId = 0;
const pending = new Map();
const events = new Map();

socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  if (message.id !== undefined) {
    const entry = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) entry?.reject(new Error(message.error.message));
    else entry?.resolve(message.result);
    return;
  }
  const waiters = events.get(message.method);
  if (waiters?.length) waiters.shift()(message.params);
});

function send(method, params = {}) {
  nextId += 1;
  const id = nextId;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

const once = (method) =>
  new Promise((resolve) => {
    if (!events.has(method)) events.set(method, []);
    events.get(method).push(resolve);
  });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/* ---------- 开拍 ---------- */
await send('Page.enable');
await send('Runtime.enable');

const DESKTOP = { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false };
const PHONE = { width: 390, height: 844, deviceScaleFactor: 1, mobile: true };

await mkdir(TARGET, { recursive: true });

/** 派发完整的按下/抬起/点击序列：Radix 的 Tabs 在 mousedown 上切换，只 click 切不动。 */
const press = (selector) => `(() => {
  const el = document.querySelector(${JSON.stringify(selector)});
  if (!el) return false;
  const opts = { bubbles: true, cancelable: true, button: 0 };
  el.dispatchEvent(new MouseEvent('mousedown', opts));
  el.dispatchEvent(new MouseEvent('mouseup', opts));
  el.click();
  return true;
})()`;

async function shoot(name, { tab, scrollTop = 0, viewport = DESKTOP, action } = {}) {
  await send('Emulation.setDeviceMetricsOverride', viewport);
  const loaded = once('Page.loadEventFired');
  await send('Page.navigate', { url: origin });
  await loaded;
  await sleep(500);

  if (tab) {
    const { result } = await send('Runtime.evaluate', {
      expression: `(() => {
        const el = [...document.querySelectorAll('[role="tab"]')]
          .find((b) => b.textContent.trim() === ${JSON.stringify(tab)});
        if (!el) return false;
        const opts = { bubbles: true, cancelable: true, button: 0 };
        el.dispatchEvent(new MouseEvent('mousedown', opts));
        el.dispatchEvent(new MouseEvent('mouseup', opts));
        el.click();
        return true;
      })()`,
    });
    if (result?.value !== true) throw new Error(`找不到标签页：${tab}`);
    await sleep(600);
  }
  if (scrollTop) {
    await send('Runtime.evaluate', {
      expression: `(() => { const s = document.querySelector('[data-scroll="preview"], [data-scroll="rail"]'); if (s) s.scrollTop = ${scrollTop}; })()`,
    });
    await sleep(250);
  }
  if (action) {
    const { result } = await send('Runtime.evaluate', { expression: action });
    if (result?.value === false) throw new Error(`${name}：操作未命中目标元素`);
    await sleep(500);
  }

  const { data } = await send('Page.captureScreenshot', { format: 'png' });
  await writeFile(join(TARGET, `${name}.png`), Buffer.from(data, 'base64'));
  console.log(`  ✓ ${name}.png`);
}

console.log('截图输出到', TARGET);
try {
  await shoot('01-article');
  await shoot('02-header', { tab: '头图' });
  await shoot('03-cover', { tab: '封面' });
  await shoot('04-mobile', { viewport: PHONE });
  await shoot('05-mobile-sheet', {
    viewport: PHONE,
    action: press('[aria-label="打开更多操作"]'),
  });
  await shoot('06-confirm', { action: press('[aria-label="恢复默认配置"]') });
} finally {
  socket.close();
  chrome.kill();
  nextServer.kill();
}
