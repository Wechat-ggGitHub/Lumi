# Voice Wake Word Detection Design

## Overview

为 Shrew 新增语音唤醒功能：用户说出分身名称（如"钱钱"）即可唤起语音对话，无需按键。唤醒后自动开始录音，VAD 检测静音 3 秒后自动停止，转入豆包 ASR 转写。体验类似 "Hey Siri"。

## Requirements

1. **唤醒词 = 分身名称**：读取 `~/.shrew/persona/profile.json` 的 `name` 字段（默认 "Shrew"），通常是 2-4 个中文字
2. **纯本地检测**：唤醒词检测必须在本地完成，不发送持续音频到云端
3. **完整体验**：唤醒词触发 → 自动录音 → VAD 自动停止 → 豆包 ASR 转写 → 进入 editing
4. **体验优先**：可接受一定 CPU/内存占用，不影响正常使用即可
5. **默认关闭**：用户需在设置中主动开启
6. **按键并存**：右 Option 键方式完整保留，两种触发方式互不干扰

## Technical Approach: sherpa-onnx Keyword Spotting

使用 [sherpa-onnx](https://github.com/k2-fsa/sherpa) 的 keyword spotting 模式。基于 transducer 模型做流式 ASR，通过关键词文本匹配检测唤醒词。

**选择理由：**
- 专为 keyword spotting 设计，误唤醒率低
- 支持动态关键词——用户改分身名只需更新文本，无需重训练
- 轻量：模型 ~50-80MB，macOS 上 CPU < 5%（Apple Silicon）
- 开源 Apache 2.0，有中文 zipformer 模型

## Architecture

### Audio Pipeline

```
常驻隐藏 BrowserWindow (audio-listener)
  → getUserMedia 持续采集 16kHz mono PCM
  → IPC 流式发送 PCM chunks 到主进程
  → sherpa-onnx keyword spotter 流式检测
  → 匹配到唤醒词
  → 停止 keyword spotting，audio-listener 继续采集
  → voice-bar 弹出（仅 UI 展示）
  → 音频流从 keyword spotter 切换到 WAV 写入（复用 audio-listener，不切换 getUserMedia）
  → VAD 检测静音超时（默认 3s）
  → 停止采集 → WAV → 豆包 ASR 转写
  → 进入 editing 状态
```

**注意：** 录音阶段复用 audio-listener 窗口继续采集，不切换到 voice-bar 的 getUserMedia。voice-bar 仅负责 UI 展示。这样可以避免切换麦克风会话带来的 ~200-500ms 延迟。

### State Machine Integration

仅 `idle` 状态下运行 keyword spotting。检测到唤醒词后：

```
idle --(wake word detected)--> recording
  → keyword spotting stopped
  → voice-bar shown
  → AudioRecorder starts

recording --(VAD silence 3s)--> transcribing
  → audio sent to Doubao ASR

transcribing --(ASR result)--> editing
  → transcript displayed in voice-bar

editing/sending/executing/completed 状态下不运行 keyword spotting
```

### Wake Word Lifecycle

```
应用启动
  → 读取唤醒词设置
  → 如果开启：
      1. 加载 sherpa-onnx 模型
      2. 读取 profile.json 获取唤醒词
      3. 创建 audio-listener 隐藏窗口
      4. 开始持续采集 + keyword spotting
  → 如果未开启：跳过

用户在 /persona 页修改名称
  → IPC wake-word:update-keyword
  → keyword spotter runtime 更新关键词

用户在设置页关闭唤醒词
  → IPC wake-word:toggle(false)
  → 停止 keyword spotting
  → 销毁 audio-listener 窗口
  → 释放模型资源
```

## VAD Design

使用 sherpa-onnx 自带 VAD 模块检测语音活动（减少额外依赖）。

**参数：**
- 静音超时：默认 3 秒（用户可在设置中调整 1-5 秒）
- 最短有效语音：0.5 秒（过滤咳嗽、误触等）
- 最长录音时间：30 秒兜底

**唤醒词后延迟：**
- keyword spotting 触发到开始录音有 ~100-200ms 延迟
- 唤醒词本身不在最终录音中
- 用户说"钱钱，帮我查天气"→ 录音从"帮我查天气"开始
- 用户会自然在唤醒词后停顿，延迟可接受

## New/Modified Files

| 文件 | 变更 | 职责 |
|------|------|------|
| `electron/wake-word.ts` | 新增 | Keyword spotting 引擎（初始化、启停、关键词更新） |
| `electron/audio-listener.ts` | 新增 | 常驻隐藏窗口，持续 getUserMedia 采集 |
| `electron/vad.ts` | 新增 | VAD 逻辑（静音检测、时长限制） |
| `electron/main.ts` | 修改 | 集成唤醒词生命周期、新增 IPC handlers |
| `electron/voice-bar.ts` | 修改 | 支持唤醒词触发的差异化提示 |
| `src/lib/store.ts` | 修改 | 新增 wakeWordEnabled 状态 |
| `src/types/index.ts` | 修改 | 新增唤醒词相关类型定义 |
| `src/app/settings/page.tsx` | 修改 | 新增"语音唤醒"设置区域 |

## New IPC Channels

| 通道 | 方向 | 用途 |
|------|------|------|
| `wake-word:toggle` | renderer → main | 开关唤醒词检测 |
| `wake-word:update-keyword` | renderer → main | 分身名称变更时更新关键词 |
| `wake-word:status` | main → renderer | 引擎状态通知 |
| `audio-listener:pcm-chunk` | renderer → main | 常驻音频流 PCM 数据 |
| `audio-listener:start` | main → renderer | 开始持续采集 |
| `audio-listener:stop` | main → renderer | 停止采集 |

## Settings

在设置页新增"语音唤醒"区域：

- **唤醒词开关**：总开关，默认关闭
- **唤醒词预览**：显示当前唤醒词（= 分身名称），不可编辑（去 /persona 页改）
- **静音超时**：滑块，范围 1-5 秒，默认 3 秒

## Edge Cases

| 场景 | 处理方式 |
|------|----------|
| 用户在视频会议中 | 开启后正常工作，用户自行判断何时开启 |
| 背景噪音误唤醒 | keyword spotter 低误唤醒率；可加二次确认（检测到后等 0.3s 看是否有后续语音） |
| 播放音乐 | VAD 检测到非语音模式，keyword spotter 过滤 |
| 日常对话包含唤醒词（如"钱不够花"含"钱"） | 接受小概率误触发；用户可 Esc 取消 voice-bar |
| 非idle状态 | 不运行 keyword spotting |
| 笔记本合盖/睡眠 | 系统断开麦克风，检测自动停止 |
| 应用最小化/隐藏 | 继续监听，这是核心体验 |
| macOS 锁屏 | 系统级断开麦克风，检测停止 |
| 麦克风权限拒绝 | 唤醒词功能自动关闭，提示用户授权 |

## Build & Packaging

- sherpa-onnx 模型文件（~50-80MB）打包为 extraResources
- `.node` addon 标记为 external + ASAR 解包（与现有 native modules 处理方式一致）
- `electron-builder.yml` 更新 extraResources 和 asarUnpack 配置

## Fallback Plan

如果 sherpa-onnx Node.js binding 在 macOS 上有兼容性问题：
1. 使用 sherpa-onnx 预编译 CLI 二进制，通过 child process + stdin/stdout 传输音频
2. 切换到 Apple SFSpeechRenderer 本地方案

## Resource Expectations

- CPU：Apple Silicon < 5%，Intel Mac < 10%
- 内存：模型加载 ~100-150MB
- 电量：持续麦克风 + 本地推理，预计影响续航 5-10%
