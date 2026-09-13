/*
 * 用本机缓存的 chrome-headless-shell 给三个标签页各截一张图。
 *
 * 不依赖 playwright：Node 22 自带 WebSocket，直接讲 DevTools 协议，
 * 顺带起一个极小的静态服务器把 out/ 端出去。
 *
 * 用法：node tools/screenshot.mjs [输出目录]
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const OUT = join(ROOT, 'out');
const TARGET = process.argv[2] ?? '/tmp/gzhelper-shots';

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
if (!existsSync(OUT)) {
  console.error('先跑 npm run build 生成 out/');
  process.exit(1);
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
};

/* ---------- 极简静态服务器 ---------- */
const server = createServer(async (req, res) => {
  const url = (req.url ?? '/').split('?')[0];
  let file = normalize(join(OUT, decodeURIComponent(url)));
  if (!file.startsWith(OUT)) {
    res.writeHead(403).end();
    return;
  }
  try {
    let body = await readFile(file).catch(async () => {
      file = join(OUT, 'index.html');
      return readFile(file);
    });
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;

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
await send('Emulation.setDeviceMetricsOverride', {
  width: 1440,
  height: 960,
  deviceScaleFactor: 1,
  mobile: false,
});

await mkdir(TARGET, { recursive: true });

async function shoot(name, { tab, scrollTop = 0 } = {}) {
  const loaded = once('Page.loadEventFired');
  await send('Page.navigate', { url: origin });
  await loaded;
  await sleep(500);

  if (tab) {
    await send('Runtime.evaluate', {
      expression: `[...document.querySelectorAll('.mode-tab')].find((b) => b.textContent.trim() === ${JSON.stringify(
        tab,
      )})?.click()`,
    });
    await sleep(600);
  }
  if (scrollTop) {
    await send('Runtime.evaluate', {
      expression: `(() => { const s = document.querySelector('.preview-scroll, .rail-scroll'); if (s) s.scrollTop = ${scrollTop}; })()`,
    });
    await sleep(250);
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
  await shoot('04-canvas', { tab: '头图', scrollTop: 0 });
} finally {
  socket.close();
  chrome.kill();
  server.close();
}
