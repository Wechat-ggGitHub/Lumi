# Codebase Concerns

**Analysis Date:** 2026-04-22

## Tech Debt

**Monolithic main.ts (499 lines, growing):**
- Issue: `electron/main.ts` handles window lifecycle, IPC registration, settings, prompt execution, onboarding, and Next.js server management all in one file. It is the single largest file in the project and will become harder to maintain as features grow.
- Files: `electron/main.ts`
- Impact: Any change to IPC, window management, or execution logic requires modifying the same file, increasing merge conflict risk and cognitive load.
- Fix approach: Extract IPC handlers into `electron/ipc.ts`, prompt execution into `electron/executor.ts`, settings management into `electron/settings.ts`, and onboarding logic into `electron/onboarding.ts`. Keep `main.ts` as a thin orchestrator that wires modules together.

**Hardcoded permission bypass with no user-facing option:**
- Issue: `claude-client.ts` always sets `permissionMode: 'bypassPermissions'` and `allowDangerouslySkipPermissions: true`. The settings UI has a `claudePermissionMode` field in `AppSettings` but it is never read or applied during execution. There is no way for users to choose a safer permission mode.
- Files: `src/lib/claude-client.ts` (lines 38-39), `electron/main.ts` (line 136), `src/types/index.ts` (line 45)
- Impact: All Claude SDK executions run with full permission bypass. If the SDK attempts a dangerous operation (e.g., file deletion), there is no safety gate.
- Fix approach: Read `settings.claudePermissionMode` in `executeClaude()` and pass it to the SDK options. Add a UI control in the settings page to toggle between `bypassPermissions` and safer modes.

**No TypeScript strict typing for IPC channels:**
- Issue: IPC communication uses raw string channel names (`'voice:send'`, `'settings:load'`, etc.) scattered across both `electron/` and `src/` code. Although `src/types/index.ts` defines `IpcMessages`, it is never referenced by actual IPC call sites. No compile-time checking ensures channel names or payloads match.
- Files: `src/types/index.ts` (lines 52-74), all files using `ipcMain.on`/`ipcRenderer.send`
- Impact: Typos in channel names or payload shape mismatches fail silently at runtime.
- Fix approach: Create typed wrapper functions for `ipcMain.handle`, `ipcMain.on`, and `ipcRenderer` calls that derive channel names and payload types from `IpcMessages`. Replace raw string usage with the wrappers.

**globalThis as inter-process bridge:**
- Issue: `electron/main.ts` exposes `store` and `executor` via `(globalThis as any).__shrewStore` and `__shrewExecutor`. Next.js API routes (`src/app/api/status/route.ts`, `src/app/api/chat/route.ts`) read from `globalThis` with `(globalThis as any)`. This is an untyped, fragile bridge.
- Files: `electron/main.ts` (lines 385-388), `src/app/api/chat/route.ts` (line 17), `src/app/api/status/route.ts` (line 4)
- Impact: No type safety. If the main process fails to initialize before an API route is hit, the route silently returns a fallback or error. Refactoring either side breaks the bridge with no compile-time warning.
- Fix approach: Create a typed registry module (e.g., `src/lib/bridge.ts`) that formally exposes these references with proper types. Alternatively, use Electron's IPC mechanism exclusively and remove the `globalThis` bridge.

**Excessive `as any` type assertions:**
- Issue: At least 9 `as any` casts across the codebase, primarily in `claude-client.ts` (message type narrowing), `main.ts` (port extraction, tray reference), and API routes (globalThis access).
- Files: `src/lib/claude-client.ts` (lines 70, 85, 92), `electron/main.ts` (lines 51, 385-386, 417)
- Impact: Masks potential type errors. Changes to the Claude Agent SDK message types would not be caught at compile time.
- Fix approach: Define proper TypeScript interfaces for SDK message variants. Use discriminated unions with type guards instead of `as any`.

## Known Bugs

**Onboarding setInterval never cleared on unmount:**
- Symptoms: In `Onboarding.tsx`, when the user clicks "Open System Settings" for accessibility, a `setInterval` polls every 1 second. If the component unmounts (e.g., user navigates away), the interval continues running and may call `setStep` on an unmounted component.
- Files: `src/components/Onboarding.tsx` (lines 68-74)
- Trigger: Click "Open System Settings" in accessibility step, then somehow navigate away before permission is granted.
- Workaround: None. The interval eventually resolves or the component unmounts after the flow completes.

**Settings page file-scoped `path` variable shadows Node.js `path` module:**
- Symptoms: In `settings/page.tsx` line 104, `const path = await ipcRenderer.invoke('settings:pick-directory')` shadows the top-level `path` import if one were added. Currently no `path` import exists, but this naming conflict will cause confusion if the module is extended.
- Files: `src/app/settings/page.tsx` (line 104)
- Trigger: Adding a `path` import to the settings page.
- Workaround: Rename the variable to `selectedPath` or `dirPath`.

