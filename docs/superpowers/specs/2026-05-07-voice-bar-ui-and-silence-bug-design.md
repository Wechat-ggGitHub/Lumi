# Voice Bar UI 重构 + 静音 Bug 修复 — 设计文档

**日期**：2026-05-07
**作者**：riki + Claude
**状态**：待审核

---

## 1. 背景与问题

### 问题 ① — 底部语音条 UI 几乎不可见
当前代码里 voice-bar 的 BrowserWindow 是 `transparent: true` 且页面/容器都没有背景，`VoiceInput.tsx` 也没有承载容器。结果：屏幕上看到的不是一根"语音条"，而是一段悬浮的蓝色波浪 + 一个几乎看不见的 × 按钮（`rgba(255,255,255,0.1)` 背景 + `rgba(255,255,255,0.5)` 文字）。用户主诉"波浪和关闭按钮都没显示在底部语音条上"——**根因是缺承载容器**。

### 问题 ② — "唤醒后说一句、停 3 秒、不发到 agent"
日志（`~/.shrew/logs/shrew-2026-05-07.log`）拉出三段印证：
- **22:38:19 那次**：唤醒 → VAD 在 22:38:29 输出 segment(4.73s) → 转写时豆包 ASR 报 `WebSocket was closed before the connection was established` → 走静默 catch，**voice bar 不显示任何错误**。用户看到的是"啥都没发生"。
- **19:16:52 那次**：唤醒后 VAD **9.73 秒不自动收尾**，最后用户手动按右 Option 才结束。
- **22:12:29 那次**：唤醒后 VoiceEndpoint 启动，再无后续日志（应用被重启）。

### 顺带发现的盲点
- `store.transition` 白名单失败时静默 return 不打日志（`src/lib/store.ts:42`）——以后任何状态机错位都查不到。
- `executePrompt` 调用前主进程 `voiceBar.hide()`，期间没有 transcribing 状态视觉。

---

## 2. 范围

**改动文件**：

| 文件 | 性质 |
|------|------|
| `src/components/VoiceInput.tsx` | 重写 |
| `src/app/voice-bar/page.tsx` | 微调 |
| `electron/voice-bar.ts` | 修 `show()/hide()` 语义 |
| `electron/voice-endpoint.ts` | VAD 阈值与默认 silence |
| `electron/main.ts` | 发送 IPC 重构 + 录音绝对超时 + 错误反馈 |
| `src/lib/store.ts` | transition 失败打 warn |
| `src/types/index.ts` | IPC 类型 |

**不在范围**：
- 唤醒词整体可靠性（噪声触发、误唤醒等，需要单独 brainstorm）
- TTS / 字幕弹窗
- 主窗口动效
- CLAUDE.md / `handleRightCommand` 函数名 / Swift native 包里"右 Command"的命名遗留（不影响功能，留给后续 cleanup）

---

## 3. 状态机

5 个状态，去掉旧的 `hint`（连续对话 5 秒静默期保持 `hidden`，由 main 进程 VAD 在背后听，开口才显示 `recording`）：

| 状态 | 何时进入 | 视觉 | 何时退出 |
|------|----------|------|----------|
| **recording** | 右 Option / 唤醒词命中 / 连续对话期间用户开口（音量 > 0.1） | 5 根 `#4CAF50` 绿条按音量抖动 + "在听…" + × | VAD 收尾 / × / ESC / 右 Option / **8s 兜底超时** |
| **transcribing** | `onRecordingComplete` 入口 | 5 根 `#7AA8FF` 蓝条慢节奏 + "识别中…"（不带 ×） | ASR 成功 text 非空 → hidden（agent 接手）；ASR 失败 → error；ASR 成功但 text 空 → too-short |
| **too-short** | VAD `onTooShort`（segment <0.5s）或 ASR 返回空文本 | 琥珀色 `#cfa44a` 矮线 + "没听清" | 1.2s 自动 → hidden |
| **error** | ASR 抛错 / 网络错误 | 红色 `#ff6b6b` 矮线 + "识别失败" + × | × 或 2s 自动 → hidden |
| **hidden** | 默认 / 所有结束分支 / 连续对话 5s 静默期 | 窗口隐藏 | — |

迁移图：
```
hidden ──(右Option | 唤醒词 | 连续对话开口)──▶ recording
recording ──(VAD 收尾, dur≥0.5s | 8s 兜底, 已有音频)──▶ transcribing
recording ──(VAD 收尾, dur<0.5s | 8s 兜底, 无音频)──▶ too-short ─(1.2s)─▶ hidden
recording ──(× | ESC | voice:cancel)──▶ hidden
transcribing ──(ASR 成功, 非空)──▶ hidden(agent 接手)
transcribing ──(ASR 成功, 空文本)──▶ too-short ─(1.2s)─▶ hidden
transcribing ──(ASR 失败)──▶ error ─(2s | ×)─▶ hidden
```

