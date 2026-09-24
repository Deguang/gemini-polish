# Gemini Polish

一款让 Google Gemini 阅读体验可定制的浏览器扩展：可调字体排版、最小化界面干扰、自定义强调色、内联渲染 Mermaid 图表——可一键切换预设方案，也可由 16 个原子开关自由组合。

![版本](https://img.shields.io/badge/版本-1.2.0-blue)
![平台](https://img.shields.io/badge/平台-Chrome%20|%20Edge-lightgrey)
![许可](https://img.shields.io/badge/许可-MIT-green)

## ✨ 功能

### 阅读排版
- 字体家族（系统字体、衬线、等宽，含适合中文的霞鹜文楷、思源宋体、仿宋等，也可手动输入任意已安装字体）
- 字号、行高、段落间距
- 内容最大宽度（控制行长）
- 标题按基础字号比例缩放（h1–h6）

### 侧栏密度
- 导航字号和条目内边距
- 当前对话条目用强调色高亮

### 强调色
- 自由选色，会注入 Gemini 自己的设计 token（`--gem-sys-color--primary`、`--lumi-sys-color--primary`、`--mat-sys-primary`）
- 细粒度开关：粗体文字、行内代码、引用块边框、用户消息气泡底色

### 极简模式
- 隐藏底部"Gemini 可能显示不准确信息"免责声明
- 消息操作按钮（点赞、分享、复制）默认淡化，hover 一行时恢复

### Mermaid 图表渲染（原始核心功能）
- 分栏视图：代码和渲染图左右或上下展示
- 1:1 矢量渲染 + 流畅缩放/拖拽
- 全屏"传送门"模式（ESC 退出）
- 导出 SVG、复制源码、复制图片（PNG，2 倍分辨率）

### 专业用户逃生口
- popup 里的 Custom CSS 文本框——你写的任何规则都会在 Polish 规则之后加载，可以盖过 Gemini 的所有默认样式

## 🎛 一键预设

| 预设 | 作用 |
|---|---|
| **Reading Mode**（首装默认） | 优雅排版 + 强调色，不动 minimal/sidebar |
| **Minimal Focus** | Reading 排版 + 强调色 + 隐藏免责 + 淡化按钮 + 侧栏当前项高亮 |
| **Power Reader** | 全部开启 |
| **Classic Gemini** | 全关，只保留 Mermaid 渲染 |
| **Custom** | 任何手动改动后自动切到此项 |

## 🚀 安装

1. **Chrome 应用商店**：[Gemini Polish | Typography & Pro Diagramming](https://chromewebstore.google.com/detail/ajboihpfgkpcpeibiahobpdogdbbmfpn)
2. **开发者手动安装**：
   - 克隆本仓库
   - 浏览器打开 `chrome://extensions/`，开启**开发者模式**
   - 点击**加载已解压的扩展程序**，选择项目目录

首次安装时 Polish 会应用 Reading Mode 并在 Gemini 页面右下角弹出一个小提示，说明发生了什么、如何恢复原版。

## 🧰 架构（为什么它不会很快变成屎山）

本扩展刻意不去打 Gemini 的 class 名称战——`[class*="sidebar"]` 这类选择器每次 Google 改版都会断。它只锚定以下稳定 surface：

- **Angular Custom Element 标签**：`<user-query>`、`<model-response>`、`<message-content>`、`<chat-disclaimer>` 等
- **`data-test-id`** 属性：Google 自动化测试 hook，跨重构稳定
- **`role` / `aria-*`**：无障碍驱动，几乎不动
- **Gemini 的 `--gem-sys-color--*` / `--lumi-sys-color--*` 设计 token**：注入强调色的最高 ROI 入口

每个功能 = 一个 body class + ≤5 行 CSS，内部全部用 `:where()` 把特异性归零，所以你的 Custom CSS 永远能盖过。Gemini 改 DOM 时只会击穿对应 toggle，其它 15 个继续工作；用户也可单独关掉坏的，不必禁用整个扩展。

## 🗂 项目结构

```
manifest.json
background.js                  # 安装时种默认配置 + 注入已打开的 Gemini 标签页
content.js                     # Mermaid 管线 + Polish 配置 + 首次运行 toast (Shadow DOM)
popup/                         # 设置面板（preset 选择器 + 折叠面板的原子 toggle）
styles/
  polish-vars.css              # 所有 --polish-* CSS 变量与默认值
  mermaid.css                  # Mermaid 分栏渲染样式
  polish-reading.css           # Toggle 1–6（排版）
  polish-sidebar.css           # Toggle 7–9（侧栏密度）
  polish-accent.css            # Toggle 10–14（强调色）
  polish-minimal.css           # Toggle 15–16（去干扰）
tests/anchor-check.js          # 在 DevTools console 验证 Gemini 锚点是否还存活的脚本
```

## 🛠 支持的 Mermaid 类型

`graph TD/LR/BT/RL`、`flowchart`、`erDiagram`、`sequenceDiagram`、`classDiagram`、`stateDiagram`、`mindmap`、`timeline`、`gantt`、`pie` 等。

## 🔒 隐私

- 所有渲染和样式化都在本地浏览器执行
- 设置仅通过 `chrome.storage.sync`（你的 Google 账号）同步，不经任何第三方
- 兼容 Trusted Types——渲染路径上无 `innerHTML` 使用

## 📄 许可

MIT。欢迎使用、Fork、提 Issue、贡献代码。

---

*Gemini Polish 是独立开发的项目，与 Google 无关联，未获其背书或赞助。"Google" 与
"Gemini" 是 Google LLC 的商标，此处仅用于说明本扩展的适用对象。*
