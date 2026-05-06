# 字幕弹窗固定高度优化 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将字幕弹窗从动态高度改为固定高度，文字超出时平滑滚动。

**Architecture:** 移除主进程的 `tts-content-height` IPC 动态调高机制，窗口固定 150px。页面端将滚动容器固定为 92px（约4行），添加底部渐变遮罩暗示更多内容。保留现有的 scrollIntoView 自动滚动和手动滚动暂停逻辑。

**Tech Stack:** Electron BrowserWindow API, React inline styles, CSS gradient overlay

---

### Task 1: 修改 electron/subtitle-popup.ts — 固定窗口高度，移除动态调高

**Files:**
- Modify: `electron/subtitle-popup.ts`

- [ ] **Step 1: 修改 ensureWindow 中的窗口高度**

将 `ensureWindow` 中两处 `140` 改为 `150`（line 29 和 line 35）：

```typescript
// line 29: setSize 调用
this.win.setSize(popupWidth, 150);

// line 35: BrowserWindow 构造参数
height: 150,
```

- [ ] **Step 2: 移除 tts-content-height IPC 监听器**

删除 `ensureWindow` 中 line 62-71 的整个 `tts-content-height` 监听器注册块：

```typescript
// 删除以下代码块:
if (this.heightHandler) {
  ipcMain.removeListener('tts-content-height', this.heightHandler);
}
this.heightHandler = (_event: any, height: number) => {
  if (typeof height !== 'number' || !Number.isFinite(height)) return;
  if (!this.win || this.win.isDestroyed()) return;
  const winHeight = Math.round(Math.max(140, Math.min(400, 42 + height + 28)));
  this.win.setSize(340, winHeight);
};
ipcMain.on('tts-content-height', this.heightHandler);
```

- [ ] **Step 3: 移除 heightHandler 字段声明和 destroy 中的清理**

删除类字段 `private heightHandler: ((_event: any, height: number) => void) | null = null;`（line 15）。

在 `destroy()` 方法中，删除 heightHandler 清理块（line 134-137）：

```typescript
// 删除以下代码:
if (this.heightHandler) {
  ipcMain.removeListener('tts-content-height', this.heightHandler);
  this.heightHandler = null;
}
```

- [ ] **Step 4: 移除不再需要的 ipcMain import**

将 `import { BrowserWindow, ipcMain } from 'electron';` 改为 `import { BrowserWindow } from 'electron';`，因为 `ipcMain` 只被 `tts-content-height` 和 `tts-page-ready` 使用。检查 `tts-page-ready` 仍在使用 `ipcMain`，所以保留 import 不变。

（经检查：`tts-page-ready` 在 `show()` 和 `destroy()` 中仍使用 `ipcMain`，所以 import 保留不变。）

- [ ] **Step 5: 提交**

```bash
git add electron/subtitle-popup.ts
git commit -m "refactor: fix subtitle popup height at 150px, remove dynamic resizing"
```

---

### Task 2: 修改 src/app/subtitle/page.tsx — 固定滚动容器高度，添加渐变遮罩

**Files:**
- Modify: `src/app/subtitle/page.tsx`

- [ ] **Step 1: 移除 ResizeObserver 高度上报 useEffect**

删除 line 97-110 的整个 useEffect 块（`// Measure text height and notify main process` 注释到 `}, [visible]);`）：

```typescript
// 删除整个块:
useEffect(() => {
  if (!textContainerRef.current || !visible) return;

  const observer = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const height = Math.round(Number(entry.contentRect.height));
      if (!Number.isFinite(height) || height <= 0) return;
      getIpcRenderer()?.send('tts-content-height', height);
    }
  });

  observer.observe(textContainerRef.current);
  return () => observer.disconnect();
}, [visible]);
```

同时删除 `textContainerRef` 的声明（line 34）：

```typescript
// 删除:
const textContainerRef = useRef<HTMLDivElement | null>(null);
```

- [ ] **Step 2: 移除外层容器的动态高度相关样式**

在 `SubtitleContent` 的 return JSX 中，外层 `<div>`（line 193-209）的 style 中：

- 删除 `minHeight: '80px',`（line 204）
- 删除 `maxHeight: '400px',`（line 205）

- [ ] **Step 3: 修改滚动容器为固定高度**

滚动容器 `<div>`（line 275-307）的 style 中，将 `maxHeight: 'calc(400px - 42px - 28px)'` 改为固定高度：

```typescript
height: '92px',  // 固定4行高度，替代 maxHeight
overflowY: 'auto',
```

同时将内层包裹 div 的 `ref={(el) => { textContainerRef.current = el; }}` 移除（因为 textContainerRef 已删除），改为不设 ref：

```tsx
<div>
```

- [ ] **Step 4: 添加底部渐变遮罩**

在外层容器的 `</div>` 结束标签之前（关闭按钮之后、滚动容器之后），添加渐变遮罩：

```tsx
{/* Bottom gradient mask */}
<div
  style={{
    position: 'absolute',
    bottom: '14px',
    left: '18px',
    right: '18px',
    height: '28px',
    background: 'linear-gradient(transparent, rgb(28, 28, 35))',
    pointerEvents: 'none',
    zIndex: 5,
  }}
/>
```

- [ ] **Step 5: 验证构建通过**

运行: `npm run build`
预期: 构建成功，无 TypeScript 错误

- [ ] **Step 6: 提交**

```bash
git add src/app/subtitle/page.tsx
git commit -m "feat: fixed-height subtitle scroll container with gradient mask"
```

---

### Task 3: 端到端验证

- [ ] **Step 1: 启动 Electron 开发模式**

运行: `npm run electron:dev`

- [ ] **Step 2: 触发一次 TTS 朗读**

验证:
- 弹窗出现时高度固定，不会跳变
- 文字超过4行时自动向上滚动，当前朗读词居中
- 底部渐变遮罩可见，暗示还有更多内容
- 手动滚动时自动滚动暂停2秒
- 朗读结束后弹窗正常关闭
