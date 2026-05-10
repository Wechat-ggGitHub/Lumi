# Voice Wake Word Detection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add always-on local wake word detection so users can speak their persona name (e.g. "钱钱") to start a voice session, like "Hey Siri".

**Architecture:** A hidden BrowserWindow (audio-listener) continuously captures mic audio via getUserMedia and streams PCM chunks to the main process. sherpa-onnx keyword spotter runs on those chunks. On detection, audio switches to VAD endpointing mode; when silence is detected (3s default), the accumulated speech is sent to Doubao ASR for transcription.

**Tech Stack:** sherpa-onnx-node (keyword spotting + VAD), pinyin-pro (Chinese→pinyin conversion), existing Web Audio API capture chain, existing Doubao ASR.

---

### Task 1: Install dependencies and download models

**Files:**
- Modify: `package.json` (add deps)
- Create: `scripts/download-kws-models.sh`

- [ ] **Step 1: Install npm packages**

```bash
cd /Users/rikiwang/Documents/Agent/Aiva/Aiva
npm install sherpa-onnx-node pinyin-pro
```

- [ ] **Step 2: Run electron-rebuild for native module**

```bash
npm run rebuild
```

- [ ] **Step 3: Download keyword spotting model**

Create `scripts/download-kws-models.sh`:

```bash
#!/bin/bash
set -e
MODEL_DIR="resources/sherpa-onnx/kws"
mkdir -p "$MODEL_DIR"

if [ ! -f "$MODEL_DIR/tokens.txt" ]; then
  echo "Downloading KWS model (wenetspeech, 3.3MB)..."
  curl -L -o /tmp/kws-model.tar.bz2 \
    "https://github.com/k2-fsa/sherpa-onnx/releases/download/kws-models/sherpa-onnx-kws-zipformer-wenetspeech-3.3M-2024-01-01.tar.bz2"
  tar xf /tmp/kws-model.tar.bz2 -C /tmp/
  cp /tmp/sherpa-onnx-kws-zipformer-wenetspeech-3.3M-2024-01-01/*.onnx "$MODEL_DIR/"
  cp /tmp/sherpa-onnx-kws-zipformer-wenetspeech-3.3M-2024-01-01/tokens.txt "$MODEL_DIR/"
  rm -rf /tmp/kws-model.tar.bz2 /tmp/sherpa-onnx-kws-zipformer-wenetspeech-3.3M-2024-01-01
  echo "KWS model downloaded."
else
  echo "KWS model already exists."
fi

VAD_DIR="resources/sherpa-onnx/vad"
mkdir -p "$VAD_DIR"
if [ ! -f "$VAD_DIR/silero_vad.onnx" ]; then
  echo "Downloading Silero VAD model..."
  curl -L -o "$VAD_DIR/silero_vad.onnx" \
    "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/silero_vad.onnx"
  echo "VAD model downloaded."
else
  echo "VAD model already exists."
fi
```

```bash
chmod +x scripts/download-kws-models.sh
bash scripts/download-kws-models.sh
```

- [ ] **Step 4: Verify sherpa-onnx-node loads**

Create a quick test at project root, run and delete:

```bash
node -e "const s = require('sherpa-onnx-node'); console.log('sherpa-onnx-node loaded, createKws:', typeof s.createKws, 'createVad:', typeof s.createVad)"
```

Expected: `sherpa-onnx-node loaded, createKws: function createVad: function`

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json scripts/download-kws-models.sh
git commit -m "chore: add sherpa-onnx-node and pinyin-pro dependencies"
```

---

### Task 2: Create pinyin-to-keyword conversion utility

**Files:**
- Create: `src/lib/pinyin-keyword.ts`
- Create: `src/__tests__/pinyin-keyword.test.ts`

- [ ] **Step 1: Write tests**

Create `src/__tests__/pinyin-keyword.test.ts`:

```ts
import { chineseToKeyword, splitPinyin } from '../lib/pinyin-keyword';

describe('splitPinyin', () => {
  test('splits syllable with initial', () => {
    expect(splitPinyin('qián')).toEqual(['q', 'ián']);
  });

  test('splits syllable with two-letter initial', () => {
    expect(splitPinyin('zhōng')).toEqual(['zh', 'ōng']);
  });

  test('splits syllable without initial', () => {
    expect(splitPinyin('ài')).toEqual(['', 'ài']);
  });

  test('splits single letter', () => {
    expect(splitPinyin('è')).toEqual(['', 'è']);
  });
});

