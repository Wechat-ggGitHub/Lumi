# TTS 字幕同步 + 关闭按钮 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现字幕滚动与 TTS 朗读的句级别同步，并添加点击关闭按钮。

**Architecture:** 在 TTS 合成阶段开启 `enable_timestamp`，从 `TTSSentenceEnd` 事件中收集每句的文本和时间戳。播放阶段前端根据本地计时器匹配当前句子并滚动到对应位置。字幕弹窗改为 `focusable` 并添加关闭按钮。

**Tech Stack:** Electron, Next.js (React), 火山引擎 TTS WebSocket V3

---

### Task 1: 修改 TtsService 返回值类型，收集句子时间戳

**Files:**
- Modify: `electron/tts.ts:14-19` (TtsOptions 附近)
- Modify: `electron/tts.ts:83` (synthesize 返回类型)
- Modify: `electron/tts.ts:226-242` (EVENT_SESSION_STARTED case，StartSession payload)
- Modify: `electron/tts.ts:283-297` (EVENT_SESSION_FINISHED case)

- [ ] **Step 1: 导出 TtsSentence 接口和 TtsResult 类型**

在 `electron/tts.ts` 的 import 之后、`makeHeader` 函数之前添加：

```typescript
export interface TtsSentence {
  text: string;
  startTime: number;
  endTime: number;
}

export interface TtsResult {
  audioPath: string;
  sentences: TtsSentence[];
}
```

- [ ] **Step 2: 修改 synthesize 返回类型**

将 `electron/tts.ts:83` 的返回类型从 `Promise<string | null>` 改为 `Promise<TtsResult | null>`：

```typescript
async synthesize(options: TtsOptions): Promise<TtsResult | null> {
```

- [ ] **Step 3: 在 synthesize 内部添加 sentences 收集变量和 cumulativeTime**

在 `synthesize` 方法内、`audioChunks` 声明之后添加：

```typescript
const sentences: TtsSentence[] = [];
let cumulativeTime = 0;
```

- [ ] **Step 4: 在 StartSession payload 中启用 enable_timestamp**

修改 `electron/tts.ts` 中 `EVENT_CONNECTION_STARTED` case 里的 `sessionPayload`（约第 230-242 行），在 `audio_params` 中添加 `enable_timestamp: true`：

```typescript
case EVENT_CONNECTION_STARTED:
  sessionId = `shrew-${Date.now()}`;
  const sessionPayload = {
    user: { uid: 'shrew-app' },
    event: EVENT_START_SESSION,
    namespace: 'BidirectionalTTS',
    req_params: {
      speaker: 'zh_female_shuangkuaisisi_moon_bigtts',
      audio_params: {
        format: 'mp3',
        sample_rate: 24000,
        enable_timestamp: true,
      },
    },
  };
  ws.send(buildEventMessage(EVENT_START_SESSION, sessionId, sessionPayload));
  break;
```

- [ ] **Step 5: 添加 EVENT_TTS_SENTENCE_END 处理，收集句子时间戳**

在 `switch (eventCode)` 中，在 `EVENT_SESSION_FINISHED` case 之前添加新的 case：

```typescript
case EVENT_TTS_SENTENCE_END:
  log.info('TTS: SentenceEnd payload:', JSON.stringify(payload));
  {
    const duration = payload?.res_params?.duration ?? payload?.payload?.duration ?? 0;
    const sentenceText = payload?.res_params?.text ?? payload?.payload?.text ?? payload?.sentence?.text ?? '';
    if (duration > 0 && sentenceText) {
      sentences.push({
        text: sentenceText,
        startTime: cumulativeTime,
        endTime: cumulativeTime + duration,
      });
      cumulativeTime += duration;
    }
  }
  break;
```

注意：首次运行时这条日志会输出完整 payload 结构，用于验证实际字段名。如果字段名不对，需要根据日志调整。

- [ ] **Step 6: 修改 EVENT_SESSION_FINISHED case 返回 TtsResult**

将 `electron/tts.ts` 中 `EVENT_SESSION_FINISHED` case 的返回值从 `done(tempFile)` 改为 `done({ audioPath: tempFile, sentences })`：

```typescript
case EVENT_SESSION_FINISHED:
  if (audioChunks.length === 0) {
    log.warn('TTS: 无音频数据返回');
    ws.send(buildEventMessage(EVENT_FINISH_CONNECTION, null, {}));
    done(null);
    return;
  }
  const fullAudio = Buffer.concat(audioChunks);
  fs.writeFileSync(tempFile, fullAudio);
  log.info('TTS: 音频写入完成, 大小:', fullAudio.length, '路径:', tempFile, '句子数:', sentences.length);
  ws.send(buildEventMessage(EVENT_FINISH_CONNECTION, null, {}));
  done({ audioPath: tempFile, sentences });
  break;
```

- [ ] **Step 7: Commit**

```bash
git add electron/tts.ts
git commit -m "feat: collect sentence timestamps from TTS API for subtitle sync"
```

