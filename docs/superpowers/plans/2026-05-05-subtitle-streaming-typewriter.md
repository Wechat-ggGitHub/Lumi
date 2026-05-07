# 字幕流式打字机效果 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将字幕弹窗从歌词式逐句高亮改为流式打字机效果，音频读到哪个字就显示哪个字，严格同步。

**Architecture:** TTS API 返回 word 级时间戳，通过 IPC 传到渲染进程，`requestAnimationFrame` 循环用 `AudioContext.currentTime` 精确驱动每个字的显示时机。修改 5 个文件：parser 增加 words 返回、tts 收集 words、payload 增加 words、main 传递 words、page 重写渲染。

**Tech Stack:** TypeScript, Electron, React, Web Audio API, Jest

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `electron/tts-sentence-parser.ts` | Modify | `ParsedSentence` 增加 `words` 字段，透传 `payload.words` |
| `electron/tts.ts` | Modify | `TtsResult` 增加 `words`，`EVENT_TTS_SENTENCE_END` 收集 words 到扁平数组 |
| `electron/subtitle-popup.ts` | Modify | `SubtitlePayload` 增加 `words` 字段，IPC 传递 |
| `electron/main.ts` | Modify | `speakResult` 传递 `result.words` |
| `src/__tests__/tts-sentence-parser.test.ts` | Modify | 增加测试验证 words 透传 |
| `src/app/subtitle/page.tsx` | Rewrite | 流式打字机渲染 + 波形动画控制 |

---

### Task 1: Update parser to pass through words

**Files:**
- Modify: `electron/tts-sentence-parser.ts`
- Modify: `src/__tests__/tts-sentence-parser.test.ts`

- [ ] **Step 1: Add test for words passthrough**

Add to `src/__tests__/tts-sentence-parser.test.ts`:

```typescript
  it('passes through words array from payload', () => {
    const payload = {
      phonemes: [],
      text: '哈哈',
      words: [
        { startTime: 0.435, endTime: 0.625, word: '哈', confidence: 0.86 },
        { startTime: 0.625, endTime: 0.715, word: '哈', confidence: 0.71 },
      ],
    };

    const result = parseSentenceFromPayload(payload);

    expect(result).not.toBeNull();
    expect(result!.words).toEqual([
      { startTime: 0.435, endTime: 0.625, word: '哈', confidence: 0.86 },
      { startTime: 0.625, endTime: 0.715, word: '哈', confidence: 0.71 },
    ]);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/__tests__/tts-sentence-parser.test.ts --no-cache`
Expected: The new test fails — `result.words` is `undefined`

- [ ] **Step 3: Update `ParsedSentence` interface and pass words through**

In `electron/tts-sentence-parser.ts`, update the interface and function:

```typescript
// electron/tts-sentence-parser.ts

export interface ParsedSentence {
  text: string;
  duration: number;
  words?: Array<{ word: string; startTime: number; endTime: number; [key: string]: any }>;
}

export function parseSentenceFromPayload(payload: any): ParsedSentence | null {
  const sentenceText =
    payload?.text
    ?? payload?.res_params?.text
    ?? payload?.payload?.text
    ?? payload?.sentence?.text
    ?? '';

  let duration =
    payload?.res_params?.duration
    ?? payload?.payload?.duration
    ?? 0;

  if (duration === 0 && Array.isArray(payload?.words) && payload.words.length > 0) {
    const first = payload.words[0];
    const last = payload.words[payload.words.length - 1];
    if (first?.startTime != null && last?.endTime != null) {
      duration = last.endTime - first.startTime;
    }
  }

  if (duration > 0 && sentenceText) {
    return {
      text: sentenceText,
      duration,
      words: Array.isArray(payload?.words) && payload.words.length > 0 ? payload.words : undefined,
    };
  }

  return null;
}
```

- [ ] **Step 4: Run all tests**

Run: `npx jest src/__tests__/tts-sentence-parser.test.ts --no-cache`
Expected: 5 tests PASS (4 existing + 1 new)

- [ ] **Step 5: Commit**

```bash
git add electron/tts-sentence-parser.ts src/__tests__/tts-sentence-parser.test.ts
git commit -m "feat: pass through words array in TTS sentence parser"
```

---

### Task 2: Collect words in tts.ts and add to TtsResult

