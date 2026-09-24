# Gemini Polish

A customizable reading experience for Google Gemini. Adjust typography, fade away clutter, theme the accent color, render Mermaid diagrams inline — pick a one-click preset or compose your own from 16 atomic toggles.

![Version](https://img.shields.io/badge/version-1.2.0-blue)
![Platform](https://img.shields.io/badge/platform-Chrome%20|%20Edge-lightgrey)
![License](https://img.shields.io/badge/license-MIT-green)

## ✨ Features

### Reading typography
- Font family (system, serif, mono, plus calligraphic options for CJK readers, or any custom font installed on your system)
- Base font size, line height, paragraph spacing
- Content column max-width
- Proportional heading scale (h1–h6 follow base size)

### Sidebar density
- Nav font size and item padding
- Accent-color highlight on the active chat in your history

### Accent color
- Choose any color; it cascades into Gemini's own design tokens (`--gem-sys-color--primary`, `--lumi-sys-color--primary`, `--mat-sys-primary`)
- Granular toggles for: bold text, inline code, blockquote borders, user-message bubble tint

### Minimal mode
- Hide bottom disclaimer footer
- Fade message action buttons (thumbs up, share, copy) until you hover the row

### Mermaid graph viewer (the original feature)
- Split-view: code on one side, rendered diagram on the other
- 1:1 vector rendering with smooth zoom + pan
- Fullscreen "teleport" mode (ESC to exit)
- Export SVG, Copy Code, Copy Image (PNG, 2× resolution)

### Power user escape hatch
- Custom CSS textbox in the popup — anything you write here loads after every Polish rule and beats Gemini defaults

## 🎛 One-click Presets

| Preset | What it does |
|---|---|
| **Reading Mode** (default on first install) | Elegant typography + accent color, no minimal/sidebar overrides |
| **Minimal Focus** | Reading typography + accent + hide disclaimer + fade actions + sidebar active highlight |
| **Power Reader** | Everything on |
| **Classic Gemini** | All Polish features off (only Mermaid graph renderer remains) |
| **Custom** | Auto-selected as soon as you toggle anything by hand |

## 🚀 Installation

1. **Chrome Web Store**: [Gemini Polish | Typography & Pro Diagramming](https://chromewebstore.google.com/detail/ajboihpfgkpcpeibiahobpdogdbbmfpn)
2. **Developer install**:
   - Clone this repo
   - Open `chrome://extensions/`, enable **Developer mode**
   - Click **Load unpacked**, select the project folder

On first install, Gemini Polish applies Reading Mode and shows a small in-page toast explaining what changed and how to revert.

## 🧰 Architecture (why it stays maintainable)

This extension intentionally avoids fighting Gemini's class names — `[class*="sidebar"]` style selectors break every time Google ships a UI rollout. Instead it anchors only to stable surfaces:

- **Angular Custom Element tags** — `<user-query>`, `<model-response>`, `<message-content>`, `<chat-disclaimer>`, etc.
- **`data-test-id`** attributes — Google's own automation hooks
- **`role` / `aria-*`** — accessibility-driven, slow-changing
- **Gemini's `--gem-sys-color--*` / `--lumi-sys-color--*` design tokens** — the canonical color injection point

Each feature is one body class + a ≤5-line CSS rule that uses `:where()` to keep specificity at zero, so your Custom CSS always wins. When Gemini does break one of our anchors, only the affected toggle stops working — the other 15 keep going, and you can disable the broken one from the popup without losing everything else.

## 🗂 Project layout

```
manifest.json
background.js                  # onInstall seed + retrofit open Gemini tabs
content.js                     # Mermaid pipeline + Polish config + first-run toast (Shadow DOM)
popup/                         # Settings UI (preset picker + accordion of toggles)
styles/
  polish-vars.css              # All --polish-* CSS variables and defaults
  mermaid.css                  # Mermaid split-view rendering chrome
  polish-reading.css           # Toggles 1–6 (typography)
  polish-sidebar.css           # Toggles 7–9 (sidebar density)
  polish-accent.css            # Toggles 10–14 (color)
  polish-minimal.css           # Toggles 15–16 (de-clutter)
tests/anchor-check.js          # DevTools console snippet to verify Gemini anchors
```

## 🛠 Supported Mermaid diagram types

`graph TD/LR/BT/RL`, `flowchart`, `erDiagram`, `sequenceDiagram`, `classDiagram`, `stateDiagram`, `mindmap`, `timeline`, `gantt`, `pie`, and more.

## 🔒 Privacy

- All rendering and styling happens locally in your browser.
- Settings sync only via `chrome.storage.sync` (your Google account); no third-party server.
- Trusted Types compliant — no `innerHTML` usage anywhere in the rendering path.

## 📄 License

MIT. Use it, fork it, file issues, send PRs.

---

*Gemini Polish is an independent project. It is not affiliated with, endorsed by,
or sponsored by Google. "Google" and "Gemini" are trademarks of Google LLC, used
here only to describe what this extension works with.*