---

### Task 2: 适配 main.ts 中 speakResult() 的返回值变更

**Files:**
- Modify: `electron/main.ts:590-609` (speakResult 函数中的 synthesize 调用和后续逻辑)

- [ ] **Step 1: 修改 speakResult 适配 TtsResult 返回值**

将 `electron/main.ts` 中 `speakResult()` 函数（约第 590-609 行）替换为：

```typescript
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

// 计算总时长：优先从 sentences 累加，降级用文件大小估算
let duration: number;
const sentences = result.sentences.length > 0 ? result.sentences : null;
if (sentences) {
  duration = sentences[sentences.length - 1].endTime;
} else {
  const stat = fs.statSync(result.audioPath);
  duration = stat.size / 3000;
}

const trayBounds = tray.getBounds();
subtitlePopup.show(summary, trayBounds, duration, sentences);

await ttsService.play(result.audioPath);
```

- [ ] **Step 2: 验证构建通过**

Run: `npm run build:electron`
Expected: 编译成功，无类型错误

- [ ] **Step 3: Commit**

```bash
git add electron/main.ts
git commit -m "feat: adapt speakResult to use TtsResult with sentence timestamps"
```

---

### Task 3: 修改 subtitle-popup 支持传递 sentences 和可点击

**Files:**
- Modify: `electron/subtitle-popup.ts:12-40` (show 方法)

- [ ] **Step 1: 修改 show() 签名，添加 sentences 参数，改为 focusable**

将 `electron/subtitle-popup.ts` 的 `show` 方法整体替换为：

```typescript
show(
  text: string,
  trayBounds: { x: number; y: number; width: number; height: number },
  duration: number,
  sentences?: { text: string; startTime: number; endTime: number }[] | null,
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

  const params = new URLSearchParams({
    text,
    duration: String(duration),
  });
  if (sentences && sentences.length > 0) {
    params.set('sentences', encodeURIComponent(JSON.stringify(sentences)));
  }

  this.win.loadURL(`http://127.0.0.1:${this.serverPort}/subtitle?${params.toString()}`);
  this.win.once('ready-to-show', () => {
    this.win?.show();
    log.info('字幕弹窗: 已显示');
  });
}
```

- [ ] **Step 2: 验证构建通过**

Run: `npm run build:electron`
Expected: 编译成功

- [ ] **Step 3: Commit**

```bash
git add electron/subtitle-popup.ts
git commit -m "feat: pass sentence timestamps to subtitle popup and enable click interaction"
```

---

### Task 4: 重写字幕前端页面，实现句级别滚动 + 关闭按钮

**Files:**
- Modify: `src/app/subtitle/page.tsx` (完整重写)

- [ ] **Step 1: 重写 SubtitleContent 组件**

将 `src/app/subtitle/page.tsx` 的完整内容替换为：

```tsx
'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useState, useRef, useCallback, Suspense } from 'react';
import { ipcRenderer } from 'electron';

interface TtsSentence {
  text: string;
  startTime: number;
  endTime: number;
}

