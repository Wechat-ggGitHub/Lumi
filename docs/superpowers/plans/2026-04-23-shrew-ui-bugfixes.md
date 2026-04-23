# Shrew UI Bugfixes + Summary Detail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 4 UI/UX bugs (empty transcription, missing Dock icon, broken tray click, no close button) and add summary detail view.

**Architecture:** All changes are within the existing Electron + Next.js structure. Bug fixes target Electron main process (`electron/`) and React components (`src/`). New feature adds a detail page route and IPC channel. Each task produces independently testable changes.

**Tech Stack:** Electron 33+, Next.js 15, React 19, better-sqlite3, TypeScript

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `electron/main.ts` | Empty text handling, cancel recording, detail window IPC |
| Modify | `electron/recorder.ts` | Add logging to transcribe() |
| Modify | `electron/tray.ts` | Fix left/right click, remove internal summaryWindow |
| Modify | `electron-builder.yml` | Add mac.icon |
| Modify | `src/components/VoiceInput.tsx` | Error state UI + close button |
| Modify | `src/components/SummaryPanel.tsx` | Clickable records |
| Create | `src/app/summary/detail/page.tsx` | Detail view page |
| Create | `scripts/generate-icon.mjs` | Placeholder icon generator |
| Create | `resources/icon.png` | Placeholder app icon (generated) |
| Test | `src/__tests__/store.test.ts` | Add empty transcription transition test |
| Test | `src/__tests__/db.test.ts` | Add getExecutionById test |

---

### Task 1: Empty Transcription Handling (Bug 1)

**Files:**
- Test: `src/__tests__/store.test.ts`
- Modify: `electron/recorder.ts:102-123`
- Modify: `electron/main.ts:183-205`
- Modify: `src/components/VoiceInput.tsx:1-151`

- [ ] **Step 1: Write the failing test for transcribing → idle transition**

Add to `src/__tests__/store.test.ts`:

```typescript
test('transcribing can transition to idle (empty transcription scenario)', () => {
  const store = new ShrewStore();
  store.transition('recording');
  store.transition('transcribing');
  store.transition('idle');
  expect(store.appState).toBe('idle');

  // Verify we can restart recording from idle after empty transcription
  store.transition('recording');
  expect(store.appState).toBe('recording');
});
```

- [ ] **Step 2: Run test to verify it passes (transition already allowed)**

Run: `npx jest src/__tests__/store.test.ts -v`
Expected: PASS — the store already allows `transcribing → idle`. This test documents the expected behavior for the empty transcription flow.

- [ ] **Step 3: Add logging to `electron/recorder.ts` transcribe method**

In `electron/recorder.ts`, update the `transcribe` method (lines 102-123) to:

```typescript
async transcribe(audioPath?: string): Promise<string> {
  if (!this.recognizer.isLoaded) {
    console.log('[recorder] Loading voice model...');
    await this.recognizer.load();
    console.log('[recorder] Voice model loaded successfully');
  }

  const filePath = audioPath || this.outputPath;

  if (!fs.existsSync(filePath)) {
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
```

- [ ] **Step 4: Fix empty transcription handling in `electron/main.ts`**

In `electron/main.ts`, replace the `stop-recording` case in `handleRightCommand` (lines 183-205) with:

```typescript
case 'stop-recording':
  recorder.stopRecording().then(audioPath => {
    store.transition('transcribing');
    updateTrayDot();
    voiceBar.send('voice:transcribing');

    return recorder.transcribe(audioPath);
  }).then(text => {
    if (text) {
      store.transition('editing');
      voiceBar.send('voice:transcript', { text, isAppending: false });
    } else {
      // Empty transcription — show error and go back to idle
      voiceBar.send('voice:error', { message: '未能识别语音，请重试' });
      store.transition('idle');
    }
    updateTrayDot();
  }).catch(err => {
    console.error('[main] Transcription error:', err);
    voiceBar.send('voice:error', { message: err.message });
    store.transition('idle');
    updateTrayDot();
  });
  break;
```

Key changes from original:
- Empty text: `store.transition('idle')` instead of `store.transition('editing')`
- Error catch: `idle` directly instead of `error` then `idle` (simpler, same result)

- [ ] **Step 5: Update VoiceInput error handling for recording/transcribing states**

