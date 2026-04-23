# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Shrew 是一个 macOS 桌面应用（macOS 13+），通过语音快捷入口驱动 Claude Code 执行任务，并在菜单栏提供状态反馈。用户按下右 Command 键唤起语音输入，说出指令后 Shrew 通过本地语音识别转文字，再调用 Claude Agent SDK 执行。

## Architecture

**Electron + Next.js hybrid**: Electron 主进程管理窗口和系统交互，Next.js 15 standalone 提供所有 UI 页面。生产模式下 Next.js standalone server 由主进程 spawn 在随机端口上运行。

**两条代码路径**（各自有独立的 tsconfig）:
- `electron/` — Electron 主进程模块（CJS，由 esbuild 编译到 `dist-electron/`，使用 `tsconfig.electron.json`）
- `src/` — Next.js 应用（React 19 页面 + API routes，由 Next.js 构建，使用 `tsconfig.json`）

**状态机核心** (`src/lib/store.ts`): 两层状态架构——应用状态机（idle→recording→transcribing→editing→sending→executing→idle）和 SDK 子状态（thinking/executing_tool/compacting 等）。所有状态转换经过白名单校验。

**IPC 通信**: 主进程通过 `ipcMain` 与 BrowserWindow 通信，同时通过 `globalThis` 暴露 store 和 executor 给 Next.js API routes。

## Key Modules

| 模块 | 职责 |
|------|------|
| `electron/main.ts` | 应用生命周期、窗口管理、IPC 注册、状态协调中心 |
| `electron/tray.ts` | 菜单栏图标 + 动态状态小点（像素级绘制 RGBA buffer） |
| `electron/voice-bar.ts` | 语音悬浮窗（屏幕底部居中，无边框透明窗口） |
| `electron/summary-popup.ts` | 摘要弹窗（Tray 图标下方弹出，blur 自动关闭） |
| `electron/shortcuts.ts` | 右 Command 监听（uiohook-napi），需辅助功能权限 |
| `electron/recorder.ts` | 录音（Web Audio API via IPC）→ 豆包语音大模型在线转写 |
| `electron/native/key-event-tap/` | Swift Package Manager 项目，原生 macOS 按键事件监听 |
| `src/lib/claude-client.ts` | Claude Agent SDK `query()` 封装，AsyncGenerator 流式处理 |
| `src/lib/doubao-asr.ts` | 豆包流式语音识别 WebSocket 客户端 |
| `src/lib/db.ts` | better-sqlite3 数据层（WAL 模式），execution_history 表 |
| `src/lib/keychain.ts` | API Key 加密存储（Electron safeStorage） |
| `src/lib/store.ts` | 运行时状态机，被 electron 和 Next.js 共享 |

## Commands

```bash
npm run dev              # 开发（Web 模式，无 Electron）
npm run electron:dev     # 开发（Electron 模式）
npm run build            # 构建 Next.js
npm run build:electron   # 构建 Electron 主进程
npm run electron:build   # 生产打包（Electron DMG/ZIP）
npx jest                 # 运行测试
npx jest src/__tests__/store.test.ts  # 运行单个测试文件
npm run rebuild          # 重新编译 native modules
```

## Build Pipeline

1. `next build` → `.next/standalone/` 输出独立服务器
2. `scripts/build-electron.mjs` → esbuild 将 `electron/main.ts` 打包到 `dist-electron/main.js`（native modules + `@anthropic-ai/claude-agent-sdk` 标记为 external）
3. `electron-builder` → 打包 DMG/ZIP，将 `.next/standalone` 和 `.next/static` 作为 extraResources 打入 app，ASAR 解包 `*.node`/`*.dylib`/`*.so`

## Native Dependencies

项目包含多个需要 `@electron/rebuild` 的 native modules:
- `better-sqlite3` — SQLite 绑定
- `uiohook-napi` — 全局键盘/鼠标钩子

修改 `package.json` 中的依赖版本后需运行 `npm run rebuild`。

## Path Aliases

`@/*` 映射到 `./src/*`（在 tsconfig.json、jest.config.ts 和 esbuild alias 中均有配置）。

## Next.js Pages

| 路由 | 用途 |
|------|------|
| `/voice-bar` | 语音悬浮窗 UI |
| `/summary` | 摘要弹窗 UI |
| `/settings` | 设置页（API Key、工作目录、权限模式） |
| `/onboarding` | 首次启动引导 |
| `/api/chat` | Claude 执行入口 |
| `/api/health` | 健康检查（服务器就绪探测） |
| `/api/status` | 运行时状态查询 |

## Client-Side Import Restriction

Next.js 客户端 bundle 禁用了 Node.js 内置模块（`fs`, `path`, `os`, `crypto`, `stream`, `child_process`）和 `electron`。在 `src/components/` 或页面组件中引入这些模块会导致构建失败。需要 Node.js API 的逻辑应放在 API routes 或 `electron/` 中。

## Key Design Decisions

- **voice-bar 和 summary 是按需创建销毁的 BrowserWindow**，不是常驻窗口
- **API Key 使用 Electron safeStorage 加密**，存储在 `~/Library/Application Support/Shrew/secure/` 目录
- **SQLite 数据库存放在 Electron userData 目录** (`~/Library/Application Support/Shrew/shrew.db`)
- **语音识别需要网络连接**：使用火山引擎在线 API，需要配置 App ID 和 Access Token
- **录音使用 Web Audio API**：通过 voice-bar 渲染进程的 getUserMedia + AudioContext 采集麦克风音频，IPC 传回主进程写 WAV 文件，无需外部依赖
- **语音识别使用豆包流式语音识别模型 2.0**（火山引擎在线 API），通过 WebSocket 二进制协议通信
