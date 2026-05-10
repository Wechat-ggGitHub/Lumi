# Voice Bar UI 重构 + 静音 Bug 修复 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复底部语音条的"看不见"问题，并消除"唤醒后说一句、停 3 秒、不发到 agent"的体验黑洞。

**Architecture:** 用统一的 `voice:state` IPC 取代 3 个旧通道；voice bar 状态机由 main 进程驱动，VoiceInput 渲染层做无业务的纯展示；ASR 失败/网络错误必须有用户可见反馈；recording 加 8 秒绝对超时兜底，避免 VAD 卡死。

**Tech Stack:** Electron 主进程 (TypeScript) + Next.js 15 React 19 渲染端 + sherpa-onnx VAD + 豆包 ASR + jest/ts-jest（仅 node 环境，无 React testing-library）

**Spec:** `docs/superpowers/specs/2026-05-07-voice-bar-ui-and-silence-bug-design.md`

---

## File Structure

修改/创建的文件清单：

| 文件 | 操作 | 责任 |
|------|------|------|
| `src/types/index.ts` | 修改（IPC 类型） | 删除 `voice:start-recording`、`voice:continuous-chat-hint`，新增 `voice:state` |
| `src/lib/store.ts` | 修改 | `transition` 失败时 `log.warn` |
| `src/__tests__/store.test.ts` | 修改 | 新增"transition 拒绝时打 warn"测试 |
| `src/components/VoiceInput.tsx` | 重写 | 5 状态分支渲染（recording/transcribing/too-short/error） |
| `src/app/voice-bar/page.tsx` | 不动 | 仅作为容器，无逻辑改动 |
| `electron/voice-bar.ts` | 修改 | 删除 `showHint()`（连续对话不再有 hint 视觉） |
| `electron/voice-endpoint.ts` | 修改 | VAD `threshold` 0.5 → 0.6 |
| `electron/main.ts` | 修改 | 录音 8s 兜底超时 + IPC 重构 + ASR 错误反馈 + 删除 hint 调用 |

---

## Task 1: 扩展 IPC 类型定义

**Files:**
- Modify: `src/types/index.ts:115-203`（IpcMessages 接口）

- [ ] **Step 1: 编辑 IpcMessages 接口，替换 voice 通道**

打开 `src/types/index.ts`，找到 `// IPC 消息类型` 这块（约 115 行起）。

**删除这两行**（120-123 行附近）：
```ts
  // main -> voice-bar
  'voice:start-recording': void;
  'voice:volume': { volume: number };
  'voice:continuous-chat-hint': { remaining: number };
```

**替换为**：
```ts
  // main -> voice-bar
  'voice:state': {
    state: 'recording' | 'transcribing' | 'too-short' | 'error' | 'hidden';
    message?: string;
  };
  'voice:volume': { volume: number };
```

保留 `'voice:cancel': void;`（在 voice-bar -> main 区段，别动）。

- [ ] **Step 2: 验证 TypeScript 编译**

Run: `cd /Users/rikiwang/Documents/Agent/Aiva/Aiva && npx tsc --noEmit -p tsconfig.json`
Expected: 一定会报错——`voice:start-recording` 和 `voice:continuous-chat-hint` 仍在 `electron/main.ts`、`src/components/VoiceInput.tsx` 中被引用。**这是预期的，会在后续 task 中清理**。先记下报错文件名，确认没漏。

- [ ] **Step 3: 跳过 commit（这一步会暂时让代码编译失败，等后续任务一起 commit）**

**注意**：本任务不立即 commit。我们要让 task 1-3 一起完成后才 commit，避免中间状态构建失败。如果工作流要求每任务必须 commit，可以先跳过 type 修改，等到 task 6 再做。

---

## Task 2: store.transition 失败时打 warn + 测试

**Files:**
- Modify: `src/lib/store.ts:1`（加 import）、`src/lib/store.ts:40-66`（transition 方法）
- Modify: `src/__tests__/store.test.ts`（新增一条测试）

- [ ] **Step 1: 写失败测试**

打开 `src/__tests__/store.test.ts`，找到现有的 `test('invalid transitions are ignored', ...)`（约第 28 行）。

在它**下面**新增一条测试（紧接其后）：

```ts
test('invalid transitions log a warning', () => {
  const store = new AivaStore();
  const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

  store.transition('executing'); // idle -> executing is invalid

  expect(warnSpy).toHaveBeenCalledWith(
    expect.stringContaining('store.transition rejected: idle → executing')
  );
  warnSpy.mockRestore();
});
```