In `src/components/VoiceInput.tsx`, update the status type and error handler. Replace lines 11-46 with:

```typescript
export function VoiceInput({ onSend, onCancel }: VoiceInputProps) {
  const [text, setText] = useState('');
  const [status, setStatus] = useState<'recording' | 'transcribing' | 'editing' | 'error'>('recording');
  const [errorMessage, setErrorMessage] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const statusRef = useRef(status);
  statusRef.current = status;

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const ipcRenderer = getIpcRenderer();
    if (!ipcRenderer) return;

    const handlers = {
      'voice:transcript': (_: unknown, data: { text: string; isAppending: boolean }) => {
        setText(prev => data.isAppending ? prev + data.text : data.text);
        setStatus('editing');
        textareaRef.current?.focus();
      },
      'voice:transcribing': () => setStatus('transcribing'),
      'voice:start-recording': () => setStatus('recording'),
      'voice:error': (_: unknown, data: { message: string }) => {
        if (statusRef.current === 'recording' || statusRef.current === 'transcribing') {
          setErrorMessage(data.message);
          setStatus('error');
          setTimeout(() => onCancel(), 2000);
        } else {
          setText(prev => prev + `\n[错误: ${data.message}]`);
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

- [ ] **Step 6: Add error state UI to VoiceInput**

In `src/components/VoiceInput.tsx`, add the error state rendering. Insert before the recording status block (before line 78). The full status rendering section becomes:

```typescript
      {/* Error state */}
      {status === 'error' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
          <span style={{ fontSize: 14, color: '#FF453A' }}>{errorMessage || '发生错误'}</span>
        </div>
      )}

      {/* Recording state */}
      {status === 'recording' && (
```

- [ ] **Step 7: Run tests**

Run: `npx jest src/__tests__/store.test.ts -v`
Expected: All tests PASS

- [ ] **Step 8: Manual test**

1. Run `npm run electron:dev`
2. Press right Command to start recording
3. Press right Command again to stop (without speaking)
4. Verify: error message "未能识别语音，请重试" appears in voice bar
5. Verify: voice bar auto-closes after 2 seconds
6. Verify: tray dot returns to gray (idle state)

- [ ] **Step 9: Commit**

```bash
git add src/__tests__/store.test.ts electron/recorder.ts electron/main.ts src/components/VoiceInput.tsx
git commit -m "fix: handle empty voice transcription with error state and auto-close"
```

---

### Task 2: Close Button on Voice Bar (Bug 4)

**Files:**
- Modify: `src/components/VoiceInput.tsx:64-149`
- Modify: `electron/main.ts:302-306`

- [ ] **Step 1: Add close button to VoiceInput component**

In `src/components/VoiceInput.tsx`, update the outer div style to include `position: 'relative'` and add a close button. Replace the outer `<div>` opening tag and add the button right after it. The component return becomes:

```typescript
return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: '16px 20px',
      background: 'rgba(30, 30, 30, 0.95)',
      borderRadius: 16,
      backdropFilter: 'blur(20px)',
      color: '#fff',
      width: '100%',
      boxSizing: 'border-box',
      position: 'relative',
    }}>
      {/* Close button — visible in all states */}
      <button
        onClick={onCancel}
        style={{
          position: 'absolute',
          top: -8,
          right: -8,
          width: 22,
          height: 22,
          borderRadius: '50%',
          border: 'none',
          background: 'rgba(255,255,255,0.1)',
          color: 'rgba(255,255,255,0.5)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 11,
          lineHeight: 1,
          padding: 0,
          transition: 'background 0.15s ease, color 0.15s ease',
        }}
        onMouseEnter={e => {
          e.currentTarget.style.background = 'rgba(255,255,255,0.2)';
          e.currentTarget.style.color = 'rgba(255,255,255,0.9)';
        }}
        onMouseLeave={e => {
          e.currentTarget.style.background = 'rgba(255,255,255,0.1)';
          e.currentTarget.style.color = 'rgba(255,255,255,0.5)';
        }}
      >
        ✕
      </button>

      {/* Error state */}
      {status === 'error' && (
```

- [ ] **Step 2: Update voice:cancel handler to stop active recording**

In `electron/main.ts`, replace the `voice:cancel` handler (lines 302-306) with:

```typescript
ipcMain.on('voice:cancel', () => {
  if (store.appState === 'recording') {
    recorder.stopRecording().catch(() => {});
  }
  voiceBar.close();
  store.transition('idle');
  updateTrayDot();
});
```

- [ ] **Step 3: Manual test**

1. Run `npm run electron:dev`
2. Press right Command to start recording
3. Verify: ✕ button visible in top-right corner
4. Click ✕ during recording → voice bar closes, recording stops
5. Press right Command, speak, press again to stop
6. During transcribing → click ✕ → voice bar closes
7. During editing → click ✕ → voice bar closes, text discarded
8. Verify: tray dot returns to gray after each cancel

- [ ] **Step 4: Commit**

```bash
git add src/components/VoiceInput.tsx electron/main.ts
git commit -m "fix: add close button to voice bar, cancel recording on close"
```

---

### Task 3: Fix Tray Click Behavior (Bug 3)

**Files:**
- Modify: `electron/tray.ts:1-145`
- Modify: `electron/main.ts:506-515`

- [ ] **Step 1: Rewrite `electron/tray.ts`**

Replace the entire `electron/tray.ts` with:

```typescript
import { Tray, nativeImage, Menu } from 'electron';
import type { DotColor } from '../src/types';

// 生成 Template 图标 (22x22)：一个小麦克风形状
function createBaseIcon(): Electron.NativeImage {
  const size = 22;
  const canvas = Buffer.alloc(size * size * 4, 0);

  const center = size / 2;
  const radius = 9;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - center;
      const dy = y - center;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const idx = (y * size + x) * 4;

      if (dist <= radius) {
        canvas[idx] = 0;
        canvas[idx + 1] = 0;
        canvas[idx + 2] = 0;
        canvas[idx + 3] = 255;
      }
    }
  }

  return nativeImage.createFromBuffer(canvas, {
    width: size,
    height: size,
    scaleFactor: 2.0,
  });
}

