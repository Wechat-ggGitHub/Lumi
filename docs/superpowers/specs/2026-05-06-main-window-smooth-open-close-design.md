# Main Window Smooth Open/Close

## Problem

Clicking the tray icon to open the main window causes a visual flash, and closing the window (red traffic light button) causes a white flash. Root causes:

1. **Window destroyed on close**: The close button destroys the BrowserWindow. Every tray click after closing creates a new window, loads the URL, and waits for `ready-to-show`. Even with deferred showing, the first paint may reveal the native `backgroundColor` before CSS takes over.

2. **Hardcoded light background**: `backgroundColor` is hardcoded to `#faf9f5`. In dark mode the CSS background is `#111110`, creating a stark contrast during the brief moment the native background is visible.

3. **No close animation**: `mainWindow.hide()` or window destruction happens instantly with no transition.

## Solution

Three targeted changes to eliminate flashes and smooth the experience.

### 1. Hide Instead of Destroy

Intercept the `close` event in `createMainWindow()`:

```typescript
mainWindow.on('close', (event) => {
  if (isQuitting) return;
  event.preventDefault();
  mainWindow.hide();
});
```

On tray click, the existing `show()` + `focus()` path is used — no window recreation, no page reload.

On app quit (`before-quit`), set a flag so the close handler allows destruction:

```typescript
app.on('before-quit', () => {
  isQuitting = true;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.close();
  }
});
```

Use a module-level variable `let isQuitting = false` in `electron/main.ts`.

### 2. Dynamic Background Color

In `createMainWindow()`, read the system theme:

```typescript
backgroundColor: nativeTheme.shouldUseDarkColors ? '#111110' : '#faf9f5',
```

Listen for theme changes to update the existing window:

```typescript
nativeTheme.on('updated', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setBackgroundColor(
      nativeTheme.shouldUseDarkColors ? '#111110' : '#faf9f5'
    );
  }
});
```

This requires importing `nativeTheme` from `electron`.

### 3. CSS Fade-In

Add a fade-in animation to the body in `src/app/globals.css`:

```css
body {
  animation: windowFadeIn 0.2s ease-out;
}

@keyframes windowFadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
```

No close animation — `mainWindow.hide()` is instant and the background color match (from change #2) eliminates the white flash. Keeping it simple.

## Files Changed

| File | Change |
|------|--------|
| `electron/main.ts` | Close event interception, `before-quit` handler, dynamic `backgroundColor`, `nativeTheme` listener |
| `src/app/globals.css` | `windowFadeIn` keyframe animation on body |

## Verification

1. Click tray icon → window appears with smooth fade-in, no flash
2. Close window (red button) → no white flash
3. Click tray icon again → window reappears instantly, no reload
4. Switch system theme → window background color updates
5. Quit app → window closes cleanly, no hang
