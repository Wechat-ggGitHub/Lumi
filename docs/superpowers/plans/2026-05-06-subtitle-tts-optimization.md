# Subtitle & TTS Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix subtitle freezing mid-playback, support dynamic height with auto-scrolling, and reduce TTS playback delay by parallelizing synthesis with window preparation.

**Architecture:** Refactor `SubtitlePopup` to reuse BrowserWindow (hide/show instead of create/destroy). Replace rAF with `setInterval` to avoid Chromium throttling. Add auto-scrolling to the subtitle text area. Parallelize TTS synthesis and window preparation in `speakResult()`.

**Tech Stack:** Electron BrowserWindow, React 19, AudioContext, IPC

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `electron/subtitle-popup.ts` | Modify | Window lifecycle (reuse, hide/show), `backgroundThrottling`, dynamic height, `prepare()` |
| `src/app/subtitle/page.tsx` | Modify | `setInterval` tick loop, auto-scroll container, height measurement, manual scroll override |
| `electron/main.ts` | Modify | Parallel TTS + window prep in `speakResult()` |

No new files created. No test files — the changes are Electron/React UI behavior not testable with Jest (no DOM, no BrowserWindow in test env).

---

### Task 1: Refactor SubtitlePopup — window reuse + backgroundThrottling

**Files:**
- Modify: `electron/subtitle-popup.ts` (full rewrite)

**Context:** The current `SubtitlePopup` creates a new `BrowserWindow` on every `show()` and destroys it on `close()`. We change it to create once, reuse via hide/show, and add `backgroundThrottling: false`.

- [ ] **Step 1: Rewrite `electron/subtitle-popup.ts`**

Replace the full file content with:

