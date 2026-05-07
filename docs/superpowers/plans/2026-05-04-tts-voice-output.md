# TTS 语音输出功能实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agent 完成任务后，通过火山引擎 TTS 朗读结果摘要，同时在 tray 图标下方弹出字幕面板。

**Architecture:** 主进程驱动——TTS API 调用、音频播放、字幕弹窗全部在 Electron 主进程中完成。新增 `electron/tts.ts` 封装火山引擎 TTS WebSocket 协议，新增 `electron/subtitle-popup.ts` 管理 tray 下方的字幕窗口。store 增加 `speaking` 标记用于中断控制。

**Tech Stack:** 火山引擎大模型语音合成 2.0 (WebSocket)、Electron BrowserWindow、macOS afplay 音频播放

---

## File Structure

| 文件 | 操作 | 职责 |
|------|------|------|
| `src/lib/store.ts` | 修改 | 增加 `speaking` 属性和 `stop-speaking` RightCommandAction |
| `src/types/index.ts` | 修改 | RightCommandAction 类型增加 `'stop-speaking'` |
| `electron/tts.ts` | 新建 | 火山引擎 TTS WebSocket 客户端 |
| `electron/subtitle-popup.ts` | 新建 | tray 下方字幕弹窗 |
| `electron/main.ts` | 修改 | executePrompt 完成后调用 TTS、handleRightCommand 增加 stop-speaking 分支 |
| `src/lib/shrew-context.ts` | 修改 | buildShrewContext 增加交付方式指令 |
| `src/__tests__/store.test.ts` | 修改 | 增加 speaking 相关测试 |

---

### Task 1: Store 增加 speaking 属性和 stop-speaking action

**Files:**
- Modify: `src/types/index.ts:16-21`
- Modify: `src/lib/store.ts`
- Modify: `src/__tests__/store.test.ts`

- [ ] **Step 1: Write the failing test**

在 `src/__tests__/store.test.ts` 末尾追加：

```typescript
test('speaking flag defaults to false', () => {
  const store = new ShrewStore();
  expect(store.speaking).toBe(false);
});

test('setSpeaking updates the flag and notifies listeners', () => {
  const store = new ShrewStore();
  const changes: Array<{ appState: string; sdkSubState: string | null }> = [];
  store.onChange((state) => changes.push({ ...state }));

  store.setSpeaking(true);
  expect(store.speaking).toBe(true);
  expect(changes.length).toBe(1);

  store.setSpeaking(false);
  expect(store.speaking).toBe(false);
  expect(changes.length).toBe(2);
});

test('getRightCommandAction returns stop-speaking when speaking is true', () => {
  const store = new ShrewStore();
  store.setSpeaking(true);
  expect(store.getRightCommandAction()).toBe('stop-speaking');
});

test('getRightCommandAction returns start-recording when idle and not speaking', () => {
  const store = new ShrewStore();
  expect(store.getRightCommandAction()).toBe('start-recording');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/__tests__/store.test.ts --verbose 2>&1 | tail -20`
Expected: FAIL — `speaking` property does not exist, `stop-speaking` action not returned

- [ ] **Step 3: Update types**

In `src/types/index.ts`, change `RightCommandAction` type (line 16-21):

```typescript
export type RightCommandAction =
  | 'start-recording'
  | 'stop-recording'
  | 'none'
  | 'append-recording'
  | 'cancel-execution'
  | 'stop-speaking';
```

- [ ] **Step 4: Update store**

In `src/lib/store.ts`:

Add property after line 31 (`private _listeners`):
```typescript
  private _speaking: boolean = false;
```

Add getter after line 35 (`get currentToolName`):
```typescript
  get speaking(): boolean { return this._speaking; }
```

Add method after `clearCompletedState()` (after line 77):
```typescript
  setSpeaking(value: boolean): void {
    this._speaking = value;
    this.notify();
  }
```

Update `getRightCommandAction()` (line 94-105), add speaking check at the top:
```typescript
  getRightCommandAction(): RightCommandAction {
    if (this._speaking) return 'stop-speaking';
    switch (this._appState) {
      case 'idle':
      case 'completed': return 'start-recording';
      case 'recording': return 'stop-recording';
      case 'transcribing': return 'none';
      case 'editing': return 'append-recording';
      case 'thinking':
      case 'executing': return 'cancel-execution';
      default: return 'none';
    }
  }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx jest src/__tests__/store.test.ts --verbose`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/types/index.ts src/lib/store.ts src/__tests__/store.test.ts