- [ ] **Step 2: 跑测试，确认失败**

Run: `cd /Users/rikiwang/Documents/Agent/Aiva/Aiva && npx jest src/__tests__/store.test.ts -t "invalid transitions log a warning"`
Expected: FAIL — `expect(warnSpy).toHaveBeenCalledWith(...)` 不通过（因为 store 还没打 warn）

- [ ] **Step 3: 修改 store.ts 加 warn**

打开 `src/lib/store.ts`。

**第 1 行后面**加 import：

```ts
import type { AppState, SdkSubState, DotColor } from '@/types';
import { log } from './logger';
```

把第 40-42 行的 `transition` 方法开头：

```ts
  transition(newState: AppState): void {
    const allowed = VALID_TRANSITIONS[this._appState];
    if (!allowed.includes(newState)) return;
```

**改为**：

```ts
  transition(newState: AppState): void {
    const allowed = VALID_TRANSITIONS[this._appState];
    if (!allowed.includes(newState)) {
      log.warn(`store.transition rejected: ${this._appState} → ${newState}`);
      return;
    }
```

- [ ] **Step 4: 跑测试，确认通过**

Run: `cd /Users/rikiwang/Documents/Agent/Aiva/Aiva && npx jest src/__tests__/store.test.ts`
Expected: 全部 PASS（包括新加的"invalid transitions log a warning"和原有的"invalid transitions are ignored"）

- [ ] **Step 5: 验证 logger 在 jest 下不爆炸**

`src/lib/logger.ts` 中 `_logDir` 默认 null，未 initLogger 时会跳过文件写、只走 `console.warn`。我们的测试 mock 了 `console.warn`，所以正常工作。Run 一次完整 jest 确认：

Run: `cd /Users/rikiwang/Documents/Agent/Aiva/Aiva && npx jest`
Expected: 全部 PASS。

- [ ] **Step 6: Commit**

