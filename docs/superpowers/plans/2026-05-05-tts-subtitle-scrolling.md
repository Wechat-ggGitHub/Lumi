# TTS 字幕面板自动滚动 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让字幕弹窗在朗读时根据播放进度自动滚动文字，确保用户始终能看到当前朗读位置。

**Architecture:** 通过 MP3 文件大小估算音频时长，通过 URL 参数传递给字幕页面，前端用 `requestAnimationFrame` 驱动均匀滚动，配合渐变遮罩区分已读/未读文字。

**Tech Stack:** Electron BrowserWindow, Next.js 页面, React, requestAnimationFrame

---

## File Structure

| 文件 | 职责 |
|------|------|
| `electron/subtitle-popup.ts` | 面板尺寸调整 + `show()` 增加 duration 参数 |
| `src/app/subtitle/page.tsx` | 前端滚动逻辑 + 渐变遮罩 |
| `electron/main.ts` | `speakResult()` 中估算时长并传入 |

---

### Task 1: 调整面板尺寸并增加 duration 参数

**Files:**
- Modify: `electron/subtitle-popup.ts` (全文 58 行)

- [ ] **Step 1: 修改 `subtitle-popup.ts` — 面板尺寸和 `show()` 签名**

将 `popupWidth` 从 300 改为 340，`height` 从 120 改为 140，`show()` 增加 `duration` 参数并拼入 URL。

```typescript
// electron/subtitle-popup.ts — 完整替换
import { BrowserWindow } from 'electron';
import { log } from '../src/lib/logger';

export class SubtitlePopup {
  private win: BrowserWindow | null = null;
  private serverPort: number;

  constructor(serverPort: number) {
    this.serverPort = serverPort;
  }

  show(text: string, trayBounds: { x: number; y: number; width: number; height: number }, duration: number): void {
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
      focusable: false,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
      },
    });

    this.win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    this.win.loadURL(`http://127.0.0.1:${this.serverPort}/subtitle?text=${encodeURIComponent(text)}&duration=${duration}`);
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
git commit -m "feat: enlarge subtitle popup and add duration parameter to show()"
```

---

### Task 2: 在 `speakResult()` 中估算音频时长

**Files:**
- Modify: `electron/main.ts:573-619`（`speakResult` 函数）
- Modify: `electron/main.ts:1-4`（已有 `fs` 导入）

- [ ] **Step 1: 修改 `speakResult()` 函数，在合成后估算时长并传入 `subtitlePopup.show()`**

在 `ttsService.synthesize()` 返回 `audioPath` 后，读取文件大小估算时长，传给 `subtitlePopup.show()`。

将 `speakResult()` 函数（第 573-619 行）替换为：

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

    // 根据文件大小估算音频时长（~24kbps mp3）
    const stat = fs.statSync(audioPath);
    const duration = stat.size / 3000;

    const trayBounds = tray.getBounds();
    subtitlePopup.show(summary, trayBounds, duration);

    await ttsService.play(audioPath);
  } catch (err) {
    log.error('TTS: 语音播报异常:', err);
  } finally {
    store.setSpeaking(false);
    ttsAbortController = null;
    subtitlePopup.close();
    ttsService.stop();
    updateTrayDot();
    // If still in completed state after speaking, transition to idle
    if (store.appState === 'completed') {
      store.transition('idle');
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add electron/main.ts
git commit -m "feat: estimate audio duration from file size for subtitle scrolling"
```

---

### Task 3: 实现前端滚动逻辑和渐变遮罩

**Files:**
- Modify: `src/app/subtitle/page.tsx` (全文 65 行)

- [ ] **Step 1: 重写 `page.tsx` — 读取 duration，实现 rAF 滚动 + 渐变遮罩**

完整替换 `src/app/subtitle/page.tsx`：

```tsx
'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useState, useRef, useCallback, Suspense } from 'react';

function SubtitleContent() {
  const searchParams = useSearchParams();
  const text = searchParams.get('text') || '';
  const duration = parseFloat(searchParams.get('duration') || '0');
  const [visible, setVisible] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const startTimeRef = useRef<number>(0);
  const rafRef = useRef<number>(0);

  const tick = useCallback(() => {
    if (!scrollRef.current || !contentRef.current || duration <= 0) return;

    if (startTimeRef.current === 0) {
      startTimeRef.current = performance.now();
    }

    const elapsed = (performance.now() - startTimeRef.current) / 1000;
    const progress = Math.min(elapsed / duration, 1);
    const containerHeight = scrollRef.current.clientHeight;
    const contentHeight = contentRef.current.scrollHeight;
    const maxScroll = contentHeight - containerHeight;

    if (maxScroll > 0) {
      scrollRef.current.scrollTop = maxScroll * progress;
    }

    if (progress < 1) {
      rafRef.current = requestAnimationFrame(tick);
    }
  }, [duration]);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  useEffect(() => {
    if (duration > 0) {
      rafRef.current = requestAnimationFrame(tick);
    }
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [tick, duration]);

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
        <span style={{ fontSize: '10px', color: '#888' }}>Aiva 正在朗读...</span>
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
        <div
          ref={contentRef}
          style={{
            position: 'relative',
          }}
        >
          {text}
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

关键设计点：
- `scrollRef` 是滚动容器（固定高度 90px + overflow hidden），通过 `scrollTop` 驱动滚动
- `contentRef` 是内容层，用于测量 `scrollHeight` 计算最大滚动量
- `requestAnimationFrame` 循环中按 `elapsed / duration` 均匀推进 `scrollTop`
- 顶部渐变遮罩 24px 高，`rgba(30,30,40,0.6)` → transparent，让已滚过的文字稍微变暗
- `duration <= 0` 时 fallback 不滚动（短文本或估算异常）

- [ ] **Step 2: Commit**

```bash
git add src/app/subtitle/page.tsx
git commit -m "feat: add auto-scrolling and gradient mask to subtitle popup"
```

---

### Task 4: 验证和收尾

- [ ] **Step 1: 运行构建确认无编译错误**

```bash
npm run build && npm run build:electron
```

Expected: 构建成功，无类型错误。

- [ ] **Step 2: 启动 Electron 开发模式做冒烟测试**

```bash
npm run electron:dev
```

手动验证：
1. 配置火山引擎凭证（如已有则跳过）
2. 触发一次 Claude 执行，等待朗读开始
3. 确认面板尺寸为 340x140
4. 确认文字在朗读期间平滑滚动
5. 确认顶部渐变遮罩可见
6. 确认短文本不滚动
7. 确认右 Option 键可中断朗读

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "feat: TTS subtitle auto-scrolling — teleprompter effect with gradient mask"
```