**Files:**
- Modify: `electron/tts.ts`

- [ ] **Step 1: Add `TtsWord` interface and `words` to `TtsResult`**

In `electron/tts.ts`, add after `TtsSentence` interface (line 26):

```typescript
export interface TtsWord {
  word: string;
  startTime: number;
  endTime: number;
}
```

Update `TtsResult` interface (line 28-31):

```typescript
export interface TtsResult {
  audioPath: string;
  sentences: TtsSentence[];
  words: TtsWord[];
}
```

- [ ] **Step 2: Add `allWords` array in `synthesize` method**

In the `synthesize` method's Promise callback, after `const sentences: TtsSentence[] = [];` (line 109), add:

```typescript
      const allWords: TtsWord[] = [];
```

- [ ] **Step 3: Collect words in `EVENT_TTS_SENTENCE_END` handler**

Replace the `EVENT_TTS_SENTENCE_END` case (lines 298-311) with:

```typescript
            case EVENT_TTS_SENTENCE_END:
              log.info('TTS: SentenceEnd payload:', JSON.stringify(payload));
              {
                const parsed = parseSentenceFromPayload(payload);
                if (parsed) {
                  sentences.push({
                    text: parsed.text,
                    startTime: cumulativeTime,
                    endTime: cumulativeTime + parsed.duration,
                  });
                  if (parsed.words && parsed.words.length > 0) {
                    for (const w of parsed.words) {
                      allWords.push({
                        word: w.word,
                        startTime: cumulativeTime + w.startTime,
                        endTime: cumulativeTime + w.endTime,
                      });
                    }
                  }
                  cumulativeTime += parsed.duration;
                }
              }
              break;
```

Key detail: each word's `startTime`/`endTime` from the API are relative to the sentence. We offset by `cumulativeTime` (which equals the current sentence's `startTime`) to get global timestamps aligned with audio playback.

- [ ] **Step 4: Include `allWords` in `EVENT_SESSION_FINISHED` result**

Replace line 325:

```typescript
              done({ audioPath: tempFile, sentences });
```

With:

```typescript
              done({ audioPath: tempFile, sentences, words: allWords });
```

- [ ] **Step 5: Verify build**

Run: `npm run build:electron 2>&1 | tail -3`
Expected: Build succeeds

- [ ] **Step 6: Commit**

```bash
git add electron/tts.ts
git commit -m "feat: collect word-level timestamps in TTS service"
```

---

### Task 3: Pass words through subtitle-popup and main.ts

**Files:**
- Modify: `electron/subtitle-popup.ts`
- Modify: `electron/main.ts`

- [ ] **Step 1: Update `SubtitlePayload` interface**

In `electron/subtitle-popup.ts`, update the interface (lines 4-8):

```typescript
export interface SubtitlePayload {
  sentences: { text: string; startTime: number; endTime: number }[] | null;
  words: { word: string; startTime: number; endTime: number }[] | null;
  audio: Buffer;
  personaName: string;
}
```

- [ ] **Step 2: Update IPC data send**

In `electron/subtitle-popup.ts`, inside the `show` method's `ipcMain.once('tts-page-ready', ...)` callback (line 57-61), add `words` to the sent data:

```typescript
      ipcMain.once('tts-page-ready', () => {
        this.win?.webContents.send('tts-audio-data', {
          audio: audioUint8,
          sentences: payload.sentences,
          words: payload.words,
          personaName: payload.personaName,
        });
      });
```

- [ ] **Step 3: Update `speakResult` in main.ts**

In `electron/main.ts`, in the `speakResult` function, after the `sentences` line (around line 602) and before `subtitlePopup.show`, add:

```typescript
    const words = result.words.length > 0 ? result.words : null;
```

Update the `subtitlePopup.show` call to include `words`:

```typescript
    subtitlePopup.show(trayBounds, {
      audio: audioBuffer,
      sentences,
      words,
      personaName: profile.name,
    });
```

- [ ] **Step 4: Verify build**

Run: `npm run build:electron 2>&1 | tail -3`
Expected: Build succeeds

- [ ] **Step 5: Commit**

```bash
git add electron/subtitle-popup.ts electron/main.ts
git commit -m "feat: pass word-level timestamps through IPC to subtitle page"
```

---

### Task 4: Rewrite subtitle page with streaming typewriter effect

