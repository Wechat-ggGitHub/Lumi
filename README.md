<h1 align="center">Lumi</h1>

<p align="center"><strong>住在你菜单栏的 AI Agent。</strong></p>

<p align="center">语音优先，随时唤起，懂你记你。</p>

<p align="center">
<img src="https://img.shields.io/badge/macOS-13%2B-informational" />
<img src="https://img.shields.io/badge/Electron-35-blue" />
<img src="https://img.shields.io/badge/Next.js-15-black" />
<img src="https://img.shields.io/badge/license-MIT-green" />
</p>

<p align="center">
<img src="assets/banner.png" alt="Lumi Banner" width="800" />
</p>

Lumi 是一个 macOS 原生桌面语音 AI 助手。住在菜单栏里，你说它听，它干活——查资料、写代码、操作系统，还能记住你们聊过的每一件事。

## Demo

https://github.com/Wechat-ggGitHub/Lumi/releases/download/v0.1.0-alpha/Demo1.mp4

## 功能特性

### 语音优先交互

说出来就是指令。Lumi 通过 sherpa-onnx 实时监听，火山引擎 ASR 转写你说的话，AI 处理完再通过 TTS 语音回复。你甚至不需要看屏幕——透明字幕弹窗会实时显示回复内容。支持 continuous chat 模式，说完一句自动接着听下一句。

### 随时唤起

两种方式，随你选择：

- **快捷键**：默认 Right Option 一键唤起录音，松开即发送
- **唤醒词**：呼唤 AI 的名字，它就会开始听你说话

### 个性化性格与分身

通过 Persona 系统定制 AI 的性格、说话风格和行为方式。每个人设是一个 Markdown 文件，支持自定义头像。你可以创建多个分身——工作助手、创意伙伴、学习教练，随时切换。

### 技能系统

给 AI 装上技能。通过 Markdown 或 Zip 文件导入技能包，让 AI 学会使用特定工具、遵循特定流程。内置技能目录管理，启用/禁用一键切换。

### 记忆系统

AI 会自动记住你每天聊了什么。每日记忆自动写入，核心记忆定期评估，越用越懂你。你可以随时回顾历史记忆，了解 AI 记住了哪些关于你的事。

### 多 Provider 支持

支持 13 个 AI 后端，按需切换：

- **官方**：Anthropic (Claude)
- **国内服务商**：GLM（国内/国际）、DeepSeek、Moonshot (Kimi)、MiniMax（国内/国际）、通义千问（百炼）、火山引擎（豆包）、小米 MiMo
- **聚合平台**：OpenRouter、SiliconFlow

语音服务同样支持多供应商：火山引擎（豆包语音）和阿里云百炼（Paraformer ASR + CosyVoice TTS），ASR 和 TTS 可独立选择不同供应商。

### 菜单栏常驻

不占 Dock 位，不抢桌面空间。Lumi 安静地住在菜单栏里，托盘图标的状态指示点实时反映当前状态：灰色空闲、蓝色思考、绿色完成、红色出错。

## 快速开始

### 环境要求

- macOS 13.0+
- Node.js 18+
- Xcode Command Line Tools（用于编译原生模块）

### 安装与运行

```bash
git clone https://github.com/Wechat-ggGitHub/Lumi.git
cd Lumi
npm install
npm run electron:dev
```

### 构建

```bash
npm run electron:build
```

构建产物在 `release/` 目录下。

### 可用脚本

| 脚本 | 说明 |
|---|---|
| `npm run electron:dev` | 开发模式，Next.js + Electron 同时启动 |
| `npm run electron:build` | 完整构建并打包 DMG |
| `npm run build:electron` | 仅编译 Electron 主进程 |
| `npm run build` | 仅构建 Next.js |

## 技术架构

### 整体架构

Electron 主进程在随机端口 spawn Next.js 15 standalone 服务器，通过 IPC（而非 REST API）连接前后端。生产环境下，Next.js 作为子进程运行在 Electron 内部。

```
┌─────────────────────────────────────────┐
│              Electron Main              │
│                                         │
│  ┌─────────────┐  ┌──────────────────┐  │
│  │  Tray +      │  │  Voice Pipeline  │  │
│  │  Shortcuts   │  │  (ASR/TTS/VAD)   │  │
│  └─────────────┘  └──────────────────┘  │
│                                         │
│  ┌─────────────────────────────────────┐│
│  │         Next.js 15 (embedded)       ││
│  │    BrowserWindow ←→ IPC ←→ Main    ││
│  └─────────────────────────────────────┘│
└─────────────────────────────────────────┘
```

### 语音管线

```
AudioListener → WakeWordEngine (sherpa-onnx)
             → VoiceEndpoint (VAD 静音检测)
             → AudioRecorder (录音)
             → ASR Provider (火山引擎 / 阿里云百炼)
             → Claude Agent SDK (AI 处理)
             → TTS Provider (火山引擎 / 阿里云百炼)
             → SubtitlePopup (字幕弹窗)
```

### 状态机

```
idle → recording → transcribing → thinking → executing → completed → idle
```

### 目录结构

```
Lumi/
├── electron/                  # Electron 主进程
│   ├── main.ts                # 核心编排（窗口、状态机、语音管线、IPC）
│   ├── tray.ts                # 菜单栏托盘 + 状态指示点
│   ├── shortcuts.ts           # 全局快捷键
│   ├── recorder.ts            # 音频录制 + ASR
│   ├── tts.ts                 # TTS + 句子解析
│   ├── voice-providers/       # 语音供应商抽象层
│   ├── voice-bar.ts           # 浮动语音录制指示条
│   ├── subtitle-popup.ts      # 透明字幕弹窗
│   ├── wake-word.ts           # sherpa-onnx 唤醒词引擎
│   ├── audio-listener.ts      # 麦克风音频流监听
│   └── native/                # Swift 原生模块（键盘事件拦截）
├── src/
│   ├── app/
│   │   ├── (main)/            # 主窗口页面（chat/memory/persona/skills/settings）
│   │   └── (transparent)/     # 透明弹窗（字幕、语音条）
│   ├── components/            # UI 组件
│   ├── lib/                   # 共享库（状态管理、AI 客户端、记忆、技能）
│   └── types/                 # TypeScript 类型定义
├── resources/                 # 应用资源（图标、sherpa-onnx 模型）
└── scripts/                   # 构建脚本
```

### 技术栈

| 层 | 技术 |
|---|---|
| 桌面框架 | Electron 35 |
| 前端 | Next.js 15、React 19、TypeScript |
| 样式 | Tailwind CSS |
| 语音引擎 | sherpa-onnx（唤醒词 + VAD） |
| 语音识别 | 火山引擎 ASR、阿里云百炼 Paraformer |
| 语音合成 | 火山引擎 TTS、阿里云百炼 CosyVoice |
| AI 执行 | Claude Agent SDK |
| 数据库 | better-sqlite3 |
| 原生模块 | Swift（键盘事件拦截）、uiohook-napi |
| 打包 | electron-builder（DMG） |

## 路线图

- [ ] **意图分流** — 自动判断任务复杂度，简单问答走快速响应，复杂任务才启动 Agent 全套工具链，兼顾速度与能力
- [ ] **语音先应答** — AI 开始执行任务前先用语音回应，让交互更自然，不再沉默处理完才说话
- [ ] **屏幕感知** — 监听鼠标所在区域，AI 能理解当前屏幕上下文，基于你正在看的内容进行对话和操作
- [ ] **音色选择与克隆** — 支持切换不同 TTS 音色，以及上传少量样本克隆自定义声音

## License

MIT
