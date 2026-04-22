# Architecture

**Analysis Date:** 2026-04-22

## Pattern Overview

**Overall:** Electron + Next.js hybrid monolith with dual-process architecture

**Key Characteristics:**
- Two parallel code paths: Electron main process (CJS/esbuild) and Next.js app (React 19/App Router)
- Next.js runs as a standalone HTTP server on localhost, consumed by Electron BrowserWindows
- Shared state via `ShrewStore` class instantiated in Electron main and accessed from Next.js API routes via `globalThis`
- IPC between Electron main process and BrowserWindow renderers using `ipcMain`/`ipcRenderer`
- Finite state machine governs all application behavior with whitelist-validated transitions
- Native modules (better-sqlite3, sherpa-onnx-node, uiohook-napi) run exclusively in Node.js (main process or API routes), never in browser context

## Layers

**Electron Main Process Layer:**
- Purpose: System integration, window lifecycle, hardware access (keyboard, microphone), tray icon, IPC coordination
- Location: `Shrew/electron/`
- Contains: Window managers (`VoiceBarWindow`, `SummaryPopupWindow`), hardware controllers (`ShortcutManager`, `AudioRecorder`), tray (`ShrewTray`)
- Depends on: All `src/lib/` modules via direct import (path `../src/lib/*`)
- Used by: Next.js API routes via `globalThis` bridge; BrowserWindow renderers via IPC

**Next.js Application Layer:**
- Purpose: All UI rendering (pages and components) and HTTP API endpoints
- Location: `Shrew/src/`
- Contains: App Router pages, React components, API routes, shared libraries
- Depends on: Electron main process (via IPC from renderer, via `globalThis` from API routes)
- Used by: Electron BrowserWindows load these pages via `http://127.0.0.1:{port}/{route}`

**Shared Library Layer:**
- Purpose: Business logic and data access used by both Electron and Next.js
- Location: `Shrew/src/lib/`
- Contains: State machine (`store.ts`), database (`db.ts`), Claude SDK client (`claude-client.ts`), voice recognition (`sherpa.ts`), keychain (`keychain.ts`)
- Depends on: External packages (better-sqlite3, sherpa-onnx-node, @anthropic-ai/claude-agent-sdk, electron)
- Used by: Electron main process (direct import), Next.js API routes (via `globalThis` bridge)

**Native Module Layer:**
- Purpose: Low-level system interaction requiring native binaries
- Location: `Shrew/electron/native/key-event-tap/` (Swift), npm packages (better-sqlite3, sherpa-onnx-node, uiohook-napi)
- Contains: Swift N-API module for CGEventTap keyboard interception
- Depends on: macOS system frameworks (CoreGraphics, ApplicationServices)
- Used by: Electron main process

## Data Flow

**Voice Command Execution Flow:**

1. User presses Right Command key
2. `ShortcutManager` (uiohook-napi) fires callback in `electron/main.ts`
3. `handleRightCommand()` reads current state from `ShrewStore.getRightCommandAction()`
4. State-dependent action:
   - **idle** -> `VoiceBarWindow.show()`, `AudioRecorder.startRecording()`, transition to `recording`
   - **recording** -> `AudioRecorder.stopRecording()`, transition to `transcribing`, then `recorder.transcribe()` via sherpa-onnx
   - **editing** -> transition to `recording` for append
   - **executing** -> abort current Claude execution
5. Transcription result sent to voice-bar via IPC `voice:transcript`
6. User edits text in VoiceInput component, presses Enter/Send
7. Voice-bar sends IPC `voice:send` with text to main process
8. `executePrompt()` transitions state to `sending` -> `executing`, inserts DB record, calls `executeClaude()`
9. `executeClaude()` streams Claude Agent SDK messages via AsyncGenerator, updates `ShrewStore` sub-states
10. On completion: DB record updated, state transitions to `idle`, tray dot color updated

**State Management:**
- Single `ShrewStore` instance created in `electron/main.ts` line 412
- Exposed to Next.js via `(globalThis as any).__shrewStore` (line 385)
- Two-tier state: `AppState` (application lifecycle) and `SdkSubState` (Claude execution progress)
- All transitions validated against `VALID_TRANSITIONS` whitelist in `src/lib/store.ts`
- Observer pattern: `store.onChange(callback)` with unsubscribe return

**Window Lifecycle:**
- VoiceBar and SummaryPopup are created on demand and destroyed after use (not cached)
- Settings/Onboarding use the `mainWindow` BrowserWindow (singleton, reused)
- All windows load Next.js pages via `http://127.0.0.1:{port}/{route}`
- Production: Next.js standalone server spawned on random port by Electron main process
- Development: Next.js dev server on port 3000, Electron connects to it

