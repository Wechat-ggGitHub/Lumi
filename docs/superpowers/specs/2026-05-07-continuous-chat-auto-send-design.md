# 连续对话 + 语音条自动发送设计

日期: 2026-05-07

## 概述

两个功能优化，统一通过 AudioListener + VAD 管道实现：
1. **连续对话**：TTS 播报期间及播报后 5 秒内，用户可直接说话继续对话，无需唤醒词或快捷键
2. **语音条简化 + 自动发送**：去掉编辑态，VAD 检测静默后自动发送，voice bar 精简为纯录音指示器

## 方案选择

**方案 A：统一 VAD 管道**（已选定）

所有录音场景（快捷键/唤醒词/连续对话）共用 AudioListener + VoiceEndpoint (VAD) 管道。不再使用 voice-bar renderer 的 AudioCapture。

## AudioListener 模式扩展

当前两种模式（`wake-word` 和 `endpointMode`）扩展为三种：

| 模式 | 触发条件 | 音频去向 | 结束条件 |
|------|---------|---------|---------|
| `wake-word` | 系统空闲（idle） | WakeWordEngine | 检测到唤醒词 → 切到 `recording` |
| `recording` | 唤醒词/快捷键触发 | VoiceEndpoint (VAD) | VAD 静默/手动停止 → 转写发送 |
| `continuous-chat` | TTS 播放中或播完 5 秒内 | VoiceEndpoint (VAD) 直通 | VAD 检测到说话结束 → TTS 淡出 → 转写发送 |

### `continuous-chat` 模式行为

- TTS 播放开始时，AudioListener 从 `wake-word` 切到 `continuous-chat`
- 音频流喂给 VAD（检测用户说话），不喂给唤醒词引擎
- VAD 检测到用户开始说话 → TTS 在 0.3 秒内淡出 → voice bar 出现（波浪动画）
- VAD 检测到说话结束（静默 3 秒）→ 转写 → 直接发送给 Claude
- TTS 自然播放结束 → 保持 `continuous-chat` 模式 5 秒，voice bar 显示呼吸灯
- 5 秒内无说话 → 切回 `wake-word` 模式

### 快捷键触发录音变更

- 按右 Option → AudioListener 切到 `recording` 模式（VAD）
- 不再使用 voice-bar renderer 的 AudioCapture，统一用 AudioListener 音频流
- VAD 检测静默 → 自动结束录音并直接发送
- 快捷键仍可手动停止录音

## Voice Bar UI 重新设计

### 状态与 UI 对应

| 状态 | UI 表现 |
|------|---------|
| 录音中 | 波浪动画（跟随音量实时变化）+ 右侧关闭按钮 (×) |
| 连续对话待机 | 底部细长呼吸灯效果（120×6px，5 秒倒计时渐暗） |
| 空闲 | 不显示 |

### 录音中尺寸

约 200×48px（小而精致，不遮挡内容）

### 波浪动画

- Canvas 绘制正弦波形，振幅随实时音量变化
- 颜色：品牌蓝色调（与 tray dot 一致）
- 流畅过渡

### 关闭按钮

- 半透明 × 图标，hover 变亮
- 点击 → 取消录音，切回 `wake-word` 模式

### 音频来源

Voice-bar renderer 不再用 getUserMedia 录音。AudioListener（隐藏窗口）统一提供音频流。Voice bar 只负责 UI 展示。Voice bar 需要接收实时音量数据用于波浪动画（通过 IPC 从主进程推送）。

## 状态机变更

### 简化状态流

去掉 `editing` 状态：

`idle → recording → transcribing → thinking → executing → completed → idle`

### `completed` 状态变更

- `completed` + `speaking=true` 时，进入 `continuous-chat` 监听模式
- TTS 结束后保持 5 秡 `continuous-chat` 窗口，之后转 `idle`
- 在 `continuous-chat` 窗口内检测到说话 → `recording`（不经过 idle）

### `recording` 状态变更

- VAD 检测到静默自动触发 → `transcribing` → `thinking`（跳过 editing）
- 快捷键仍可手动停止

### `getRightCommandAction()` 变更

- 去掉 `editing` 相关动作
- `speaking` 状态下按右 Option → 停止 TTS + 取消 continuous-chat 窗口 → idle
- `recording` 状态下按右 Option → 手动停止录音（保持现有行为）

### 新增状态标志

- `continuousChatWindow: boolean` — 是否在连续对话窗口内

## 完整交互流程

### 场景 A：唤醒词触发

1. 系统空闲，AudioListener 在 `wake-word` 模式
2. 用户说唤醒词 → WakeWordEngine 检测到 → 切到 `recording` 模式
3. Voice bar 出现（波浪动画），AudioListener 音频流喂给 VAD
4. 用户说话 → VAD 检测静默 → 自动结束录音
5. Voice bar 隐藏，转写 → 直接发送给 Claude
6. Claude 执行中 → 状态 thinking/executing
7. 执行完成 → TTS 播报 → 进入场景 C

### 场景 B：快捷键触发

1. 系统空闲，用户按右 Option
2. AudioListener 切到 `recording` 模式，Voice bar 出现
3. 用户说话 → VAD 检测静默 → 自动结束录音 → 直接发送
4. 执行完成 → TTS 播报 → 进入场景 C

### 场景 C：连续对话（核心新增）

1. TTS 正在播报 Claude 的回复
2. AudioListener 切到 `continuous-chat` 模式（VAD 直通）
3. 用户开口说话 → VAD 检测到语音 → TTS 在 0.3 秒内淡出 → Voice bar 出现
4. 用户说完 → VAD 检测静默 → 转写 → 直接发送
5. 新一轮执行 → TTS 播报 → 回到步骤 2

### 场景 D：连续对话窗口过期

1. TTS 自然播放完毕
2. 保持 `continuous-chat` 模式 5 秒，voice bar 显示呼吸灯
3. 5 秒内用户没说话 → 切回 `wake-word` 模式，voice bar 隐藏
4. 用户需要说唤醒词或按快捷键开始下一轮

## 涉及文件

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `electron/audio-listener.ts` | 重构 | 新增 `continuous-chat` 模式，统一音频流管理 |
| `electron/voice-endpoint.ts` | 小改 | 支持 continuous-chat 模式的 VAD 配置 |
| `electron/main.ts` | 重构 | IPC 注册、状态协调、连续对话窗口管理、TTS 淡出 |
| `electron/voice-bar.ts` | 重构 | 窗口尺寸、状态展示 |
| `electron/recorder.ts` | 重构 | 去掉 voice-bar renderer AudioCapture，用 AudioListener 音频流转写 |
| `electron/tts.ts` | 小改 | 支持淡出（fade out）功能 |
| `electron/subtitle-popup.ts` | 小改 | TTS 淡出实现 |
| `src/lib/store.ts` | 重构 | 去掉 editing 状态，新增 continuousChatWindow 标志 |
| `src/components/VoiceInput.tsx` | 重写 | 简化为纯录音指示器（波浪动画 + 关闭按钮） |
| `src/app/voice-bar/page.tsx` | 小改 | 适配新组件 |
| `src/lib/audio-capture.ts` | 可删除 | 不再在 voice-bar renderer 中录音 |
| `src/types/index.ts` | 小改 | 状态类型更新 |
