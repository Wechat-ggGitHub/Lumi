# Aiva - Claude Code 语音壳子 设计文档

## 概述

Aiva 是一个 macOS 桌面应用，通过语音快捷入口驱动 Claude Code 执行任务，并在菜单栏提供状态反馈和执行摘要。

**核心理念**：用语音 + 最少交互完成"说一句话，Claude 帮你干活"的体验。

## 技术栈

| 层 | 选型 | 说明 |
|---|------|------|
| 桌面框架 | Electron 35+ | Main process 管理窗口、全局快捷键、Tray |
| 前端 | Next.js 15 standalone + React 19 | `utilityProcess.fork` 内嵌，不产生额外 Dock 图标 |
| Claude 交互 | @anthropic-ai/claude-agent-sdk | query() 调用，默认 bypassPermissions |
| 语音识别 | sherpa-onnx + SenseVoice Small ONNX (Int8) | 本地推理，中文优先 |
| 快捷键监听 | Swift N-API addon (CGEventTap) | 监听右 Command 单按，需辅助功能权限 |
| 数据存储 | better-sqlite3 (WAL) + JSON 配置文件 | SQLite 存执行历史元数据，JSON 存设置 |
| API Key 存储 | macOS Keychain (electron safeStorage) | 加密存储，不明文落盘 |

## 系统要求

- **最低 macOS 版本**：macOS 13 (Ventura)
- **硬件**：Apple Silicon (M1+) 或 Intel Mac

## 应用形态

- **Dock 图标**：始终显示，点击打开设置页（API Key、工作目录、权限模式、关于）
- **菜单栏图标**：Aiva logo + 状态小点，常驻
- **语音悬浮窗**：按需弹出，屏幕底部居中（鼠标所在屏幕）
- **摘要弹窗**：点击菜单栏图标后，在图标下方弹出

## 首次启动流程

用户首次打开 Aiva 的完整引导流程：

```
1. 欢迎页
   "Aiva 让你用语音驱动 Claude Code"
   [开始设置]

2. 辅助功能权限引导
   标题："Aiva 需要监听键盘快捷键"
   说明："为了响应右 Command 键唤起语音，Aiva 需要辅助功能权限。
         这与 Raycast、Alfred 等应用所需的权限相同。
         Aiva 只会监听右 Command 键，不会记录任何其他按键。"
   按钮："打开系统设置" → 跳转到 系统设置 → 隐私与安全 → 辅助功能
   用户勾选后自动检测，通过后进入下一步

3. 语音模型下载
   说明："Aiva 使用本地语音识别，需要下载约 230MB 的模型文件"
   进度条 + 下载速度显示
   失败时：重试按钮 + "跳过，稍后下载"（跳过后语音功能不可用，菜单栏提示）

4. API Key 配置
   输入框 + "验证"按钮
   说明："需要 Anthropic API Key 来调用 Claude。Key 将安全存储在 macOS 钥匙串中。"
   验证通过后进入下一步

5. 工作目录设置
   默认：~/Documents
   可浏览选择其他目录
   说明："Claude Code 将在此目录下执行命令"

6. 完成
   "设置完成！按下右 Command 开始使用 Aiva"
   [完成]
```

## 核心交互流程

### 语音输入

```
用户按下右 Command
    │
    ▼
屏幕底部弹出悬浮窗（~600x120px），开始录音
显示波形动画 + "正在聆听..."
    │
    ▼
用户再次按下右 Command（或 VAD 静音超时 2 秒）
    │
    ▼
停止录音 → sherpa-onnx (SenseVoice) 本地转文字
显示 loading + "识别中..."
    │
    ▼
转写完成 → 文字显示在输入框中
显示：文字内容 + 麦克风图标（追加语音）+ 发送按钮
    │
    ▼
用户操作：
  · 按右 Command → 追加语音（文字插入到光标位置）
  · 手动编辑文字
  · Enter / 点击发送 → 确认发送
  · Esc → 关闭悬浮窗，丢弃内容
    │
    ▼
发送 → 悬浮窗关闭 → 菜单栏蓝色脉冲
    │
    ▼
POST /api/chat → Claude Agent SDK query()
    │
    ▼
执行完成 → 菜单栏绿色 3 秒 → 恢复灰色
```