function createDotIcon(color: DotColor): Electron.NativeImage {
  const size = 22;
  const canvas = Buffer.alloc(size * size * 4);

  const colors: Record<DotColor, [number, number, number, number]> = {
    gray:   [142, 142, 147, 200],
    blue:   [50, 173, 255, 255],
    green:  [52, 199, 89, 255],
    red:    [255, 69, 58, 255],
    yellow: [255, 214, 10, 255],
  };

  const [r, g, b, a] = colors[color];
  const center = size / 2;
  const radius = 8;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - center;
      const dy = y - center;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const idx = (y * size + x) * 4;

      if (dist <= radius) {
        canvas[idx] = r;
        canvas[idx + 1] = g;
        canvas[idx + 2] = b;
        canvas[idx + 3] = a;
      } else {
        canvas[idx + 3] = 0;
      }
    }
  }

  return nativeImage.createFromBuffer(canvas, { width: size, height: size });
}

export class ShrewTray {
  private tray: Tray;
  private dotIcons: Record<DotColor, Electron.NativeImage>;
  private baseIcon: Electron.NativeImage;
  private contextMenu: Menu;

  constructor() {
    this.baseIcon = createBaseIcon();
    this.dotIcons = {
      gray: createDotIcon('gray'),
      blue: createDotIcon('blue'),
      green: createDotIcon('green'),
      red: createDotIcon('red'),
      yellow: createDotIcon('yellow'),
    };

    this.tray = new Tray(this.baseIcon);
    this.tray.setToolTip('Shrew - 待命中');
    this.updateDot('gray');

    // Build context menu but do NOT use setContextMenu()
    // On macOS, setContextMenu() overrides left-click behavior
    this.contextMenu = Menu.buildFromTemplate([
      { label: 'Shrew', type: 'normal', enabled: false },
      { type: 'separator' },
      { label: '设置...', click: () => this.openSettings() },
      { type: 'separator' },
      { label: '退出 Shrew', role: 'quit' },
    ]);

    // Left click: toggle summary popup
    this.tray.on('click', () => this.onPopupRequested?.());

    // Right click: show context menu
    this.tray.on('right-click', () => {
      this.contextMenu.popup();
    });
  }