```typescript
import { BrowserWindow, ipcMain } from 'electron';
import { log } from '../src/lib/logger';

export interface SubtitlePayload {
  sentences: { text: string; startTime: number; endTime: number }[] | null;
  words: { word: string; startTime: number; endTime: number }[] | null;
  audio: Buffer;
  personaName: string;
}

export class SubtitlePopup {
  private win: BrowserWindow | null = null;
  private serverPort: number;
  private readyResolve: (() => void) | null = null;

  constructor(serverPort: number) {
    this.serverPort = serverPort;
  }

  private ensureWindow(trayBounds: { x: number; y: number; width: number; height: number }): void {
    const popupWidth = 340;
    const popupX = Math.round(trayBounds.x + trayBounds.width / 2 - popupWidth / 2);
    const popupY = trayBounds.y + 8;

    if (this.win && !this.win.isDestroyed()) {
      this.win.setPosition(popupX, popupY);
      this.win.setSize(popupWidth, 140);
      return;
    }

    this.win = new BrowserWindow({
      width: popupWidth,
      height: 140,
      x: popupX,
      y: popupY,
      frame: false,
      transparent: true,
      resizable: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      hasShadow: false,
      show: false,
      focusable: true,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
        backgroundThrottling: false,
      },
    });

    this.win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    this.win.loadURL(`http://127.0.0.1:${this.serverPort}/subtitle`);

    this.win.on('closed', () => {
      this.win = null;
      this.readyResolve = null;
    });

    // Listen for dynamic height changes from renderer
    this.win.webContents.on('ipc-message', (_event, channel, args) => {
      if (channel === 'tts-content-height' && typeof args === 'number') {
        const contentHeight = args;
        const winHeight = Math.max(140, Math.min(400, 42 + contentHeight + 28));
        this.win?.setSize(340, winHeight);
      }
    });
  }

  prepare(trayBounds: { x: number; y: number; width: number; height: number }): Promise<void> {
    this.ensureWindow(trayBounds);

    if (!this.win) return Promise.reject(new Error('Failed to create subtitle window'));

    // If window is already showing with a loaded page, just ensure it's positioned
    if (!this.win.isVisible()) {
      return new Promise<void>((resolve) => {
        this.win!.once('ready-to-show', () => resolve());
        this.win!.webContents.once('did-finish-load', () => resolve());
      });
    }

    return Promise.resolve();
  }

  show(
    trayBounds: { x: number; y: number; width: number; height: number },
    payload: SubtitlePayload,
  ): void {
    this.ensureWindow(trayBounds);

    if (!this.win) return;

    const audioUint8 = new Uint8Array(payload.audio);

    // Reload page to reset state
    this.win.webContents.reload();

    ipcMain.removeAllListeners('tts-page-ready');
    ipcMain.once('tts-page-ready', () => {
      this.win?.webContents.send('tts-audio-data', {
        audio: audioUint8,
        sentences: payload.sentences,
        words: payload.words,
        personaName: payload.personaName,
      });
    });

    this.win.show();
    log.info('字幕弹窗: 已显示');
  }

  close(): void {
    if (this.win && !this.win.isDestroyed() && this.win.isVisible()) {
      this.win.hide();
      log.info('字幕弹窗: 已隐藏');
    }
  }

  destroy(): void {
    if (this.win && !this.win.isDestroyed()) {
      this.win.close();
      this.win = null;
    }
    ipcMain.removeAllListeners('tts-page-ready');
    log.info('字幕弹窗: 已销毁');
  }
}
```

Key changes from original:
- `backgroundThrottling: false` in webPreferences
- `ensureWindow()` creates window only once, repositions on reuse
- `close()` calls `win.hide()` instead of `win.close()`
- `destroy()` for app shutdown (existing call site at line 1221)
- `prepare()` method for parallel window preparation
- `tts-content-height` IPC listener for dynamic resizing
- `show()` reloads page content to reset React state before each playback

- [ ] **Step 2: Verify no compile errors**

Run: `npx tsc --noEmit --project tsconfig.electron.json 2>&1 | head -20`

Expected: No errors related to `subtitle-popup.ts`

- [ ] **Step 3: Commit**

```bash
git add electron/subtitle-popup.ts
git commit -m "refactor: subtitle popup reuse with backgroundThrottling and dynamic height"
```

---

### Task 2: Replace rAF with setInterval + add auto-scroll + height measurement

**Files:**
- Modify: `src/app/subtitle/page.tsx` (full rewrite of `SubtitleContent`)

**Context:** The current `tick` loop uses `requestAnimationFrame` which gets throttled when the BrowserWindow loses focus. We replace it with `setInterval(50ms)`. We also add a scrollable text container that auto-follows the current word.

- [ ] **Step 1: Rewrite `src/app/subtitle/page.tsx`**

Replace the full file content with:

```tsx
'use client';

import { useEffect, useState, useRef, useCallback, Suspense } from 'react';
import { getIpcRenderer } from '@/lib/electron-ipc';

interface TtsWord {
  word: string;
  startTime: number;
  endTime: number;
}

interface TtsAudioPayload {
  audio: Uint8Array;
  words: TtsWord[] | null;
  personaName: string;
}