describe('chineseToKeyword', () => {
  test('converts 钱钱', () => {
    const result = chineseToKeyword('钱钱');
    expect(result).toContain('@钱钱');
    // Should contain pinyin parts
    expect(result).toMatch(/q\s+ián/);
  });

  test('converts 小狐狸', () => {
    const result = chineseToKeyword('小狐狸');
    expect(result).toContain('@小狐狸');
  });

  test('handles single character', () => {
    const result = chineseToKeyword('雪');
    expect(result).toContain('@雪');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx jest src/__tests__/pinyin-keyword.test.ts --no-coverage
```

Expected: FAIL (module not found)

- [ ] **Step 3: Implement pinyin-keyword utility**

Create `src/lib/pinyin-keyword.ts`:

```ts
import { pinyin } from 'pinyin-pro';

const PINYIN_INITIALS = [
  'zh', 'ch', 'sh',
  'b', 'p', 'm', 'f',
  'd', 't', 'n', 'l',
  'g', 'k', 'h',
  'j', 'q', 'x',
  'r', 'z', 'c', 's',
  'y', 'w',
];

export function splitPinyin(syllable: string): [string, string] {
  for (const initial of PINYIN_INITIALS) {
    if (syllable.startsWith(initial)) {
      return [initial, syllable.slice(initial.length)];
    }
  }
  return ['', syllable];
}

export function chineseToKeyword(text: string): string {
  const py = pinyin(text, { toneType: 'symbol', type: 'array' });
  const parts: string[] = [];
  for (const syllable of py) {
    const [initial, final] = splitPinyin(syllable);
    if (initial) parts.push(initial);
    parts.push(final);
  }
  return parts.join(' ') + '  @' + text;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx jest src/__tests__/pinyin-keyword.test.ts --no-coverage
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/pinyin-keyword.ts src/__tests__/pinyin-keyword.test.ts
git commit -m "feat: add pinyin-to-keyword conversion utility for wake word"
```

---

### Task 3: Create AudioListener module (hidden BrowserWindow for continuous capture)

**Files:**
- Create: `electron/audio-listener.ts`

- [ ] **Step 1: Implement AudioListener**

Create `electron/audio-listener.ts`:

```ts
import { BrowserWindow } from 'electron';
import { log } from '../src/lib/logger';

const INLINE_HTML = `<!DOCTYPE html>
<html><body><script>
const { ipcRenderer } = require('electron');
let audioContext, stream, processor, gain;

ipcRenderer.on('audio-listener:start', () => {
  navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true }
  }).then(s => {
    stream = s;
    audioContext = new AudioContext({ sampleRate: 16000 });
    if (audioContext.state === 'suspended') audioContext.resume();
    const source = audioContext.createMediaStreamSource(stream);
    processor = audioContext.createScriptProcessor(4096, 1, 1);
    gain = audioContext.createGain();
    gain.gain.value = 0;
    source.connect(processor);
    processor.connect(gain);
    gain.connect(audioContext.destination);
    processor.onaudioprocess = (e) => {
      const data = e.inputBuffer.getChannelData(0);
      ipcRenderer.send('audio-listener:pcm-chunk', new Float32Array(data));
    };
    ipcRenderer.send('audio-listener:started');
  }).catch(err => {
    ipcRenderer.send('audio-listener:error', err.message);
  });
});

ipcRenderer.on('audio-listener:stop', () => {
  if (processor) processor.disconnect();
  if (gain) gain.disconnect();
  if (stream) stream.getTracks().forEach(t => t.stop());
  if (audioContext) audioContext.close();
  audioContext = null; stream = null; processor = null; gain = null;
});
</script></body></html>`;

export class AudioListener {
  private win: BrowserWindow | null = null;
  private onChunk: ((samples: Float32Array) => void) | null = null;
  private onError: ((message: string) => void) | null = null;
  private started = false;

  create(): void {
    if (this.win && !this.win.isDestroyed()) return;

    this.win = new BrowserWindow({
      width: 1,
      height: 1,
      show: false,
      skipTaskbar: true,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
      },
    });

    this.win.loadURL(
      'data:text/html;charset=utf-8,' + encodeURIComponent(INLINE_HTML)
    );

    this.win.webContents.on('did-finish-load', () => {
      log.info('AudioListener: 窗口加载完成');
    });
  }

  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.win || this.win.isDestroyed()) {
        reject(new Error('AudioListener window not created'));
        return;
      }

      // Register one-time listeners for this start
      const { ipcMain } = require('electron');
      ipcMain.once('audio-listener:started', () => {
        this.started = true;
        log.info('AudioListener: 开始采集');
        resolve();
      });
      ipcMain.once('audio-listener:error', (_event: any, message: string) => {
        log.error('AudioListener: 采集错误:', message);
        reject(new Error(message));
      });

      // Register persistent chunk handler
      if (!this.onChunk) {
        // chunk handler is registered once in registerChunkHandler
      }

      this.win.webContents.send('audio-listener:start');
    });
  }

  registerChunkHandler(handler: (samples: Float32Array) => void): void {
    this.onChunk = handler;
    const { ipcMain } = require('electron');
    ipcMain.on('audio-listener:pcm-chunk', (_event: any, data: Float32Array) => {
      if (this.onChunk) {
        this.onChunk(data);
      }
    });
  }

  stop(): void {
    if (this.win && !this.win.isDestroyed()) {
      this.win.webContents.send('audio-listener:stop');
    }
    this.started = false;
    log.info('AudioListener: 停止采集');
  }

  destroy(): void {
    this.stop();
    if (this.win && !this.win.isDestroyed()) {
      this.win.close();
    }
    this.win = null;
    this.onChunk = null;
    this.onError = null;
    this.started = false;
  }

  isActive(): boolean {
    return this.started;
  }
}
```

Note: PCM data is sent as `Float32Array` via Electron's structured clone algorithm. This works because Electron IPC supports TypedArray serialization.

- [ ] **Step 2: Commit**

```bash
git add electron/audio-listener.ts
git commit -m "feat: add AudioListener hidden window for continuous mic capture"
```

---

### Task 4: Create WakeWordEngine module (keyword spotting wrapper)

**Files:**
- Create: `electron/wake-word.ts`

- [ ] **Step 1: Implement WakeWordEngine**

Create `electron/wake-word.ts`:

```ts
import path from 'path';
import { app } from 'electron';
import { chineseToKeyword } from '../src/lib/pinyin-keyword';
import { log } from '../src/lib/logger';