```bash
cd /Users/rikiwang/Documents/Agent/Aiva/Aiva
git add src/lib/store.ts src/__tests__/store.test.ts
git commit -m "$(cat <<'EOF'
feat(store): warn-log invalid transitions

Silent rejection in store.transition was a debugging blind spot — any
state-machine misuse vanished without trace. Now logs via the shared
logger so future regressions show up in ~/.aiva/logs.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

Expected: commit 成功，无 hook 失败。

---

## Task 3: VoiceEndpoint 调整 VAD 阈值

**Files:**
- Modify: `electron/voice-endpoint.ts:42-49`（Vad 配置块）

- [ ] **Step 1: 修改 threshold**

打开 `electron/voice-endpoint.ts`。

第 42-49 行（Vad 实例化）：

```ts
    this.vad = new Vad({
      sileroVad: {
        model: path.join(resourcesDir, 'silero_vad.onnx'),
        threshold: 0.5,
        minSpeechDuration: this.minDuration,
        minSilenceDuration: this.silenceTimeout,
        maxSpeechDuration: this.maxDuration,
        windowSize: 512,
      },
```

把 `threshold: 0.5` 改为 `threshold: 0.6`。其余不动。

- [ ] **Step 2: 验证编译**

Run: `cd /Users/rikiwang/Documents/Agent/Aiva/Aiva && npx tsc --noEmit -p tsconfig.electron.json`
Expected: 无报错（仅这个文件改动，与 IPC 无关）

- [ ] **Step 3: Commit**

```bash
cd /Users/rikiwang/Documents/Agent/Aiva/Aiva
git add electron/voice-endpoint.ts
git commit -m "$(cat <<'EOF'
fix(voice): raise VAD threshold to 0.6 to ignore breath/ambient noise

Logs from 2026-05-07 showed VAD failing to auto-finalize for ~9s after
user stopped speaking; root cause is sub-threshold ambient sound keeping
the speech state alive. 0.6 is a conservative bump; can be lowered if
quiet-voiced users complain.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

Expected: commit 成功。

---

## Task 4: voice-bar.ts 删除 showHint 方法

**Files:**
- Modify: `electron/voice-bar.ts:49-58`（删除 showHint 方法）

- [ ] **Step 1: 删除方法**

打开 `electron/voice-bar.ts`，找到第 49-58 行的 `showHint()` 方法：

```ts
  /** 显示呼吸灯提示（连续对话待机），小尺寸 */
  showHint(): void {
    if (!this.win || this.win.isDestroyed()) {
      this.preCreate();
    }
    this.win!.setSize(120, 6);
    const pos = this.centerPosition(120, 6);
    this.win!.setPosition(pos.x, pos.y);
    this.win!.showInactive();
  }

```

**整段删除**（包括前面的 JSDoc 注释和后面的空行）。

- [ ] **Step 2: 验证编译**

Run: `cd /Users/rikiwang/Documents/Agent/Aiva/Aiva && npx tsc --noEmit -p tsconfig.electron.json`
Expected: **会报错**——`electron/main.ts` 中 `voiceBar.showHint()` 调用还在。预期，会在 Task 8 中清理。先记下错误，继续。

- [ ] **Step 3: 暂不 commit**

这个改动会和 Task 8 一起 commit（因为它们是同一个语义变化的两端）。先把改动留在工作区。

---

## Task 5: 重写 VoiceInput 组件

**Files:**
- Rewrite: `src/components/VoiceInput.tsx`

- [ ] **Step 1: 全文替换**

打开 `src/components/VoiceInput.tsx`，**全文替换**为以下内容：

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';

type VoiceState = 'recording' | 'transcribing' | 'too-short' | 'error';

type VoiceStatePayload = {
  state: VoiceState | 'hidden';
  message?: string;
};

type VoiceInputProps = {
  onCancel: () => void;
};

const BAR_COUNT = 5;
const RECORDING_BASE = [6, 10, 14, 8, 12];

export function VoiceInput({ onCancel }: VoiceInputProps) {
  const [state, setState] = useState<VoiceState>('recording');
  const [message, setMessage] = useState<string>('在听…');
  const volumeRef = useRef(0);
  const barRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const animFrameRef = useRef<number>(0);

  // IPC: voice:state 切换状态；voice:volume 喂音量
  useEffect(() => {
    const { ipcRenderer } = require('electron');
    const onState = (_: unknown, payload: VoiceStatePayload) => {
      if (payload.state === 'hidden') return; // hidden 由窗口 hide 处理，不进入渲染
      setState(payload.state);
      if (payload.message !== undefined) setMessage(payload.message);
    };
    const onVolume = (_: unknown, data: { volume: number }) => {
      volumeRef.current = data.volume;
    };
    ipcRenderer.on('voice:state', onState);
    ipcRenderer.on('voice:volume', onVolume);
    return () => {
      ipcRenderer.removeListener('voice:state', onState);
      ipcRenderer.removeListener('voice:volume', onVolume);
    };
  }, []);

  // 仅 recording 状态用音量驱动 5 根条；其它状态走静态 / CSS 动画
  useEffect(() => {
    if (state !== 'recording') return;
    const tick = () => {
      const v = volumeRef.current;
      for (let i = 0; i < BAR_COUNT; i++) {
        const el = barRefs.current[i];
        if (!el) continue;
        const base = RECORDING_BASE[i];
        const amp = base + v * 8 * Math.sin((Date.now() / 120) + i);
        const h = Math.max(3, Math.min(14, amp));
        el.style.height = `${h}px`;
      }
      animFrameRef.current = requestAnimationFrame(tick);
    };
    animFrameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [state]);

  // ESC 关闭（仅 recording / error 允许；transcribing / too-short 不可中断）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && (state === 'recording' || state === 'error')) {
        onCancel();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel, state]);

  const showClose = state === 'recording' || state === 'error';
  const barColor =
    state === 'recording' ? '#4CAF50'
    : state === 'transcribing' ? '#7AA8FF'
    : state === 'too-short' ? '#cfa44a'
    : '#ff6b6b';
  const messageColor =
    state === 'error' ? '#ff8b8b'
    : state === 'too-short' ? 'rgba(255,255,255,0.55)'
    : '#e6e6ec';

  return (
    <>
      <style>{`
        @keyframes vbWaveSlow { from { height:4px } to { height:10px } }
      `}</style>
      <div style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 10,
        background: 'rgb(28, 28, 35)',
        borderRadius: 14,
        padding: '10px 14px',
        boxShadow: '0 4px 24px rgba(0, 0, 0, 0.4)',
        color: messageColor,
        fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif',
        fontSize: 13,
        transition: 'opacity 200ms ease',
      }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 2, height: 14 }}>
          {Array.from({ length: BAR_COUNT }).map((_, i) => (
            <span
              key={i}
              ref={(el) => { barRefs.current[i] = el; }}
              style={{
                width: 2,
                borderRadius: 1,
                background: barColor,
                display: 'block',
                height: state === 'recording' ? `${RECORDING_BASE[i]}px`
                  : state === 'transcribing' ? '4px'
                  : state === 'too-short' ? (i === 2 ? '6px' : '4px')
                  : (i === 2 ? '8px' : '4px'),
                animation: state === 'transcribing'
                  ? `vbWaveSlow 0.9s ease-in-out ${i * 0.12}s infinite alternate`
                  : 'none',
              }}
            />
          ))}
        </div>
        <span>{message}</span>
        {showClose && (
          <button
            onClick={onCancel}
            style={{
              width: 18,
              height: 18,
              borderRadius: '50%',
              border: 'none',
              background: 'rgba(255,255,255,0.08)',
              cursor: 'pointer',
              padding: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginLeft: 4,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.20)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; }}
          >
            <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
              <path d="M1 1L7 7M7 1L1 7" stroke="rgba(255,255,255,0.55)" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        )}
      </div>
    </>
  );
}
```

- [ ] **Step 2: 验证 Next.js 编译**

Run: `cd /Users/rikiwang/Documents/Agent/Aiva/Aiva && npx tsc --noEmit -p tsconfig.json`
Expected: 仍报 `voice:start-recording` 等错误（来自 main.ts），但 VoiceInput.tsx 自身应无错误。如果只看 `src/components/VoiceInput.tsx` 这一个文件无错就 OK。

- [ ] **Step 3: 暂不 commit**

VoiceInput 的改动需要和 main.ts 的 IPC 重构一起提交，否则中间状态主进程仍在发 `voice:start-recording`，组件却只听 `voice:state`，会造成"看不到任何状态"。和 Task 8/9 一起 commit。

---

## Task 6: main.ts 加入录音绝对超时基础设施

**Files:**
- Modify: `electron/main.ts:55-56`（模块级变量声明区）
- Modify: `electron/main.ts:283-297`（destroyWakeWord 函数）

- [ ] **Step 1: 加模块级变量与清理函数**

打开 `electron/main.ts`，找到第 55-56 行：

```ts
let continuousChatTimer: ReturnType<typeof setTimeout> | null = null;
let fadeOutTimer: ReturnType<typeof setTimeout> | null = null;
```

**在它们下面新增**：

```ts
let recordingTimeoutTimer: ReturnType<typeof setTimeout> | null = null;
let voiceBarHideTimer: ReturnType<typeof setTimeout> | null = null;

