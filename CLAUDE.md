# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Shrew 是一个 macOS 桌面端语音 AI 助手。Electron 主进程内嵌 Next.js 15 standalone 服务器，通过 IPC 通信而非 REST API 连接前后端。macOS-only（菜单栏托盘、DMG 分发、arm64 原生模块）。

## Commands

```bash
# 开发（同时启动 Next.js dev server 和 Electron）
npm run electron:dev

# 构建 Electron 应用（完整打包 DMG）
npm run electron:build

# 仅构建 Electron 主进程（esbuild 编译 electron/ → dist-electron/）
npm run build:electron

# 仅构建 Next.js
npm run build
```

无测试框架配置（jest 在 devDependencies 但未配置 jest.config）。

## Architecture

### Electron + Next.js 交互模式

- **生产环境**: Electron 启动 → 在随机端口 spawn Next.js standalone `server.js` → 等 `/api/health` 响应 → 创建 BrowserWindow 加载页面
- **开发环境**: `concurrently` 同时跑 `next dev` 和 `electron .`，`wait-on` 等端口 3000 就绪
- **IPC 通信**: `nodeIntegration: true` + `contextIsolation: false`，页面直接用 `ipcRenderer`，类型定义在 `src/types/index.ts` 的 `IpcMessages`
- **共享代码**: `electron/` 和 `src/` 都通过 `@/` 别名导入 `src/lib/` 和 `src/types/`

### 目录职责

| 路径 | 职责 |
|---|---|
| `electron/main.ts` | 核心编排：窗口管理、状态机、语音管线、AI 执行、IPC handlers（~1700 行） |
| `electron/tray.ts` | 菜单栏托盘 + 状态指示点 |
| `electron/shortcuts.ts` | 全局快捷键（默认 Right Command） |
| `electron/recorder.ts` | 音频录制 + 火山引擎 ASR 转写 |
| `electron/tts.ts` | 火山引擎 TTS + 句子解析 |
| `electron/voice-bar.ts` | 浮动语音录制指示条窗口 |
| `electron/subtitle-popup.ts` | 透明字幕弹窗 |
| `electron/wake-word.ts` | sherpa-onnx 唤醒词引擎 |
| `electron/native/key-event-tap/` | Swift 原生模块，低级别键盘事件拦截 |
| `src/app/(main)/` | 主窗口页面：chat、memory、persona、services、settings |
| `src/app/(transparent)/` | 透明/无边框弹窗：subtitle、voice-bar |
| `src/app/api/health/` | 健康检查端点（Electron 启动时探测用） |
| `src/components/chat/` | 聊天相关组件 |
| `src/components/ui/` | 设计系统基础组件 |
| `src/lib/` | 共享库（store、db、AI client、provider config 等） |
| `scripts/build-electron.mjs` | esbuild 编译 Electron 主进程 |

### 状态机

`ShrewStore`（`src/lib/store.ts`）管理 `idle → recording → transcribing → thinking → executing → completed → idle` 状态流转，托盘指示点颜色反映当前状态。

### 语音管线

`AudioListener` → `WakeWordEngine` (sherpa-onnx) → `VoiceEndpoint` (VAD) → `AudioRecorder` → 火山引擎 ASR → Claude Agent SDK → 火山引擎 TTS → `SubtitlePopup`。支持 "continuous chat" 模式（说完自动再听）。

### AI 执行

通过 `@anthropic-ai/claude-agent-sdk` 的 `query()` 流式调用。支持多 provider：GLM-CN、GLM-Global、Anthropic。`buildSdkEnv()` 构建 SDK 所需环境变量。

## Coding Guidelines (Karpathy Principles)

来源: [andrej-karpathy-skills](https://github.com/forrestchang/andrej-karpathy-skills)

**权衡:** 这些原则偏向谨慎而非速度。对于简单任务，根据判断灵活处理。

### 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

### 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

### 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

### 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.