  updateDot(color: DotColor): void {
    const dot = this.dotIcons[color];
    this.tray.setImage(dot);

    const tooltips: Record<DotColor, string> = {
      gray: 'Shrew - 待命中',
      blue: 'Shrew - 执行中',
      green: 'Shrew - 已完成',
      red: 'Shrew - 出错了',
      yellow: 'Shrew - 等待中',
    };
    this.tray.setToolTip(tooltips[color]);
  }

  private openSettings(): void {
    this.onSettingsRequested?.();
  }

  getBounds(): Electron.Rectangle {
    return this.tray.getBounds();
  }

  onPopupRequested?: () => void;
  onSettingsRequested?: () => void;

  destroy(): void {
    this.tray.destroy();
  }
}
```

Key changes:
- Removed `BrowserWindow` import (no longer needed)
- Removed `this.summaryWindow` field — tray no longer manages summary window state
- Removed `setContextMenu()` call — was overriding left-click on macOS
- Added `this.tray.on('right-click')` with manual `Menu.popup()` for context menu
- Left click now directly calls `onPopupRequested` callback (toggle logic is in `SummaryPopupWindow.show()`)

- [ ] **Step 2: Update main.ts tray initialization**

In `electron/main.ts`, the tray initialization section (around lines 506-515) stays the same. The `onPopupRequested` callback already calls `summaryPopup.show(tray as any)`, and `SummaryPopupWindow.show()` has the toggle logic built in. No changes needed to main.ts for this part.

- [ ] **Step 3: Manual test**

1. Run `npm run electron:dev`
2. Left-click tray icon → summary popup opens
3. Left-click again → summary popup closes (toggle)
4. Right-click tray icon → context menu appears with "设置..." and "退出 Shrew"
5. Click "设置..." → settings window opens
6. Verify: left-click still works after using right-click menu

- [ ] **Step 4: Commit**

```bash
git add electron/tray.ts
git commit -m "fix: separate tray left/right click, remove setContextMenu override"
```

---

### Task 4: Dock Icon Placeholder (Bug 2)

**Files:**
- Create: `scripts/generate-icon.mjs`
- Create: `resources/icon.png` (generated)
- Modify: `electron-builder.yml`

- [ ] **Step 1: Create icon generation script**

Create `scripts/generate-icon.mjs`:

```javascript
import fs from 'fs';
import zlib from 'zlib';

const SIZE = 512;

// Purple background: #6C47FF → rounded square with 80px corner radius
const pixels = Buffer.alloc(SIZE * SIZE * 4);
const cx = SIZE / 2;
const cy = SIZE / 2;
const halfSide = SIZE / 2 - 40; // 20px margin
const cornerRadius = 80;

for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    const idx = (y * SIZE + x) * 4;

    // Check if pixel is inside rounded rectangle
    const dx = Math.abs(x - cx);
    const dy = Math.abs(y - cy);

    let inside = true;
    if (dx > halfSide || dy > halfSide) {
      inside = false;
    } else if (dx > halfSide - cornerRadius && dy > halfSide - cornerRadius) {
      // Corner check
      const cornerDx = dx - (halfSide - cornerRadius);
      const cornerDy = dy - (halfSide - cornerRadius);
      if (cornerDx * cornerDx + cornerDy * cornerDy > cornerRadius * cornerRadius) {
        inside = false;
      }
    }

    if (inside) {
      pixels[idx + 0] = 0x6C; // R
      pixels[idx + 1] = 0x47; // G
      pixels[idx + 2] = 0xFF; // B
      pixels[idx + 3] = 0xFF; // A
    }
  }
}

// Draw a white "S" letter (simplified pixel art, 12px grid)
const grid = [
  '  ########  ',
  ' ##      ## ',
  '##        ##',
  '##         #',
  '#          #',
  '#          #',
  '##         #',
  ' ###       #',
  '   ###    ##',
  '     ###  ##',
  '#      ### #',
  '#       ## #',
  '#       #  #',
  '##     ##  #',
  '##    ##   #',
  ' ##  ##    #',
  '  ####   ###',
  '   ##   ### ',
  '        ##  ',
  '         #  ',
];

const letterSize = 18; // each grid cell is 18x18 pixels
const offsetX = Math.round((SIZE - grid[0].length * letterSize) / 2);
const offsetY = Math.round((SIZE - grid.length * letterSize) / 2);