function clearRecordingTimeoutTimer(): void {
  if (recordingTimeoutTimer) {
    clearTimeout(recordingTimeoutTimer);
    recordingTimeoutTimer = null;
  }
}

function clearVoiceBarHideTimer(): void {
  if (voiceBarHideTimer) {
    clearTimeout(voiceBarHideTimer);
    voiceBarHideTimer = null;
  }
}
```

`recordingTimeoutTimer` 用于 8s 录音兜底；`voiceBarHideTimer` 用于 too-short / error 状态显示完后隐藏 voice bar。

- [ ] **Step 2: 在 destroyWakeWord 里清理 timers**

找到 `destroyWakeWord()` 函数（第 283-297 行附近）。在 `voiceEndpoint?.destroy()` 块之后**新增**：

```ts
  clearRecordingTimeoutTimer();
  clearVoiceBarHideTimer();
```

完整改后的 `destroyWakeWord` 应为：

```ts
function destroyWakeWord(): void {
  stopWakeWord();
  if (wakeWordEngine) {
    wakeWordEngine.destroy();
    wakeWordEngine = null;
  }
  if (audioListener) {
    audioListener.destroy();
    audioListener = null;
  }
  if (voiceEndpoint) {
    voiceEndpoint.destroy();
    voiceEndpoint = null;
  }
  clearRecordingTimeoutTimer();
  clearVoiceBarHideTimer();
}
```

- [ ] **Step 3: 验证编译**

Run: `cd /Users/rikiwang/Documents/Agent/Aiva/Aiva && npx tsc --noEmit -p tsconfig.electron.json`
Expected: 引入了未使用的函数会被 ts-strict 报错？检查输出。如果 strict 报"unused"则忽略到 Task 7 调用即可，否则 OK。

- [ ] **Step 4: 暂不 commit**

继续 Task 7。

---

## Task 7: main.ts 重写 startRecordingSession（发 voice:state + 启动 8s 超时）

**Files:**
- Modify: `electron/main.ts:318-354`（startRecordingSession 函数）
- Modify: `electron/main.ts:323`（silenceTimeout fallback 3 → 2）
- Modify: `electron/main.ts:495`（startContinuousChat 中同样的 fallback 3 → 2）

- [ ] **Step 1: 改默认 silenceTimeout fallback**

第 323 行：

```ts
  const timeout = settings.wakeWordSilenceTimeout ?? 3;
