# 连续对话 + 语音条自动发送 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现连续对话（TTS 播报期间免唤醒继续聊）和语音条简化（VAD 自动发送，去掉编辑态）

**Architecture:** 统一 AudioListener + VoiceEndpoint (VAD) 管道处理所有录音场景。AudioListener 新增三种模式（wake-word / recording / continuous-chat）。状态机去掉 editing 状态。Voice bar 简化为纯录音指示器。

**Tech Stack:** Electron, Next.js 15, sherpa-onnx-node (VAD), React 19, Canvas (波浪动画)

---

## File Structure

| 文件 | 变更 | 职责 |
|------|------|------|
| `src/types/index.ts` | 修改 | 去掉 editing，新增 IPC 类型 |
| `src/lib/store.ts` | 修改 | 去掉 editing，新增 continuousChatWindow，更新 RightCommandAction |
| `src/__tests__/store.test.ts` | 修改 | 适配新状态流 |
| `electron/audio-listener.ts` | 修改 | 新增模式管理（wake-word/recording/continuous-chat） |
| `electron/voice-endpoint.ts` | 修改 | 新增音量回调用于波浪动画 |
| `electron/voice-bar.ts` | 修改 | 新尺寸，多状态展示 |
| `electron/recorder.ts` | 修改 | 新增直接从 WAV 文件转写的方法 |
| `electron/tts.ts` | 修改 | 不变（淡出在 subtitle-popup 实现） |
| `electron/subtitle-popup.ts` | 修改 | 新增 fadeOut 方法 |
| `src/components/VoiceInput.tsx` | 重写 | 波浪动画 + 关闭按钮 |
| `src/app/voice-bar/page.tsx` | 修改 | 适配新 VoiceInput |
| `src/lib/audio-capture.ts` | 删除 | 不再需要 |
| `electron/main.ts` | 修改 | 连续对话模式管理，统一录音管道 |

---

### Task 1: Update types — 去掉 editing，新增 IPC 类型

**Files:**
- Modify: `src/types/index.ts`

- [ ] **Step 1: 更新 AppState 类型**

`src/types/index.ts` — 将 `AppState` 中的 `'editing'` 去掉：

```typescript
export type AppState =
  | 'idle'
  | 'recording'
  | 'transcribing'
  | 'thinking'
  | 'executing'
  | 'completed'
  | 'error';
```

- [ ] **Step 2: 更新 IpcMessages，新增音量推送和连续对话 IPC**

在 `IpcMessages` 中：
- 删除 `'voice:start-capture'`, `'voice:stop-capture'`, `'voice:capture-started'`, `'voice:audio-data'`, `'voice:request-append'`
- 新增 `'voice:volume'`（主进程推音量给 voice-bar）
- 新增 `'voice:continuous-chat-hint'`（通知 voice-bar 显示呼吸灯）
- 修改 `'voice:start-recording'` 为不需要参数（不再由 voice-bar 录音）

```typescript
// main -> voice-bar (新增)
'voice:volume': { volume: number }; // 实时音量 0-1

// main -> voice-bar (连续对话呼吸灯)
'voice:continuous-chat-hint': { remaining: number }; // 剩余秒数
```

- [ ] **Step 3: Commit**

```bash
git add src/types/index.ts
git commit -m "refactor: remove editing state, add continuous-chat IPC types"
```

---

### Task 2: Update store — 去掉 editing，新增 continuousChatWindow

**Files:**
- Modify: `src/lib/store.ts`

- [ ] **Step 1: 更新 VALID_TRANSITIONS**

去掉 `editing` 行，更新相关状态的允许转换：

```typescript
const VALID_TRANSITIONS: ValidTransitions = {
  idle: ['recording', 'thinking'],
  recording: ['transcribing', 'idle'],
  transcribing: ['thinking', 'idle'],
  thinking: ['executing', 'completed', 'error', 'idle'],
  executing: ['completed', 'error', 'idle'],
  completed: ['idle', 'thinking', 'recording'],
  error: ['idle'],
};
```

关键变化：
- `transcribing` 现在直接转 `thinking`（跳过 editing）
- 去掉 `editing` 行

- [ ] **Step 2: 更新 RightCommandAction 类型和 getRightCommandAction()**

去掉 `'append-recording'`，新增 `'stop-speaking-and-cancel-chat'`：