const sherpa_onnx = require('sherpa-onnx-node');

export class WakeWordEngine {
  private kws: any = null;
  private stream: any = null;
  private keyword: string = '';
  private active = false;

  get isEnabled(): boolean {
    return this.kws !== null;
  }

  init(keyword: string): void {
    const resourcesDir = app.isPackaged
      ? path.join(process.resourcesPath, 'sherpa-onnx', 'kws')
      : path.join(app.getAppPath(), 'resources', 'sherpa-onnx', 'kws');

    const config = {
      modelConfig: {
        transducer: {
          encoder: path.join(resourcesDir, 'encoder-epoch-12-avg-2-chunk-16-left-64.onnx'),
          decoder: path.join(resourcesDir, 'decoder-epoch-12-avg-2-chunk-16-left-64.onnx'),
          joiner: path.join(resourcesDir, 'joiner-epoch-12-avg-2-chunk-16-left-64.onnx'),
        },
        tokens: path.join(resourcesDir, 'tokens.txt'),
      },
      keywords: '',
      keywordsScore: 1.0,
      keywordsThreshold: 0.25,
      maxActivePaths: 4,
      numTrailingBlanks: 1,
    };

    this.kws = sherpa_onnx.createKws(config);
    this.stream = this.kws.createStream();
    this.updateKeyword(keyword);
    log.info('WakeWordEngine: 初始化完成, 关键词:', keyword);
  }

  updateKeyword(keyword: string): void {
    if (!this.kws) return;
    this.keyword = keyword;
    const keywordStr = chineseToKeyword(keyword);
    log.info('WakeWordEngine: 更新关键词:', keywordStr);

    // Try runtime keyword update; if not supported, recreate
    if (typeof this.kws.setKeywords === 'function') {
      this.kws.setKeywords(keywordStr);
    } else {
      // Fallback: destroy and recreate with new keyword
      if (this.stream) this.stream.free();
      this.kws.free();
      this.init(keyword);
    }
  }