```

改为：

```ts
  const timeout = settings.wakeWordSilenceTimeout ?? 2;
```

第 495 行同样的改动（`startContinuousChat` 中也有一行）。

- [ ] **Step 2: 重写 startRecordingSession 函数体**

第 318-354 行整个函数：

```ts
function startRecordingSession(trigger: 'wake-word' | 'shortcut' | 'continuous-chat'): void {
  log.info(`开始录音 (trigger: ${trigger})`);
  if (audioListener) audioListener.setMode('recording');

  const settings = loadSettings();
  const timeout = settings.wakeWordSilenceTimeout ?? 2;

  if (voiceEndpoint) voiceEndpoint.destroy();
  voiceEndpoint = new VoiceEndpoint({
    silenceTimeout: timeout,
    minDuration: 0.5,
    maxDuration: 30,
  });

  try {
    voiceEndpoint.init();
  } catch (err) {
    log.error('VoiceEndpoint 初始化失败:', err);
    if (audioListener) audioListener.setMode('wake-word');
    voiceEndpoint.destroy();
    voiceEndpoint = null;
    resumeWakeWord();
    return;
  }

  voiceEndpoint.setCallbacks(
    (wavPath) => onRecordingComplete(wavPath),
    () => onRecordingTooShort(),
    (volume) => voiceBar.send('voice:volume', { volume }),
  );
  voiceEndpoint.start();

  voiceBar.show();
  voiceBar.send('voice:start-recording');
  store.transition('recording');
  updateTrayDot();
}
```

**替换为**：

```ts
function startRecordingSession(trigger: 'wake-word' | 'shortcut' | 'continuous-chat'): void {
  log.info(`开始录音 (trigger: ${trigger})`);
  clearVoiceBarHideTimer();
  if (audioListener) audioListener.setMode('recording');

  const settings = loadSettings();
  const timeout = settings.wakeWordSilenceTimeout ?? 2;

  if (voiceEndpoint) voiceEndpoint.destroy();
  voiceEndpoint = new VoiceEndpoint({
    silenceTimeout: timeout,
    minDuration: 0.5,
    maxDuration: 30,
  });

  try {
    voiceEndpoint.init();
  } catch (err) {
    log.error('VoiceEndpoint 初始化失败:', err);
    if (audioListener) audioListener.setMode('wake-word');
    voiceEndpoint.destroy();
    voiceEndpoint = null;
    resumeWakeWord();
    return;
  }

  voiceEndpoint.setCallbacks(
    (wavPath) => onRecordingComplete(wavPath),
    () => onRecordingTooShort(),
    (volume) => voiceBar.send('voice:volume', { volume }),
  );
  voiceEndpoint.start();

  voiceBar.show();
  voiceBar.send('voice:state', { state: 'recording', message: '在听…' });
  store.transition('recording');
  updateTrayDot();

  // 8s 绝对超时兜底：避免 VAD 卡死永不收尾
  clearRecordingTimeoutTimer();
  recordingTimeoutTimer = setTimeout(() => {
    log.warn('录音绝对超时（8s），强制 finish');
    recordingTimeoutTimer = null;
    if (voiceEndpoint) voiceEndpoint.finish();
  }, 8000);
}
```

变化点：
1. 函数开头清掉 voiceBarHideTimer（避免上一轮 too-short/error 的延迟 hide 把这一轮的 voice bar 关掉）
2. 第 23 行 `voiceBar.send('voice:start-recording')` 改成 `voice:state` payload
3. 末尾启动 8s `recordingTimeoutTimer`

- [ ] **Step 3: 验证编译**

Run: `cd /Users/rikiwang/Documents/Agent/Aiva/Aiva && npx tsc --noEmit -p tsconfig.electron.json`
Expected: 还会报 `showHint` 与其它发送点未改的错。预期，继续。

- [ ] **Step 4: 暂不 commit**

Task 8/9/10 一起 commit。

---

## Task 8: main.ts 重写 onRecordingComplete + onRecordingTooShort

**Files:**
- Modify: `electron/main.ts:386-410`（onRecordingComplete）
- Modify: `electron/main.ts:412-425`（onRecordingTooShort）

- [ ] **Step 1: 重写 onRecordingComplete**

找到 `function onRecordingComplete(wavPath: string)`（约第 386 行）。

**整个函数替换为**：

```ts
function onRecordingComplete(wavPath: string): void {
  clearRecordingTimeoutTimer();
  if (voiceEndpoint) { voiceEndpoint.destroy(); voiceEndpoint = null; }
  log.info('录音完成, 开始转写');

  // 切换 voice bar 视觉到 transcribing；不再 hide
  voiceBar.send('voice:state', { state: 'transcribing', message: '识别中…' });
  store.transition('transcribing');
  updateTrayDot();

  recorder.transcribeFile(wavPath).then(text => {
    log.info('转写结果:', text || '(空)');
    if (text) {
      // 成功路径：交给 executePrompt（其内部会在 thinking 时关闭 voice bar）
      executePrompt(text, true);
    } else {
      // ASR 成功但识别为空：显示 too-short 1.2s
      voiceBar.send('voice:state', { state: 'too-short', message: '没听清' });
      clearVoiceBarHideTimer();
      voiceBarHideTimer = setTimeout(() => {
        voiceBarHideTimer = null;
        voiceBar.hide();
        voiceBar.send('voice:state', { state: 'hidden' });
      }, 1200);
      store.transition('idle');
      updateTrayDot();
      resumeWakeWord();
    }
  }).catch(err => {
    log.error('转写失败:', err);
    try { fs.unlinkSync(wavPath); } catch {}
    // ASR 失败：显示 error 2s
    voiceBar.send('voice:state', { state: 'error', message: '识别失败' });
    clearVoiceBarHideTimer();
    voiceBarHideTimer = setTimeout(() => {
      voiceBarHideTimer = null;
      voiceBar.hide();
      voiceBar.send('voice:state', { state: 'hidden' });
    }, 2000);
    store.transition('idle');
    updateTrayDot();
    resumeWakeWord();
  });
}
```

变化点：
1. 入口 `clearRecordingTimeoutTimer()`（如果 8s 超时之前 VAD 自然收尾了，清掉兜底 timer）
2. 不再 `voiceBar.hide()`，改为发送 `voice:state` transcribing
3. ASR 空文本分支：显示 too-short 1.2s（之前是静默回 idle）
4. ASR 失败分支：显示 error 2s（之前是静默回 idle，用户看不到错误）

- [ ] **Step 2: 重写 onRecordingTooShort**

找到 `function onRecordingTooShort()`（约第 412 行）。

**整个函数替换为**：

```ts
function onRecordingTooShort(): void {
  clearRecordingTimeoutTimer();
  if (voiceEndpoint) { voiceEndpoint.destroy(); voiceEndpoint = null; }
  log.info('录音太短，忽略');

  voiceBar.send('voice:state', { state: 'too-short', message: '没听清' });
  clearVoiceBarHideTimer();
  voiceBarHideTimer = setTimeout(() => {
    voiceBarHideTimer = null;
    voiceBar.hide();
    voiceBar.send('voice:state', { state: 'hidden' });
    if (store.continuousChatWindow) {
      // 连续对话期间静默期保持 audioListener 在 continuous-chat 模式
      if (audioListener) audioListener.setMode('continuous-chat');
    } else {
      store.transition('idle');
      updateTrayDot();
      resumeWakeWord();
    }
  }, 1200);
}
```

变化点：相比原版（直接 close 或 hide 不显示反馈），现在统一显示 too-short 视觉 1.2s 再隐藏。连续对话场景的 audioListener 切换在 hide 之后做，避免静默期没监听。

- [ ] **Step 3: 验证编译**

Run: `cd /Users/rikiwang/Documents/Agent/Aiva/Aiva && npx tsc --noEmit -p tsconfig.electron.json`
Expected: 此时仅剩 `startContinuousChat` 中的 `voiceBar.showHint()` 和 `voice:start-recording` 报错，由 Task 9 清理。

- [ ] **Step 4: 暂不 commit**

继续 Task 9。

---

## Task 9: main.ts 重写 startContinuousChat（删除 hint）

**Files:**
- Modify: `electron/main.ts:481-537`（startContinuousChat 函数）

- [ ] **Step 1: 替换函数体**

找到 `function startContinuousChat(): void`（约第 481 行）。

**整个函数替换为**：

```ts
function startContinuousChat(): void {
  log.info('进入连续对话模式');
  if (continuousChatTimer) {
    clearTimeout(continuousChatTimer);
    continuousChatTimer = null;
  }

  store.setContinuousChatWindow(true);

  if (audioListener && audioListener.isActive()) {
    audioListener.setMode('continuous-chat');
  }

  const settings = loadSettings();
  const timeout = settings.wakeWordSilenceTimeout ?? 2;

  if (voiceEndpoint) voiceEndpoint.destroy();
  voiceEndpoint = new VoiceEndpoint({
    silenceTimeout: timeout,
    minDuration: 0.5,
    maxDuration: 30,
  });

  try {
    voiceEndpoint.init();
  } catch (err) {
    log.error('连续对话 VAD 初始化失败:', err);
    voiceEndpoint.destroy();
    voiceEndpoint = null;
    return;
  }

  voiceEndpoint.setCallbacks(
    (wavPath) => {
      subtitlePopup.fadeOut();
      fadeOutTimer = setTimeout(() => {
        fadeOutTimer = null;
        onRecordingComplete(wavPath);
      }, 350);
    },
    () => {
      log.info('连续对话: 语音太短，保持监听');
    },
    (volume) => {
      // 连续对话期间 voice bar 默认 hidden；用户开口达到阈值才显示 recording
      if (volume > 0.1 && !voiceBar.isVisible()) {
        voiceBar.show();
        voiceBar.send('voice:state', { state: 'recording', message: '在听…' });
      }
      voiceBar.send('voice:volume', { volume });
    },
  );
  voiceEndpoint.start();

  // 不再调用 voiceBar.showHint()——5 秒静默期保持 hidden
}
```

变化点：
1. 删除 `voiceBar.showHint()` 调用（最后一行）
2. 删除 `voiceBar.send('voice:continuous-chat-hint', { remaining: 5 })` 调用
3. 用户开口的 IPC 从 `voice:start-recording` 改为 `voice:state`

- [ ] **Step 2: 验证 ts 编译全绿**

Run: `cd /Users/rikiwang/Documents/Agent/Aiva/Aiva && npx tsc --noEmit -p tsconfig.electron.json`
Expected: 0 errors（IPC 重构完成）

Run: `cd /Users/rikiwang/Documents/Agent/Aiva/Aiva && npx tsc --noEmit -p tsconfig.json`
Expected: 0 errors（renderer 端类型也对得上了）

如有报错，检查是否还有遗漏的 `voice:start-recording` / `voice:continuous-chat-hint` / `showHint` 引用：

Run: `cd /Users/rikiwang/Documents/Agent/Aiva/Aiva && grep -rn "voice:start-recording\|voice:continuous-chat-hint\|showHint" electron src 2>/dev/null | grep -v "\.next/\|dist-electron/"`
Expected: 输出应为空。

- [ ] **Step 3: 跑测试**

Run: `cd /Users/rikiwang/Documents/Agent/Aiva/Aiva && npx jest`
Expected: 全部 PASS。

- [ ] **Step 4: Commit（一次提交所有 Task 1/4/5/6/7/8/9 的改动）**

到此为止，IPC 重构、VoiceInput 重写、main.ts 状态切换、voice-bar.ts hint 删除、voice-endpoint VAD 阈值 都已串联起来，可以编译可以跑测试。

```bash
cd /Users/rikiwang/Documents/Agent/Aiva/Aiva
git add src/types/index.ts src/components/VoiceInput.tsx \
        electron/main.ts electron/voice-bar.ts
