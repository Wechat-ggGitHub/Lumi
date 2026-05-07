# Main Window Smooth Open/Close Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate visual flash when opening/closing the main window via tray icon click.

**Architecture:** Three targeted changes — hide instead of destroy on close, dynamic `backgroundColor` matching system theme, CSS fade-in animation on show. Only two files modified.

**Tech Stack:** Electron BrowserWindow API, `nativeTheme` module, CSS animations.

---

### Task 1: Hide Instead of Destroy

**Files:**
- Modify: `electron/main.ts:38` (add module-level variable)
- Modify: `electron/main.ts:1` (import `nativeTheme`)
- Modify: `electron/main.ts:1201-1218` (add close handler in `createMainWindow`)
- Modify: `electron/main.ts:1242-1253` (extend `before-quit` handler)

- [ ] **Step 1: Add `isQuitting` flag and import `nativeTheme`**

In `electron/main.ts`, line 1, add `nativeTheme` to the electron import:

```typescript
import { app, BrowserWindow, ipcMain, systemPreferences, dialog, shell, nativeTheme } from 'electron';
```

After line 44 (`let personaWatcher`), add:

```typescript
let isQuitting = false;
```

- [ ] **Step 2: Add close event handler in `createMainWindow()`**

In `electron/main.ts`, after `mainWindow.once('ready-to-show', ...)` (line 1217), add the close handler:

```typescript
  mainWindow.on('close', (event) => {
    if (isQuitting) return;
    event.preventDefault();
    mainWindow!.hide();
  });
```

The full `createMainWindow()` function should now read:

```typescript
function createMainWindow(): void {
  mainWindow = new BrowserWindow({
    width: 920,
    height: 640,
    minWidth: 880,
    minHeight: 620,
    show: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#faf9f5',
    trafficLightPosition: { x: 16, y: 18 },
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });
  mainWindow.loadURL(`http://127.0.0.1:${serverPort}/chat`);
  mainWindow.once('ready-to-show', () => mainWindow?.show());
  mainWindow.on('close', (event) => {
    if (isQuitting) return;
    event.preventDefault();
    mainWindow!.hide();
  });
}
```

- [ ] **Step 3: Extend `before-quit` handler**

In `electron/main.ts`, at the start of the existing `app.on('before-quit', ...)` handler (line 1242), add the `isQuitting` flag and mainWindow cleanup:

```typescript
app.on('before-quit', () => {
  isQuitting = true;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.removeAllListeners('close');
    mainWindow.close();
  }
  personaWatcher?.close();
  shortcutManager?.stop();
  ttsService?.stop();
  subtitlePopup?.destroy();
  voiceBar?.destroy();
  db?.close();
  if (nextServer) {
    nextServer.kill();
    nextServer = null;
  }
});
```

- [ ] **Step 4: Fix `onboarding:complete` handler**

At line 804-807, the onboarding complete handler calls `mainWindow?.close()` which will now hide instead of destroy. Update it to explicitly destroy:

```typescript
ipcMain.on('onboarding:complete', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.removeAllListeners('close');
    mainWindow.close();
  }
  createMainWindow();
});
```

- [ ] **Step 5: Fix `activate` handler**

At line 1194-1198, the `app.on('activate')` handler checks `BrowserWindow.getAllWindows().length === 0`. Since the window is now hidden instead of destroyed, it will still exist. Update to check visibility:

```typescript
app.on('activate', () => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createMainWindow();
  } else {
    mainWindow.show();
    mainWindow.focus();
  }
});
```

- [ ] **Step 6: Build and verify**

Run: `npm run build:electron`

Expected: Build succeeds with no errors.

- [ ] **Step 7: Commit**

```bash
git add electron/main.ts
git commit -m "feat: hide main window on close instead of destroying

Window is reused on next tray click, eliminating the flash caused
by recreating and reloading the page each time."
```

---

### Task 2: Dynamic Background Color

**Files:**
- Modify: `electron/main.ts:1209` (dynamic `backgroundColor` in `createMainWindow`)
- Modify: `electron/main.ts` (add `nativeTheme.on('updated')` listener)

- [ ] **Step 1: Use dynamic `backgroundColor` in `createMainWindow()`**

In `electron/main.ts`, inside `createMainWindow()`, change the hardcoded `backgroundColor`:

```typescript
backgroundColor: nativeTheme.shouldUseDarkColors ? '#111110' : '#faf9f5',
```

- [ ] **Step 2: Add `nativeTheme` change listener**

In `electron/main.ts`, after the `createMainWindow()` function definition (after the closing brace around line 1221), add:

```typescript
nativeTheme.on('updated', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setBackgroundColor(
      nativeTheme.shouldUseDarkColors ? '#111110' : '#faf9f5'
    );
  }
});
```

- [ ] **Step 3: Build and verify**

Run: `npm run build:electron`

Expected: Build succeeds with no errors.

- [ ] **Step 4: Commit**

```bash
git add electron/main.ts
git commit -m "feat: match BrowserWindow background color to system theme

Eliminates the white flash in dark mode by syncing the native
backgroundColor with the CSS theme."
```

---

### Task 3: CSS Fade-In Animation

**Files:**
- Modify: `src/app/globals.css:46-50` (add animation to body rule)

- [ ] **Step 1: Add fade-in animation to body**

In `src/app/globals.css`, update the existing `body` rule (line 46-50) to include the animation:

```css
body {
  margin: 0;
  background: var(--bg-app);
  color: var(--text-primary);
  animation: windowFadeIn 0.2s ease-out;
}
```

Then add the keyframe after the existing `@keyframes spin` block (around line 60):

```css
@keyframes windowFadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
```

- [ ] **Step 2: Build and verify**

Run: `npm run build`

Expected: Build succeeds with no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/globals.css
git commit -m "style: add fade-in animation to main window body"
```

---

### Task 4: Manual Verification

These steps require running the app in Electron mode and manually testing.

- [ ] **Step 1: Launch in dev mode**

Run: `npm run electron:dev`

- [ ] **Step 2: Test open flash**

Click the tray icon. The window should appear with a smooth 0.2s fade-in, no white flash.

- [ ] **Step 3: Test close flash**

Click the red close button. The window should disappear instantly with no white flash.

- [ ] **Step 4: Test reopen speed**

Click the tray icon again. The window should reappear instantly (no page reload), with a smooth fade-in.

- [ ] **Step 5: Test dark mode**

Switch macOS to dark mode, then click the tray icon. No light flash should appear.

- [ ] **Step 6: Test quit**

With the window open, quit the app (Cmd+Q or tray menu → Quit). The app should quit cleanly without hanging.