for (let gy = 0; gy < grid.length; gy++) {
  for (let gx = 0; gx < grid[gy].length; gx++) {
    if (grid[gy][gx] === '#') {
      for (let py = 0; py < letterSize; py++) {
        for (let px = 0; px < letterSize; px++) {
          const pixelX = offsetX + gx * letterSize + px;
          const pixelY = offsetY + gy * letterSize + py;
          if (pixelX >= 0 && pixelX < SIZE && pixelY >= 0 && pixelY < SIZE) {
            const idx = (pixelY * SIZE + pixelX) * 4;
            pixels[idx + 0] = 0xFF; // R
            pixels[idx + 1] = 0xFF; // G
            pixels[idx + 2] = 0xFF; // B
            pixels[idx + 3] = 0xFF; // A
          }
        }
      }
    }
  }
}

// PNG encoding
const rawData = Buffer.alloc(SIZE * (SIZE * 4 + 1));
for (let y = 0; y < SIZE; y++) {
  rawData[y * (SIZE * 4 + 1)] = 0; // filter byte: None
  pixels.copy(rawData, y * (SIZE * 4 + 1) + 1, y * SIZE * 4, (y + 1) * SIZE * 4);
}

const compressed = zlib.deflateSync(rawData);

function crc32(buf) {
  let c = 0xFFFFFFFF;
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let cc = n;
    for (let k = 0; k < 8; k++) cc = cc & 1 ? 0xEDB88320 ^ (cc >>> 1) : cc >>> 1;
    table[n] = cc;
  }
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function chunk(type, data) {
  const typeData = Buffer.concat([Buffer.from(type), data]);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeData));
  return Buffer.concat([len, typeData, crc]);
}

const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8;  // bit depth
ihdr[9] = 6;  // RGBA
ihdr[10] = 0;
ihdr[11] = 0;
ihdr[12] = 0;

const png = Buffer.concat([
  signature,
  chunk('IHDR', ihdr),
  chunk('IDAT', compressed),
  chunk('IEND', Buffer.alloc(0)),
]);

fs.mkdirSync('resources', { recursive: true });
fs.writeFileSync('resources/icon.png', png);
console.log('Icon created: resources/icon.png (' + png.length + ' bytes)');
```

- [ ] **Step 2: Run icon generation script**

Run: `node scripts/generate-icon.mjs`
Expected: `Icon created: resources/icon.png (...)`

Verify: `ls -la resources/icon.png` shows the file exists.

- [ ] **Step 3: Add icon config to `electron-builder.yml`**

In `electron-builder.yml`, add `icon` to the `mac:` section. The updated mac section:

```yaml
mac:
  category: public.app-category.developer-tools
  icon: resources/icon.png
  target:
    - dmg
    - zip
  hardenedRuntime: true
  gatekeeperAssess: false
  minimumSystemVersion: "13.0.0"
```

- [ ] **Step 4: Verify build picks up icon**

Run: `npm run electron:build 2>&1 | head -30`
Expected: Build starts without errors. (Full build may take time — a clean start is sufficient verification.)

- [ ] **Step 5: Commit**

```bash
git add scripts/generate-icon.mjs resources/icon.png electron-builder.yml
git commit -m "fix: add placeholder Dock icon for macOS build"
```

---

### Task 5: Summary Detail View (Feature)

**Files:**
- Test: `src/__tests__/db.test.ts`
- Modify: `src/lib/db.ts` (already has `getExecutionById`, verify import)
- Modify: `electron/main.ts` (add IPC handlers + imports)
- Modify: `src/components/SummaryPanel.tsx`
- Create: `src/app/summary/detail/page.tsx`

- [ ] **Step 1: Write failing test for getExecutionById**

Add to `src/__tests__/db.test.ts`:

```typescript
import { getExecutionById } from '../lib/db';
```

Add test at the end of the file:

```typescript
test('getExecutionById returns correct record', () => {
  const id = insertExecution(db, {
    cwd: '/Users/test/project',
    user_prompt: '重构认证模块',
  });

  updateExecution(db, id, {
    status: 'completed',
    summary: '已将认证逻辑从 middleware 移至 service 层',
    duration_ms: 25000,
    num_turns: 5,
  });

  const record = getExecutionById(db, id);
  expect(record).not.toBeNull();
  expect(record!.id).toBe(id);
  expect(record!.user_prompt).toBe('重构认证模块');
  expect(record!.summary).toBe('已将认证逻辑从 middleware 移至 service 层');
  expect(record!.status).toBe('completed');
  expect(record!.duration_ms).toBe(25000);
});