### 右 Command 在不同状态下的行为

| 当前状态 | 按右 Command 的效果 |
|---|---|
| idle | 开始录音（弹出悬浮窗） |
| recording | 停止录音，开始转写 |
| transcribing | 无操作（等待转写完成） |
| editing | 追加语音（录音 → 转写 → 插入光标位置） |
| executing | 中断当前执行（通过 AbortController） |

无歧义：每个状态下的右 Command 行为不同，不会冲突。

### 快捷键规则

- 应用运行时（菜单栏有 Aiva 图标）右 Command 可唤起语音
- 应用退出时快捷键自动注销
- VAD 静音超时默认 2 秒，用户可在设置中调整（1-5 秒）

## 状态系统

### 两层状态架构

**第一层：应用状态机**（控制 UI 流程）

```
idle → recording → transcribing → editing → sending → executing → idle
                                               ↘ error → idle
```

**第二层：SDK 执行子状态**（executing 状态下的内部细分）

executing 状态下，Claude SDK 会发出不同类型的子事件。这些子事件不改变应用状态机（始终是 executing），只影响菜单栏小点的 tooltip 内容。

### 菜单栏状态小点

用户只关心三件事：**Aiva 在干活吗？干完了？出问题了？**

| 应用状态 | SDK 子状态（如有） | 小点 | 用户感知 |
|---|---|---|---|
| idle | - | 灰色静态 | 没事，Aiva 待命中 |
| recording | - | 灰色 | 录音中 |
| transcribing | - | 灰色 | 识别中 |
| editing | - | 灰色 | 编辑中 |
| sending | - | 蓝色脉冲 | 发送中 |
| executing | thinking | 蓝色脉冲 | Aiva 在想 |
| executing | executing_tool | 蓝色脉冲 + tooltip 显示工具名 | Aiva 在干活 |
| executing | compacting | 蓝色脉冲 | Aiva 在整理（用户不用管） |
| idle | completed（刚完成） | 绿色静态，3秒后回灰 | 搞定了 |
| idle | failed | 红色静态 | 出错了，点我看详情 |
| executing | rate_limited | 黄色闪烁 | 等一下，API 太频繁 |
| executing | authenticating | 黄色闪烁 | 正在连接 |
| idle | cancelled | 灰色 | 中断了，恢复待命 |

### 状态映射逻辑

- **蓝色** = 正在干活（executing 状态下的所有子状态统一为蓝色脉冲）
- **绿色** = 搞定了（短暂显示 3 秒后渐变回灰色）
- **红色** = 出错了（需要用户关注，点击查看详情）
- **黄色** = 卡住了（限流/认证等等待状态）
- **灰色** = 待命（空闲/录音/转写/编辑/已中断）

## 摘要弹窗

点击菜单栏图标 → 在图标正下方弹出（~360px 宽）：

```
┌─────────────────────────────────────┐
│  ● 执行中 / ● 完成 / ● 出错         │
├─────────────────────────────────────┤
│                                     │
│  "帮我新建一个 React 项目"           │  ← 用户指令
│                                     │
│  已创建 my-app 目录，安装了          │  ← 摘要（取 SDKResultMessage.result）
│  React + TypeScript 依赖。          │
│                                     │
│  耗时 32s  ·  使用了 5 个工具        │
│                                     │
├─────────────────────────────────────┤
│  最近 5 条                          │
│  · 创建 React 项目        ●  32s    │
│  · 修复登录 Bug           ●  1m12s  │
│  · 重构 API 层            ●  失败    │
│  · ...                              │
└─────────────────────────────────────┘
```

- 摘要来源：`SDKResultMessage.result`（Claude 自己总结的执行结果），不需要额外 AI 调用
- 点击外部自动关闭
- 执行中时摘要实时更新（通过 SSE 或 IPC 推送 SDK 子状态）