```typescript
export type RightCommandAction =
  | 'start-recording'
  | 'stop-recording'
  | 'none'
  | 'cancel-execution'
  | 'stop-speaking';
```

更新 `getRightCommandAction()`：

```typescript
getRightCommandAction(): RightCommandAction {
  if (this._speaking) return 'stop-speaking';
  switch (this._appState) {
    case 'idle':
    case 'completed': return 'start-recording';
    case 'recording': return 'stop-recording';
    case 'transcribing': return 'none';
    case 'thinking':
    case 'executing': return 'cancel-execution';
    default: return 'none';
  }
}
```

- [ ] **Step 3: 新增 continuousChatWindow 标志**

在 AivaStore 中新增：

```typescript
private _continuousChatWindow: boolean = false;

get continuousChatWindow(): boolean { return this._continuousChatWindow; }

setContinuousChatWindow(value: boolean): void {
  this._continuousChatWindow = value;
  this.notify();
}
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/store.ts
git commit -m "refactor: remove editing state, add continuousChatWindow flag"
```

---

### Task 3: Update store tests — 适配新状态流

**Files:**
- Modify: `src/__tests__/store.test.ts`

- [ ] **Step 1: 更新测试用例**

将所有经过 `editing` 的测试路径改为直接 `transcribing → thinking`。

```typescript
test('transition: idle → recording → transcribing → thinking', () => {
  const store = new AivaStore();
  store.transition('recording');
  expect(store.appState).toBe('recording');

  store.transition('transcribing');
  expect(store.appState).toBe('transcribing');

  // 直接到 thinking，不再经过 editing
  store.transition('thinking');
  expect(store.appState).toBe('thinking');
});

test('transition: idle → thinking → executing → completed → idle', () => {
  const store = new AivaStore();
  store.transition('thinking');
  store.transition('executing');
  store.transition('completed');
  expect(store.appState).toBe('completed');
});
```

- [ ] **Step 2: 更新 rightCommand 测试**

去掉 `editing` 相关断言，新增 `continuousChatWindow` 测试：

```typescript
test('rightCommand behavior per state', () => {
  const store = new AivaStore();

  expect(store.getRightCommandAction()).toBe('start-recording');

  store.transition('recording');
  expect(store.getRightCommandAction()).toBe('stop-recording');

  store.transition('transcribing');
  expect(store.getRightCommandAction()).toBe('none');

  // 不再经过 editing，直接 transcribing → thinking
  store.transition('thinking');
  store.transition('executing');
  expect(store.getRightCommandAction()).toBe('cancel-execution');
});

test('continuousChatWindow flag', () => {
  const store = new AivaStore();
  expect(store.continuousChatWindow).toBe(false);

  store.setContinuousChatWindow(true);
  expect(store.continuousChatWindow).toBe(true);
});
```

- [ ] **Step 3: Run tests**

Run: `npx jest src/__tests__/store.test.ts`
Expected: all PASS

- [ ] **Step 4: Commit**

```bash
git add src/__tests__/store.test.ts
git commit -m "test: update store tests for new state flow without editing"
```

---

### Task 4: Update VoiceEndpoint — 新增音量回调

**Files:**
- Modify: `electron/voice-endpoint.ts`

- [ ] **Step 1: 新增 onVolume 回调和 volume 计算**

在 `VoiceEndpoint` 中新增：

```typescript
private onVolume: ((volume: number) => void) | null = null;

setCallbacks(
  onComplete: (wavPath: string) => void,
  onTooShort: () => void,
  onVolume?: (volume: number) => void,
): void {
  this.onComplete = onComplete;
  this.onTooShort = onTooShort;
  this.onVolume = onVolume ?? null;
}
```

在 `feed()` 方法中，每次接收音频后计算 RMS 音量并回调：

```typescript
feed(samples: Float32Array): void {
  if (!this.vad) return;

  this.chunks.push(samples);
  this.vad.acceptWaveform(samples);

  // 计算实时音量 (RMS)
  if (this.onVolume) {
    let sum = 0;
    for (let i = 0; i < samples.length; i++) {
      sum += samples[i] * samples[i];
    }
    const rms = Math.sqrt(sum / samples.length);
    const volume = Math.min(1, rms * 5); // 放大映射到 0-1
    this.onVolume(volume);
  }

  // ... 后续 VAD 逻辑不变
```

- [ ] **Step 2: Commit**