git commit -m "feat: add speaking flag and stop-speaking action to store"
```

---

### Task 2: 火山引擎 TTS 模块

**Files:**
- Create: `electron/tts.ts`

- [ ] **Step 1: Create TTS module**

Create `electron/tts.ts`:

```typescript
import WebSocket from 'ws';
import zlib from 'zlib';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawn, ChildProcess } from 'child_process';
import { log } from '../src/lib/logger';

const WS_URL = 'wss://openspeech.bytedance.com/api/v3/tts/bigmodel';
const RESOURCE_ID = 'volc.seedtts';
const CONNECT_TIMEOUT = 10_000;
const TOTAL_TIMEOUT = 30_000;

export interface TtsOptions {
  appId: string;
  accessToken: string;
  text: string;
  signal?: AbortSignal;
}

function makeHeader(
  messageType: number,
  messageFlags: number,
  serialization: number,
  compression: number,
): Buffer {
  return Buffer.from([
    0x11,
    (messageType << 4) | messageFlags,
    (serialization << 4) | compression,
    0x00,
  ]);
}

const HEADER_FULL_CLIENT = makeHeader(0x1, 0x0, 0x1, 0x1);

export class TtsService {
  private playProcess: ChildProcess | null = null;
  private tempFile: string | null = null;

  async synthesize(options: TtsOptions): Promise<string | null> {
    const { appId, accessToken, text, signal } = options;

    if (!text || text.trim().length === 0) {
      log.info('TTS: 文本为空，跳过合成');
      return null;
    }

    const tempDir = os.tmpdir();
    const tempFile = path.join(tempDir, `shrew-tts-${Date.now()}.mp3`);
    this.tempFile = tempFile;

    return new Promise<string | null>((resolve) => {
      const totalTimer = setTimeout(() => {
        ws.close();
        resolve(null);
      }, TOTAL_TIMEOUT);

      if (signal) {
        signal.addEventListener('abort', () => {
          clearTimeout(totalTimer);
          ws.close();
          this.cleanup();
          resolve(null);
        }, { once: true });
      }

      const ws = new WebSocket(WS_URL, {
        headers: {
          'X-Api-App-Key': appId,
          'X-Api-Access-Key': accessToken,
          'X-Api-Resource-Id': RESOURCE_ID,
          'X-Api-Connect-Id': crypto.randomUUID(),
        },
      });

      let settled = false;
      const audioChunks: Buffer[] = [];

      const done = (result: string | null) => {
        if (settled) return;
        settled = true;
        clearTimeout(totalTimer);
        resolve(result);
      };

      ws.on('error', (err) => {
        log.error('TTS: WebSocket 连接错误:', err.message);
        done(null);
      });

      ws.on('close', () => {
        if (!settled) {
          log.warn('TTS: WebSocket 意外关闭');
          done(null);
        }
      });

      const connectTimer = setTimeout(() => {
        ws.close();
        done(null);
      }, CONNECT_TIMEOUT);

      ws.on('open', () => {
        clearTimeout(connectTimer);
        log.info('TTS: WebSocket 已连接, 文本长度:', text.length);

        const config = JSON.stringify({
          user: { uid: 'shrew-app' },
          audio: {
            voice_type: 'zh_female_cancan',
            encoding: 'mp3',
            speed_ratio: 1.0,
          },
          request: {
            text,
            operation: 'query',
          },
        });

        const configPayload = zlib.gzipSync(Buffer.from(config));
        const configSize = Buffer.alloc(4);
        configSize.writeUInt32BE(configPayload.length, 0);

        ws.send(Buffer.concat([HEADER_FULL_CLIENT, configSize, configPayload]));
      });

      ws.on('message', (data: WebSocket.Data) => {
        const buf = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
        if (buf.length < 4) return;

        const messageType = (buf[1] >> 4) & 0xf;

        if (messageType === 0xf) {
          if (buf.length >= 12) {
            const errorCode = buf.readUInt32BE(4);
            const errorMsgSize = buf.readUInt32BE(8);
            const errorMsg = buf.subarray(12, 12 + errorMsgSize).toString('utf-8');
            log.error('TTS: 服务端错误, code:', errorCode, 'msg:', errorMsg);
          }
          ws.close();
          done(null);
          return;
        }

        if (messageType === 0x9) {
          const flags = buf[1] & 0xf;
          const compression = buf[2] & 0xf;
          const payloadSize = buf.length > 8 ? buf.readUInt32BE(8) : 0;
          const payloadBuf = buf.subarray(12, 12 + payloadSize);

          if (flags === 0x1) {
            // 音频数据
            let audioData: Buffer;
            if (compression === 0x1) {
              audioData = zlib.gunzipSync(payloadBuf);
            } else {
              audioData = payloadBuf;
            }
            audioChunks.push(audioData);
          }

          if (flags === 0x3) {
            // 最后一个包
            if (audioChunks.length === 0) {
              log.warn('TTS: 无音频数据返回');
              done(null);
              return;
            }

            const fullAudio = Buffer.concat(audioChunks);
            fs.writeFileSync(tempFile, fullAudio);
            log.info('TTS: 音频写入完成, 大小:', fullAudio.length, '路径:', tempFile);
            done(tempFile);
          }
        }
      });
    });
  }