## 数据模型

### SQLite（better-sqlite3, WAL 模式）

只存元数据，完整消息由 SDK 自带 persistSession 管理：

```sql
CREATE TABLE execution_history (
  id TEXT PRIMARY KEY,
  sdk_session_id TEXT,              -- 关联 SDK session，支持 resume
  cwd TEXT NOT NULL,                 -- 执行时的工作目录
  user_prompt TEXT NOT NULL,         -- 用户原始输入
  summary TEXT,                      -- SDKResultMessage.result
  cost_usd REAL,                     -- 执行费用
  duration_ms INTEGER,               -- 执行时长
  num_turns INTEGER,                 -- 工具调用轮次
  status TEXT NOT NULL DEFAULT 'running',  -- running|completed|failed|cancelled
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME
);
CREATE INDEX idx_execution_history_created ON execution_history(created_at DESC);
```

### JSON 配置文件

路径：`~/Library/Application Support/Aiva/settings.json`

```json
{
  "shortcut": "right_cmd",
  "voiceModel": "sensevoice",
  "claudePermissionMode": "bypassPermissions",
  "defaultCwd": "~/Documents",
  "vadTimeout": 2,
  "theme": "system"
}
```

### API Key 存储

使用 Electron 的 `safeStorage` API 加密后存入 macOS Keychain，不明文落盘。

## 安全设计

### 权限模式选择

首次启动时用户可选择：
- **信任模式**（默认）：`bypassPermissions`，Claude 直接执行，无需确认
- **确认模式**：每次工具调用需用户在弹窗中确认（v2 实现，MVP 只提供信任模式）

### MVP 安全边界

- **工作目录限制**：Claude 只在用户配置的 cwd 目录下操作
- **风险告知**：首次启动引导中明确说明信任模式的风险
- **执行记录**：所有执行操作记录在 SQLite，可回溯审计
- **中断能力**：任何时候可按右 Command 中断执行

### 错误处理策略

| 失败场景 | 处理方式 |
|---|---|
| 辅助功能权限未授予 | 引导页持续显示，快捷键不可用。菜单栏显示"请完成设置" |
| 语音模型未下载 | 语音功能不可用，菜单栏点击提示"请下载语音模型" |
| 语音模型加载失败 | 显示错误提示 + 重试按钮。降级：提示用户用文字输入（v2） |
| 录音失败（无麦克风权限） | 弹出系统麦克风权限请求。拒绝后提示 |
| 语音识别返回空 | 悬浮窗显示"未检测到语音，请重试"，保持 editing 状态 |
| API Key 无效/过期 | 菜单栏红色 + 弹窗提示"API Key 无效，请检查设置" |
| 网络断开 | 菜单栏黄色 + 提示"网络连接中断" |
| Claude SDK 执行超时 | 5 分钟无响应自动中断，标记为 failed |
| Claude SDK 执行失败 | 记录错误信息到 execution_history，菜单栏红色 |
| SQLite 数据库损坏 | 自动备份损坏文件 → 重建空数据库 → 提示用户 |
| native module 加载失败 | 启动时检测，失败则提示用户重新安装 |

## 项目结构

