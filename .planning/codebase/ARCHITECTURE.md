# Architecture

**Analysis Date:** 2026-04-22

## Pattern Overview

**Overall:** Electron + Next.js hybrid with shared state machine

**Key Characteristics:**
- Dual-process model: Electron main process (Node.js/CJS) + Next.js standalone server (React/SSR)
- Centralized state machine (`ShrewStore`) shared across both code paths via `globalThis`
- On-demand window lifecycle: voice-bar and summary popup BrowserWindows created and destroyed as needed
- IPC bridge between Electron main process and Next.js renderer windows via `ipcMain`/`ipcRenderer`
- `globalThis` bridge from Electron main process to Next.js API routes for store and executor access

## Layers

**Electron Main Process:**
- Purpose: System-level integration, window lifecycle, global shortcuts, audio recording, tray management
- Location: `electron/`
- Contains: Application lifecycle, BrowserWindow creation/destruction, IPC handler registration, shortcut listening, recording orchestration
- Depends on: `src/lib/` modules (store, db, claude-client, sherpa, keychain), native modules (better-sqlite3, sherpa-onnx-node, uiohook-napi)
- Used by: Nobody (this is the top-level orchestrator)
- Key file: `electron/main.ts` (500 lines, the central coordinator)

**Next.js Application (UI Layer):**
- Purpose: All UI rendering -- voice-bar, summary popup, settings, onboarding, API routes
- Location: `src/app/`, `src/components/`
- Contains: React pages, UI components, Next.js API route handlers
- Depends on: `src/lib/` (for types), Electron `ipcRenderer` (for IPC communication), `globalThis` (for store/executor in API routes)
- Used by: Electron BrowserWindows load these pages via HTTP URLs

**Shared Library Layer:**
- Purpose: Core business logic shared between Electron and Next.js
- Location: `src/lib/`
- Contains: State machine (`store.ts`), Claude SDK client (`claude-client.ts`), database layer (`db.ts`), voice recognition (`sherpa.ts`), keychain (`keychain.ts`)
- Depends on: `src/types/`, external packages (better-sqlite3, sherpa-onnx-node, @anthropic-ai/claude-agent-sdk, electron)
- Used by: Both `electron/` and `src/app/api/` routes

**Type Definitions:**
- Purpose: Shared TypeScript types for app state, IPC messages, settings, execution records
- Location: `src/types/`
- Contains: `index.ts` (all domain types), `declarations.d.ts` (ambient module declarations)
- Depends on: Nothing
- Used by: All layers

## Data Flow

**Voice-to-Execution Flow (Primary User Journey):**

1. User presses Right Command key
2. `ShortcutManager` in `electron/shortcuts.ts` detects keydown via `uIOhook`
3. `handleRightCommand()` in `electron/main.ts` queries `store.getRightCommandAction()`
4. Store returns `'start-recording'` (from idle state)
5. `VoiceBarWindow.show()` creates a BrowserWindow at screen bottom, loads `http://127.0.0.1:{port}/voice-bar`
6. `AudioRecorder.startRecording()` spawns macOS `afrecord` to capture WAV audio
7. User presses Right Command again
8. Store returns `'stop-recording'`, recording stops
9. Store transitions: `recording` -> `transcribing`
10. `AudioRecorder.transcribe()` loads sherpa-onnx model (lazy) and runs SenseVoice inference
11. Transcript text sent to voice-bar via `voiceBar.send('voice:transcript', { text })`
12. Store transitions: `transcribing` -> `editing`
13. User edits text in VoiceInput component, presses Enter or Send button
14. VoiceInput sends `voice:send` IPC message with text
15. `executePrompt()` in main.ts transitions store: `editing` -> `sending` -> `executing`
16. `executeClaude()` calls Claude Agent SDK `query()` with AsyncGenerator iteration
17. SDK sub-state callbacks update store via `store.setSdkSubState()`
18. Tray dot color updates in real-time (gray/blue/green/red/yellow)
19. On completion, store transitions: `executing` -> `idle`, substate set to `completed`/`failed`
20. Execution record written to SQLite via `updateExecution()`

**State Management:**
- Single `ShrewStore` instance created in `electron/main.ts` at app startup
- Exposed to Next.js API routes via `(globalThis as any).__shrewStore`
- Exposed to Next.js API routes via `(globalThis as any).__shrewExecutor`
- Renderer windows receive state updates via IPC events (not polling)
- Tray icon reflects state via `store.dotColor` computed property
- Summary popup receives push updates via `summary:update` IPC channel

**Settings Persistence Flow:**
1. Settings UI (`src/app/settings/page.tsx`) calls `ipcRenderer.invoke('settings:save', data)`
2. Main process writes JSON to `~/Library/Application Support/Shrew/settings.json`
3. API Key separately encrypted via `electron/safeStorage` -> `~/Library/Application Support/Shrew/secure/anthropic-key.enc`

## Key Abstractions

**ShrewStore (State Machine):**
- Purpose: Central application state with whitelisted transitions
- Examples: `src/lib/store.ts`
- Pattern: Finite state machine with two layers:
  - App state: `idle -> recording -> transcribing -> editing -> sending -> executing -> idle/error`
  - SDK sub-state: `thinking | executing_tool | compacting | rate_limited | authenticating | completed | failed | cancelled | null`
  - Valid transitions defined in `VALID_TRANSITIONS` map
  - Observer pattern via `onChange()` for listener registration
  - Computed `dotColor` property maps state to tray icon color
  - Computed `getRightCommandAction()` maps state to shortcut behavior

