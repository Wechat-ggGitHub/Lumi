# Web Audio API Recording Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace ffmpeg-based audio recording with Electron Web Audio API for zero-dependency microphone capture.

**Architecture:** Audio capture moves from main process (spawning ffmpeg) to the voice-bar renderer process (using getUserMedia + AudioContext + ScriptProcessorNode). PCM samples are collected as Float32Array chunks, sent via IPC to the main process, which converts them to a WAV file and passes it to sherpa-onnx for transcription.

**Tech Stack:** Electron BrowserWindow, Web Audio API (getUserMedia, AudioContext, ScriptProcessorNode), Electron IPC, Node.js Buffer for WAV encoding.

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src/lib/wav-writer.ts` | Create | Pure function: Float32Array → WAV Buffer |
| `src/__tests__/wav-writer.test.ts` | Create | Unit tests for WAV encoding |
| `src/lib/audio-capture.ts` | Create | Renderer-side Web Audio capture module |
| `src/components/VoiceInput.tsx` | Modify | Integrate AudioCapture with IPC |
| `electron/voice-bar.ts` | Modify | Add preCreate(), change close() to hide() |
| `electron/recorder.ts` | Rewrite | IPC-based recording + WAV file writing |
| `electron/main.ts` | Modify | Pre-create voice-bar, pass window to recorder |
| `CLAUDE.md` | Modify | Fix "macOS afrecord" → "Web Audio API" |
| `src/types/index.ts` | Modify | Add new IPC message types |

---

### Task 1: WAV Buffer Utility (TDD)

**Files:**
- Create: `src/lib/wav-writer.ts`
- Create: `src/__tests__/wav-writer.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/__tests__/wav-writer.test.ts
import { createWavBuffer } from '@/lib/wav-writer';