test('getExecutionById returns null for non-existent id', () => {
  const record = getExecutionById(db, 'non-existent-uuid');
  expect(record).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `npx jest src/__tests__/db.test.ts -v`
Expected: All tests PASS — `getExecutionById` already exists in `src/lib/db.ts`.

- [ ] **Step 3: Update main.ts imports and add detail window IPC handlers**

In `electron/main.ts`, update the db import (line 11) to include `getExecutionById`:

```typescript
import { initDb, insertExecution, updateExecution, getRecentExecutions, getActiveExecution, getExecutionById } from '../src/lib/db';
```

Add a `detailWindow` variable near the other global state (around line 35):

```typescript
let detailWindow: BrowserWindow | null = null;
```

Add two new IPC handlers inside `registerIpcHandlers()` (after the existing `summary:ready` handler, around line 322):

```typescript
ipcMain.on('summary:open-detail', (_, { id }: { id: string }) => {
  if (detailWindow && !detailWindow.isDestroyed()) {
    detailWindow.close();
  }

  detailWindow = new BrowserWindow({
    width: 500,
    height: 600,
    title: '执行详情',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  detailWindow.loadURL(`http://127.0.0.1:${serverPort}/summary/detail?id=${id}`);
  detailWindow.on('closed', () => { detailWindow = null; });
});

ipcMain.on('summary:fetch-detail', (event, { id }: { id: string }) => {
  const record = getExecutionById(db, id);
  event.sender.send('summary:detail-data', { record });
});
```

- [ ] **Step 4: Create detail page**

Create `src/app/summary/detail/page.tsx`:

```typescript
'use client';

import { useState, useEffect } from 'react';
import { getIpcRenderer } from '@/lib/electron-ipc';
import type { ExecutionRecord } from '@/types';