**Server readiness race condition in production mode:**
- Symptoms: `startNextServer()` has a 5-second timeout fallback (`setTimeout(() => resolve(port), 5000)`) that resolves even if the Next.js server has not printed "Ready". Then `waitForServer()` polls the health endpoint. If the server is slow to start and neither the "Ready" string nor the health check succeeds within the combined timeout, the app proceeds with a non-functional server.
- Files: `electron/main.ts` (lines 37-95, 98-125)
- Trigger: Slow disk I/O or large `.next/standalone` bundle on first launch.
- Workaround: The app shows an error dialog and quits if `waitForServer` fails after 20 retries.

**Empty catch block swallows settings load errors:**
- Symptoms: `loadSettings()` in `main.ts` wraps `JSON.parse` in an empty `catch {}`. If the settings file is corrupted (not just missing), the user silently gets default settings and their previous configuration is lost.
- Files: `electron/main.ts` (line 132)
- Trigger: Corrupted `settings.json` file (e.g., partial write after crash).
- Workaround: None. User must manually fix or delete the file.

## Security Considerations

**nodeIntegration + contextIsolation disabled on ALL windows:**
- Risk: All four BrowserWindow creation sites (`mainWindow`, `onboardingWindow`, `voiceBar`, `summaryPopup`) set `nodeIntegration: true` and `contextIsolation: false`. This gives the renderer process full Node.js access. If any external or user-controlled content is loaded (e.g., through a crafted URL or SDK message injection), it could execute arbitrary system commands.
- Files: `electron/main.ts` (lines 465-466, 480-481), `electron/voice-bar.ts` (lines 37-38), `electron/summary-popup.ts` (lines 37-38)
- Current mitigation: All loaded URLs are hardcoded (`http://127.0.0.1:${serverPort}/...`). No external content is loaded.
- Recommendations: Migrate to `contextIsolation: true` with a `preload.js` script that exposes only the necessary IPC methods via `contextBridge`. This is the Electron security best practice and would prevent renderer-side code from accessing Node.js APIs directly.

**API Key passed as plaintext string through IPC and memory:**
- Risk: The API key flows from `keychain.ts` to `executePrompt()` to `executeClaude()` where it is set as an environment variable. It passes through `globalThis` and IPC messages. It remains in memory for the lifetime of the process.
- Files: `src/lib/keychain.ts`, `electron/main.ts` (line 218), `src/lib/claude-client.ts` (line 41)
- Current mitigation: Encrypted at rest via Electron safeStorage. Never logged or written to disk unencrypted.
- Recommendations: Consider clearing the API key from memory after each SDK call. Avoid passing it through IPC channels (currently it is loaded directly in main process, which is fine).

**Model download from hardcoded URL without integrity check:**
- Risk: The onboarding model download fetches from `https://modelscope.cn/models/iic/SenseVoiceSmall/resolve/master/model.onnx` with no checksum verification. A MITM or compromised CDN could serve a malicious ONNX model.
- Files: `electron/main.ts` (lines 335-352)
- Current mitigation: HTTPS provides transport-level protection.
- Recommendations: Add a SHA-256 checksum verification after download. Store the expected hash in the source code and validate before writing to disk.

**Claude SDK permission bypass (see Tech Debt above):**
- Risk: `bypassPermissions` with `allowDangerouslySkipPermissions: true` means Claude can execute any tool (file system, shell commands) without user confirmation.
- Files: `src/lib/claude-client.ts` (lines 38-39)
- Current mitigation: This is the intended behavior for the MVP (voice-driven, hands-free operation).
- Recommendations: Implement a configurable permission mode with user opt-in for bypass vs. interactive confirmation.

## Performance Bottlenecks

**Voice model lazy load has no progress feedback:**
- Problem: When the user triggers voice input for the first time, `sherpa.ts` loads the ONNX model synchronously within `VoiceRecognizer.load()`. This blocks the main process event loop during model initialization (~230MB model file). The UI freezes with no feedback.
- Files: `src/lib/sherpa.ts` (lines 22-48), `electron/recorder.ts` (lines 64-67)
- Cause: `sherpa-onnx-node`'s `createOfflineRecognizer` is synchronous and CPU-intensive.
- Improvement path: Load the model in a Worker thread using Electron's `utilityProcess` or Node.js `worker_threads`. Show a loading indicator in the voice bar during first-use model load.