---

## 4. 视觉规范

继承右上角字幕弹窗 (`src/app/subtitle/page.tsx`) 风格：

| 项 | 值 |
|----|---|
| 容器背景 | `rgb(28, 28, 35)` |
| 圆角 | 14px |
| 阴影 | `0 4px 24px rgba(0, 0, 0, 0.4)` |
| 内边距 | `10px 14px` |
| 字体 | `-apple-system, "SF Pro Text", BlinkMacSystemFont`, 13px, `#e6e6ec` |
| 波浪条 | 5 根 2px 宽圆角竖条，间距 2px，容器高 14px |
| 状态切换 | `opacity 200ms ease` |
| 关闭按钮 | 18×18 圆，`rgba(255,255,255,.08)` 背景，hover `.20` |

各状态的波浪动画：

```css
@keyframes waveBar      { from {height:4px} to {height:14px} }   /* recording */
@keyframes waveBarSlow  { from {height:4px} to {height:10px} }   /* transcribing */

/* recording: 5 根错开 0.1s，时长 0.5s，#4CAF50；amplitude 由实时 volume 调制 */
/* transcribing: 5 根错开 0.12s，时长 0.9s，#7AA8FF；不依赖音量 */
/* too-short:  静态矮线 height 4-6px，#cfa44a */
/* error:      静态矮线 height 4-8px，#ff6b6b */
```

**recording 音量驱动**：保留现有 `voice:volume` 实时音量 IPC，但波浪几何换成 5 根条；`amplitude` 由 `volume` 决定每根条的高度上限（最大 14px）。

**窗口尺寸**：
- recording / transcribing / too-short / error：`200 × 44`（内容居中，高度允许文字+条共存）
- hidden：窗口 hide

---

## 5. IPC 协议

### 删除
| 通道 | 原用途 | 替代 |
|------|--------|------|
| `voice:start-recording` | 通知进入 recording | 改用统一的 `voice:state` |
| `voice:continuous-chat-hint` | 连续对话 hint | 直接删除（不再有 hint 视觉） |

### 新增
```ts
'voice:state': {
  state: 'recording' | 'transcribing' | 'too-short' | 'error' | 'hidden';
  message?: string;  // 状态对应文字，由 main 决定（"在听…" / "识别中…" / "没听清" / "识别失败"）
}
```

### 保留
- `voice:volume` — main → renderer，实时音量
- `voice:cancel` — renderer → main，用户点 ×（已存在）

### 发送时机（main.ts 改动汇总）

| 函数 | 旧行为 | 新行为 |
|------|--------|--------|
| `startRecordingSession` | `voiceBar.show()` + `send('voice:start-recording')` | `voiceBar.show()` + `send('voice:state', {state:'recording', message:'在听…'})` + 启动 8s 兜底 timer |
| `onRecordingComplete` 入口 | `voiceBar.hide()` | `send('voice:state', {state:'transcribing', message:'识别中…'})`，**不再 hide** |
| `onRecordingComplete` ASR 成功非空 | `executePrompt(text, true)` | 同左；额外 `voiceBar.hide()` 在 executePrompt 已有的 `voiceBar.close()` 时机 |
| `onRecordingComplete` ASR 成功空 | 静默 `transition('idle')` | `send('voice:state', {state:'too-short', message:'没听清'})` + 1.2s 后 `voiceBar.hide()` + `transition('idle')` |
| `onRecordingComplete` ASR 失败 catch | 静默 `transition('idle')` | `send('voice:state', {state:'error', message:'识别失败'})` + 2s 后 `voiceBar.hide()` + `transition('idle')` |
| `onRecordingTooShort` | `voiceBar.close()` 或继续 hint | `send('voice:state', {state:'too-short', message:'没听清'})` + 1.2s 后 `voiceBar.hide()` |
| `startContinuousChat` 中 `voiceBar.showHint()` | 显示呼吸 hint | **删除**——保持 voice bar hidden，等用户开口（音量 > 0.1）时再 `voiceBar.show()` + `send('voice:state', recording)` |
| 连续对话用户开口（main.ts:524-528） | `voiceBar.show() + send('voice:start-recording')` | `voiceBar.show() + send('voice:state', recording)` |

---

## 6. 录音绝对超时（8s 兜底）

`startRecordingSession` 启动一个 `recordingTimeoutTimer = setTimeout(..., 8000)`：
- 触发时调用 `voiceEndpoint.finish()`，由 finish 内部分流：
  - 已有音频 ≥ 0.5s → 走 `onComplete` → 进 transcribing
  - 已有音频 < 0.5s → 走 `onTooShort` → 进 too-short