## Key Abstractions

**ShrewStore (State Machine):**
- Purpose: Central runtime state governing all application behavior
- Implementation: `src/lib/store.ts` - class with whitelist-validated `transition()` method
- State graph: `idle` -> `recording` -> `transcribing` -> `editing` -> `sending` -> `executing` -> `idle` (with `error` branch)
- SDK sub-states: `thinking`, `executing_tool`, `compacting`, `rate_limited`, `authenticating`, `completed`, `failed`, `cancelled`
- Derives `dotColor` (tray indicator) and `getRightCommandAction()` (keyboard behavior) from current state
- Examples: `Shrew/src/lib/store.ts`

**Window Manager Classes:**
- Purpose: Lifecycle management for specialized BrowserWindows
- Pattern: Each window type is a class with `show()`, `close()`, `send()` methods
- Examples: `Shrew/electron/voice-bar.ts` (`VoiceBarWindow`), `Shrew/electron/summary-popup.ts` (`SummaryPopupWindow`)
- VoiceBar: Screen-bottom centered, frameless, transparent, always-on-top, visible on all workspaces
- SummaryPopup: Positioned below tray icon, frameless, auto-close on blur

**Claude Execution Client:**
- Purpose: Async streaming interface to Claude Agent SDK
- Implementation: `src/lib/claude-client.ts` - `executeClaude()` returns `Promise<ClaudeExecutionResult>`
- Uses `query()` AsyncGenerator from `@anthropic-ai/claude-agent-sdk`
- Callback interface: `onSubState(substate, toolName?)`, `onError(error)`
- Supports abort via `AbortController` signal chaining
- Examples: `Shrew/src/lib/claude-client.ts`

**Audio Pipeline:**
- Purpose: Record audio and transcribe to text locally
- Components: `AudioRecorder` (recording via macOS `afrecord`) + `VoiceRecognizer` (sherpa-onnx SenseVoice)
- Lazy loading: Voice model loaded on first use, not at startup
- Temp files: Written to `~/Library/Application Support/Shrew/tmp/`, cleaned after transcription
- Examples: `Shrew/electron/recorder.ts`, `Shrew/src/lib/sherpa.ts`

**Database Layer:**
- Purpose: Persistent storage for execution history
- Implementation: `src/lib/db.ts` - functional module (not class), takes `Database` as first parameter
- Schema: Single `execution_history` table with indexed `created_at`
- SQLite in WAL mode for concurrent read/write
- Location: `~/Library/Application Support/Shrew/shrew.db`
- Examples: `Shrew/src/lib/db.ts`

## Entry Points

**Electron Main Process:**
- Location: `Shrew/electron/main.ts`
- Triggers: Electron app startup (`app.whenReady()`)
- Responsibilities: Initializes all subsystems (DB, store, tray, shortcuts, recorder, IPC), manages window lifecycle, starts Next.js server in production

**Next.js Standalone Server:**
- Location: Built to `.next/standalone/server.js`
- Triggers: Spawned by Electron main process in production, or `npm run dev` in development
- Responsibilities: Serves all UI pages and API routes via HTTP on localhost

**Build Entry Point:**
- Location: `Shrew/scripts/build-electron.mjs`
- Triggers: `npm run build:electron` or `npm run electron:dev`
- Responsibilities: esbuild bundles `electron/main.ts` to `dist-electron/main.js` with native modules externalized

## Error Handling

**Strategy:** Fail-silently with user-facing feedback via tray dot and voice-bar error messages

**Patterns:**
- State machine `error` state with automatic transition to `idle` (see `handleRightCommand` catch block in `electron/main.ts` lines 189-193)
- Claude execution errors captured as `failed` status in `ClaudeExecutionResult` and persisted to DB
- Voice-bar receives `voice:error` IPC message for display to user
- Missing API key results in red tray dot (no crash)
- Next.js server startup failure shows dialog and quits app

## Cross-Cutting Concerns

**Logging:** `console.log`/`console.error` only. Next.js server stdout/stderr captured with `[next-server]` prefix. No structured logging framework.

**Validation:** State machine transition whitelist in `src/lib/store.ts`. IPC message types defined in `src/types/index.ts` (typed but not runtime-validated). API route input validation (prompt + cwd required in `api/chat/route.ts`).

**Authentication:** API key stored encrypted via Electron `safeStorage` (macOS Keychain-backed). File at `~/Library/Application Support/Shrew/secure/anthropic-key.enc`. Key validation during onboarding via test API call. Permission mode hardcoded to `bypassPermissions`.

---

*Architecture analysis: 2026-04-22*