git commit -m "$(cat <<'EOF'
feat(voice): unified voice:state IPC + 8s recording timeout + ASR error UX

Replaces voice:start-recording / voice:continuous-chat-hint with a single
voice:state channel carrying { state, message } so the renderer can render
recording / transcribing / too-short / error / hidden uniformly.

Bug fixes:
- ASR network errors used to silently transition to idle, leaving user
  thinking nothing happened. Now surface as 'error' state for 2s.
- VAD occasionally failed to auto-finalize on noisy environments. Add an
  8s absolute recording timeout that force-finishes the endpoint.
- VoiceEndpoint had no visible UI during transcribing; voice bar now stays
  visible with a blue slow-wave + "识别中…" until ASR returns.

Continuous-chat 5s standby no longer shows a breathing-bar hint — the bar
stays hidden and only appears when the user actually starts speaking.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

Expected: commit 成功。

---

## Task 10: 全量回归 + 手动验证

**Files:** 无代码改动。

- [ ] **Step 1: 全量编译 + 测试**

Run: `cd /Users/rikiwang/Documents/Agent/Aiva/Aiva && npx tsc --noEmit -p tsconfig.json && npx tsc --noEmit -p tsconfig.electron.json && npx jest`
Expected: 全部 PASS。

- [ ] **Step 2: 启动 dev 模式**

