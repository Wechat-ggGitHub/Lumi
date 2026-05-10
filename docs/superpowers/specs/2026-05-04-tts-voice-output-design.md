# TTS 语音输出功能设计

## 概述

为 Aiva 添加语音播报能力。当 Agent 完成任务后，通过 TTS 朗读结果摘要，同时在 tray 图标下方弹出字幕面板同步显示文字。目标是打造纯语音交互的 AI 助理体验。

## 需求

- Agent 完成后，自动朗读结果摘要
- 长结果由 Agent 自行判断，整理到文件写入 ~/Desktop/，并简短播报文件位置
- 字幕显示在 tray 图标下方弹出的面板中
- 朗读完毕字幕自动消失
- 右 Command 键中断朗读
- TTS 使用火山引擎（复用现有火山引擎凭证体系）
- TTS 失败时静默降级，不影响主流程

## 数据流

```
Agent 执行完成
  → main.ts 拿到 result.summary
  → 调用 TTS 模块 (electron/tts.ts)
    → 火山引擎 TTS API 合成音频
    → 音频数据写入临时文件
  → 主进程播放音频
  → 同时创建字幕弹窗 (electron/subtitle-popup.ts)
    → tray 图标下方弹出，显示文本
  → 播放完毕 → 字幕弹窗自动关闭
  → 中断：用户按右 Command → 停止播放 + 关闭弹窗
```

## 新增模块

### electron/tts.ts — TTS 服务

- 封装火山引擎 TTS WebSocket API（大模型语音合成 2.0）
- 输入：文本字符串
- 输出：音频临时文件路径
- 支持中断（AbortController）
- 凭证复用火山引擎 App ID + Access Token（keychain 中已有）
- 默认音色：自然女声

### electron/subtitle-popup.ts — 字幕弹窗

- 参考 voice-bar 的窗口管理模式（按需创建/销毁）
- 窗口规格：约 300px 宽，自适应高度
- 位置：tray 图标正下方
- 样式：无边框、半透明背景、毛玻璃效果
- 内容：顶部"Aiva 正在朗读..." + 播放图标 + summary 文本
- 朗读完毕后延迟 1-2 秒淡出关闭

## 现有模块改动

### electron/main.ts

- 在 `executePrompt` 中，`transition('completed')` 之前调用 TTS 模块
- 传入 `result.summary` 作为朗读文本

### electron/shortcuts.ts

- 右 Command 键增加 speaking 状态判断
- 当 `speaking=true` 时，中断朗读 + 关闭字幕，不触发录音

### src/lib/store.ts

- 新增 `speaking: boolean` 属性（默认 false）
- 不作为独立 AppState，而是 completed 状态的附属标记
- 提供 `setSpeaking(value)` 方法

### System Prompt

在发给 Agent 的 system prompt 中增加：

```
当你完成用户指令后，根据结果的复杂度选择交付方式：
- 如果结果是简短说明（如"已更新配置"、"创建完成"），直接用文字回复
- 如果结果较长或包含复杂内容（如代码修改总结、多步骤操作、详细分析），
  将完整内容整理成文件写入 ~/Desktop/ 目录，
  然后用一两句话告诉用户你做了什么以及文件位置
回复时不要使用 Markdown 格式，保持纯文本。
```

## 状态与中断

### speaking 标记

| 状态组合 | 含义 | tray 显示 |
|---------|------|----------|
| completed + speaking=true | 朗读中 | 绿色播放动画 |
| completed + speaking=false | 原有行为 | 绿色静态点 |

### 右 Command 行为表

| 当前状态 | 行为 |
|---------|------|
| idle | 开始录音（现有） |
| recording | 停止录音，转写（现有） |
| speaking | 中断朗读 + 关闭字幕 |
| 其他 | 忽略 |

### 朗读完成流转

- TTS 播放结束 → `speaking=false` → completed 倒计时 2.5s → idle
- TTS 被中断 → 立即 `speaking=false` → 同上

## 错误处理

| 场景 | 处理 |
|------|------|
| TTS API 调用失败 | 静默降级，不朗读，tray 正常显示完成 |
| TTS 返回空音频 | 静默跳过 |
| 字幕窗口创建失败 | 音照播，无字幕 |
| 朗读中用户发起新指令 | 中断朗读 → 关闭字幕 → 进入 recording |

TTS 是增强功能，失败不影响主流程。不需要 toast 或错误弹窗。
