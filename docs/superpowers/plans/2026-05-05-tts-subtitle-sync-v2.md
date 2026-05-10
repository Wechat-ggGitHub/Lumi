# TTS 字幕精准同步 v2 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 TTS 音频播放从 afplay 迁移到字幕窗口的 Web Audio API，实现歌词式精准同步，采用毛玻璃视觉设计。

**Architecture:** 主进程合成音频后通过 IPC 传 Buffer 给字幕窗口，字幕窗口用 Web Audio API 解码播放，`audioContext.currentTime` 驱动动画循环。播放结束或用户关闭通过 IPC 通知主进程清理。

**Tech Stack:** Electron IPC, Web Audio API (AudioContext/decodeAudioData/AudioBufferSourceNode), React requestAnimationFrame

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `electron/subtitle-popup.ts` | Modify | `show()` 接收 sentences + audioBuffer + personaName，`did-finish-load` 后发送 IPC |
| `electron/main.ts` | Modify | `speakResult()` 读 MP3 为 Buffer，通过 popup 传数据，等 IPC 事件；注册 `tts-stop-requested` / `tts-playback-done` |
| `src/app/subtitle/page.tsx` | Rewrite | 接收 IPC 音频数据，Web Audio API 播放，歌词式同步动画，毛玻璃视觉 |
| `electron/tts.ts` | Modify | 删除 `play()` 方法，简化 `stop()` |

---

### Task 1: 重写 SubtitlePopup.show() — 改为 IPC 数据传递

**Files:**
- Modify: `electron/subtitle-popup.ts`

- [ ] **Step 1: 重写 SubtitlePopup**

将 `show()` 签名改为接收 `sentences`, `audioBuffer`, `personaName`。页面加载不再带 query params，改为 `did-finish-load` 后通过 IPC 发送数据。

```typescript
import { BrowserWindow } from 'electron';
import { log } from '../src/lib/logger';

export interface SubtitlePayload {
  sentences: { text: string; startTime: number; endTime: number }[] | null;
  audio: Buffer;
  personaName: string;
}

export class SubtitlePopup {
  private win: BrowserWindow | null = null;
  private serverPort: number;

  constructor(serverPort: number) {
    this.serverPort = serverPort;
  }

  show(
    trayBounds: { x: number; y: number; width: number; height: number },
    payload: SubtitlePayload,
  ): void {
    this.close();

    const { x: trayX, y: trayY, width: trayWidth } = trayBounds;
    const popupWidth = 340;
    const popupX = Math.round(trayX + trayWidth / 2 - popupWidth / 2);
    const popupY = trayY + 8;

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
      },
    });

    this.win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

    // Convert Buffer to Uint8Array for IPC transfer
    const audioUint8 = new Uint8Array(payload.audio);

    this.win.loadURL(`http://127.0.0.1:${this.serverPort}/subtitle`);
    this.win.webContents.once('did-finish-load', () => {
      this.win?.webContents.send('tts-audio-data', {
        audio: audioUint8,
        sentences: payload.sentences,
        personaName: payload.personaName,
      });
    });
    this.win.once('ready-to-show', () => {
      this.win?.show();
      log.info('字幕弹窗: 已显示');
    });
  }

  close(): void {
    if (this.win && !this.win.isDestroyed()) {
      this.win.close();
      this.win = null;
      log.info('字幕弹窗: 已关闭');
    }
  }

  destroy(): void {
    this.close();
  }
}
```

- [ ] **Step 2: 验证构建**

Run: `npm run build:electron`
Expected: 编译成功，无错误

- [ ] **Step 3: Commit**

```bash
git add electron/subtitle-popup.ts
git commit -m "refactor: SubtitlePopup uses IPC data transfer instead of URL params"
```

---

### Task 2: 改写 main.ts speakResult() + 简化 TtsService（原子操作）

Task 2 和 Task 3 必须一起做：删除 play() 调用处和 play() 方法本身。

**Files:**
- Modify: `electron/main.ts:573-629` (speakResult 函数)
- Modify: `electron/tts.ts`

- [ ] **Step 1: 改写 speakResult()**

替换整个 `speakResult()` 函数。核心变化：
1. 不再调用 `ttsService.play()`，改为 `subtitlePopup.show()` 传 Buffer
2. 用 Promise 等待 IPC 事件（`tts-playback-done` 或 `tts-stop-requested`）
3. 读取 persona name 传给字幕窗口

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
    const result = await ttsService.synthesize({
      appId: creds.appId,
      accessToken: creds.accessToken,
      text: summary,
      signal: ttsAbortController.signal,
    });

    if (!result) {
      log.info('TTS: 合成失败或被中断，跳过播放');
      return;
    }

    const sentences = result.sentences.length > 0 ? result.sentences : null;
    const audioBuffer = fs.readFileSync(result.audioPath);
    const profile = readProfile(aivaDir);

    const trayBounds = tray.getBounds();
    subtitlePopup.show(trayBounds, {
      audio: audioBuffer,
      sentences,
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

- [ ] **Step 2: 简化 TtsService**

在 `electron/tts.ts` 中：
1. 删除 `private playProcess: ChildProcess | null = null;` 字段
2. 删除整个 `play()` 方法（line 367-380）
3. 简化 `stop()` 为只调用 `this.cleanup()`，删除 playProcess 相关代码
4. 删除顶部 `import { spawn, ChildProcess } from 'child_process';`（play() 删除后不再需要）
5. 删除 `isPlaying` getter（依赖 playProcess）

`stop()` 改为：
```typescript
stop(): void {
  this.cleanup();
}
```

- [ ] **Step 3: 验证构建**

Run: `npm run build:electron`
Expected: 编译成功

- [ ] **Step 4: Commit**

```bash
git add electron/main.ts electron/tts.ts
git commit -m "feat: IPC-driven playback, remove afplay from TtsService"
```

---

### Task 3: 重写字幕页 — Web Audio API + 毛玻璃歌词式

**Files:**
- Rewrite: `src/app/subtitle/page.tsx`

- [ ] **Step 1: 重写整个 page.tsx**

这是最大的改动。页面不再从 URL params 读取数据，改为监听 IPC `tts-audio-data` 事件接收音频 Buffer 和句子数据。用 Web Audio API 播放，`audioContext.currentTime` 驱动动画。

```tsx
'use client';