**Audio recording uses process spawn with fixed delays:**
- Problem: `AudioRecorder.startRecording()` spawns `afrecord` and resolves after a fixed 100ms delay. `stopRecording()` sends SIGINT and resolves after a fixed 200ms delay. These timeouts are guesses and may not be reliable on all systems.
- Files: `electron/recorder.ts` (lines 41-45, 56-61)
- Cause: No event-based confirmation that recording has started or that the file has been fully written after SIGINT.
- Improvement path: Watch for the output file to exist and stabilize (size unchanged for N ms) instead of using fixed timeouts. Or use a Node.js audio library that provides event-based start/stop.

**No database connection pooling or error recovery:**
- Problem: A single `better-sqlite3` connection is created at startup and never reconnected. If the database file becomes corrupted or locked, all DB operations fail with no recovery path.
- Files: `electron/main.ts` (lines 408-409), `src/lib/db.ts`
- Cause: Synchronous SQLite with a single connection and no error handling around DB operations.
- Improvement path: Wrap DB operations in try/catch with retry logic. Consider periodic integrity checks (`PRAGMA integrity_check`).

## Fragile Areas

**IPC message contract between Electron and Next.js:**
- Files: All files using `ipcMain.on`/`ipcMain.handle` in `electron/main.ts`, all files using `ipcRenderer.send`/`ipcRenderer.invoke` in `src/components/` and `src/app/`
- Why fragile: 11 raw `require('electron').ipcRenderer` call sites with no shared type definitions. Adding, renaming, or changing the payload of any IPC message requires coordinated edits across multiple files with no compile-time verification.
- Safe modification: First create typed IPC wrappers that reference `IpcMessages` from `src/types/index.ts`. Then migrate call sites one at a time.
- Test coverage: No tests for IPC communication. Only the store and DB are tested.

**State machine substate clearing logic:**
- Files: `src/lib/store.ts` (lines 44-52)
- Why fragile: The `transition()` method has nested conditions for when to clear `_sdkSubState`. The logic is: clear substate unless we are transitioning to `executing`, or unless we are going to `idle` with a terminal substate (`completed`/`failed`). This is hard to reason about and has already led to the separate `scheduleGreenToGray()` timer. Future state additions could break the dot color display.
- Safe modification: Write comprehensive tests covering every state+substate combination before modifying the transition logic. The current test file only covers happy-path transitions.
- Test coverage: `src/__tests__/store.test.ts` has 6 tests covering main transitions but not the substate clearing edge cases (e.g., what happens to substate on `executing -> error -> idle`).

**Window lifecycle management:**
- Files: `electron/voice-bar.ts`, `electron/summary-popup.ts`, `electron/main.ts` (lines 459-486)
- Why fragile: Windows are created and destroyed imperatively. `voiceBar` and `summaryPopup` hold `BrowserWindow | null` references. Race conditions can occur if `send()` is called after `close()` on the same tick, or if `close()` is called during `show()`.
- Safe modification: Always check `win && !win.isDestroyed()` before any operation (already done in `send()` methods, but not enforced in `show()`).
- Test coverage: None. Window management is untested.

## Scaling Limits

**SQLite single-writer constraint:**
- Current capacity: The app uses SQLite in WAL mode, which allows concurrent reads but only one writer. For a single-user desktop app, this is fine.
- Limit: If background tasks or multiple windows try to write simultaneously, `SQLITE_BUSY` errors can occur.
- Scaling path: Wrap writes in retry logic with busy timeout (`db.pragma('busy_timeout = 5000')`).

**Voice bar window recreated each time:**
- Current capacity: A new `BrowserWindow` is created and a Next.js page is loaded every time the user presses Right Command. Page load takes 200-500ms.
- Limit: Users who trigger voice input frequently experience noticeable delay on each invocation.
- Scaling path: Keep the voice bar window hidden (not destroyed) after first use, and reuse it. Add `voiceBar.hide()` instead of `voiceBar.close()` in the execution flow.

**No history pagination:**
- Current capacity: `getRecentExecutions(db, 5)` fetches the 5 most recent executions. The summary popup only shows 5 items.
- Limit: Users with many executions cannot browse older history.
- Scaling path: Add pagination or a scrollable history view in the summary popup.

## Dependencies at Risk

**`@anthropic-ai/claude-agent-sdk` (v0.2.0):**
- Risk: This is a pre-1.0 SDK with evolving message types. The codebase uses dynamic message type checking (`'session_id' in message`, `'subtype' in message`) rather than typed discriminated unions. Breaking changes to message shapes would cause runtime failures.
- Impact: All Claude SDK execution would break. The app's core functionality depends on this.
- Migration plan: Pin the SDK version. Create an adapter layer that translates SDK messages to internal types, isolating the rest of the code from SDK changes.

