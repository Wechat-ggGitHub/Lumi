# Subtitle & TTS Optimization Design

Date: 2026-05-06

## Problem

Four issues with the subtitle popup and TTS pipeline:

1. **Subtitle freezes mid-playback**: `requestAnimationFrame` is throttled when BrowserWindow loses focus; no `backgroundThrottling: false` set.
2. **Only 3 lines visible**: Popup height hardcoded to 140px, no overflow handling.
3. **No scrolling**: Text beyond the visible area is clipped with no way to scroll.
4. **Noticeable delay after green dot**: TTS synthesis + window creation + audio decoding are all serial, totaling 3-6 seconds.

## Approach

Parallel optimization: fix bugs (1-3) and reduce latency (4) together. No streaming TTS (deferred to future work).

## Design

### 1. Subtitle Popup Reuse + backgroundThrottling

**File: `electron/subtitle-popup.ts`**

- Add `backgroundThrottling: false` to BrowserWindow webPreferences.
- Constructor creates the window once; `show()` reuses the existing window.
- `close()` hides the window (`win.hide()`), does not destroy it.
- `destroy()` closes and nulls the window (app shutdown only).
- On `show()`: if window exists and is loaded, reload the page URL, then follow the existing handshake. If window was destroyed, create a new one.

### 2. Dynamic Height + Auto-Scrolling

**File: `src/app/subtitle/page.tsx`**

- Text container gets `overflow-y: auto` and a `ref` for scroll control.
- Each word `<span>` gets a `ref` (via callback ref stored in an array) so we can call `scrollIntoView` on the current word.
- Auto-scroll: when `currentIndex` changes, call `scrollIntoView({ block: 'center', behavior: 'smooth' })` on the current word element.
- Manual scroll override: if user scrolls manually, set `autoScrollRef.current = false`. A 2-second `setTimeout` resets it to `true`.
- Height: renderer measures text content height via `ResizeObserver` on the text container. Sends `tts-content-height` IPC with the measured height.

**File: `electron/subtitle-popup.ts`**

- Listen for `tts-content-height` IPC event.
- Calculate window height: `headerHeight(42px) + contentHeight + padding(28px)`, clamped to `[140, 400]`.
- Call `win.setSize(340, calculatedHeight)`.

### 3. setInterval Replaces requestAnimationFrame

**File: `src/app/subtitle/page.tsx`**

- Replace `requestAnimationFrame(tick)` loop with `setInterval(tick, 50)`.
- `backgroundThrottling: false` ensures the interval is not throttled.
- Cleanup: `clearInterval` on unmount and when playback ends.
- Tick logic unchanged: read `AudioContext.currentTime`, find current word index.

### 4. Parallel TTS Synthesis + Window Preparation

**File: `electron/main.ts`**

- In `speakResult()`, start TTS synthesis and window preparation in parallel using `Promise.all`-style concurrency.
- Window preparation: call `subtitlePopup.prepare(trayBounds)` which ensures the window is loaded and ready (creates if needed, reloads if reused).
- TTS synthesis: `ttsService.synthesize(...)` runs concurrently.
- When both complete: read audio file, send to popup via IPC.

Timing improvement:
- Before: serial(TTS 2-4s + window 1.5s + decode 0.2s) = 3.7-5.7s
- After: parallel(max(TTS 2-4s, window 0.5s) + decode 0.2s) = 2.2-4.2s (first run)
- Subsequent runs with reused window: max(TTS 2-4s, ~0s) + decode = 2.2-4.2s

## Files Changed

| File | Change |
|------|--------|
| `electron/subtitle-popup.ts` | Window reuse, `backgroundThrottling: false`, dynamic height via IPC, `prepare()` method |
| `src/app/subtitle/page.tsx` | `setInterval` tick, auto-scroll container, `ResizeObserver` height measurement, manual scroll override |
| `electron/main.ts` | Parallel TTS + window preparation in `speakResult()` |
| `electron/tts.ts` | No changes needed |

## Not Changed

- TTS WebSocket protocol
- Tray icon animation logic
- Store state machine
- IPC channel names (reusing existing `tts-audio-data`, `tts-page-ready`, `tts-playback-done`, `tts-stop-requested`)

## New IPC Channels

| Channel | Direction | Purpose |
|---------|-----------|---------|
| `tts-content-height` | renderer -> main | Notify popup of measured text content height |

## Future Work

- Streaming TTS: send audio chunks to popup as they arrive, decode and play incrementally. Would reduce perceived latency to <1s but requires significant refactoring of both TTS service and audio playback pipeline.