import { useEffect, useState, useRef, useCallback, Suspense } from 'react';
import { getIpcRenderer } from '@/lib/electron-ipc';

interface TtsSentence {
  text: string;
  startTime: number;
  endTime: number;
}

interface TtsAudioPayload {
  audio: Uint8Array;
  sentences: TtsSentence[] | null;
  personaName: string;
}

function SubtitleContent() {
  const [sentences, setSentences] = useState<TtsSentence[] | null>(null);
  const [personaName, setPersonaName] = useState('S');
  const [activeIndex, setActiveIndex] = useState(-1);
  const [visible, setVisible] = useState(false);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const startTimeRef = useRef<number>(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentenceRefs = useRef<(HTMLDivElement | null)[]>([]);
  const rafRef = useRef<number>(0);

  const tick = useCallback(() => {
    const ctx = audioCtxRef.current;
    if (!ctx || startTimeRef.current === 0) return;

    const elapsed = ctx.currentTime - startTimeRef.current;

    // Find current sentence
    if (sentences && sentences.length > 0) {
      let currentIdx = -1;
      for (let i = 0; i < sentences.length; i++) {
        if (elapsed >= sentences[i].startTime && elapsed < sentences[i].endTime) {
          currentIdx = i;
          break;
        }
      }
      if (currentIdx === -1 && elapsed >= sentences[sentences.length - 1].startTime) {
        currentIdx = sentences.length - 1;
      }

      if (currentIdx !== activeIndex) {
        setActiveIndex(currentIdx);
      }

      // Scroll current sentence to 1/3 from top
      if (currentIdx >= 0 && sentenceRefs.current[currentIdx] && scrollRef.current) {
        const el = sentenceRefs.current[currentIdx]!;
        const containerHeight = scrollRef.current.clientHeight;
        scrollRef.current.scrollTop = Math.max(0, el.offsetTop - containerHeight / 3);
      }

      const totalDuration = sentences[sentences.length - 1].endTime;
      if (elapsed < totalDuration + 0.5) {
        rafRef.current = requestAnimationFrame(tick);
      }
    }
  }, [sentences, activeIndex]);

  useEffect(() => {
    const ipc = getIpcRenderer();
    if (!ipc) return;

    const handler = async (_event: any, payload: TtsAudioPayload) => {
      setPersonaName(payload.personaName?.charAt(0).toUpperCase() || 'S');

      let ctx: AudioContext;
      try {
        ctx = new AudioContext();
        audioCtxRef.current = ctx;
      } catch {
        getIpcRenderer()?.send('tts-playback-done');
        return;
      }

      try {
        const audioBuffer = await ctx.decodeAudioData(payload.audio.buffer.slice(0));
        const source = ctx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(ctx.destination);

        source.onended = () => {
          getIpcRenderer()?.send('tts-playback-done');
        };

        startTimeRef.current = ctx.currentTime;
        source.start(0);
        sourceRef.current = source;
      } catch {
        getIpcRenderer()?.send('tts-playback-done');
        return;
      }

      setSentences(payload.sentences);
      requestAnimationFrame(() => setVisible(true));
    };

    ipc.on('tts-audio-data', handler);
    return () => {
      ipc.removeListener('tts-audio-data', handler);
    };
  }, []);

  useEffect(() => {
    if (visible && sentences && sentences.length > 0) {
      rafRef.current = requestAnimationFrame(tick);
    }
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [tick, visible, sentences]);

  useEffect(() => {
    return () => {
      sourceRef.current?.stop();
      audioCtxRef.current?.close();
    };
  }, []);

  const handleClose = () => {
    sourceRef.current?.stop();
    getIpcRenderer()?.send('tts-stop-requested');
  };

  const getSentenceColor = (index: number) => {
    if (index === activeIndex) return '#ffffff';
    if (index < activeIndex) return 'rgba(255, 255, 255, 0.25)';
    const distance = index - activeIndex;
    return `rgba(255, 255, 255, ${Math.max(0.35, 0.7 - distance * 0.12)})`;
  };

  return (
    <div
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        padding: '14px 18px',
        background: 'rgba(40, 40, 55, 0.75)',
        borderRadius: '14px',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        border: '1px solid rgba(255, 255, 255, 0.12)',
        boxShadow: '0 4px 24px rgba(0, 0, 0, 0.3)',
        opacity: visible ? 1 : 0,
        transition: 'opacity 0.3s ease',
        minHeight: '80px',
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

      {/* Header: avatar + waveform (no text) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
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
                animation: `waveBar 0.5s ease-in-out ${i * 0.1}s infinite alternate`,
              }}
            />
          ))}
        </div>
      </div>

      {/* Lyric area */}
      <div
        ref={scrollRef}
        style={{
          position: 'relative',
          fontSize: '13px',
          lineHeight: '1.8',
          wordBreak: 'break-word',
          overflow: 'hidden',
          height: '90px',
        }}
      >
        <div style={{ position: 'relative' }}>
          {sentences && sentences.length > 0
            ? sentences.map((s, i) => (
                <div
                  key={i}
                  ref={(el) => {
                    sentenceRefs.current[i] = el;
                  }}
                  style={{
                    color: getSentenceColor(i),
                    fontWeight: i === activeIndex ? 500 : 400,
                    textShadow:
                      i === activeIndex ? '0 0 12px rgba(76, 175, 80, 0.3)' : 'none',
                    transition: 'color 0.2s ease',
                    padding: '2px 0',
                  }}
                >
                  {s.text}
                </div>
              ))
            : '...'}
        </div>
        {/* Top gradient mask */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: '28px',
            background: 'linear-gradient(to bottom, rgba(40, 40, 55, 0.9), transparent)',
            pointerEvents: 'none',
          }}
        />
        {/* Bottom gradient mask */}
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: '28px',
            background: 'linear-gradient(to top, rgba(40, 40, 55, 0.9), transparent)',
            pointerEvents: 'none',
          }}
        />
      </div>
    </div>
  );
}

