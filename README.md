# 纸页工作台

把 PDF 试卷排成公众号推文。三件事：

1. **排版** —— 导入 PDF，按顺序转成高清图片，一键复制成公众号富文本
2. **头图** —— 推文最前面那张大字信息图：标题 / 时间 / 难度 / 页数 + 获取提示
3. **封面** —— 2.35:1 微信头条封面

PDF 解析、画布渲染、打包全部在浏览器里完成。**文件不会离开这台机器。**

## 快速开始

```bash
npm install
npm run dev          # http://localhost:3000
```

出静态站点：

```bash
npm run build        # 产物在 out/，是纯静态文件
npm run preview      # 本地起个静态服务器预览 out/
```

> 别用 `file://` 直接打开 `out/index.html`——pdf.js 的 worker 会被 CORS 拦住。
> 用 `npm run dev` 或 `npm run preview`。

## 常用命令

| 命令 | 作用 |
| --- | --- |
| `npm run dev` | 开发服务器 |
| `npm run build` | 静态导出到 `out/` |
| `npm run preview` | 预览静态产物 |
| `npm test` | 单元测试（vitest） |
| `npm run typecheck` | 类型检查 |
| `node tools/screenshot.mjs [目录]` | 无头浏览器给三个页面截图 |

## 代码结构

```
app/                 Next.js App Router（静态导出，无服务端）
  layout.tsx         根布局与 metadata
  page.tsx           入口
  globals.css        全部样式（按 01–08 分节）

lib/                 与框架无关的核心逻辑，可直接单元测试
  settings.ts        配置类型、默认值、版本迁移
  palettes.ts        18 组配色主题
  store.ts           全局状态（useSyncExternalStore）
  feedback.ts        任务浮层与提示条
  canvas/
    kit.ts           排字、换行、导出等纯工具
    backdrop.ts      背景：纯色 / 渐变 / 光晕 / 图片
    header.ts        头图排版与绘制
    cover.ts         封面排版与绘制
  article/
    pdf.ts           pdf.js 加载与页面渲染
    export.ts        富文本复制、图片打包
    queue.ts         渲染串行队列

components/          React 组件（只负责把状态接到 UI 上）
tests/               vitest 测试
tools/screenshot.mjs 无头截图脚本
```

设计上的一条线：**`lib/` 里不出现 React，组件里不出现画布数学**。
所以排版规则（行数、字号、留白、不截断）全部能在 Node 里跑测试，
不需要浏览器，也不需要人眼。

## 几处值得一提的实现

- **移动端可读性**：头图字号按画布宽度的百分比给，而不是固定像素。
  因为图片在手机上会被压到约 350px 宽，按比例给才能保证缩下去还看得清。
  测试里直接把最小字号换算成手机上的 px 来卡这条线。
- **留白自适应**：先量出每块的高度，再把剩余空间平摊到块与块之间。
  画布越高、内容越少，留白越大，不会挤在中间。
- **超长文案只缩不截断**：缩到最小字号还放不下时，宁可多排一行。
- **配置迁移带版本号**：`migrateSettings` 只在从更早版本升级时跑一次。
  早期版本没有版本号，导致用户每次打开都被打回默认值——这条有回归测试守着。
- **换行优先断在标点/空格后**：避免把「期中模拟卷」切成「期 / 中模拟卷」。

## 部署

`npm run build` 出来的 `out/` 是纯静态文件，扔到任意静态托管即可
（Vercel / GitHub Pages / 对象存储 / 内网 nginx）。
没有服务端，没有环境变量，没有数据库。