function SubtitleContent() {
  const searchParams = useSearchParams();
  const text = searchParams.get('text') || '';
  const duration = parseFloat(searchParams.get('duration') || '0');
  const sentencesParam = searchParams.get('sentences');

  const sentences: TtsSentence[] | null = sentencesParam
    ? JSON.parse(decodeURIComponent(sentencesParam))
    : null;

  const [visible, setVisible] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const sentenceRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const startTimeRef = useRef<number>(0);
  const rafRef = useRef<number>(0);

  // 均匀滚动（降级模式）
  const tickLinear = useCallback(() => {
    if (!scrollRef.current || !contentRef.current || duration <= 0) return;

    if (startTimeRef.current === 0) {
      startTimeRef.current = performance.now();
    }

    const elapsed = (performance.now() - startTimeRef.current) / 1000;
    const progress = Math.min(elapsed / duration, 1);
    const maxScroll = contentRef.current.scrollHeight - scrollRef.current.clientHeight;

    if (maxScroll > 0) {
      scrollRef.current.scrollTop = maxScroll * progress;
    }

    if (progress < 1) {
      rafRef.current = requestAnimationFrame(tickLinear);
    }
  }, [duration]);

  // 句级别同步滚动
  const tickSynced = useCallback(() => {
    if (!scrollRef.current || !sentences || sentences.length === 0) return;

    if (startTimeRef.current === 0) {
      startTimeRef.current = performance.now();
    }

    const elapsed = (performance.now() - startTimeRef.current) / 1000;
    const totalDuration = sentences[sentences.length - 1].endTime;

    // 查找当前句子
    let currentIdx = -1;
    for (let i = 0; i < sentences.length; i++) {
      if (elapsed >= sentences[i].startTime && elapsed < sentences[i].endTime) {
        currentIdx = i;
        break;
      }
    }
    // 如果超出最后一句话的 endTime，标记为最后一句
    if (currentIdx === -1 && elapsed >= sentences[sentences.length - 1].startTime) {
      currentIdx = sentences.length - 1;
    }

    if (currentIdx !== activeIndex) {
      setActiveIndex(currentIdx);
    }

    // 滚动到当前句子
    if (currentIdx >= 0) {
      const el = sentenceRefs.current[currentIdx];
      if (el && scrollRef.current) {
        const containerHeight = scrollRef.current.clientHeight;
        const targetScroll = el.offsetTop - containerHeight / 3;
        scrollRef.current.scrollTop = Math.max(0, targetScroll);
      }
    }

    if (elapsed < totalDuration + 0.5) {
      rafRef.current = requestAnimationFrame(tickSynced);
    }
  }, [sentences, activeIndex]);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  useEffect(() => {
    if (sentences && sentences.length > 0) {
      rafRef.current = requestAnimationFrame(tickSynced);
    } else if (duration > 0) {
      rafRef.current = requestAnimationFrame(tickLinear);
    }
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [tickSynced, tickLinear, sentences, duration]);

  const handleClose = () => {
    ipcRenderer.send('stop-speaking');
  };

  return (
    <div
      style={{
        position: 'relative',
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
      {/* 关闭按钮 */}
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
          background: 'rgba(255, 255, 255, 0.1)',
          color: 'rgba(255, 255, 255, 0.5)',
          fontSize: '10px',
          lineHeight: '18px',
          textAlign: 'center',
          cursor: 'pointer',
          padding: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'background 0.15s, color 0.15s',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
          e.currentTarget.style.color = 'rgba(255, 255, 255, 0.8)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
          e.currentTarget.style.color = 'rgba(255, 255, 255, 0.5)';
        }}
      >
        ✕
      </button>

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
      <div
        ref={scrollRef}
        style={{
          position: 'relative',
          fontSize: '13px',
          lineHeight: '1.6',
          wordBreak: 'break-word',
          overflow: 'hidden',
          height: '90px',
        }}
      >
        <div ref={contentRef} style={{ position: 'relative' }}>
          {sentences && sentences.length > 0 ? (
            sentences.map((s, i) => (
              <span
                key={i}
                ref={(el) => { sentenceRefs.current[i] = el; }}
                style={{
                  color: i === activeIndex ? '#ffffff' : i < activeIndex ? '#a0a0a0' : '#e0e0e0',
                  fontWeight: i === activeIndex ? 500 : 400,
                  transition: 'color 0.2s ease, font-weight 0.2s ease',
                }}
              >
                {s.text}
              </span>
            ))
          ) : (
            text
          )}
        </div>
        {/* 渐变遮罩：顶部已读区域变暗 */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: '24px',
            background: 'linear-gradient(to bottom, rgba(30, 30, 40, 0.6), transparent)',
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
      <style>{`html, body { background: transparent !important; overflow: hidden !important; }`}</style>
      <Suspense fallback={null}>
        <SubtitleContent />
      </Suspense>
    </>
  );
}
```

- [ ] **Step 2: 验证 Next.js 构建通过**

Run: `npm run build`
Expected: 构建成功，无编译错误

- [ ] **Step 3: 验证 Electron 构建**

Run: `npm run build:electron`
Expected: 编译成功

- [ ] **Step 4: Commit**

```bash
git add src/app/subtitle/page.tsx
git commit -m "feat: sentence-level subtitle sync with close button"
```

---

### Task 5: 首次运行验证 — 确认 TTS payload 字段结构

**Files:** 无代码改动（仅验证）

- [ ] **Step 1: 启动 Electron 开发模式**

Run: `npm run electron:dev`

- [ ] **Step 2: 触发一次 TTS 朗读，查看日志**

在应用中执行一次语音指令，触发 TTS 朗读。查看日志文件 `~/.shrew/logs/shrew-$(date +%Y-%m-%d).log` 中 `TTS: SentenceEnd payload:` 的输出。

Expected: 应该看到类似如下结构的 JSON：
```json
{"res_params": {"duration": 1.23, "text": "xxx"}, ...}
```
或
```json
{"payload": {"duration": 1.23, "text": "xxx"}, ...}
```

- [ ] **Step 3: 根据实际 payload 结构调整字段名**

如果实际 payload 字段名与 Task 1 Step 5 中的假设不同，修改 `electron/tts.ts` 中 `EVENT_TTS_SENTENCE_END` case 的字段提取逻辑。

- [ ] **Step 4: 验证字幕同步效果**

再次触发 TTS 朗读，观察字幕滚动是否与语音同步。

Expected: 字幕在每句话朗读时自动跳转到对应位置，当前句子高亮显示为白色。

- [ ] **Step 5: 验证关闭按钮**

点击字幕弹窗右上角的 ✕ 按钮。

Expected: 朗读立即停止，字幕弹窗关闭。

- [ ] **Step 6: Commit 任何验证后的调整**

```bash
git add -u
git commit -m "fix: adjust TTS payload field names based on runtime verification"
```