- 一旦 `onComplete` / `onTooShort` 被触发（无论 VAD 自然收尾还是手动 finish），都在回调入口 `clearTimeout(recordingTimeoutTimer)`，避免重复触发。
- voiceEndpoint.destroy() 时也应该清掉该 timer。

代码位置：`electron/main.ts` 顶层加一个模块级变量 `let recordingTimeoutTimer: NodeJS.Timeout | null`，配套 `clearRecordingTimeout()`。

---

## 7. VoiceEndpoint 调参

`electron/voice-endpoint.ts`：
- `threshold`: `0.5` → `0.6`（更不敏感于环境噪声 / 呼吸声）
- `silenceTimeout` 默认值（构造函数 fallback）保持 3，但 `loadSettings().wakeWordSilenceTimeout` 默认从 3 改为 **2**（在 `electron/main.ts:323/495` 读取处）
- `minDuration`: 维持 0.5
- `maxDuration`: 维持 30（兜底 8s 早于 30s，所以 30 实际不会触发，但保留作为 VAD 内部 fallback）

---

## 8. Store 调试日志

`src/lib/store.ts` 第 40-42 行：

```ts
transition(newState: AppState): void {
  const allowed = VALID_TRANSITIONS[this._appState];
  if (!allowed.includes(newState)) {
    log.warn(`store.transition rejected: ${this._appState} → ${newState}`);
    return;
  }
  // ...
}
```

需要 `import { log } from './logger'`（已存在 logger 模块）。

---

## 9. VoiceInput 组件重写

`src/components/VoiceInput.tsx` 重写为单一 `state` 状态分支渲染：

```tsx
type VoiceState = 'recording' | 'transcribing' | 'too-short' | 'error';

// 监听 voice:state，setState
// 监听 voice:volume，更新 volumeRef
// 渲染：
//   外层容器（统一 rgb(28,28,35) + 圆角 14 + 阴影）
//   左侧 5 根条（按 state 选 className）
//   中间 message 文字
//   右侧 × 按钮（仅 recording / error 显示）
```

`hidden` 状态由窗口 hide 实现，不进入渲染分支。

---

## 10. 测试与验证

### 单元/集成测试
- `src/__tests__/store.test.ts`：新增"transition 拒绝时打 warn"测试
- `src/components/VoiceInput.test.tsx`（新增）：4 个状态各渲染一次，断言 className / 文字 / 是否有 × 按钮

### 手动验证清单
1. **快捷键正常路径**：右 Option → 说话 → 自然停顿 → 看到 transcribing → 主窗口出现用户消息和 agent 回答 ✅
2. **唤醒词正常路径**：说唤醒词 → 说指令 → 自然停顿 ≤2s → 同上 ✅
3. **错误路径**：拔网线 → 触发 → 说话 → 看到 "识别失败" 红条 → 2s 自动消失 ✅
4. **太短路径**：触发后立即 ESC / × → 看到 "没听清" 琥珀条 → 1.2s 自动消失 ✅
5. **静默兜底**：触发后完全不说话 → 8s 后看到 too-short 或 error，不再卡 30s ✅
6. **VAD 卡死兜底**：开嘈杂环境（开音乐）触发 → 8s 兜底强制收尾 → 进 transcribing ✅
7. **连续对话**：完成一轮对话 → 5s 内不显示任何 voice bar → 直接说下一句 → 看到 recording ✅
8. **5s 窗口超时**：完成一轮对话 → 5s 内不说 → 6s 后 voice bar 不出现，唤醒词重新生效 ✅

### 验证成功标准
- 上述 8 条手动测试全过
- 现有 `npx jest` 全绿
- 日志里无新的 `store.transition rejected` warn（除调试期外）

---

## 11. Trade-offs 与已知风险

- **VAD `threshold` 0.5→0.6**：可能对**说话音量较小**的用户不友好，导致语音被当噪声漏过。后续可暴露到设置项。
- **`silenceTimeout` 默认 3→2**：把"自然停顿"窗口压短，急性子用户更顺畅，但慢说话者可能在中途被收尾。可观察后调。
- **8s 绝对超时**：偏激进，但比 30s 体验好太多。若发现长指令被切断，再调到 12s。
- **统一 `voice:state` IPC**：替换 3 个旧通道（删除 `voice:start-recording`、`voice:continuous-chat-hint`，调整 `voice:volume` 不变）。会有一阵子需要保证发送/接收两端同步改造，单 PR 一次性提交。
- **不修 CLAUDE.md / 函数命名遗留**：`handleRightCommand` 函数名仍写"Cmd"，CLAUDE.md 仍有"右 Command"描述。本 spec 不动，留给后续 cleanup。

---

## 12. 不变式

- IPC 仍以单向 main → renderer 为主（仅 `voice:cancel` 反向）
- 状态机仍由 `store` 集中维护
- VoiceInput 不直接调用任何 main 进程函数，只通过 IPC

---

**完。等待用户审核。**