export default function SubtitlePage() {
  return (
    <>
      <style>{`html, body { background: transparent !important; overflow: hidden !important; }
@keyframes waveBar { from { height: 4px; } to { height: 14px; } }`}</style>
      <Suspense fallback={null}>
        <SubtitleContent />
      </Suspense>
    </>
  );
}
```

- [ ] **Step 2: 验证 Next.js 构建**

Run: `npm run build`
Expected: 构建成功，subtitle 页面无错误

- [ ] **Step 3: 验证 Electron 构建**

Run: `npm run build:electron`
Expected: 编译成功

- [ ] **Step 4: Commit**

```bash
git add src/app/subtitle/page.tsx
git commit -m "feat: rewrite subtitle page with Web Audio API and frosted glass design"
```

---

### Task 4: 端到端验证

- [ ] **Step 1: 完整构建**

Run: `npm run build && npm run build:electron`
Expected: 两个构建都成功

- [ ] **Step 2: 检查 subtitle bundle 无 existsSync**

Run: `grep -c "existsSync" .next/static/chunks/app/subtitle/page-*.js`
Expected: `0`

- [ ] **Step 3: 运行现有测试**

Run: `npx jest --passWithNoTests 2>&1 | tail -5`
Expected: 所有测试通过（或无测试文件）

- [ ] **Step 4: 启动 Electron 开发模式手动测试**

Run: `npm run electron:dev`

验证：
1. 触发一次语音指令，等待执行完成
2. 确认右上角弹出毛玻璃字幕窗口
3. 确认显示 Agent 头像首字母 + 波形动画（无文字）
4. 确认歌词式同步：当前句子白色高亮，已读/未读渐隐
5. 确认关闭按钮正常工作
6. 确认播报自然结束后窗口关闭

- [ ] **Step 5: Commit (如有手动测试修复)**

```bash
git add -A
git commit -m "fix: address e2e testing issues"
```

---

### Task 5: 打包发布

- [ ] **Step 1: 完整打包**

Run: `npm run electron:build`
Expected: 生成 DMG 和 ZIP 在 `release/` 目录

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "chore: update lock file after electron build"
```