function SubtitleContent() {
  const [words, setWords] = useState<TtsWord[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [visible, setVisible] = useState(false);
  const [personaName, setPersonaName] = useState('S');

  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const startTimeRef = useRef<number>(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const wordRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const autoScrollRef = useRef(true);
  const manualScrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textContainerRef = useRef<HTMLDivElement | null>(null);

  const stopTick = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const startTick = useCallback(() => {
    stopTick();
    intervalRef.current = setInterval(() => {
      const ctx = audioCtxRef.current;
      if (!ctx || startTimeRef.current === 0) return;

      const elapsed = ctx.currentTime - startTimeRef.current;
      const currentWords = words;
      if (currentWords.length === 0) return;

      let idx = -1;
      for (let i = currentWords.length - 1; i >= 0; i--) {
        if (elapsed >= currentWords[i].startTime) {
          idx = i;
          break;
        }
      }

      setCurrentIndex(idx);

      // Auto-scroll to current word
      if (idx >= 0 && autoScrollRef.current && wordRefs.current[idx]) {
        wordRefs.current[idx]?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }

      const lastEnd = currentWords[currentWords.length - 1].endTime;
      if (elapsed >= lastEnd + 0.5) {
        stopTick();
      }
    }, 50);
  }, [words, stopTick]);

  // Start tick loop when words are loaded and visible
  useEffect(() => {
    if (visible && words.length > 0) {
      startTick();
    }
    return () => stopTick();
  }, [startTick, visible, words]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopTick();
      sourceRef.current?.stop();
      audioCtxRef.current?.close();
      if (manualScrollTimerRef.current) clearTimeout(manualScrollTimerRef.current);
    };
  }, [stopTick]);

  // Measure text height and notify main process
  useEffect(() => {
    if (!textContainerRef.current || !visible) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const height = entry.contentRect.height;
        getIpcRenderer()?.send('tts-content-height', height);
      }
    });

    observer.observe(textContainerRef.current);
    return () => observer.disconnect();
  }, [visible]);

  // Manual scroll override handler
  const handleScroll = useCallback(() => {
    autoScrollRef.current = false;
    if (manualScrollTimerRef.current) clearTimeout(manualScrollTimerRef.current);
    manualScrollTimerRef.current = setTimeout(() => {
      autoScrollRef.current = true;
    }, 2000);
  }, []);

  useEffect(() => {
    const ipc = getIpcRenderer();
    if (!ipc) return;

    ipc.send('tts-page-ready');

    const handler = async (_event: any, payload: TtsAudioPayload) => {
      setPersonaName(payload.personaName?.charAt(0).toUpperCase() || 'S');
      setCurrentIndex(-1);
      wordRefs.current = [];

      let ctx: AudioContext;
      try {
        ctx = new AudioContext();
        audioCtxRef.current = ctx;
      } catch {
        getIpcRenderer()?.send('tts-playback-done');
        return;
      }

      try {
        const audioBuffer = await ctx.decodeAudioData(payload.audio.buffer.slice(0) as ArrayBuffer);
        const source = ctx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(ctx.destination);

        source.onended = () => {
          setIsPlaying(false);
          stopTick();
          getIpcRenderer()?.send('tts-playback-done');
        };

        startTimeRef.current = ctx.currentTime;
        source.start(0);
        sourceRef.current = source;
      } catch {
        getIpcRenderer()?.send('tts-playback-done');
        return;
      }

      if (payload.words && payload.words.length > 0) {
        setWords(payload.words);
      }
      setIsPlaying(true);
      requestAnimationFrame(() => setVisible(true));
    };

    ipc.on('tts-audio-data', handler);
    return () => {
      ipc.removeListener('tts-audio-data', handler);
    };
  }, [stopTick]);

  const handleClose = () => {
    stopTick();
    sourceRef.current?.stop();
    getIpcRenderer()?.send('tts-stop-requested');
  };

  return (
    <div
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        padding: '14px 18px',
        background: 'rgb(28, 28, 35)',
        borderRadius: '14px',
        boxShadow: '0 4px 24px rgba(0, 0, 0, 0.4)',
        opacity: visible ? 1 : 0,
        transition: 'opacity 0.3s ease',
        minHeight: '80px',
        maxHeight: '400px',
        color: '#e0e0e0',
        fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif',
      }}
    >
      {/* Close button */}
      <button
        onClick={handleClose}
        style={{
          position: 'absolute',
          top: '8px',
          right: '8px',
          width: '18px',
          height: '18px',
          borderRadius: '50%',
          border: 'none',
          background: 'rgba(255, 255, 255, 0.08)',
          cursor: 'pointer',
          padding: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'background 0.15s',
          zIndex: 10,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
        }}
      >
        <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
          <path d="M1 1L7 7M7 1L1 7" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>

      {/* Header: avatar + waveform */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px', flexShrink: 0 }}>
        <div
          style={{
            width: '22px',
            height: '22px',
            borderRadius: '6px',
            background: 'linear-gradient(135deg, #667eea, #764ba2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: '10px', color: 'white', fontWeight: 600 }}>{personaName}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '2px', height: '14px' }}>
          {[6, 10, 14, 8, 12].map((h, i) => (
            <div
              key={i}
              style={{
                width: '2px',
                height: `${h}px`,
                background: '#4CAF50',
                borderRadius: '1px',
                animation: isPlaying ? `waveBar 0.5s ease-in-out ${i * 0.1}s infinite alternate` : 'none',
              }}
            />
          ))}
        </div>
      </div>

      {/* Scrollable text area */}
      <div
        ref={(el) => {
          scrollContainerRef.current = el;
        }}
        onScroll={handleScroll}
        style={{
          fontSize: '13px',
          lineHeight: '1.8',
          wordBreak: 'break-word',
          overflowY: 'auto',
          maxHeight: 'calc(400px - 42px - 28px)',
          paddingRight: '4px',
        }}
      >
        <div ref={(el) => { textContainerRef.current = el; }}>
          {words.length > 0
            ? words.map((w, i) => {
                let color = 'transparent';
                if (i < currentIndex) color = 'rgba(255, 255, 255, 0.5)';
                else if (i === currentIndex) color = '#ffffff';
                return (
                  <span
                    key={i}
                    ref={(el) => { wordRefs.current[i] = el; }}
                    style={{ color, transition: 'color 0.1s ease' }}
                  >
                    {w.word}
                  </span>
                );
              })
            : '...'}
        </div>
      </div>
    </div>
  );
}

export default function SubtitlePage() {
  return (
    <>
      <style>{`html, body { background: transparent !important; overflow: hidden !important; }
@keyframes waveBar { from { height: 4px; } to { height: 14px; } }
@keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
::-webkit-scrollbar { width: 4px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 2px; }
::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.3); }`}</style>
      <Suspense fallback={null}>
        <SubtitleContent />
      </Suspense>
    </>
  );
}
```

Key changes from original:
- `setInterval(tick, 50)` replaces `requestAnimationFrame` loop
- `stopTick()` clears the interval on playback end and unmount
- `wordRefs` array stores refs for each word span
- `scrollContainerRef` with `overflow-y: auto` for scrolling
- `autoScrollRef` + `manualScrollTimerRef` for manual scroll override (2s cooldown)
- `textContainerRef` + `ResizeObserver` measures content height, sends `tts-content-height` IPC
- Custom scrollbar styles in the `<style>` tag
- `maxHeight: '400px'` on outer container

- [ ] **Step 2: Verify no compile errors**

Run: `npx tsc --noEmit 2>&1 | head -20`

Expected: No errors related to `subtitle/page.tsx`

- [ ] **Step 3: Commit**

```bash
git add src/app/subtitle/page.tsx
git commit -m "feat: setInterval tick, auto-scroll, and dynamic height for subtitle popup"
```

---

### Task 3: Parallelize TTS synthesis + window preparation in main.ts

**Files:**
- Modify: `electron/main.ts:573-640` (the `speakResult` function)

**Context:** Currently `speakResult()` runs TTS synthesis first, then creates the popup. We run them in parallel.

- [ ] **Step 1: Modify the `speakResult` function in `electron/main.ts`**

Replace lines 573-640 (the `speakResult` function) with:

```typescript
async function speakResult(summary: string): Promise<void> {
  const creds = loadVolcengineCredentials();
  if (!creds) {
    log.info('TTS: 火山引擎凭证未配置，跳过语音播报');
    return;
  }

  if (!summary || summary.trim().length === 0) {
    log.info('TTS: summary 为空，跳过语音播报');
    return;
  }

  ttsAbortController = new AbortController();
  store.setSpeaking(true);
  updateTrayDot();

  try {
    // Start TTS synthesis and window preparation in parallel
    const trayBounds = tray.getBounds();
    const profile = readProfile(aivaDir);

    const [ttsResult] = await Promise.all([
      ttsService.synthesize({
        appId: creds.appId,
        accessToken: creds.accessToken,
        text: summary,
        signal: ttsAbortController.signal,
      }),
      subtitlePopup.prepare(trayBounds),
    ]);

    if (!ttsResult) {
      log.info('TTS: 合成失败或被中断，跳过播放');
      return;
    }

    const sentences = ttsResult.sentences.length > 0 ? ttsResult.sentences : null;
    const words = ttsResult.words.length > 0 ? ttsResult.words : null;
    const audioBuffer = fs.readFileSync(ttsResult.audioPath);

    subtitlePopup.show(trayBounds, {
      audio: audioBuffer,
      sentences,
      words,
      personaName: profile.name,
    });

    // Wait for subtitle renderer to finish playing or user to stop
    await new Promise<void>((resolve) => {
      const onDone = () => {
        ipcMain.removeListener('tts-stop-requested', onStop);
        resolve();
      };
      const onStop = () => {
        ipcMain.removeListener('tts-playback-done', onDone);
        resolve();
      };
      ipcMain.once('tts-playback-done', onDone);
      ipcMain.once('tts-stop-requested', onStop);
    });
  } catch (err) {
    log.error('TTS: 语音播报异常:', err);
  } finally {
    store.setSpeaking(false);
    ttsAbortController = null;
    subtitlePopup.close();
    ttsService.stop();
    updateTrayDot();
    if (store.appState === 'completed') {
      store.transition('idle');
    }
  }
}
```

Key changes:
- `tray.getBounds()` and `readProfile()` moved before the parallel block (they're sync, no need to parallelize)
- `Promise.all([ttsService.synthesize(...), subtitlePopup.prepare(trayBounds)])` runs both concurrently
- `subtitlePopup.prepare()` ensures window is loaded and ready while TTS is synthesizing
- After both complete, `subtitlePopup.show()` sends audio data to the already-ready window
- The rest (wait for playback, cleanup) is unchanged

- [ ] **Step 2: Verify no compile errors**

Run: `npx tsc --noEmit --project tsconfig.electron.json 2>&1 | head -20`

Expected: No errors related to `main.ts`

- [ ] **Step 3: Commit**

```bash
git add electron/main.ts
git commit -m "perf: parallelize TTS synthesis and subtitle window preparation"
```

---

### Task 4: End-to-end verification

**Files:** None (testing only)

- [ ] **Step 1: Build both targets**

```bash
npm run build && npm run build:electron
```

Expected: Both build without errors.

- [ ] **Step 2: Run existing tests**

```bash
npx jest --passWithNoTests
```

Expected: All tests pass (no new tests added; existing tests unchanged).

- [ ] **Step 3: Manual test in Electron dev mode**

```bash
npm run electron:dev
```

Then:
1. Trigger a voice command that generates a long response (>3 lines of text)
2. Verify: subtitle text scrolls automatically as words are spoken
3. Verify: popup height grows beyond 140px when text is long (up to 400px max)
4. Verify: manually scrolling pauses auto-scroll, which resumes after 2 seconds
5. Click away from the popup to another window
6. Verify: subtitle continues to update (no freeze)
7. Note the time between green dot appearing and voice starting — should be noticeably shorter than before

- [ ] **Step 4: Commit any fixes found during testing**

If any issues found during manual test, fix and commit with descriptive message.

---

## Self-Review Checklist

**1. Spec coverage:**
- ✅ backgroundThrottling: Task 1
- ✅ Window reuse (hide/show): Task 1
- ✅ Dynamic height: Task 1 (IPC listener) + Task 2 (ResizeObserver)
- ✅ Auto-scroll: Task 2
- ✅ Manual scroll override (2s): Task 2
- ✅ setInterval replaces rAF: Task 2
- ✅ Parallel TTS + window prep: Task 3
- ✅ New IPC channel `tts-content-height`: Task 1 + Task 2

**2. Placeholder scan:** No TBD, TODO, or placeholder steps. All code is complete.

**3. Type consistency:**
- `SubtitlePopup.prepare()` returns `Promise<void>` — matches `Promise.all` usage in Task 3
- `SubtitlePopup.show()` signature unchanged — matches existing call site
- `SubtitlePopup.close()` and `destroy()` signatures unchanged — match existing call sites (lines 293, 633, 1221)
- `tts-content-height` IPC sends `number` from renderer (Task 2), main process checks `typeof args === 'number'` (Task 1)
- `stopTick` function name consistent across all usages in Task 2
