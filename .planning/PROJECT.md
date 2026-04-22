# Shrew

## What This Is

Shrew 是一个 macOS 桌面应用（macOS 13+），通过语音快捷入口驱动 Claude Code 执行任务。用户按下右 Command 键唤起语音输入，说出指令后通过本地语音识别转文字，再调用 Claude Agent SDK 执行，菜单栏实时显示状态反馈。目标用户是需要频繁与 Claude Code 交互的开发者。

## Core Value

按下右 Command，说一句话，Claude 帮你干活——最小交互完成 AI 辅助编程。

## Requirements

### Validated

- ✓ Electron + Next.js standalone 混合架构 — existing (electron/main.ts, src/)
- ✓ 菜单栏 Tray + 像素级动态状态小点 — existing (electron/tray.ts)
- ✓ 两层状态机（应用状态机 + SDK 子状态） — existing (src/lib/store.ts)
- ✓ SQLite WAL 数据层（execution_history） — existing (src/lib/db.ts)
- ✓ API Key 加密存储（Electron safeStorage） — existing (src/lib/keychain.ts)
- ✓ sherpa-onnx SenseVoice 本地语音识别封装 — existing (src/lib/sherpa.ts)
- ✓ Claude Agent SDK query() 封装，AsyncGenerator 流式处理 — existing (src/lib/claude-client.ts)
- ✓ 语音悬浮窗（无边框透明窗口） — existing (electron/voice-bar.ts)
- ✓ 摘要弹窗（Tray 图标下方弹出） — existing (electron/summary-popup.ts)
- ✓ 全局键盘监听（uiohook-napi 右 Command） — existing (electron/shortcuts.ts)
- ✓ 录音管理（macOS afrecord） — existing (electron/recorder.ts)
- ✓ 设置页（API Key、工作目录、权限模式） — existing (src/app/settings/)
- ✓ 首次启动引导（onboarding） — existing (src/app/onboarding/)
- ✓ IPC 通信框架 — existing (electron/main.ts)

### Active

- [ ] 打包成可安装可运行的 DMG（electron-builder 配置正确）
- [ ] 完整的语音→Claude 流程在打包后应用中端到端工作
- [ ] 首次启动引导流程完整可用（权限→模型下载→API Key→cwd→完成）
- [ ] 错误处理和降级方案在各场景下正确工作

### Out of Scope

- 完整对话 UI（消息流、代码块渲染、工具调用详情） — v2
- 文字输入框（静音场景） — v2
- 确认模式（工具调用弹窗确认） — v2
- 多会话管理 — v2
- 自定义快捷键设置 — v2
- Windows 支持 — v2
- 自动更新 — 后续版本

## Context

- **设计文档**: `docs/superpowers/specs/2026-04-22-shrew-design.md` — 完整产品规格（交互流程、状态系统、数据模型、错误处理）
- **实现计划**: `docs/superpowers/plans/2026-04-22-shrew-implementation.md` — 4 阶段 13 任务详细实现方案
- **Native 依赖**: better-sqlite3, sherpa-onnx-node, uiohook-napi 需要 @electron/rebuild
- **构建管线**: next build → standalone → esbuild electron → electron-builder DMG
- **当前构建产物**: `Shrew/release/` 中有旧的 DMG（valkyrie-app 时代），需用当前代码重新构建
- **开发模式**: `npm run electron:dev` 可正常运行
- **打包模式**: 未用当前代码成功构建过 DMG

## Constraints

- **平台**: macOS 13+ (Ventura)，Apple Silicon + Intel
- **Native Modules**: better-sqlite3, sherpa-onnx-node, uiohook-napi 需要为 Electron 重新编译
- **语音模型**: SenseVoice Small ONNX Int8 量化约 230MB，延迟加载
- **权限**: 辅助功能权限（全局快捷键）、麦克风权限（录音）
- **安全**: API Key 使用 Electron safeStorage 加密存储

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Electron + Next.js standalone 混合 | Next.js 提供 UI 框架能力，Electron 管理窗口和系统交互 | — Pending |
| uiohook-napi 替代 Swift N-API addon | 原计划用 Swift CGEventTap addon，实际用 uiohook-napi（更成熟的跨平台方案） | — Pending |
| sherpa-onnx SenseVoice 替代 Whisper | 中文效果更好，Int8 量化模型体积小 | — Pending |
| esbuild 替代 tsc 编译 Electron | 原计划用 tsc -p tsconfig.electron.json，实际用 esbuild 更快 | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-22 after initialization*
