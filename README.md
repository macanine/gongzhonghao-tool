# 纸页工作台

把 PDF 试卷整理成适合微信公众号发布的内容：导入并排序 PDF 页面，渲染成高清图片，
生成配套的公众号头图与微信封面。

纯前端工具，PDF 解析、画布渲染和图片打包都在浏览器里完成，文件不上传，适合处理
内部资料和未公开试卷。

## 功能

- **公众号排版**：导入一个或多个 PDF，拖拽调整页序，一键复制为公众号富文本。
- **信息头图**：编辑标题、时间、难度、页数和获取提示，生成推文开头的竖版信息图。
- **微信封面**：生成 2.35:1 头条封面，支持标题、副标题和多种视觉主题。
- **配置可迁移**：排版习惯保存在本地，支持导入、导出和版本迁移。

## 快速开始

```bash
npm install
npm run dev          # http://localhost:3000
```

生产构建：

```bash
npm run build
npm run start
```

## 常用命令

| 命令 | 作用 |
| --- | --- |
| `npm run dev` | 开发服务器 |
| `npm run build` | 生产构建 |
| `npm run start` | 启动生产构建 |
| `npm test` | 单元测试（vitest） |
| `npm run typecheck` | 类型检查 |
| `node tools/screenshot.mjs [目录]` | 无头浏览器截图（三个工作区 + 手机端 + 弹窗） |

## 技术栈

Next.js 16 App Router、React 19、TypeScript、Tailwind CSS v4、Radix UI、pdf.js、
Lucide React、Vitest。

## 代码结构

```
app/                  Next.js App Router
  globals.css         设计令牌（@theme）与全局样式
lib/                  核心逻辑
  settings.ts         配置类型、默认值、版本迁移
  palettes.ts         18 组配色主题
  store.ts            全局状态（useSyncExternalStore）
  feedback.ts         任务浮层与提示条
  utils.ts            cn() 类名合并
  canvas/             排字工具、背景、头图、封面绘制
  article/            pdf.js 加载渲染、富文本复制、图片打包、串行队列
components/           React 组件，只负责把状态接到 UI 上
  ui/                 按钮、表单、弹窗等通用控件（Tailwind + Radix）
tests/                vitest 测试
tools/screenshot.mjs  无头浏览器截图脚本
```

`lib/canvas/` 与 `lib/article/` 不依赖 React，`components/` 里不写画布数学。排版规则
（行数、字号、留白、不截断）因此全部能在 Node 里测试。

## 部署

Vercel 原生 Next.js 部署，没有服务端逻辑、环境变量、数据库或文件上传服务。仓库里的
`vercel.json` 只声明框架，不覆盖 Build Command 和 Output Directory。

Vercel 项目设置里的 Output Directory 必须留空：`outputDirectory` 一旦写入就会被长期
保留，之后从 `vercel.json` 删除也不生效，构建会在产物收集阶段报
`NEXT_OUTPUT_DIR_MISSING`。需要重置时运行：

```bash
npx vercel project update gongzhonghao-tool --auto-detect output-directory
```