describe('createWavBuffer', () => {
  it('writes correct WAV header for 16kHz mono', () => {
    const samples = new Float32Array([0, 0.5, -0.5, 1.0, -1.0]);
    const buffer = createWavBuffer(samples, 16000);

    // RIFF header
    expect(buffer.toString('ascii', 0, 4)).toBe('RIFF');
    expect(buffer.readUInt32LE(4)).toBe(36 + samples.length * 2); // file size - 8
    expect(buffer.toString('ascii', 8, 12)).toBe('WAVE');

    // fmt chunk
    expect(buffer.toString('ascii', 12, 16)).toBe('fmt ');
    expect(buffer.readUInt32LE(16)).toBe(16);         // chunk size
    expect(buffer.readUInt16LE(20)).toBe(1);          // PCM format
    expect(buffer.readUInt16LE(22)).toBe(1);          // mono
    expect(buffer.readUInt32LE(24)).toBe(16000);      // sample rate
    expect(buffer.readUInt32LE(28)).toBe(32000);      // byte rate (16000 * 2)
    expect(buffer.readUInt16LE(32)).toBe(2);          // block align
    expect(buffer.readUInt16LE(34)).toBe(16);         // bits per sample

    // data chunk
    expect(buffer.toString('ascii', 36, 40)).toBe('data');
    expect(buffer.readUInt32LE(40)).toBe(samples.length * 2);
  });

  it('converts Float32 samples to Int16 PCM correctly', () => {
    const samples = new Float32Array([0, 0.5, -0.5, 1.0, -1.0]);
    const buffer = createWavBuffer(samples, 16000);

    // PCM data starts at byte 44
    expect(buffer.readInt16LE(44)).toBe(0);          // 0.0 → 0
    expect(buffer.readInt16LE(46)).toBe(16384);      // 0.5 → ~16384
    expect(buffer.readInt16LE(48)).toBe(-16384);     // -0.5 → ~-16384
    expect(buffer.readInt16LE(50)).toBe(32767);      // 1.0 → 32767
    expect(buffer.readInt16LE(52)).toBe(-32768);     // -1.0 → -32768
  });

  it('clamps values outside [-1, 1]', () => {
    const samples = new Float32Array([2.0, -2.0]);
    const buffer = createWavBuffer(samples, 16000);

    expect(buffer.readInt16LE(44)).toBe(32767);      // clamped to 1.0
    expect(buffer.readInt16LE(46)).toBe(-32768);     // clamped to -1.0
  });

  it('handles empty samples', () => {
    const samples = new Float32Array(0);
    const buffer = createWavBuffer(samples, 16000);

    expect(buffer.length).toBe(44); // header only, no data
    expect(buffer.readUInt32LE(40)).toBe(0); // data size = 0
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/__tests__/wav-writer.test.ts`
Expected: FAIL — `Cannot find module '@/lib/wav-writer'`

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/lib/wav-writer.ts
export function createWavBuffer(samples: Float32Array, sampleRate: number): Buffer {
  const numSamples = samples.length;
  const dataSize = numSamples * 2;
  const buffer = Buffer.alloc(44 + dataSize);

  // RIFF header
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);

  // fmt sub-chunk
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);             // PCM
  buffer.writeUInt16LE(1, 22);             // mono
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28); // byte rate
  buffer.writeUInt16LE(2, 32);             // block align
  buffer.writeUInt16LE(16, 34);            // bits per sample

  // data sub-chunk
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  // Float32 → Int16 PCM
  for (let i = 0; i < numSamples; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    buffer.writeInt16LE(s < 0 ? s * 0x8000 : s * 0x7FFF, 44 + i * 2);
  }

  return buffer;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/__tests__/wav-writer.test.ts`
Expected: All 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/wav-writer.ts src/__tests__/wav-writer.test.ts
git commit -m "feat: add WAV buffer utility for Float32→PCM16 conversion"
```

---

### Task 2: AudioCapture Module

**Files:**
- Create: `src/lib/audio-capture.ts`

- [ ] **Step 1: Create the AudioCapture class**

```typescript
// src/lib/audio-capture.ts
export class AudioCapture {
  private audioContext: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private processor: ScriptProcessorNode | null = null;
  private silenceGain: GainNode | null = null;
  private chunks: Float32Array[] = [];

  async start(): Promise<void> {
    this.chunks = [];

    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
      },
    });

    this.audioContext = new AudioContext({ sampleRate: 16000 });
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }

    const source = this.audioContext.createMediaStreamSource(this.stream);
    this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);

    // Mute output to prevent speaker feedback
    this.silenceGain = this.audioContext.createGain();
    this.silenceGain.gain.value = 0;

    source.connect(this.processor);
    this.processor.connect(this.silenceGain);
    this.silenceGain.connect(this.audioContext.destination);

    this.processor.onaudioprocess = (e: AudioProcessingEvent) => {
      const data = e.inputBuffer.getChannelData(0);
      this.chunks.push(new Float32Array(data));
    };
  }

  stop(): { samples: Float32Array; sampleRate: number } {
    this.processor?.disconnect();
    this.silenceGain?.disconnect();
    this.stream?.getTracks().forEach(t => t.stop());

    const totalLength = this.chunks.reduce((acc, c) => acc + c.length, 0);
    const samples = new Float32Array(totalLength);
    let offset = 0;
    for (const chunk of this.chunks) {
      samples.set(chunk, offset);
      offset += chunk.length;
    }

    this.chunks = [];
    this.close();
    return { samples, sampleRate: 16000 };
  }

  close(): void {
    this.processor?.disconnect();
    this.silenceGain?.disconnect();
    this.stream?.getTracks().forEach(t => t.stop());
    this.audioContext?.close();
    this.audioContext = null;
    this.stream = null;
    this.processor = null;
    this.silenceGain = null;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/audio-capture.ts
git commit -m "feat: add AudioCapture module using Web Audio API"
```

---

### Task 3: Integrate AudioCapture into VoiceInput

**Files:**
- Modify: `src/components/VoiceInput.tsx`
- Modify: `src/types/index.ts`

- [ ] **Step 1: Add new IPC message types**

Add to `src/types/index.ts` inside `IpcMessages` interface, after the existing `voice:error` entry (line 68):

```typescript
  // voice-bar <-> main (audio capture)
  'voice:start-capture': void;
  'voice:stop-capture': void;
  'voice:capture-started': boolean;
  'voice:audio-data': { samples: Float32Array; sampleRate: number };
```

- [ ] **Step 2: Modify VoiceInput.tsx to integrate AudioCapture**

Replace lines 1-53 of `src/components/VoiceInput.tsx` with:

```typescript
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { getIpcRenderer } from '@/lib/electron-ipc';
import { AudioCapture } from '@/lib/audio-capture';

type VoiceInputProps = {
  onSend: (text: string) => void;
  onCancel: () => void;
};

export function VoiceInput({ onSend, onCancel }: VoiceInputProps) {
  const [text, setText] = useState('');
  const [status, setStatus] = useState<'recording' | 'transcribing' | 'editing' | 'error'>('recording');
  const [errorMessage, setErrorMessage] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const statusRef = useRef(status);
  statusRef.current = status;

  const audioCaptureRef = useRef<AudioCapture | null>(null);

  // Initialize AudioCapture once
  useEffect(() => {
    audioCaptureRef.current = new AudioCapture();
    return () => {
      audioCaptureRef.current?.close();
      audioCaptureRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const ipcRenderer = getIpcRenderer();
    if (!ipcRenderer) return;

    const handlers: Record<string, (...args: unknown[]) => void> = {
      'voice:transcript': (_: unknown, data: { text: string; isAppending: boolean }) => {
        setText(prev => data.isAppending ? prev + data.text : data.text);
        setStatus('editing');
        textareaRef.current?.focus();
      },
      'voice:transcribing': () => setStatus('transcribing'),
      'voice:error': (_: unknown, data: { message: string }) => {
        if (statusRef.current === 'recording' || statusRef.current === 'transcribing') {
          setErrorMessage(data.message);
          setStatus('error');
          setTimeout(() => onCancel(), 2000);
        } else {
          setText(prev => prev + `\n[错误: ${data.message}]`);
        }
      },
      'voice:start-capture': async () => {
        setStatus('recording');
        try {
          await audioCaptureRef.current?.start();
          ipcRenderer.send('voice:capture-started', true);
        } catch {
          ipcRenderer.send('voice:capture-started', false);
        }
      },
      'voice:stop-capture': () => {
        const result = audioCaptureRef.current?.stop();
        if (result) {
          ipcRenderer.send('voice:audio-data', result);
        }
      },
    };

    for (const [channel, handler] of Object.entries(handlers)) {
      ipcRenderer.on(channel, handler);
    }

    return () => {
      for (const [channel, handler] of Object.entries(handlers)) {
        ipcRenderer.removeListener(channel, handler);
      }
    };
  }, [onCancel]);
```

The rest of the file (lines 55-225 — handleSend, handleKeyDown, JSX rendering, RecordingPulse, Spinner) stays unchanged.

- [ ] **Step 3: Commit**

```bash
git add src/components/VoiceInput.tsx src/types/index.ts
git commit -m "feat: integrate AudioCapture into VoiceInput with IPC handlers"
```

---

### Task 4: Modify voice-bar.ts

**Files:**
- Modify: `electron/voice-bar.ts`

- [ ] **Step 1: Add preCreate() and getWindow(), change close() to hide()**

Replace the entire file `electron/voice-bar.ts` with:

```typescript
import { BrowserWindow, screen } from 'electron';

export class VoiceBarWindow {
  private win: BrowserWindow | null = null;
  private serverPort: number;

  constructor(serverPort: number) {
    this.serverPort = serverPort;
  }

  preCreate(): void {
    if (this.win && !this.win.isDestroyed()) return;

    const cursorScreen = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    const { width: screenWidth, height: screenHeight } = cursorScreen.workAreaSize;
    const barWidth = 640;
    const barHeight = 100;
    const x = cursorScreen.workArea.x + Math.round((screenWidth - barWidth) / 2);
    const y = cursorScreen.workArea.y + screenHeight - barHeight - 40;

    this.win = new BrowserWindow({
      width: barWidth,
      height: barHeight,
      x,
      y,
      frame: false,
      transparent: true,
      resizable: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      hasShadow: false,
      show: false,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
      },
    });

    this.win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    this.win.loadURL(`http://127.0.0.1:${this.serverPort}/voice-bar`);
  }

  show(): void {
    if (!this.win || this.win.isDestroyed()) {
      this.preCreate();
    }
    this.win!.show();
  }

  hide(): void {
    if (this.win && !this.win.isDestroyed()) {
      this.win.hide();
    }
  }

  /** Keep for API compat — now just hides instead of destroying */
  close(): void {
    this.hide();
  }

  /** Actually destroy the window — only called on app quit */
  destroy(): void {
    if (this.win && !this.win.isDestroyed()) {
      this.win.close();
      this.win = null;
    }
  }

  send(channel: string, data?: unknown): void {
    if (this.win && !this.win.isDestroyed()) {
      this.win.webContents.send(channel, data);
    }
  }

  getWindow(): BrowserWindow | null {
    return this.win && !this.win.isDestroyed() ? this.win : null;
  }

  isVisible(): boolean {
    return this.win !== null && !this.win.isDestroyed() && this.win.isVisible();
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add electron/voice-bar.ts
git commit -m "feat: add preCreate/getWindow to VoiceBarWindow, close becomes hide"
```

---

### Task 5: Rewrite recorder.ts

**Files:**
- Modify: `electron/recorder.ts`

- [ ] **Step 1: Rewrite recorder to use IPC + WAV writer**

Replace the entire file `electron/recorder.ts` with:

```typescript
import { systemPreferences, ipcMain, BrowserWindow } from 'electron';
import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import { VoiceRecognizer } from '../src/lib/sherpa';
import { createWavBuffer } from '../src/lib/wav-writer';

export class AudioRecorder {
  private win: BrowserWindow | null = null;
  private tmpDir: string;
  private recognizer: VoiceRecognizer;

  constructor() {
    this.tmpDir = path.join(app.getPath('userData'), 'tmp');
    if (!fs.existsSync(this.tmpDir)) fs.mkdirSync(this.tmpDir, { recursive: true });
    this.recognizer = new VoiceRecognizer();
  }

  setWindow(win: BrowserWindow): void {
    this.win = win;
  }

  static async checkMicrophonePermission(): Promise<boolean> {
    return systemPreferences.askForMediaAccess('microphone');
  }

  async startRecording(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.win || this.win.isDestroyed()) {
        return reject(new Error('语音窗口不可用'));
      }

      const timeout = setTimeout(() => {
        reject(new Error('录音启动超时'));
      }, 5000);

      ipcMain.once('voice:capture-started', (_event, success: boolean) => {
        clearTimeout(timeout);
        if (success) resolve();
        else reject(new Error('麦克风访问被拒绝，请在系统设置中允许麦克风权限'));
      });

      this.win.webContents.send('voice:start-capture');
    });
  }

  stopRecording(): Promise<string> {
    const outputPath = path.join(this.tmpDir, `recording-${Date.now()}.wav`);

    return new Promise((resolve) => {
      if (!this.win || this.win.isDestroyed()) {
        resolve(outputPath);
        return;
      }

      ipcMain.once('voice:audio-data', (_event, data: { samples: Float32Array; sampleRate: number }) => {
        const buffer = createWavBuffer(data.samples, data.sampleRate);
        fs.writeFileSync(outputPath, buffer);
        resolve(outputPath);
      });

      this.win.webContents.send('voice:stop-capture');
    });
  }

  async transcribe(audioPath?: string): Promise<string> {
    if (!this.recognizer.isLoaded) {
      console.log('[recorder] Loading voice model...');
      await this.recognizer.load();
      console.log('[recorder] Voice model loaded successfully');
    }

    const filePath = audioPath || '';

    if (!filePath || !fs.existsSync(filePath)) {
      console.error('[recorder] Audio file not found:', filePath);
      throw new Error('音频文件不存在');
    }

    const stat = fs.statSync(filePath);
    console.log(`[recorder] Audio file: ${filePath} (${stat.size} bytes)`);
    if (stat.size < 44) {
      throw new Error('音频文件过小，可能录制失败');
    }

    const text = await this.recognizer.transcribe(filePath);
    console.log(`[recorder] Transcription result: "${text}" (length: ${text.length})`);

    try { fs.unlinkSync(filePath); } catch {}

    return text;
  }

  getRecognizer(): VoiceRecognizer {
    return this.recognizer;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add electron/recorder.ts
git commit -m "feat: rewrite recorder to use IPC-based Web Audio capture"
```

---

### Task 6: Wire up in main.ts

**Files:**
- Modify: `electron/main.ts`

- [ ] **Step 1: Pre-create voice-bar window and pass to recorder**

In `electron/main.ts`, find the initialization block (around line 547-558):
```typescript
  // 创建窗口管理器
  voiceBar = new VoiceBarWindow(serverPort);
  summaryPopup = new SummaryPopupWindow(serverPort);

  // 初始化快捷键
  shortcutManager = new ShortcutManager();
  const shortcutReady = await shortcutManager.init();
  if (shortcutReady) {
    shortcutManager.start(() => handleRightCommand());
  }

  // 初始化录音器
  recorder = new AudioRecorder();
```

Replace with:
```typescript
  // 创建窗口管理器
  voiceBar = new VoiceBarWindow(serverPort);
  summaryPopup = new SummaryPopupWindow(serverPort);

  // 初始化快捷键
  shortcutManager = new ShortcutManager();
  const shortcutReady = await shortcutManager.init();
  if (shortcutReady) {
    shortcutManager.start(() => handleRightCommand());
  }

  // 初始化录音器并预创建 voice-bar 窗口
  recorder = new AudioRecorder();
  voiceBar.preCreate();
  recorder.setWindow(voiceBar.getWindow()!);
```

- [ ] **Step 2: Update before-quit cleanup**

Find the `before-quit` handler (around line 611-618):
```typescript
app.on('before-quit', () => {
  shortcutManager?.stop();
  db?.close();
  if (nextServer) {
    nextServer.kill();
    nextServer = null;
  }
});
```

Replace with:
```typescript
app.on('before-quit', () => {
  shortcutManager?.stop();
  voiceBar?.destroy();
  db?.close();
  if (nextServer) {
    nextServer.kill();
    nextServer = null;
  }
});
```

- [ ] **Step 3: Remove unused import**

At line 4, `spawn` and `ChildProcess` are imported. Keep `ChildProcess` (used for `nextServer`), but `spawn` is still used at line 64 for `nextServer = spawn(...)`. So no import changes needed.

- [ ] **Step 4: Commit**

```bash
git add electron/main.ts
git commit -m "feat: pre-create voice-bar window, wire recorder to window ref"
```

---

### Task 7: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Fix documentation**

Find this line in the Key Modules table:
```
| `electron/recorder.ts` | 录音（macOS afrecord）→ sherpa-onnx 本地转写 |
```

Replace with:
```
| `electron/recorder.ts` | 录音（Web Audio API via IPC）→ sherpa-onnx 本地转写 |
```

Find this line in the Native Dependencies section:
```
- `better-sqlite3` — SQLite 绑定
```

No changes needed to native deps (ffmpeg was never listed).

Find this line in Key Design Decisions:
```
- **语音模型延迟加载**：应用启动时不加载，首次使用语音时才加载
```

Add after it:
```
- **录音使用 Web Audio API**：通过 voice-bar 渲染进程的 getUserMedia + AudioContext 采集麦克风音频，IPC 传回主进程写 WAV 文件，无需外部依赖
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md — Web Audio API replaces afrecord/ffmpeg"
```

---

### Task 8: Build Verification

- [ ] **Step 1: Run all tests**

Run: `npx jest`
Expected: All tests pass (including new wav-writer tests)

- [ ] **Step 2: Build Electron**

Run: `npm run build && npm run build:electron`
Expected: No build errors

- [ ] **Step 3: Manual smoke test**

Run: `npm run electron:dev`

1. Press Right Command key → voice-bar should appear with "正在聆听..."
2. Speak a short phrase → release key
3. Should see "识别中..." then the transcript in editing state
4. Click send → should execute the command

If mic permission prompt appears, grant it and retry.