```bash
git add electron/voice-endpoint.ts
git commit -m "feat: add volume callback to VoiceEndpoint for wave animation"
```

---

### Task 5: Update AudioListener — 新增模式管理

**Files:**
- Modify: `electron/audio-listener.ts`

- [ ] **Step 1: 新增 ListenerMode 类型和模式管理**

在 AudioListener 中新增：

```typescript
export type ListenerMode = 'wake-word' | 'recording' | 'continuous-chat';

export class AudioListener {
  private win: Electron.BrowserWindow | null = null;
  private capturing = false;
  private chunkHandler: ((chunk: Float32Array) => void) | null = null;
  private _mode: ListenerMode = 'wake-word';

  get mode(): ListenerMode { return this._mode; }

  setMode(mode: ListenerMode): void {
    this._mode = mode;
    log.info(`AudioListener: 模式切换为 ${mode}`);
  }
  // ... 其余不变
```

- [ ] **Step 2: Commit**

```bash
git add electron/audio-listener.ts
git commit -m "feat: add ListenerMode to AudioListener"
```

---

### Task 6: Update recorder — 新增 transcribeFile 方法

**Files:**
- Modify: `electron/recorder.ts`

- [ ] **Step 1: 新增 transcribeFile 方法**

Recorder 不再需要通过 voice-bar renderer 录音，但仍需要转写功能。新增一个直接转写 WAV 文件路径的方法：

```typescript
async transcribeFile(wavPath: string): Promise<string> {
  return this.transcribe(wavPath);
}
```

注意：现有的 `transcribe(audioPath)` 已经接受文件路径并做清理，这里 `transcribeFile` 只是提供一个更明确的公开接口。

- [ ] **Step 2: Commit**

```bash
git add electron/recorder.ts
git commit -m "feat: add transcribeFile method to AudioRecorder"
```

---

### Task 7: Update voice-bar — 新尺寸，多状态支持

**Files:**
- Modify: `electron/voice-bar.ts`

- [ ] **Step 1: 修改 preCreate() 默认尺寸和新增 showHint() 方法**