Run: `cd /Users/rikiwang/Documents/Agent/Aiva/Aiva && npm run electron:dev`

等到看到 `唤醒词功能已启动` 或 `启动完成` 日志后，进入手动测试。

- [ ] **Step 3: 执行手动验证清单（8 条）**

每条都需要肉眼确认 voice bar 正确显示对应状态：

1. **快捷键正常路径**：右 Option → 说"打开 finder" → 自然停顿 → ✅ 看到绿条+在听… → ✅ 看到蓝条+识别中… → ✅ 主窗口出现这条用户消息
2. **唤醒词正常路径**：说唤醒词 → 说"现在几点" → 自然停顿 ≤2s → ✅ 同上
3. **ASR 错误路径**：开飞行模式 / 拔网线 → 触发 → 说一句 → ✅ 看到红条+识别失败 → ✅ 2s 后自动消失
4. **太短路径**：右 Option 触发后立即按 ESC → ✅ 看到琥珀条+没听清 → ✅ 1.2s 后自动消失
5. **8s 静默兜底**：右 Option 触发后**不说话**等 8 秒 → ✅ voice bar 不再卡住，看到 too-short 或被强制结束
6. **VAD 卡死兜底**：开音乐+触发 → 说一句 → ✅ 8s 内强制 finish 进入 transcribing
7. **连续对话静默期**：完成一轮（含 TTS 朗读）→ TTS 完成后 5s 内 voice bar **不显示** → 直接说下一句 → ✅ 看到绿条出现
8. **连续对话超时**：完成一轮 → 5s 内不说话 → ✅ voice bar 仍然不显示，6s 后唤醒词重新生效