```
Aiva/
├── electron/
│   ├── main.ts                # Electron 主进程：窗口管理、生命周期
│   ├── tray.ts                # 菜单栏 Tray + 状态小点管理
│   ├── voice-bar.ts           # 语音悬浮窗创建/销毁/通信
│   ├── summary-popup.ts       # 摘要弹窗创建/定位/通信
│   ├── shortcuts.ts           # 右 Cmd 监听（Swift addon 桥接）
│   ├── recorder.ts            # 录音 → sherpa-onnx 转写
│   └── native/                # Swift N-API addon 源码
│       ├── Package.swift
│       └── Sources/KeyEventTap.swift
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── chat/route.ts        # Claude Agent SDK 交互
│   │   │   └── status/route.ts      # 运行时状态查询
│   │   ├── voice-bar/
│   │   │   └── page.tsx             # 语音悬浮窗 UI
│   │   ├── summary/
│   │   │   └── page.tsx             # 摘要弹窗 UI
│   │   └── settings/
│   │       └── page.tsx             # 设置页（API Key、cwd、权限模式）
│   ├── lib/
│   │   ├── claude-client.ts         # Claude Agent SDK 封装
│   │   ├── sherpa.ts                # sherpa-onnx 调用封装
│   │   ├── db.ts                    # SQLite 操作
│   │   ├── store.ts                 # 运行时状态管理（两层状态机）
│   │   └── keychain.ts             # API Key 安全存储
│   └── components/
│       ├── VoiceInput.tsx            # 语音输入 + 编辑组件
│       ├── SummaryPanel.tsx          # 摘要面板组件
│       └── Onboarding.tsx           # 首次启动引导组件
├── models/                           # 语音模型存放目录
│   └── sensevoice-small-int8.onnx
├── package.json
├── next.config.ts
├── electron-builder.yml
└── tsconfig.json
```

## 关键技术决策

### 1. 右 Command 监听

自建 Swift N-API addon，使用 `CGEventTap` 监听：
- 键码 `0x36` = 右 Command，`0x37` = 左 Command
- 需要辅助功能权限，首次启动时引导用户开启
- 引导流程：说明页 → 打开系统设置 → 用户勾选 → 回到 app → 验证通过
- 只监听 keydown/keyup 事件，不记录按键内容

### 2. Electron + Next.js standalone

参考 CodePilot 的 `utilityProcess.fork` 模式：
- `next build` 输出 standalone
- `utilityProcess.fork(serverPath)` 启动，随机端口
- `waitForServer()` 轮询 health check
- 冷启动约 3-5 秒，先展示 loading spinner
- 为后期扩展完整对话 UI 保留框架能力

### 3. 语音识别

sherpa-onnx + SenseVoice Small ONNX (Int8 量化)：
- 模型约 230MB，首次启动时下载，存放在 `~/Library/Application Support/Aiva/models/`
- 中文效果优于 Whisper
- M1/M2 Mac 上 10 秒音频约 0.5-1 秒转写
- 自带 VAD（语音端点检测），默认静音超时 2 秒
- 通过 `sherpa-onnx-node` Node.js binding 调用
- 需为 Electron 重新编译 native module（使用 `@electron/rebuild`）
- 延迟加载：应用启动时不加载模型，首次使用语音时才加载

### 4. Claude Agent SDK

```typescript
const queryOptions = {
  cwd: settings.defaultCwd,
  permissionMode: 'bypassPermissions',
  allowDangerouslySkipPermissions: true,
  abortController,
};

for await (const msg of query({ prompt, options: queryOptions })) {
  // 处理 SDKAssistantMessage, SDKResultMessage, SDKToolProgressMessage 等
}
```

- 天然支持流式（AsyncGenerator）
- `SDKResultMessage.result` 直接用作摘要
- `SDKToolProgressMessage.tool_name` + `elapsed_time_seconds` 用于执行进度
- 执行中可通过 `abortController.abort()` 中断
- 执行超时 5 分钟自动中断

### 5. 多显示器支持

悬浮窗在鼠标当前所在的屏幕底部居中弹出，通过 `screen.getDisplayNearestPoint(screen.getCursorScreenPoint())` 定位。

## MVP 范围

**包含**：
- 首次启动引导（权限 → 模型下载 → API Key → cwd → 完成）
- 右 Command 唤起语音条 + 语音追加 + 编辑确认
- 菜单栏状态小点（灰/蓝/绿/红/黄）
- 摘要弹窗（最近执行记录 + 摘要）
- 设置页（API Key 管理、默认 cwd、权限模式）
- Claude Agent SDK 默认危险模式执行
- 错误处理和降级方案

**不包含（后续版本）**：
- 完整对话 UI（消息流、代码块渲染、工具调用详情）
- 文字输入框（静音场景）
- 确认模式（工具调用弹窗确认）
- 多会话管理
- 自定义快捷键设置
- Windows 支持