  play(audioPath: string): Promise<void> {
    return new Promise((resolve) => {
      this.playProcess = spawn('afplay', [audioPath]);
      this.playProcess.on('close', () => {
        this.playProcess = null;
        resolve();
      });
      this.playProcess.on('error', (err) => {
        log.error('TTS: afplay 错误:', err.message);
        this.playProcess = null;
        resolve();
      });
    });
  }

  stop(): void {
    if (this.playProcess) {
      this.playProcess.kill('SIGTERM');
      this.playProcess = null;
    }
    this.cleanup();
  }

  private cleanup(): void {
    if (this.tempFile) {
      try { fs.unlinkSync(this.tempFile); } catch {}
      this.tempFile = null;
    }
  }

  get isPlaying(): boolean {
    return this.playProcess !== null;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add electron/tts.ts
git commit -m "feat: add volcengine TTS service module"
```

---

### Task 3: 字幕弹窗模块

**Files:**
- Create: `electron/subtitle-popup.ts`

- [ ] **Step 1: Create subtitle popup module**

Create `electron/subtitle-popup.ts`:

```typescript
import { BrowserWindow, screen } from 'electron';
import { log } from '../src/lib/logger';

export class SubtitlePopup {
  private win: BrowserWindow | null = null;
  private serverPort: number;

  constructor(serverPort: number) {
    this.serverPort = serverPort;
  }

  show(text: string, trayBounds: { x: number; y: number; width: number; height: number }): void {
    this.close();

    const { x: trayX, y: trayY, width: trayWidth } = trayBounds;
    const popupWidth = 300;
    const popupX = Math.round(trayX + trayWidth / 2 - popupWidth / 2);
    const popupY = trayY + 8;

    this.win = new BrowserWindow({
      width: popupWidth,
      height: 120,
      x: popupX,
      y: popupY,
      frame: false,
      transparent: true,
      resizable: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      hasShadow: false,
      show: false,
      focusable: false,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
      },
    });

    this.win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    this.win.loadURL(`http://127.0.0.1:${this.serverPort}/subtitle?text=${encodeURIComponent(text)}`);
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

- [ ] **Step 2: Commit**

```bash
git add electron/subtitle-popup.ts
git commit -m "feat: add subtitle popup module"
```

---

### Task 4: 字幕弹窗页面

**Files:**
- Create: `src/app/subtitle/page.tsx`

- [ ] **Step 1: Create subtitle page**

Create `src/app/subtitle/page.tsx`:

```tsx
'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function SubtitlePage() {
  const searchParams = useSearchParams();
  const text = searchParams.get('text') || '';
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        padding: '12px 16px',
        background: 'rgba(30, 30, 40, 0.92)',
        borderRadius: '10px',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        opacity: visible ? 1 : 0,
        transition: 'opacity 0.3s ease',
        minHeight: '80px',
        color: '#e0e0e0',
        fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
        <div
          style={{
            width: '12px',
            height: '12px',
            background: '#4CAF50',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <span style={{ fontSize: '6px', color: 'white' }}>▶</span>
        </div>
        <span style={{ fontSize: '10px', color: '#888' }}>Shrew 正在朗读...</span>
      </div>
      <div style={{ fontSize: '13px', lineHeight: '1.6', wordBreak: 'break-word' }}>
        {text}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify the page builds**

Run: `npx next build 2>&1 | tail -20`
Expected: Build succeeds, subtitle page included

- [ ] **Step 3: Commit**

```bash
git add src/app/subtitle/page.tsx
git commit -m "feat: add subtitle display page"
```

---

### Task 5: System Prompt 增加交付方式指令

**Files:**
- Modify: `src/lib/shrew-context.ts`

- [ ] **Step 1: Add delivery instruction to context**

In `src/lib/shrew-context.ts`, update `buildShrewContext` function:

```typescript
import Database from 'better-sqlite3';

const DELIVERY_INSTRUCTION = `## 结果交付方式
当你完成用户指令后，根据结果的复杂度选择交付方式：
- 如果结果是简短说明（如"已更新配置"、"创建完成"），直接用文字回复
- 如果结果较长或包含复杂内容（如代码修改总结、多步骤操作、详细分析），将完整内容整理成文件写入 ~/Desktop/ 目录，然后用一两句话告诉用户你做了什么以及文件位置`;

export function buildShrewContext(personaContent: string, memoryLines: string[]): string {
  const parts: string[] = [];

  if (personaContent.trim()) {
    parts.push(personaContent.trim());
  }

  parts.push(DELIVERY_INSTRUCTION);

  if (memoryLines.length > 0) {
    parts.push(`\n## 关于用户的记忆`);
    for (const line of memoryLines) {
      parts.push(`- ${line}`);
    }
  }

  return parts.join('\n');
}

export function getActiveMemories(db: Database.Database): string[] {
  const rows = db.prepare(
    `SELECT content FROM memory_item WHERE status = '生效中' ORDER BY pinned DESC, updated_at DESC`
  ).all() as { content: string }[];
  return rows.map(r => r.content);
}

export function getPinnedMemories(db: Database.Database): string[] {
  const rows = db.prepare(
    `SELECT content FROM memory_item WHERE status = '生效中' AND pinned = 1 ORDER BY updated_at DESC`
  ).all() as { content: string }[];
  return rows.map(r => r.content);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/shrew-context.ts
git commit -m "feat: add delivery instruction to system context"
```

---

### Task 6: 集成到主进程

**Files:**
- Modify: `electron/main.ts`

- [ ] **Step 1: Add imports**

In `electron/main.ts`, add imports near the top (after line 8):

```typescript
import { TtsService } from './tts';
import { SubtitlePopup } from './subtitle-popup';
```

- [ ] **Step 2: Add global variables**

After line 40 (`let currentAbortController`), add:

```typescript
let ttsService: TtsService;
let subtitlePopup: SubtitlePopup;
let ttsAbortController: AbortController | null = null;
```

- [ ] **Step 3: Initialize TTS and subtitle in app.whenReady**

After line 1019 (`voiceBar = new VoiceBarWindow(serverPort);`), add:

```typescript
  // 初始化 TTS 和字幕弹窗
  ttsService = new TtsService();
  subtitlePopup = new SubtitlePopup(serverPort);
```

- [ ] **Step 4: Add speakResult function**

Add this function before `registerIpcHandlers()` (around line 535):

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
    const audioPath = await ttsService.synthesize({
      appId: creds.appId,
      accessToken: creds.accessToken,
      text: summary,
      signal: ttsAbortController.signal,
    });

    if (!audioPath) {
      log.info('TTS: 合成失败或被中断，跳过播放');
      return;
    }

    // 显示字幕
    const trayBounds = tray.getBounds();
    subtitlePopup.show(summary, trayBounds);

    // 播放音频
    await ttsService.play(audioPath);
  } catch (err) {
    log.error('TTS: 语音播报异常:', err);
  } finally {
    store.setSpeaking(false);
    ttsAbortController = null;
    subtitlePopup.close();
    ttsService.stop();
    updateTrayDot();
  }
}
```

- [ ] **Step 5: Call speakResult after execution completes**

In `executePrompt`, after line 486 (`sendToMainWindow('chat:execution-complete', ...)`), add TTS trigger:

```typescript
    // 语音播报结果（异步，不阻塞状态流转）
    if (result.status === 'completed' && result.summary) {
      speakResult(result.summary).catch(err => log.error('TTS: 播报失败:', err));
    }
```

Note: `speakResult` is called BEFORE `store.transition('completed')` (line 503) so that `speaking` flag is set before the completed timer starts. But since `speakResult` is async and we don't await it, the state transition happens immediately while TTS runs in background.

Actually, we need to adjust the timing. The `completed` state auto-transitions to `idle` after 2.5s. We need to delay that while speaking. The simplest approach: move the `speakResult` call BEFORE the `transition('completed')` and let the speaking flag suppress the timer behavior.

Update the completed timer in `store.ts` transition method (line 44-50) to check speaking:

```typescript
    if (newState === 'completed') {
      this._completedTimer = setTimeout(() => {
        if (this._appState === 'completed' && !this._speaking) {
          this.transition('idle');
        }
      }, 2500);
    }
```

Wait, that still has a race: the 2.5s timer fires, sees speaking=true, doesn't transition. But then when speaking finishes, who transitions to idle? Let's handle this in the `speakResult` finally block. After `store.setSpeaking(false)`, check if we're still in `completed` state and trigger the idle transition:

In `speakResult` finally block, after `store.setSpeaking(false)`:
```typescript
    // If still in completed state after speaking, trigger idle transition
    if (store.appState === 'completed') {
      store.transition('idle');
    }
```

So the final implementation is:

1. Don't modify the completed timer in store.ts — let it fire and check speaking flag
2. Add speaking check in the completed timer in store.ts
3. In speakResult finally, manually transition to idle if still completed

Let me revise Step 5:

In `store.ts` transition method, update the completed timer (line 44-50):

```typescript
    if (newState === 'completed') {
      this._completedTimer = setTimeout(() => {
        if (this._appState === 'completed' && !this._speaking) {
          this.transition('idle');
        }
      }, 2500);
    }
```

In `electron/main.ts` `executePrompt`, insert after line 486:

```typescript
    // 语音播报结果
    if (result.status === 'completed' && result.summary) {
      speakResult(result.summary);
    }
```

And in the `speakResult` finally block (already defined above), add after `store.setSpeaking(false)`:

```typescript
    if (store.appState === 'completed') {
      store.transition('idle');
    }
```

- [ ] **Step 6: Add stop-speaking handler in handleRightCommand**

In `handleRightCommand()` function (line 215), add a new case in the switch:

```typescript
    case 'stop-speaking':
      log.info('中断语音朗读');
      if (ttsAbortController) {
        ttsAbortController.abort();
        ttsAbortController = null;
      }
      ttsService.stop();
      subtitlePopup.close();
      store.setSpeaking(false);
      updateTrayDot();
      break;
```

- [ ] **Step 7: Cleanup on quit**

In `app.on('before-quit')` handler (line 1108), add before `voiceBar?.destroy()`:

```typescript
  ttsService?.stop();
  subtitlePopup?.destroy();
```

- [ ] **Step 8: Verify build**

Run: `npm run build:electron 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 9: Commit**

```bash
git add electron/main.ts src/lib/store.ts
git commit -m "feat: integrate TTS playback and subtitle popup into main process"
```

---

### Task 7: 端到端手动验证

- [ ] **Step 1: Start dev environment**

Run: `npm run electron:dev`

- [ ] **Step 2: Test TTS flow**

1. Configure volcengine credentials in settings (if not already done)
2. Press right Command, say "创建一个 hello.txt 文件在桌面"
3. Release right Command, wait for transcription and execution
4. Verify: After Agent completes, subtitle popup appears near tray icon
5. Verify: Audio plays via speakers reading the result
6. Verify: After audio finishes, subtitle popup auto-closes

- [ ] **Step 3: Test interruption**

1. Trigger another command that produces a longer response
2. While TTS is playing, press right Command
3. Verify: Audio stops immediately and subtitle popup closes
4. Verify: State returns to idle, can start a new recording

- [ ] **Step 4: Test graceful degradation**

1. Remove volcengine credentials temporarily
2. Execute a command
3. Verify: No crash, no error popup, execution completes normally without TTS
