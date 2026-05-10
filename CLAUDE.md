# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Aiva 是一个 macOS 桌面端语音 AI 助手。Electron 主进程内嵌 Next.js 15 standalone 服务器，通过 IPC 通信而非 REST API 连接前后端。macOS-only（菜单栏托盘、DMG 分发、arm64 原生模块）。

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
- **IPC 通信**: `nodeIntegration: true` + `contextIsolation: false`，渲染进程通过 `src/lib/electron-ipc.ts` 的 `eval('require("electron")')` 获取 `ipcRenderer`。类型定义在 `src/types/index.ts` 的 `IpcMessages`
- **IPC 模式**: fire-and-forget 用 `ipcMain.on()`/`ipcRenderer.send()`，request-response 用 `ipcMain.handle()`/`ipcRenderer.invoke()`，主→渲染推送用 `webContents.send()`
- **共享代码**: `electron/` 和 `src/` 都通过 `@/` 别名导入 `src/lib/` 和 `src/types/`

### 数据目录 (`~/.aiva/`)

所有用户数据以文件形式存储在 `~/.aiva/` 下，不依赖 Electron 的 `app.getPath('userData')`：

| 路径 | 内容 |
|---|---|
| `aiva.db` | SQLite 数据库（仅用于 chat_message、execution_history、context_segment） |
| `persona/` | Persona 配置：`profile.json`（name/avatar）、`persona.md`（性格定义）、`avatar.*` |
| `daily/` | 每日记忆：`YYYY-MM-DD.md` |
| `memories/` | 核心记忆：独立 `.md` 文件，每个代表一个用户事实 |
| `skills/` | 技能包目录 |
| `settings.json` | 应用设置 |
| `logs/` | 按天切割的日志 `aiva-YYYY-MM-DD.log` |

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
| `electron/audio-listener.ts` | 麦克风音频流监听（三种模式：wake-word / recording / continuous-chat） |
| `electron/voice-endpoint.ts` | VAD 静音端点检测 |
| `electron/native/key-event-tap/` | Swift 原生模块，低级别键盘事件拦截 |
| `src/app/(main)/` | 主窗口页面：chat、memory、persona、skills、services、settings、onboarding |
| `src/app/(transparent)/` | 透明/无边框弹窗：subtitle、voice-bar |
| `src/lib/store.ts` | 状态机（AivaStore）+ SDK 子状态（SdkSubState） |
| `src/lib/claude-client.ts` | Claude Agent SDK 封装，流式调用 + 工具类型映射 |
| `src/lib/provider-config.ts` | 多 Provider 配置：GLM-CN、GLM-Global、Anthropic |
| `src/lib/persona-file.ts` | Persona 文件管理（AI 可自修改 persona.md 和 profile.json） |
| `src/lib/aiva-context.ts` | 上下文组装：persona + 每日记忆 + 技能目录 → 注入 Claude prompt |
| `src/lib/daily-memory-writer.ts` | 每日记忆评估与写入（LLM 判断是否值得记录） |
| `src/lib/core-memory-evaluator.ts` | 核心记忆评估（LLM 决定创建/更新/删除记忆文件） |
| `src/lib/db.ts` | SQLite 初始化 + 迁移（WAL 模式，PRAGMA 迁移） |
| `scripts/build-electron.mjs` | esbuild 编译 Electron 主进程 |

### 状态机

`AivaStore`（`src/lib/store.ts`）管理 `idle → recording → transcribing → thinking → executing → completed → idle` 状态流转。关键行为：
- 非法状态转换会被拒绝并记录警告
- `completed` 是瞬态，2.5 秒后自动回到 `idle`（除非 TTS 正在播放或 continuous chat 模式激活）
- `SdkSubState` 并行追踪 Claude SDK 内部阶段（thinking / executing_tool / compacting / rate_limited 等）
- 托盘指示点颜色与状态同步（灰=空闲、蓝=思考、绿=完成、红=出错）

### 语音管线

`AudioListener` → `WakeWordEngine` (sherpa-onnx) → `VoiceEndpoint` (VAD) → `AudioRecorder` → 火山引擎 ASR → Claude Agent SDK → 火山引擎 TTS → `SubtitlePopup`。支持 "continuous chat" 模式（说完自动再听）。

AudioListener 有三种运行模式：`wake-word`（监听唤醒词）、`recording`（按住录音）、`continuous-chat`（说完自动再听）。

### AI 执行

通过 `@anthropic-ai/claude-agent-sdk` 的 `query()` 流式调用。关键配置：
- `permissionMode: 'bypassPermissions'` — 无需用户确认工具调用
- `autoMemoryEnabled: true` + `autoMemoryDirectory: '~/.aiva/memories'` — SDK 自动写入记忆
- 支持多 provider：GLM-CN（open.bigmodel.cn）、GLM-Global（api.z.ai）、Anthropic。`buildSdkEnv()` 构建 SDK 所需环境变量
- 每次 prompt 自动注入 persona 上下文 + 昨日每日记忆 + 技能目录

### 构建配置要点

- `next.config.ts` 设置 `output: 'standalone'`，standalone 产物作为 Electron 资源打包
- `electron-builder.yml` 配置 ASAR unpack 规则：原生 `.node`/`.dylib` 文件和 `claude-agent-sdk-darwin-arm64/claude` 二进制必须 unpack
- `tsconfig.electron.json` 专门用于 Electron 主进程编译（CommonJS 输出到 `dist-electron/`）
- esbuild 外部化：`electron`、`better-sqlite3`、`sherpa-onnx-node`、`uiohook-napi`、`@anthropic-ai/claude-agent-sdk` 不可打包

### 日志系统

日志写入 `~/.aiva/logs/aiva-YYYY-MM-DD.log`，实现见 `src/lib/logger.ts`。排查问题时先查日志。

## Coding Guidelines (Karpathy Principles)

**权衡:** 这些原则偏向谨慎而非速度。对于简单任务，根据判断灵活处理。

### 1. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked. No abstractions for single-use code.
- If you write 200 lines and it could be 50, rewrite it.
- Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

### 2. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

- Don't "improve" adjacent code, comments, or formatting. Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- Remove imports/variables/functions that YOUR changes made unused. Don't remove pre-existing dead code unless asked.

### 3. Goal-Driven Execution

**Define success criteria. Loop until verified.**

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```