**Window Managers:**
- Purpose: Lifecycle management for ephemeral BrowserWindows
- Examples: `electron/voice-bar.ts`, `electron/summary-popup.ts`
- Pattern: Manager classes that create/show/hide/close BrowserWindows on demand. Each holds a reference to the current window (or null). The `show()` method creates a new window if none exists. Windows are loaded by URL pointing to Next.js routes.

**AudioRecorder:**
- Purpose: Record audio via macOS system tool, transcribe via sherpa-onnx
- Examples: `electron/recorder.ts`
- Pattern: Delegates recording to `afrecord` child process, delegates transcription to `VoiceRecognizer` class. Lazy model loading on first use.

**VoiceRecognizer:**
- Purpose: Wrapper around sherpa-onnx SenseVoice model for local speech-to-text
- Examples: `src/lib/sherpa.ts`
- Pattern: Lazy-load singleton. `load()` dynamically imports `sherpa-onnx-node` and initializes the recognizer. `transcribe()` reads a WAV file and returns text.

**Claude Executor:**
- Purpose: Interface with Claude Agent SDK for task execution
- Examples: `src/lib/claude-client.ts`
- Pattern: AsyncGenerator-based streaming. `executeClaude()` iterates over `query()` messages, dispatches callbacks for each message type (assistant, tool_progress, system, result, rate_limit_event, auth_status). Supports abort via `AbortController`.

**Database Layer:**
- Purpose: SQLite persistence for execution history
- Examples: `src/lib/db.ts`
- Pattern: Functional module with `initDb()` for schema creation, plus CRUD functions (`insertExecution`, `updateExecution`, `getActiveExecution`, `getRecentExecutions`, `getExecutionById`). Uses better-sqlite3 in WAL mode.

**Keychain:**
- Purpose: Encrypt and store API key using macOS-native encryption
- Examples: `src/lib/keychain.ts`
- Pattern: Uses Electron `safeStorage.encryptString()`/`decryptString()`. Writes encrypted buffer to filesystem at `~/Library/Application Support/Shrew/secure/anthropic-key.enc`.

**ShrewTray:**
- Purpose: Menu bar presence with dynamic status dot
- Examples: `electron/tray.ts`
- Pattern: Creates Electron `Tray` with pixel-level RGBA buffer rendering for status dots (no image files needed). Callbacks (`onPopupRequested`, `onSettingsRequested`) injected by main.ts.

**ShortcutManager:**
- Purpose: Global keyboard shortcut detection
- Examples: `electron/shortcuts.ts`
- Pattern: Uses `uIOhook` from `uiohook-napi` for system-wide key event listening. Filters for Right Command key only, with 200ms debounce.

## Entry Points

**Electron Main Process:**
- Location: `electron/main.ts`
- Triggers: Electron app startup (configured as `"main": "dist-electron/main.js"` in `package.json`)
- Responsibilities: Starts Next.js standalone server (production mode), initializes database, creates store, tray, window managers, shortcut manager, recorder, registers IPC handlers, checks onboarding status

**Next.js Standalone Server:**
- Location: `.next/standalone/server.js` (built from Next.js app)
- Triggers: Spawned by Electron main process in production mode on random port
- Responsibilities: Serves all UI pages and API routes

**Build Entry Points:**
- Electron build: `scripts/build-electron.mjs` -- esbuild bundles `electron/main.ts` to `dist-electron/main.js`
- Next.js build: `next build` with `output: 'standalone'` config

## Error Handling

**Strategy:** Layered with graceful degradation

**Patterns:**
- State machine error state: Invalid transitions are silently ignored. `error` state can only transition back to `idle`
- Recording/transcription errors: Voice bar receives `voice:error` IPC message, store transitions to `error` then `idle`
- Claude execution errors: Caught in `executeClaude()` try/catch, status set to `failed`, error passed via `onError` callback, record updated in DB
- Abort handling: `AbortController` propagated from main process to Claude SDK. On cancel, status set to `cancelled`
- Server startup failure: Dialog error box shown, app quits
- Health check retry: `waitForServer()` polls `/api/health` with 500ms intervals, up to 20 retries

## Cross-Cutting Concerns

**Logging:** Console.log/error only. Next.js server stdout/stderr logged with `[next-server]` prefix. No structured logging framework.

**Validation:** API route input validation in `src/app/api/chat/route.ts` (checks for required `prompt` and `cwd`). State machine validation via whitelist. Settings are stored as JSON with defaults.

**Authentication:** API key stored encrypted using Electron `safeStorage` (backed by macOS Keychain). Validated on save by calling Anthropic API with a minimal request. No session management -- single-user desktop app.

**IPC Communication:** Bidirectional via Electron `ipcMain`/`ipcRenderer`:
- `ipcMain.on()` for fire-and-forget messages (voice:send, voice:cancel, summary:ready)
- `ipcMain.handle()` for request/response (settings:load, settings:save, onboarding:*)
- `webContents.send()` for main-to-renderer push (voice:transcript, summary:update)

**globalThis Bridge:** Store and executor exposed on `globalThis` so Next.js API routes (running in Node.js context) can access them directly without IPC:
- `__shrewStore` -> `ShrewStore` instance
- `__shrewExecutor` -> `{ execute: executePrompt }`

---

*Architecture analysis: 2026-04-22*
