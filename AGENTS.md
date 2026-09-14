<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# 项目约定

## 样式

- Tailwind CSS v4，CSS-first 配置。颜色、圆角、阴影、字体等令牌全部在
  `app/globals.css` 的 `@theme` 里，需要新令牌就加在那里，别在组件里硬编码色值。
- 组件只写工具类；要复用的样式抽成 `components/ui/` 里的组件，不要新增全局 CSS。
- 合并类名一律用 `cn()`（`lib/utils.ts`），保证后写的类能覆盖前一个。

### 坑：Tailwind 的 `max-*` 不含边界值

`max-[768px]:` 编译出来是 `@media not all and (min-width: 768px)`，即 **宽度 < 768px**；
手写 CSS 的 `@media (max-width: 768px)` 则是 **≤ 768px**。差这一个像素会咬人：
390px 正是 iPhone 12/13/14 的宽度，早期用 `max-[390px]` 时那档样式在 390px 上完全不生效。
所以断点取 768 / 1200 / 400 这类整数，避开常见设备正好落在边界上。

## 组件

- 按钮、开关、滑块、弹窗等走 `components/ui/`，能用 Radix 原语就别手写，
  键盘导航与读屏语义交给 Radix。
- 三栏骨架是 `Workbench.tsx` 的 `PANEL_GRID`：右栏在 `max-[1200px]` 隐藏，手机端上下叠两栏。
- 三个工作区面板必须一直挂载（切回来时 PDF 页与预览不重来），所以 `TabsContent` 传 `forceMount`。
  注意 Radix 在 `forceMount` 下**不会**自动隐藏未选中的面板，隐藏是靠
  `components/ui/tabs.tsx` 里补的 `data-[state=inactive]:hidden`。

## 分层

- `lib/canvas/`、`lib/article/`、`lib/settings.ts` 不依赖 React，可直接在 Node 里测试。
- `lib/store.ts`、`lib/feedback.ts` 是 `useSyncExternalStore` 的小 store，属于 React 层。
- 画布排版数学只允许出现在 `lib/canvas/`，组件里不写画布数学。

## 验证

```bash
npm test && npm run typecheck && npm run build
node tools/screenshot.mjs /tmp/gz-shots   # 六个界面：三个工作区 + 手机端 + 手机菜单 + 确认弹窗
```