**`uiohook-napi` (v1.5.5):**
- Risk: Native module that requires `@electron/rebuild` after every Electron version upgrade. Compatibility with newer Electron versions is not guaranteed.
- Impact: Right Command key detection would stop working. The app cannot function without its primary input mechanism.
- Migration plan: Investigate Electron's built-in `globalShortcut` module as a fallback. For the specific Right Command detection, also explore macOS-specific alternatives (`CGEventTap` via `electron/native/key-event-tap`).

**`sherpa-onnx-node` (v1.10.0):**
- Risk: Native module with a large binary footprint (~230MB model + native bindings). Version upgrades may change the API or require model format changes.
- Impact: Voice recognition would break. Users would need to re-download the model.
- Migration plan: Pin both the sherpa-onnx version and the model version. Store model metadata (version, checksum) alongside the model file.

## Missing Critical Features

**No error recovery UI:**
- Problem: When Claude execution fails, the tray dot turns red but the user gets no details. There is no way to view error messages or retry a failed execution from the UI.
- Files: `electron/main.ts` (lines 251-253), `src/components/SummaryPanel.tsx`
- Blocks: User cannot diagnose why an execution failed without checking system logs.

**Settings page missing most configuration options:**
- Problem: `AppSettings` defines `shortcut`, `voiceModel`, `claudePermissionMode`, and `theme` fields, but the settings page only exposes `defaultCwd`, `vadTimeout`, and API key. The other settings have no UI controls.
- Files: `src/app/settings/page.tsx`, `src/types/index.ts` (lines 42-49)
- Blocks: Users cannot change the shortcut key, voice model, permission mode, or theme.

**No execution history beyond 5 items:**
- Problem: The summary popup shows only the last 5 executions. There is no full history view or search.
- Files: `src/lib/db.ts` (line 63), `src/components/SummaryPanel.tsx` (lines 71-88)
- Blocks: Users cannot review or reference past Claude interactions.

## Test Coverage Gaps

**Untested: All Electron modules:**
- What's not tested: `electron/main.ts`, `electron/tray.ts`, `electron/voice-bar.ts`, `electron/summary-popup.ts`, `electron/shortcuts.ts`, `electron/recorder.ts`
- Files: Entire `electron/` directory
- Risk: Window lifecycle, IPC registration, recording flow, and shortcut handling have zero test coverage. Any regression in these areas would only be caught by manual testing.
- Priority: High -- these modules handle all user interaction.

**Untested: Claude client integration:**
- What's not tested: `src/lib/claude-client.ts` -- the core SDK wrapper that processes streaming messages, handles abort, and builds results.
- Files: `src/lib/claude-client.ts`
- Risk: Changes to message handling or error recovery logic could break silently.
- Priority: High -- this is the core value proposition of the app.

**Untested: Keychain and API key management:**
- What's not tested: `src/lib/keychain.ts` -- encryption, decryption, file-based key storage.
- Files: `src/lib/keychain.ts`
- Risk: Changes to Electron safeStorage behavior or file paths could cause key loss.
- Priority: Medium -- tested indirectly through onboarding, but direct unit tests would catch regressions.

**Untested: Voice recognition:**
- What's not tested: `src/lib/sherpa.ts` -- model loading and transcription.
- Files: `src/lib/sherpa.ts`
- Risk: Model format changes or API changes in sherpa-onnx-node would not be caught.
- Priority: Medium -- hard to test without mocking the native module, but the wrapper logic should be tested.

**Untested: React components:**
- What's not tested: All components in `src/components/` -- `VoiceInput.tsx`, `Onboarding.tsx`, `SummaryPanel.tsx`, `StatusDot.tsx`, and all page components in `src/app/`.
- Files: `src/components/*.tsx`, `src/app/*/page.tsx`
- Risk: UI regressions from IPC message changes, state handling bugs, or layout changes.
- Priority: Medium -- component tests with mocked IPC would catch most regressions.

**Untested: API routes:**
- What's not tested: `src/app/api/chat/route.ts`, `src/app/api/status/route.ts`
- Files: `src/app/api/*/route.ts`
- Risk: The `globalThis` bridge could fail silently. Error handling paths are untested.
- Priority: Medium -- these routes are thin wrappers but the error handling should be verified.

**Store test gaps:**
- What's not tested: The `store.test.ts` file covers the happy-path state machine flow but misses edge cases: `error` state transitions, `scheduleGreenToGray()` timer behavior, substate clearing on `error -> idle`, and concurrent state change listener notifications.
- Files: `src/__tests__/store.test.ts`
- Risk: Subtle state machine bugs could slip through.
- Priority: Low-Medium -- the existing tests are decent but should be expanded.

---

*Concerns audit: 2026-04-22*