- [ ] **Step 4: 检查日志中是否有意外的 store.transition rejected**

Run: `tail -200 ~/.aiva/logs/aiva-$(date +%Y-%m-%d).log | grep -i "rejected\|error\|warn"`
Expected: 仅有预期的网络错误（如果手动测试 3 触发了），不应有 `store.transition rejected`。如有，说明状态机迁移有遗漏，需修复。

- [ ] **Step 5: 通过 → 推送（可选）**

如果以上全过：

```bash
cd /Users/rikiwang/Documents/Agent/Aiva/Aiva
git status
# 确认 working tree clean
git log --oneline -5
# 确认有 3 个新 commit：spec、store warn、voice 重构
```

如果用户要推送：`git push`。

---

## Self-Review 备注

写完后我自查了一遍：

1. **Spec 覆盖检查**
   - ✅ 5 状态机：Task 5 (VoiceInput) + Task 7/8/9 (main.ts) 覆盖
   - ✅ 视觉规范：Task 5 全部内联实现
   - ✅ IPC 协议（删/增）：Task 1
   - ✅ 8s 兜底超时：Task 6 + Task 7
   - ✅ VAD 阈值 0.5→0.6：Task 3
   - ✅ silenceTimeout 默认 3→2：Task 7（顺手在 startContinuousChat 也改了）
   - ✅ store.transition warn：Task 2
   - ✅ ASR 错误反馈 / 空文本反馈：Task 8
   - ✅ 删除 hint 视觉（startContinuousChat）：Task 9
   - ✅ 测试：单元测试 Task 2；手动测试 Task 10
   - ⚠️ Spec 第 10 节提到 `VoiceInput.test.tsx`：因项目无 React testing-library + jsdom，**改为仅手动验证**，已在 Plan 文件结构与 Task 10 清单中体现

2. **Placeholder 扫描**：无 TBD/TODO，每段代码都完整给出。

3. **类型一致性**：
   - `voice:state` payload `{ state, message? }` 在 IpcMessages、VoiceInput、main.ts 三处一致
   - `recordingTimeoutTimer` / `voiceBarHideTimer` 命名前后一致
   - `clearRecordingTimeoutTimer` / `clearVoiceBarHideTimer` 函数名前后一致

4. **不变式**：
   - 每个 commit 后都能 ts 编译 + jest 通过
   - 中间任务（Task 1/4/5/6/7/8/9）刻意延后到 Task 9 末尾一次性 commit，保证不出现"主进程发新通道但渲染器还听旧通道"的中间状态

---

**完。**