```typescript
export class VoiceBarWindow {
  private win: Electron.BrowserWindow | null = null;
  private onBlur: (() => void) | null = null;
  private serverPort: number;

  constructor(serverPort: number) {
    this.serverPort = serverPort;
  }

  preCreate(): void {
    if (this.win && !this.win.isDestroyed()) return;

    const { BrowserWindow } = require('electron') as typeof import('electron');

    this.win = new BrowserWindow({
      width: 200,
      height: 48,
      show: false,
      frame: false,
      transparent: true,
      resizable: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      hasShadow: false,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
      },
    });

    this.win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    this.win.setPosition(
      Math.round((require('electron').screen.getPrimaryDisplay().workAreaSize.width - 200) / 2),
      require('electron').screen.getPrimaryDisplay().workAreaSize.height - 48 - 40,
    );

    this.win.loadURL(`http://127.0.0.1:${this.serverPort}/voice-bar`);
  }

  /** 显示呼吸灯提示（连续对话待机），小尺寸 */
  showHint(): void {
    if (!this.win || this.win.isDestroyed()) {
      this.preCreate();
    }
    this.win!.setSize(120, 6);
    this.win!.setPosition(
      Math.round((require('electron').screen.getPrimaryDisplay().workAreaSize.width - 120) / 2),
      require('electron').screen.getPrimaryDisplay().workAreaSize.height - 6 - 40,
    );
    this.win!.showInactive();
  }

  /** 显示录音指示器，正常尺寸 */
  show(): void {
    if (!this.win || this.win.isDestroyed()) {
      this.preCreate();
    }
    this.win!.setSize(200, 48);
    this.win!.setPosition(
      Math.round((require('electron').screen.getPrimaryDisplay().workAreaSize.width - 200) / 2),
      require('electron').screen.getPrimaryDisplay().workAreaSize.height - 48 - 40,
    );
    this.win!.showInactive();
    // blur 时取消录音
    this.win!.once('blur', () => {
      if (this.onBlur) this.onBlur();
    });
  }

  hide(): void {
    if (this.win && !this.win.isDestroyed()) {
      this.win.hide();
    }
  }

  close(): void {
    this.hide();
  }

  destroy(): void {
    if (this.win && !this.win.isDestroyed()) {
      this.win.close();
      this.win = null;
    }
  }

  send(channel: string, data?: any): void {
    if (this.win && !this.win.isDestroyed()) {
      this.win.webContents.send(channel, data);
    }
  }

  getWindow(): Electron.BrowserWindow | null {
    return this.win;
  }

  isVisible(): boolean {
    return this.win ? this.win.isVisible() : false;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add electron/voice-bar.ts
git commit -m "feat: voice bar supports recording indicator and hint modes"
```

---

### Task 8: Update subtitle-popup — 新增 fadeOut

**Files:**
- Modify: `electron/subtitle-popup.ts`

- [ ] **Step 1: 新增 fadeOut 方法**

通过 IPC 通知 renderer 做音量渐弱：

```typescript
/** 渐弱 TTS 音量并在 300ms 后停止 */
fadeOut(): void {
  if (this.win && !this.win.isDestroyed()) {
    this.win.webContents.send('tts-fade-out');
  }
}
```

- [ ] **Step 2: 在 subtitle page renderer 中实现 fade-out**

在 `src/app/subtitle/page.tsx` 的音频播放逻辑中，监听 `tts-fade-out` 事件：

在 subtitle page 中找到 AudioContext / GainNode 部分，新增：

```typescript
// 在音频播放相关代码中添加
ipcRenderer.on('tts-fade-out', () => {
  if (gainNode) {
    gainNode.gain.linearRampToValueAtTime(0, audioContext.currentTime + 0.3);
    setTimeout(() => {
      ipcRenderer.send('tts-stop-requested');
    }, 350);
  }
});
```

注意：需要在 subtitle page 现有的 `AudioBufferSourceNode` 播放逻辑中，确保 `gainNode` 和 `audioContext` 变量可被 fade-out 回调访问。具体是：在 `playAudio` 函数中，将 source 连接到一个 GainNode，再连接到 destination，并在模块作用域保存 gainNode 引用。

- [ ] **Step 3: Commit**

```bash
git add electron/subtitle-popup.ts src/app/subtitle/page.tsx
git commit -m "feat: add TTS fade-out for continuous chat interruption"
```

---

### Task 9: Rewrite VoiceInput — 波浪动画 + 关闭按钮

**Files:**
- Rewrite: `src/components/VoiceInput.tsx`

- [ ] **Step 1: 重写组件**

```tsx
'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

type VoiceInputProps = {
  onCancel: () => void;
};

export function VoiceInput({ onCancel }: VoiceInputProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number>(0);
  const volumeRef = useRef(0);
  const [status, setStatus] = useState<'recording' | 'hint'>('recording');

  // 接收实时音量
  useEffect(() => {
    const { ipcRenderer } = require('electron');
    const onVolume = (_: any, data: { volume: number }) => {
      volumeRef.current = data.volume;
    };
    const onHint = (_: any, data: { remaining: number }) => {
      setStatus('hint');
    };
    const onRecording = () => {
      setStatus('recording');
    };

    ipcRenderer.on('voice:volume', onVolume);
    ipcRenderer.on('voice:continuous-chat-hint', onHint);
    ipcRenderer.on('voice:start-recording', onRecording);

    return () => {
      ipcRenderer.removeListener('voice:volume', onVolume);
      ipcRenderer.removeListener('voice:continuous-chat-hint', onHint);
      ipcRenderer.removeListener('voice:start-recording', onRecording);
    };
  }, []);

  // Canvas 波浪动画
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = 160 * dpr;
    canvas.height = 24 * dpr;
    ctx.scale(dpr, dpr);

    let phase = 0;

    const draw = () => {
      ctx.clearRect(0, 0, 160, 24);

      const amplitude = 2 + volumeRef.current * 10;
      ctx.beginPath();
      ctx.strokeStyle = '#5B8DEF';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';

      for (let x = 0; x < 160; x++) {
        const y = 12 + Math.sin((x / 160) * Math.PI * 4 + phase) * amplitude;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      phase += 0.05 + volumeRef.current * 0.1;
      animFrameRef.current = requestAnimationFrame(draw);
    };

    draw();
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [status]);

  // ESC 键关闭
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  if (status === 'hint') {
    return (
      <div style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <div style={{
          width: 80,
          height: 3,
          borderRadius: 2,
          background: 'rgba(91, 141, 239, 0.4)',
          animation: 'breathe 1.5s ease-in-out infinite',
        }} />
        <style>{`
          @keyframes breathe {
            0%, 100% { opacity: 0.3; }
            50% { opacity: 0.8; }
          }
        `}</style>
      </div>
    );
  }

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: '8px 16px',
    }}>
      <canvas
        ref={canvasRef}
        style={{ width: 160, height: 24 }}
      />
      <button
        onClick={onCancel}
        style={{
          background: 'rgba(255,255,255,0.1)',
          border: 'none',
          borderRadius: '50%',
          width: 28,
          height: 28,
          color: 'rgba(255,255,255,0.5)',
          fontSize: 16,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'color 0.15s',
        }}
        onMouseEnter={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.9)')}
        onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.5)')}
      >
        ×
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/VoiceInput.tsx
git commit -m "feat: rewrite VoiceInput as wave animation + close button"
```

---

### Task 10: Update voice-bar page — 适配新组件

**Files:**
- Modify: `src/app/voice-bar/page.tsx`

- [ ] **Step 1: 简化 page**

```tsx
'use client';