  feed(samples: Float32Array): string | null {
    if (!this.active || !this.kws || !this.stream) return null;

    this.stream.acceptWaveform(16000, samples);

    while (this.kws.isReady(this.stream)) {
      this.kws.decode(this.stream);
      const result = this.kws.getResult(this.stream);
      if (result.keyword && result.keyword !== '') {
        log.info('WakeWordEngine: 检测到唤醒词:', result.keyword);
        this.kws.reset(this.stream);
        return result.keyword;
      }
    }
    return null;
  }

  start(): void {
    this.active = true;
    log.info('WakeWordEngine: 开始监听');
  }

  stop(): void {
    this.active = false;
    log.info('WakeWordEngine: 停止监听');
  }

  reset(): void {
    if (this.stream && this.kws) {
      this.kws.reset(this.stream);
    }
  }

  destroy(): void {
    this.active = false;
    if (this.stream) {
      this.stream.free();
      this.stream = null;
    }
    if (this.kws) {
      this.kws.free();
      this.kws = null;
    }
    log.info('WakeWordEngine: 已销毁');
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add electron/wake-word.ts
git commit -m "feat: add WakeWordEngine wrapping sherpa-onnx keyword spotter"
```

---

### Task 5: Create VAD endpointing module

**Files:**
- Create: `electron/voice-endpoint.ts`

- [ ] **Step 1: Implement VoiceEndpoint**

Create `electron/voice-endpoint.ts`:

```ts
import path from 'path';
import { app } from 'electron';
import { createWavBuffer } from '../src/lib/wav-writer';
import { log } from '../src/lib/logger';
import fs from 'fs';

const sherpa_onnx = require('sherpa-onnx-node');

export class VoiceEndpoint {
  private vad: any = null;
  private chunks: Float32Array[] = [];
  private startTime = 0;
  private silenceTimeout: number;
  private minDuration: number;
  private maxDuration: number;
  private onComplete: ((wavPath: string) => void) | null = null;
  private onTooShort: (() => void) | null = null;

  constructor(opts: {
    silenceTimeout?: number;
    minDuration?: number;
    maxDuration?: number;
  } = {}) {
    this.silenceTimeout = opts.silenceTimeout ?? 3;
    this.minDuration = opts.minDuration ?? 0.5;
    this.maxDuration = opts.maxDuration ?? 30;
  }

  init(): void {
    const resourcesDir = app.isPackaged
      ? path.join(process.resourcesPath, 'sherpa-onnx', 'vad')
      : path.join(app.getAppPath(), 'resources', 'sherpa-onnx', 'vad');

    this.vad = sherpa_onnx.createVad({
      sileroVad: {
        model: path.join(resourcesDir, 'silero_vad.onnx'),
        threshold: 0.5,
        minSpeechDuration: this.minDuration,
        minSilenceDuration: this.silenceTimeout,
        maxSpeechDuration: this.maxDuration,
        windowSize: 512,
      },
      sampleRate: 16000,
      numThreads: 1,
    });
  }

  setCallbacks(onComplete: (wavPath: string) => void, onTooShort: () => void): void {
    this.onComplete = onComplete;
    this.onTooShort = onTooShort;
  }

  start(): void {
    this.chunks = [];
    this.startTime = Date.now();
    log.info('VoiceEndpoint: 开始端点检测');
  }

  feed(samples: Float32Array): void {
    if (!this.vad) return;

    this.chunks.push(samples);
    this.vad.acceptWaveform(samples);

    // Check for completed speech segments from VAD
    while (!this.vad.isEmpty()) {
      const segment = this.vad.front();
      this.vad.pop();

      const duration = segment.samples.length / 16000;
      log.info(`VoiceEndpoint: VAD 检测到语音段, 时长: ${duration.toFixed(2)}s`);

      if (duration >= this.minDuration) {
        this.complete(segment.samples);
        return;
      } else {
        log.info('VoiceEndpoint: 语音段太短，忽略');
        if (this.onTooShort) this.onTooShort();
        return;
      }
    }

    // Max duration fallback
    const totalDuration = this.getDuration();
    if (totalDuration >= this.maxDuration) {
      log.info('VoiceEndpoint: 达到最大录音时长，停止');
      this.complete(this.getAllSamples());
    }
  }

  private complete(samples: Float32Array): void {
    const wavBuffer = createWavBuffer(samples, 16000);
    const tmpDir = path.join(require('os').homedir(), '.aiva', 'tmp');
    fs.mkdirSync(tmpDir, { recursive: true });
    const wavPath = path.join(tmpDir, `wake-recording-${Date.now()}.wav`);
    fs.writeFileSync(wavPath, wavBuffer);
    log.info('VoiceEndpoint: 录音完成:', wavPath);
    if (this.onComplete) this.onComplete(wavPath);
    this.chunks = [];
  }

  private getDuration(): number {
    const totalSamples = this.chunks.reduce((acc, c) => acc + c.length, 0);
    return totalSamples / 16000;
  }

  private getAllSamples(): Float32Array {
    const totalLength = this.chunks.reduce((acc, c) => acc + c.length, 0);
    const result = new Float32Array(totalLength);
    let offset = 0;
    for (const chunk of this.chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    return result;
  }

  reset(): void {
    this.chunks = [];
    if (this.vad) {
      // VAD doesn't have a reset method; recreate
      this.init();
    }
  }

  destroy(): void {
    this.chunks = [];
    if (this.vad) {
      this.vad.free();
      this.vad = null;
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add electron/voice-endpoint.ts
git commit -m "feat: add VoiceEndpoint module using sherpa-onnx VAD for endpointing"
```

---

### Task 6: Update types and settings

**Files:**
- Modify: `src/types/index.ts`

- [ ] **Step 1: Add wake word types to AppSettings and IpcMessages**

In `src/types/index.ts`, add `wakeWordEnabled` and `wakeWordSilenceTimeout` to `AppSettings`:

```ts
// In AppSettings interface, add after vadTimeout:
  wakeWordEnabled?: boolean;
  wakeWordSilenceTimeout?: number; // seconds, default 3
```

Add wake word IPC channels to `IpcMessages`:

```ts
  // In IpcMessages interface, add:

  // wake word: invoke (request-response)
  'wake-word:toggle': { enabled: boolean };
  'wake-word:status': void;
  'wake-word:update-keyword': { keyword: string };

  // audio-listener: fire-and-forget
  'audio-listener:pcm-chunk': Float32Array;
  'audio-listener:start': void;
  'audio-listener:stop': void;
  'audio-listener:started': void;
  'audio-listener:error': string;
```

- [ ] **Step 2: Commit**

```bash
git add src/types/index.ts
git commit -m "feat: add wake word types and IPC channel definitions"
```

---

### Task 7: Integrate wake word into main.ts

**Files:**
- Modify: `electron/main.ts`

This is the core integration task. We add the wake word engine, audio listener, and VAD, wire them together with the state machine, and add IPC handlers.

- [ ] **Step 1: Add imports and global state**

At the top of `electron/main.ts`, add imports after existing ones:

```ts
import { WakeWordEngine } from './wake-word';
import { AudioListener } from './audio-listener';
import { VoiceEndpoint } from './voice-endpoint';
```

Add global state variables after existing ones (after `let isQuitting = false;`):

```ts
let wakeWordEngine: WakeWordEngine | null = null;
let audioListener: AudioListener | null = null;
let voiceEndpoint: VoiceEndpoint | null = null;
let wakeWordActive = false; // currently in spotting mode
let endpointMode = false; // true when recording after wake word detection
```

- [ ] **Step 2: Add wake word lifecycle functions**

Add these functions before `handleRightCommand()`:

```ts
// --- Wake Word Functions ---

function getKeyword(): string {
  const profile = readProfile(aivaDir);
  return profile.name || 'Aiva';
}

async function startWakeWord(): Promise<void> {
  if (wakeWordActive) return;

  const keyword = getKeyword();

  if (!wakeWordEngine) {
    wakeWordEngine = new WakeWordEngine();
    wakeWordEngine.init(keyword);
  }

  if (!audioListener) {
    audioListener = new AudioListener();
    audioListener.create();
    audioListener.registerChunkHandler(handleAudioChunk);
    await audioListener.start();
  } else if (!audioListener.isActive()) {
    await audioListener.start();
  }

  wakeWordEngine.start();
  wakeWordActive = true;
  log.info('唤醒词监听已启动, 关键词:', keyword);
}

function stopWakeWord(): void {
  if (wakeWordEngine) wakeWordEngine.stop();
  if (audioListener) audioListener.stop();
  wakeWordActive = false;
  endpointMode = false;
  log.info('唤醒词监听已停止');
}

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
}

function handleAudioChunk(samples: Float32Array): void {
  if (endpointMode) {
    // Feed to VAD endpointing
    voiceEndpoint?.feed(samples);
    return;
  }

  if (wakeWordActive && wakeWordEngine) {
    const detected = wakeWordEngine.feed(samples);
    if (detected) {
      onWakeWordDetected();
    }
  }
}

function onWakeWordDetected(): void {
  log.info('唤醒词检测到！切换到录音模式');
  wakeWordEngine?.stop();
  endpointMode = true;

  // Initialize VAD endpoint
  const settings = loadSettings();
  const timeout = settings.wakeWordSilenceTimeout ?? 3;

  voiceEndpoint = new VoiceEndpoint({
    silenceTimeout: timeout,
    minDuration: 0.5,
    maxDuration: 30,
  });
  voiceEndpoint.init();
  voiceEndpoint.setCallbacks(
    (wavPath) => onRecordingComplete(wavPath),
    () => onRecordingTooShort(),
  );
  voiceEndpoint.start();

  // Show voice bar and transition state
  voiceBar.show();
  store.transition('recording');
  updateTrayDot();
}

function onRecordingComplete(wavPath: string): void {
  endpointMode = false;
  log.info('唤醒词录音完成, 开始转写');

  store.transition('transcribing');
  updateTrayDot();
  voiceBar.send('voice:transcribing');

  recorder.transcribe(wavPath).then(text => {
    log.info('转写结果:', text || '(空)');
    if (text) {
      store.transition('editing');
      voiceBar.send('voice:transcript', { text, isAppending: false });
    } else {
      voiceBar.send('voice:error', { message: '未能识别语音，请重试' });
      store.transition('idle');
    }
    updateTrayDot();
  }).catch(err => {
    log.error('转写失败:', err);
    voiceBar.send('voice:error', { message: err.message });
    store.transition('idle');
    updateTrayDot();
  });
}

function onRecordingTooShort(): void {
  endpointMode = false;
  log.info('唤醒词录音太短，忽略');
  voiceBar.close();
  store.transition('idle');
  updateTrayDot();
}
```

- [ ] **Step 3: Hook into state machine for auto-resume**

In the `store.onChange` callback within `app.whenReady()`, add wake word resume logic. Find the existing `store.onChange(() => { ... })` block and add inside it:

```ts
// Resume wake word spotting when returning to idle
if (store.appState === 'idle' && wakeWordEnabled && !wakeWordActive && !endpointMode) {
  startWakeWord().catch(err => log.error('恢复唤醒词监听失败:', err));
}
```

Also need a helper to check if wake word is enabled:

```ts
function isWakeWordEnabled(): boolean {
  const settings = loadSettings();
  return settings.wakeWordEnabled === true;
}
```

Note: Replace `wakeWordEnabled` in the condition above with `isWakeWordEnabled()`.

- [ ] **Step 4: Add IPC handlers for wake word**

In `registerIpcHandlers()`, add these handlers:

```ts
// Wake word IPC handlers
ipcMain.handle('wake-word:toggle', async (_event, { enabled }: { enabled: boolean }) => {
  const settings = loadSettings();
  settings.wakeWordEnabled = enabled;
  saveSettings(settings);

  if (enabled) {
    try {
      await startWakeWord();
      return { success: true };
    } catch (err: any) {
      log.error('启动唤醒词失败:', err);
      return { success: false, error: err.message };
    }
  } else {
    destroyWakeWord();
    return { success: true };
  }
});

ipcMain.handle('wake-word:status', () => {
  return {
    enabled: isWakeWordEnabled(),
    active: wakeWordActive,
    keyword: getKeyword(),
  };
});

ipcMain.handle('wake-word:update-keyword', (_event, { keyword }: { keyword: string }) => {
  if (wakeWordEngine) {
    wakeWordEngine.updateKeyword(keyword);
  }
});
```

- [ ] **Step 5: Initialize wake word on startup if enabled**

In `app.whenReady()`, after the recorder initialization (after `recorder.setWindow(voiceBar.getWindow()!)`), add:

```ts
// Initialize wake word if enabled
if (isWakeWordEnabled()) {
  try {
    await startWakeWord();
    log.info('唤醒词功能已启动');
  } catch (err) {
    log.error('启动唤醒词功能失败:', err);
  }
}
```

- [ ] **Step 6: Clean up on quit**

In the `app.on('before-quit')` handler, add before existing cleanup:

```ts
destroyWakeWord();
```

- [ ] **Step 7: Update voice-bar onBlur handler**

The existing `voiceBar.onBlur` handler stops recording and returns to idle. For wake word, we also need to stop endpoint mode. Find the `voiceBar.onBlur = () => { ... }` block and add at the beginning:

```ts
if (endpointMode) {
  endpointMode = false;
  if (voiceEndpoint) {
    voiceEndpoint.destroy();
    voiceEndpoint = null;
  }
}
```

- [ ] **Step 8: Commit**

```bash
git add electron/main.ts
git commit -m "feat: integrate wake word engine, audio listener, and VAD into main process"
```

---

### Task 8: Add wake word settings UI

**Files:**
- Create: `src/app/settings/wake-word/page.tsx`

- [ ] **Step 1: Create wake word settings page**

Create `src/app/settings/wake-word/page.tsx`:

```tsx
'use client';

import { useState, useEffect } from 'react';
import { getIpcRenderer } from '@/lib/electron-ipc';

interface WakeWordStatus {
  enabled: boolean;
  active: boolean;
  keyword: string;
}

export default function WakeWordSettingsPage() {
  const ipcRenderer = getIpcRenderer();
  const [status, setStatus] = useState<WakeWordStatus>({
    enabled: false,
    active: false,
    keyword: 'Aiva',
  });
  const [silenceTimeout, setSilenceTimeout] = useState(3);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadStatus();
    loadSettings();
  }, []);

  async function loadStatus() {
    const s = await ipcRenderer.invoke('wake-word:status');
    setStatus(s);
  }

  async function loadSettings() {
    const settings = await ipcRenderer.invoke('settings:load');
    setSilenceTimeout(settings.wakeWordSilenceTimeout ?? 3);
  }

  async function toggle(enabled: boolean) {
    setLoading(true);
    setError(null);
    const result = await ipcRenderer.invoke('wake-word:toggle', { enabled });
    if (result.success) {
      await loadStatus();
    } else {
      setError(result.error || '启动失败');
    }
    setLoading(false);
  }

  async function saveTimeout(value: number) {
    setSilenceTimeout(value);
    await ipcRenderer.invoke('settings:save', {
      wakeWordSilenceTimeout: value,
    });
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center px-6 py-4 border-b border-border">
        <button
          onClick={() => ipcRenderer.send('navigate:route', { path: '/settings' })}
          className="text-sm text-muted hover:text-foreground transition-colors"
        >
          ← 设置
        </button>
        <h1 className="text-base font-semibold ml-4">语音唤醒</h1>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-3 rounded-lg text-sm">
            {error}
          </div>
        )}

        {/* Toggle */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">语音唤醒</p>
            <p className="text-xs text-muted mt-1">
              说出分身名称即可唤起对话，无需按键
            </p>
          </div>
          <button
            onClick={() => toggle(!status.enabled)}
            disabled={loading}
            className={`relative w-11 h-6 rounded-full transition-colors ${
              status.enabled ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'
            } ${loading ? 'opacity-50' : ''}`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
                status.enabled ? 'translate-x-5' : ''
              }`}
            />
          </button>
        </div>

        {/* Keyword preview */}
        <div className="space-y-2">
          <p className="text-sm font-medium">唤醒词</p>
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold">{status.keyword}</span>
            {status.active && (
              <span className="text-xs bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 px-2 py-0.5 rounded">
                监听中
              </span>
            )}
          </div>
          <p className="text-xs text-muted">
            唤醒词等于分身名称，可在「分身设定」中修改
          </p>
        </div>

        {/* Silence timeout */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">静音超时</p>
            <span className="text-sm text-muted">{silenceTimeout} 秒</span>
          </div>
          <input
            type="range"
            min="1"
            max="5"
            step="0.5"
            value={silenceTimeout}
            onChange={(e) => saveTimeout(parseFloat(e.target.value))}
            className="w-full"
          />
          <p className="text-xs text-muted">
            说完指令后多久自动停止录音
          </p>
        </div>

        {/* Info */}
        {status.enabled && (
          <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg space-y-2">
            <p className="text-sm font-medium text-blue-700 dark:text-blue-300">
              使用说明
            </p>
            <ul className="text-xs text-blue-600 dark:text-blue-400 space-y-1">
              <li>• 清晰说出「{status.keyword}」即可唤起</li>
              <li>• 唤醒后自动录音，说完等待 {silenceTimeout} 秒自动识别</li>
              <li>• 仅在空闲时监听，执行任务时暂停</li>
              <li>• 所有唤醒词检测在本地完成，不上传音频</li>
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add navigation link to settings page**

In `src/app/settings/page.tsx`, add a new settings group after the "语音" section. Find the section with `settings:load-volcengine-credentials` and add after it:

```tsx
{/* 语音唤醒 */}
<div
  onClick={() => ipcRenderer.send('navigate:route', { path: '/settings/wake-word' })}
  className="flex items-center justify-between p-3 rounded-lg hover:bg-secondary/50 cursor-pointer transition-colors"
>
  <div className="flex items-center gap-3">
    <span className="text-sm">语音唤醒</span>
    <span className="text-xs text-muted">说出名称即可唤起</span>
  </div>
  <span className="text-xs text-muted">→</span>
</div>
```

- [ ] **Step 3: Commit**

```bash
git add src/app/settings/wake-word/page.tsx src/app/settings/page.tsx
git commit -m "feat: add wake word settings UI with toggle, preview, and timeout"
```

---

### Task 9: Update build and packaging configuration

**Files:**
- Modify: `scripts/build-electron.mjs`
- Modify: `electron-builder.yml`
- Modify: `scripts/copy-native-deps.mjs`

- [ ] **Step 1: Update build-electron.mjs externals**

In `scripts/build-electron.mjs`, the `sherpa-onnx-node` is already in the external list. Verify it's there. If not, add `'sherpa-onnx-node'` to the external array.

- [ ] **Step 2: Update electron-builder.yml for model files**

In `electron-builder.yml`, add to `extraResources`:

```yaml
extraResources:
  - from: ".next/standalone"
    to: ".next/standalone"
  - from: ".next/static"
    to: ".next/standalone/.next/static"
  - from: "public"
    to: ".next/standalone/public"
  - from: "resources/sherpa-onnx"
    to: "sherpa-onnx"
```

- [ ] **Step 3: Update copy-native-deps.mjs**

The file already includes `sherpa-onnx-node` and `sherpa-onnx-darwin-arm64`. Verify they're there. No changes needed unless they're missing.

- [ ] **Step 4: Add download script to electron:build**

In `package.json`, update the `electron:build` script to run the model download first:

```json
"electron:build": "bash scripts/download-kws-models.sh && next build && node scripts/copy-native-deps.mjs && node scripts/build-electron.mjs && electron-builder"
```

- [ ] **Step 5: Commit**

```bash
git add scripts/build-electron.mjs electron-builder.yml package.json
git commit -m "build: add sherpa-onnx model packaging and build config"
```

---

### Task 10: Manual integration test

- [ ] **Step 1: Run electron dev mode**

```bash
npm run electron:dev
```

- [ ] **Step 2: Enable wake word in settings**

Open settings → 语音唤醒 → toggle on

- [ ] **Step 3: Test wake word detection**

Say the persona name clearly. Verify:
- Voice bar appears
- VAD records speech
- After 3s silence, transcription starts
- Transcript appears in voice bar

- [ ] **Step 4: Test state machine integration**

- While executing a task, verify wake word does NOT trigger
- After task completes (returns to idle), verify wake word resumes
- Press right Option key → verify it still works alongside wake word

- [ ] **Step 5: Test settings persistence**

- Close and reopen app → verify wake word is still enabled
- Change persona name → verify keyword updates
- Disable wake word → verify audio listener stops

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "test: manual integration test for wake word feature"
```