export default function SummaryDetailPage() {
  const [record, setRecord] = useState<ExecutionRecord | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const ipcRenderer = getIpcRenderer();
    if (!ipcRenderer) return;

    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');
    if (!id) {
      setError('缺少记录 ID');
      return;
    }

    const handler = (_: unknown, data: { record: ExecutionRecord | null }) => {
      if (data.record) {
        setRecord(data.record);
      } else {
        setError('未找到记录');
      }
    };

    ipcRenderer.on('summary:detail-data', handler);
    ipcRenderer.send('summary:fetch-detail', { id });

    return () => { ipcRenderer.removeListener('summary:detail-data', handler); };
  }, []);

  const statusLabel: Record<string, string> = {
    running: '执行中',
    completed: '已完成',
    failed: '出错',
    cancelled: '已中断',
  };

  const statusColor: Record<string, string> = {
    running: '#007AFF',
    completed: '#34C759',
    failed: '#FF453A',
    cancelled: '#FF9500',
  };

  if (error) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#999', fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif' }}>
        {error}
      </div>
    );
  }

  if (!record) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#999', fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif' }}>
        加载中...
      </div>
    );
  }

  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif', fontSize: 14, color: '#333', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid #eee', display: 'flex', alignItems: 'center' }}>
        <button
          onClick={() => window.close()}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: '#007AFF', padding: 0, fontFamily: 'inherit' }}
        >
          ← 关闭
        </button>
      </div>

      <div style={{ padding: '16px 16px 12px', borderBottom: '1px solid #f5f5f5' }}>
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8, lineHeight: 1.4 }}>
          {record.user_prompt}
        </div>
        <div style={{ display: 'flex', gap: 12, fontSize: 12, color: '#999' }}>
          <span style={{ color: statusColor[record.status] || '#999' }}>
            {statusLabel[record.status] || record.status}
          </span>
          <span>{new Date(record.created_at).toLocaleString('zh-CN')}</span>
          {record.duration_ms != null && <span>耗时 {Math.round(record.duration_ms / 1000)}s</span>}
          {record.cost_usd != null && <span>${record.cost_usd.toFixed(4)}</span>}
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: '#999', marginBottom: 6, fontWeight: 600 }}>输入</div>
          <div style={{ background: '#f5f5f5', borderRadius: 8, padding: 12, whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
            {record.user_prompt}
          </div>
        </div>

        {record.summary && (
          <div>
            <div style={{ fontSize: 12, color: '#999', marginBottom: 6, fontWeight: 600 }}>输出</div>
            <div style={{ background: '#f5f5f5', borderRadius: 8, padding: 12, whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
              {record.summary}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Update SummaryPanel to make records clickable**

In `src/components/SummaryPanel.tsx`, update the current execution section (around lines 57-69). Replace the `{current && (` block with:

```typescript
      {current && (
        <div
          onClick={() => {
            if (current.status !== 'running') {
              getIpcRenderer()?.send('summary:open-detail', { id: current.id });
            }
          }}
          style={{
            padding: '12px 16px',
            borderBottom: '1px solid #eee',
            cursor: current.status !== 'running' ? 'pointer' : 'default',
            transition: 'background 0.15s ease',
            borderRadius: 4,
          }}
          onMouseEnter={e => { if (current.status !== 'running') e.currentTarget.style.background = '#f5f5f5'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
        >
          <div style={{ color: '#666', marginBottom: 6 }}>「{current.user_prompt}」</div>
          {current.summary && (
            <div style={{ lineHeight: 1.5 }}>{current.summary}</div>
          )}
          {current.duration_ms != null && (
            <div style={{ color: '#999', marginTop: 8, fontSize: 12 }}>
              耗时 {Math.round(current.duration_ms / 1000)}s
              {current.num_turns != null && ` · 使用了 ${current.num_turns} 个工具`}
            </div>
          )}
        </div>
      )}
```

Update the history records section (around lines 76-90). Replace the `{history.slice(0, 5).map(` block with:

```typescript
          {history.slice(0, 5).map(exec => (
            <div
              key={exec.id}
              onClick={() => getIpcRenderer()?.send('summary:open-detail', { id: exec.id })}
              style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '6px 0', fontSize: 12, borderBottom: '1px solid #f5f5f5',
                cursor: 'pointer', borderRadius: 4, transition: 'background 0.15s ease',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = '#f5f5f5'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 240 }}>
                {exec.user_prompt}
              </span>
              <span style={{ color: '#999', flexShrink: 0 }}>
                {exec.status === 'completed' ? `${Math.round((exec.duration_ms || 0) / 1000)}s` :
                 exec.status === 'failed' ? '失败' : '...'}
              </span>
            </div>
          ))}
```

- [ ] **Step 6: Run tests**

Run: `npx jest src/__tests__/db.test.ts -v`
Expected: All tests PASS including new `getExecutionById` tests.

- [ ] **Step 7: Manual test**

1. Run `npm run electron:dev`
2. Execute a command via voice input (or insert a record directly in DB)
3. Left-click tray icon → summary popup opens
4. Click a history record → detail window opens with full input/output
5. Verify: status, time, duration displayed correctly
6. Click "← 关闭" → detail window closes
7. Verify: clicking a running record does nothing (no cursor pointer)

- [ ] **Step 8: Commit**

```bash
git add src/__tests__/db.test.ts electron/main.ts src/app/summary/detail/page.tsx src/components/SummaryPanel.tsx
git commit -m "feat: add summary detail view with clickable execution records"
```

---

## Self-Review Checklist

**1. Spec coverage:**
- [x] Bug 1 empty transcription: Task 1 (defensive handling + logging)
- [x] Bug 2 Dock icon: Task 4 (placeholder icon + build config)
- [x] Bug 3 Tray click: Task 3 (separate left/right click, remove setContextMenu)
- [x] Bug 4 Close button: Task 2 (X button + cancel in all states)
- [x] Feature summary detail: Task 5 (IPC + detail page + clickable records)

**2. Placeholder scan:** No TBD, TODO, or placeholder patterns found.

**3. Type consistency:**
- `onCancel` callback used in VoiceInput matches `voice:cancel` IPC channel
- `ExecutionRecord` type used consistently across detail page and SummaryPanel
- `getExecutionById` import added to main.ts
- Store transition paths verified against `VALID_TRANSITIONS` map