import { VoiceInput } from '@/components/VoiceInput';
import { useCallback } from 'react';

export default function VoiceBarPage() {
  const handleCancel = useCallback(() => {
    const { ipcRenderer } = require('electron');
    ipcRenderer.send('voice:cancel');
  }, []);

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100vh',
      background: 'transparent',
    }}>
      <VoiceInput onCancel={handleCancel} />
    </div>
  );
}
```

注意：需要在 Next.js layout 或 page 中确保 html/body 背景透明（保持现有行为）。

- [ ] **Step 2: Commit**

```bash
git add src/app/voice-bar/page.tsx
git commit -m "refactor: simplify voice-bar page for new VoiceInput"
```

---

### Task 11: Update main.ts — 核心集成

**Files:**
- Modify: `electron/main.ts`

这是最大的改动，需要分步完成。

- [ ] **Step 1: 新增 continuousChatTimer 变量**

在全局变量区域（约 line 55 附近）新增：

```typescript
let continuousChatTimer: ReturnType<typeof setTimeout> | null = null;
```

- [ ] **Step 2: 重写 handleAudioChunk — 三模式路由**

```typescript
function handleAudioChunk(samples: Float32Array): void {
  if (!audioListener) return;

  switch (audioListener.mode) {
    case 'recording':
    case 'continuous-chat':
      voiceEndpoint?.feed(samples);
      break;
    case 'wake-word':
      if (wakeWordActive && wakeWordEngine) {
        const detected = wakeWordEngine.feed(samples);
        if (detected) {
          onWakeWordDetected();
        }
      }
      break;
  }
}
```

- [ ] **Step 3: 重写 startRecording() 统一入口**

新增一个统一的 `startRecordingSession()` 函数，同时修改 `onWakeWordDetected()` 和 `handleRightCommand()` 调用它：

```typescript
function startRecordingSession(trigger: 'wake-word' | 'shortcut' | 'continuous-chat'): void {
  log.info(`开始录音 (trigger: ${trigger})`);
  if (audioListener) audioListener.setMode('recording');

  const settings = loadSettings();
  const timeout = settings.wakeWordSilenceTimeout ?? 3;

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

- [ ] **Step 4: 重写 onWakeWordDetected — 调用统一入口**

```typescript
function onWakeWordDetected(): void {
  if (store.appState !== 'idle') {
    log.info('唤醒词检测到但状态非 idle，忽略:', store.appState);
    return;
  }
  log.info('唤醒词检测到！');
  startRecordingSession('wake-word');
}
```

- [ ] **Step 5: 重写 onRecordingComplete — 直接发送，跳过编辑**

```typescript
function onRecordingComplete(wavPath: string): void {
  if (voiceEndpoint) { voiceEndpoint.destroy(); voiceEndpoint = null; }
  log.info('录音完成, 开始转写');

  voiceBar.hide();
  store.transition('transcribing');
  updateTrayDot();

  recorder.transcribeFile(wavPath).then(text => {
    log.info('转写结果:', text || '(空)');
    if (text) {
      // 直接发送，跳过编辑态
      executePrompt(text, true);
    } else {
      voiceBar.send('voice:error', { message: '未能识别语音，请重试' });
      store.transition('idle');
      updateTrayDot();
      resumeWakeWord();
    }
  }).catch(err => {
    log.error('转写失败:', err);
    try { fs.unlinkSync(wavPath); } catch {}
    voiceBar.send('voice:error', { message: err.message });
    store.transition('idle');
    updateTrayDot();
    resumeWakeWord();
  });
}
```

- [ ] **Step 6: 重写 onRecordingTooShort**

```typescript
function onRecordingTooShort(): void {
  if (voiceEndpoint) { voiceEndpoint.destroy(); voiceEndpoint = null; }
  log.info('录音太短，忽略');

  if (store.continuousChatWindow) {
    // 连续对话模式下太短不算取消，回到监听
    voiceBar.hide();
    if (audioListener) audioListener.setMode('continuous-chat');
  } else {
    voiceBar.close();
    store.transition('idle');
    updateTrayDot();
    resumeWakeWord();
  }
}
```

- [ ] **Step 7: 重写 handleRightCommand**

```typescript
function handleRightCommand(): void {
  // 如果正在 endpoint 录音中，手动结束
  if (voiceEndpoint && audioListener?.mode === 'recording') {
    voiceEndpoint.finish();
    return;
  }

  const action = store.getRightCommandAction();

  switch (action) {
    case 'start-recording':
      // 如果 AudioListener 不活跃，需要先启动
      if (!audioListener || !audioListener.isActive()) {
        ensureAudioListener().then(() => {
          startRecordingSession('shortcut');
        }).catch(err => {
          log.error('启动 AudioListener 失败:', err);
          voiceBar.send('voice:error', { message: `录音失败: ${err.message}` });
        });
      } else {
        startRecordingSession('shortcut');
      }
      break;

    case 'stop-recording':
      if (voiceEndpoint) {
        voiceEndpoint.finish();
      }
      break;

    case 'cancel-execution':
      if (currentAbortController) {
        currentAbortController.abort();
        currentAbortController = null;
      }
      break;

    case 'stop-speaking':
      log.info('中断语音朗读');
      cancelContinuousChat();
      if (ttsAbortController) {
        ttsAbortController.abort();
        ttsAbortController = null;
      }
      ttsService.stop();
      subtitlePopup.stop();
      store.setSpeaking(false);
      updateTrayDot();
      break;

    case 'none':
      break;
  }
}
```

- [ ] **Step 8: 新增 ensureAudioListener() 辅助函数**

```typescript
async function ensureAudioListener(): Promise<void> {
  if (!audioListener) {
    audioListener = new AudioListener();
    audioListener.create();
    audioListener.registerChunkHandler(handleAudioChunk);
    await audioListener.start();
  } else if (!audioListener.isActive()) {
    audioListener.create();
    await audioListener.start();
  }
}
```

- [ ] **Step 9: 新增 startContinuousChat() 和 cancelContinuousChat()**

```typescript
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

  // 初始化 VAD 用于检测用户说话
  const settings = loadSettings();
  const timeout = settings.wakeWordSilenceTimeout ?? 3;

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
      // 用户说话被检测到，先淡出 TTS 再处理
      subtitlePopup.fadeOut();
      setTimeout(() => {
        onRecordingComplete(wavPath);
      }, 350);
    },
    () => {
      // 太短，保持 continuous-chat 模式
      log.info('连续对话: 语音太短，保持监听');
    },
    (volume) => {
      // 有音量输出说明用户开始说话了，显示录音指示器
      if (volume > 0.1 && !voiceBar.isVisible()) {
        voiceBar.show();
        voiceBar.send('voice:start-recording');
      }
      voiceBar.send('voice:volume', { volume });
    },
  );
  voiceEndpoint.start();
}

function cancelContinuousChat(): void {
  if (continuousChatTimer) {
    clearTimeout(continuousChatTimer);
    continuousChatTimer = null;
  }
  store.setContinuousChatWindow(false);
  if (voiceEndpoint) { voiceEndpoint.destroy(); voiceEndpoint = null; }
  voiceBar.hide();
  resumeWakeWord();
}
```

- [ ] **Step 10: 修改 speakResult() — TTS 完成后启动 continuous-chat**

在 `speakResult()` 的 `finally` 块中，替换现有的 completed → idle 逻辑：

```typescript
// finally 块中
} finally {
  store.setSpeaking(false);
  ttsAbortController = null;
  subtitlePopup.close();
  ttsService.stop();

  if (store.appState === 'completed') {
    // 进入连续对话模式而不是直接 idle
    if (isWakeWordEnabled()) {
      startContinuousChat();

      // 5 秒窗口
      continuousChatTimer = setTimeout(() => {
        if (store.continuousChatWindow && store.appState !== 'recording') {
          log.info('连续对话窗口过期');
          store.setContinuousChatWindow(false);
          if (audioListener) audioListener.setMode('wake-word');
          if (voiceEndpoint) { voiceEndpoint.destroy(); voiceEndpoint = null; }
          voiceBar.hide();
          store.transition('idle');
          updateTrayDot();
          resumeWakeWord();
        }
        continuousChatTimer = null;
      }, 5000);
    } else {
      store.transition('idle');
    }
  } else if (store.appState === 'executing') {
    store.transition('completed');
  }
  updateTrayDot();
}
```

- [ ] **Step 11: 更新 registerIpcHandlers — 简化 voice IPC**

```typescript
function registerIpcHandlers(): void {
  // voice-bar cancel
  ipcMain.on('voice:cancel', () => {
    cancelContinuousChat();
    if (voiceEndpoint) { voiceEndpoint.destroy(); voiceEndpoint = null; }
    voiceBar.close();
    store.transition('idle');
    updateTrayDot();
    resumeWakeWord();
  });

  // 删除 voice:request-append handler（不再需要）
  // 删除 voice:send handler（不再从 voice-bar 发送，录音完自动发）

  // chat window IPC
  ipcMain.on('chat:ready', () => {
    const segment = getActiveSegment(db);
    const messages = getChatMessages(db, segment.id);
    sendToMainWindow('chat:history', { messages, segmentId: segment.id });
    broadcastChatState();
  });
  // ... 其余 IPC handlers 不变
```

- [ ] **Step 12: 更新 startWakeWord — 使用 ensureAudioListener**

```typescript
async function startWakeWord(): Promise<void> {
  if (wakeWordActive) return;

  const keyword = getKeyword();

  if (!wakeWordEngine) {
    try {
      wakeWordEngine = new WakeWordEngine();
      wakeWordEngine.init(keyword);
    } catch (err) {
      wakeWordEngine = null;
      throw err;
    }
  }

  try {
    await ensureAudioListener();
    if (audioListener) audioListener.setMode('wake-word');
  } catch (err) {
    audioListener = null;
    throw err;
  }

  wakeWordEngine.start();
  wakeWordActive = true;
  log.info('唤醒词监听已启动, 关键词:', keyword);
}
```

- [ ] **Step 13: Commit**

```bash
git add electron/main.ts
git commit -m "feat: integrate continuous-chat mode and unified VAD recording pipeline"
```

---

### Task 12: Delete audio-capture.ts

**Files:**
- Delete: `src/lib/audio-capture.ts`

- [ ] **Step 1: 确认无引用后删除**

Run: `grep -r 'audio-capture' src/ electron/ --include='*.ts' --include='*.tsx'`

Expected: 无引用（VoiceInput 已重写，不再 import AudioCapture）

```bash
rm src/lib/audio-capture.ts
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "chore: remove audio-capture.ts (no longer used)"
```

---

### Task 13: 集成测试

**Files:**
- 无新文件

- [ ] **Step 1: 运行构建检查**

```bash
npm run build && npm run build:electron
```

Expected: 无类型错误，构建成功

- [ ] **Step 2: 运行现有测试**

```bash
npx jest
```

Expected: all PASS

- [ ] **Step 3: 手动测试场景**

启动 `npm run electron:dev`，依次测试：

1. **唤醒词触发**：说唤醒词 → voice bar 出现波浪动画 → 说话 → 静默 3 秒 → 自动转写发送 → TTS 播报
2. **连续对话**：TTS 播报中开口说话 → TTS 淡出 → voice bar 出现 → 说话完自动发送 → 新一轮 TTS
3. **连续对话窗口过期**：TTS 结束后等 5 秒 → 呼吸灯消失 → 需要唤醒词或快捷键
4. **快捷键触发**：按右 Option → voice bar 出现 → 说话 → 静默自动发送
5. **手动停止**：录音中按右 Option → 手动结束 → 转写发送
6. **取消录音**：点 × 按钮 → 取消 → 回到 idle

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "test: verify continuous-chat and auto-send integration"
```