**Files:**
- Modify: `src/app/subtitle/page.tsx`

This is the largest change. The entire `SubtitleContent` component and its types get rewritten.

- [ ] **Step 1: Replace the entire `src/app/subtitle/page.tsx`**

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
  const rafRef = useRef<number>(0);

  const tick = useCallback(() => {
    const ctx = audioCtxRef.current;
    if (!ctx || startTimeRef.current === 0 || words.length === 0) return;

    const elapsed = ctx.currentTime - startTimeRef.current;

    let idx = -1;
    for (let i = words.length - 1; i >= 0; i--) {
      if (elapsed >= words[i].startTime) {
        idx = i;
        break;
      }
    }

    setCurrentIndex(idx);

    const lastEnd = words[words.length - 1].endTime;
    if (elapsed < lastEnd + 0.5) {
      rafRef.current = requestAnimationFrame(tick);
    }
  }, [words]);

  useEffect(() => {
    const ipc = getIpcRenderer();
    if (!ipc) return;

    ipc.send('tts-page-ready');

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
        const audioBuffer = await ctx.decodeAudioData(payload.audio.buffer.slice(0) as ArrayBuffer);
        const source = ctx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(ctx.destination);

        source.onended = () => {
          setIsPlaying(false);
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
  }, []);

  useEffect(() => {
    if (visible && words.length > 0) {
      rafRef.current = requestAnimationFrame(tick);
    }
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [tick, visible, words]);

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

      {/* Header: avatar + waveform */}
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
                animation: isPlaying ? `waveBar 0.5s ease-in-out ${i * 0.1}s infinite alternate` : 'none',
              }}
            />
          ))}
        </div>
      </div>

      {/* Streaming text area */}
      <div
        style={{
          fontSize: '13px',
          lineHeight: '1.8',
          wordBreak: 'break-word',
        }}
      >
        {words.length > 0
          ? words.map((w, i) => {
              let color = 'transparent';
              if (i < currentIndex) color = 'rgba(255, 255, 255, 0.5)';
              else if (i === currentIndex) color = '#ffffff';
              return (
                <span key={i} style={{ color, transition: 'color 0.1s ease' }}>
                  {w.word}
                </span>
              );
            })
          : '...'}
        {isPlaying && currentIndex >= 0 && currentIndex < words.length - 1 && (
          <span
            style={{
              display: 'inline-block',
              width: '2px',
              height: '13px',
              background: '#4CAF50',
              marginLeft: '1px',
              verticalAlign: 'middle',
              animation: 'blink 0.6s ease-in-out infinite',
            }}
          />
        )}
      </div>
    </div>
  );
}

export default function SubtitlePage() {
  return (
    <>
      <style>{`html, body { background: transparent !important; overflow: hidden !important; }
@keyframes waveBar { from { height: 4px; } to { height: 14px; } }
@keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }`}</style>
      <Suspense fallback={null}>
        <SubtitleContent />
      </Suspense>
    </>
  );
}
```

Key differences from the old version:
- `sentences` state replaced with `words` state
- `getSentenceColor` removed — replaced by inline `color` logic based on `currentIndex`
- `scrollRef`, `sentenceRefs`, mask-image all removed — no scrolling needed
- `isPlaying` state controls waveform animation
- `tick` scans `words` array from end to find current word (more efficient)
- `source.onended` sets `isPlaying = false` to stop waveform
- Green blinking cursor appears between current word and next unplayed word

- [ ] **Step 2: Verify Next.js build**

Run: `npx next build 2>&1 | tail -5`
Expected: Build succeeds, `/subtitle` page listed

- [ ] **Step 3: Commit**

```bash
git add src/app/subtitle/page.tsx
git commit -m "feat: streaming typewriter effect for subtitle popup with audio-synced word display"
```

---

### Task 5: Build and manual verification

- [ ] **Step 1: Full build**

Run: `npm run electron:build 2>&1 | tail -10`
Expected: DMG and ZIP produced in `release/`

- [ ] **Step 2: Verify all 6 acceptance criteria**

1. Audio and text are strictly synced — each word appears exactly when heard
2. Pauses/gaps match — text pauses correspond to audio pauses
3. Current word is white + green cursor, past words are semi-transparent
4. Waveform animation stops when playback ends
5. Close button works
6. Popup auto-closes after playback finishes
