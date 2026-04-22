# Codebase Concerns

**Analysis Date:** 2026-04-22

## Tech Debt

**Monolithic main process (`electron/main.ts` at 499 lines):**
- Issue: All window management, IPC handlers, settings I/O, state coordination, model download, API key validation, and app lifecycle live in a single file. No modular separation of concerns.
- Files: `electron/main.ts`
- Impact: Hard to test individual behaviors. Any change risks unintended side effects across unrelated subsystems. IPC handlers alone span 100+ lines (lines 277-388).
- Fix approach: Extract into focused modules — `electron/ipc.ts` for IPC registration, `electron/settings.ts` for settings load/save, `electron/lifecycle.ts` for app startup orchestration. Follow the pattern already established by `electron/tray.ts`, `electron/voice-bar.ts`, etc.

**`globalThis` cross-process bridge:**
- Issue: Store and executor are shared between Electron main process and Next.js API routes via `(globalThis as any).__shrewStore` and `(globalThis as any).__shrewExecutor`. This is untyped, fragile, and will break silently if either side is null.
- Files: `electron/main.ts` (lines 385-388), `src/app/api/chat/route.ts` (line 17), `src/app/api/status/route.ts` (line 4)
- Impact: API routes can crash at runtime with `TypeError: Cannot read property 'execute' of undefined` if accessed before main process initialization completes. No compile-time safety.
- Fix approach: Create a typed bridge module (e.g., `src/lib/bridge.ts`) with proper typing and null checks, or use IPC for communication instead of globalThis sharing.

**Inline styles everywhere (no CSS system):**
- Issue: All UI components use inline `style={{}}` objects instead of CSS modules, Tailwind, or styled-components. Every component re-declares identical style constants. `Onboarding.tsx` defines 6 style constants at module level (lines 174-188), `SettingsPage` has ~20 inline style objects.
- Files: `src/components/Onboarding.tsx`, `src/app/settings/page.tsx`, `src/components/VoiceInput.tsx`, `src/components/SummaryPanel.tsx`, `src/components/StatusDot.tsx`
- Impact: Impossible to theme or globally adjust styles. No style reuse. Hard to maintain visual consistency.
- Fix approach: Adopt a CSS-in-JS solution or CSS modules. At minimum, extract shared style constants into `src/styles/` and import them.

**DotColor type duplicated:**
- Issue: `DotColor` type is defined in `src/types/index.ts` and re-declared locally in `src/components/SummaryPanel.tsx` (line 16) instead of importing from the shared types.
- Files: `src/types/index.ts` (line 24), `src/components/SummaryPanel.tsx` (line 16)
- Impact: If the canonical type changes, the local copy will diverge silently.
- Fix approach: Import `DotColor` from `@/types` in SummaryPanel.

**Native Swift module is stub code:**
- Issue: `electron/native/key-event-tap/Sources/KeyEventTap.swift` is pseudocode/scaffold only (lines 11-36 are comments describing intended behavior, not actual implementation). The module's `node_register_module_v1` returns `exports` without registering any functions.
- Files: `electron/native/key-event-tap/Sources/KeyEventTap.swift`
- Impact: This native module is not actually used — the project uses `uiohook-napi` instead. Dead code that adds confusion.
- Fix approach: Either remove the `electron/native/` directory entirely, or clearly document it as a future alternative to uiohook-napi.

## Known Bugs

**Silent error swallowing in settings load:**
- Symptoms: If `settings.json` is corrupted (invalid JSON), `loadSettings()` silently returns defaults with no warning to the user.
- Files: `electron/main.ts` (lines 127-141) — the `catch {}` on line 132 swallows all errors.
- Trigger: Corrupted or truncated `settings.json` file (e.g., from crash during write).
- Workaround: None — user sees default settings and their previous configuration is lost without notification.

**Race condition in recording start/stop:**
- Symptoms: `AudioRecorder.startRecording()` uses a fixed 100ms `setTimeout` to resolve the promise before `afrecord` has confirmed it started. If `afrecord` fails to start (e.g., no microphone), the promise still resolves and the state machine transitions to 'recording' with no actual recording happening.
- Files: `electron/recorder.ts` (lines 41-45)
- Trigger: Microphone in use by another app, permission not granted, or `afrecord` not found.
- Workaround: None — user sees "recording" state but no audio is captured.

**Race condition in recording stop:**
- Symptoms: `stopRecording()` sends SIGINT then waits a fixed 200ms for the file to be written. If the system is under load, the WAV file may be incomplete or empty, leading to transcription failures.
- Files: `electron/recorder.ts` (lines 48-62)
- Trigger: High system load, slow disk I/O.
- Workaround: None — may produce empty or garbled transcription.

**Model download URL is hardcoded and may not serve int8 model:**
- Symptoms: The onboarding downloads from `https://modelscope.cn/models/iic/SenseVoiceSmall/resolve/master/model.onnx` but the code expects `sensevoice-small-int8.onnx`. The downloaded file is the full (non-quantized) model, not the int8 variant.
- Files: `electron/main.ts` (lines 329-353) — downloads as `model.onnx` but saves as `sensevoice-small-int8.onnx`.
- Trigger: Onboarding model download step.
- Workaround: Manual download of correct model.

**IPC `onProgress` callback will not work:**
- Symptoms: `ipcMain.handle('onboarding:download-model')` accepts an `onProgress` callback in the argument (line 329), but IPC handle arguments are serialized — functions cannot cross the IPC boundary. The progress callback will never fire.
- Files: `electron/main.ts` (line 329)
- Trigger: Onboarding model download — progress bar will never update.
- Workaround: None.

## Security Considerations

**nodeIntegration: true + contextIsolation: false in all windows:**
- Risk: Every BrowserWindow has `nodeIntegration: true` and `contextIsolation: false`. This means renderer processes have full Node.js access and there is no isolation between preload scripts and page JavaScript. If any external content loads (e.g., from a Next.js SSR error page, or a compromised model download response), it could execute arbitrary system commands.
- Files: `electron/main.ts` (lines 464-467, 479-482), `electron/voice-bar.ts` (lines 36-39), `electron/summary-popup.ts` (lines 36-39)
- Current mitigation: The app loads only local Next.js URLs, not external content.
- Recommendations: Migrate to `contextIsolation: true` with a typed preload script exposing only the needed IPC methods. This is the Electron security best practice.

**API key sent to Anthropic for validation in plaintext:**
- Risk: The onboarding flow validates the API key by making a real API call to `https://api.anthropic.com/v1/messages`. If the user enters a wrong key, the error response may leak information about the key format expectations.
- Files: `electron/main.ts` (lines 355-372)
- Current mitigation: Uses HTTPS.
- Recommendations: Minor — this is a common pattern. Consider validating format locally (starts with `sk-ant-`) before making the network call.

**Claude SDK runs with bypassPermissions:**
- Risk: `permissionMode: 'bypassPermissions'` and `allowDangerouslySkipPermissions: true` are hardcoded in the Claude SDK call. Claude Code will execute any tool/command without user confirmation, including file deletions, shell commands, and network requests.
- Files: `src/lib/claude-client.ts` (lines 38-39), `electron/main.ts` (line 136)
- Current mitigation: The `settings.claudePermissionMode` exists in the settings type but is never read or applied — it is always bypassed.
- Recommendations: Implement the permission mode setting. At minimum, warn users during onboarding that Claude will have unrestricted execution access.

**No input sanitization on user prompt before Claude execution:**
- Risk: The voice-transcribed text is passed directly to `executeClaude()` without any sanitization or length limits.
- Files: `electron/main.ts` (line 280), `src/lib/claude-client.ts` (line 18)
- Current mitigation: None.
- Recommendations: Add prompt length limits and basic sanitization before passing to the SDK.

**Settings file stored as unencrypted JSON:**
- Risk: `settings.json` is stored as plain JSON in `~/Library/Application Support/Shrew/settings.json`. While it does not contain the API key (that uses safeStorage), it contains the default working directory and other preferences.
- Files: `electron/main.ts` (lines 21, 127-145)
- Current mitigation: API key is stored separately with encryption.
- Recommendations: Acceptable for non-sensitive settings.

## Performance Bottlenecks

**Voice model lazy-load blocks first transcription:**
- Problem: The sherpa-onnx SenseVoice model loads on first use (`recorder.transcribe()` calls `recognizer.load()`). Loading a 230MB+ ONNX model into memory takes several seconds, causing a noticeable delay on the first voice command.
- Files: `electron/recorder.ts` (lines 64-67), `src/lib/sherpa.ts` (lines 22-48)
- Cause: Lazy loading avoids startup delay but shifts the cost to first interaction.
- Improvement path: Offer a "prewarm" option — load the model in the background after app startup completes. Or load during onboarding (the model is already downloaded then).

**Dynamic imports of native modules on every transcription:**
- Problem: `sherpa-onnx-node` is imported with `await import()` inside `transcribe()` every time, and also inside `load()`. While Node.js caches imports, the dynamic import pattern adds overhead and prevents tree-shaking.
- Files: `src/lib/sherpa.ts` (lines 27, 54)
- Cause: Dynamic imports are used to handle the case where the module is not available (e.g., in web dev mode).
- Improvement path: Import once at module level and guard with a try/catch, or cache the import result.

**Tray icon pixel-by-pixel rendering:**
- Problem: `createDotIcon()` and `createBaseIcon()` in `tray.ts` iterate over all 22x22 pixels to draw circles using `Buffer.alloc` and manual RGBA writes. Called once per color on startup (5 dot icons + 1 base), this is not a hot path but the approach is verbose and error-prone.
- Files: `electron/tray.ts` (lines 6-73)
- Cause: No native image library available in main process.
- Improvement path: Use pre-made PNG files from `resources/tray/` directory (which exists but appears unused) or use `canvas`/`sharp` for icon generation at build time.

**SQLite queries without pagination for history:**
- Problem: `getRecentExecutions()` accepts a limit parameter but there is no offset-based pagination. If the history grows large, querying with a high limit could be slow.
- Files: `src/lib/db.ts` (lines 63-65)
- Cause: MVP design — only fetches last 5 executions.
- Improvement path: Add offset parameter for pagination when history UI expands.

## Fragile Areas

**State machine transition logic:**
- Files: `src/lib/store.ts` (lines 34-53)
- Why fragile: The `transition()` method has nested conditionals that clear SDK substate in some cases but not others (lines 44-52). Specifically, when transitioning to 'idle' with 'completed' or 'failed' substate, the substate is preserved for dot display, but other transitions to non-'executing' states clear it. This logic is difficult to follow and easy to break when adding new states.
- Safe modification: Write comprehensive tests covering all state+substate combinations before changing. The existing tests in `src/__tests__/store.test.ts` cover happy paths but not edge cases like transitioning from 'error' to 'idle' or the green-to-gray timer behavior.
- Test coverage: Gaps — no tests for `scheduleGreenToGray()`, `error` state transitions, or the `getRightCommandAction()` for 'sending' state.

**IPC channel name strings are untyped:**
- Files: `electron/main.ts` (lines 279-382), all files in `src/components/` and `src/app/*/page.tsx`
- Why fragile: IPC channel names like `'voice:send'`, `'summary:update'`, `'settings:load'` are string literals scattered across 10+ files. The `IpcMessages` type in `src/types/index.ts` defines the contract but is never enforced at the call sites. A typo in a channel name will fail silently.
- Safe modification: Create a shared IPC channel constants module and use it everywhere.
- Test coverage: None — no tests for IPC handlers.

**Voice-bar window lifecycle:**
- Files: `electron/voice-bar.ts`, `electron/main.ts` (lines 167-213)
- Why fragile: The voice-bar window is created on `show()` and destroyed on `close()`. If `send()` is called between window creation and `ready-to-show`, the message may be lost because the page hasn't loaded yet. The `voiceBar.send('voice:transcribing')` call at line 177 of main.ts could fire before the voice-bar page has registered its IPC listeners.
- Safe modification: Add a ready-state handshake (the voice-bar page already has a `voice:ready` channel defined in types but it is never used).
- Test coverage: None.

**Next.js server startup timing:**
- Files: `electron/main.ts` (lines 37-125)
- Why fragile: Production mode relies on spawning a Next.js standalone server and waiting for its health check. The 5-second timeout fallback (line 91) may resolve before the server is actually ready, leading to failed page loads. The health check retries with a 500ms interval and 2-second request timeout could also race.
- Safe modification: Increase the startup timeout and add retry logic for initial page loads.
- Test coverage: None — no integration tests for production startup.

## Scaling Limits

**Single concurrent execution:**
- Current capacity: One Claude execution at a time (single `currentAbortController` in `electron/main.ts` line 34).
- Limit: If a user sends a second prompt while one is executing, `executePrompt()` is called again and the previous `currentAbortController` reference is lost, but the previous execution continues running in the background.
- Scaling path: Queue executions or prevent new submissions while executing. At minimum, abort the previous execution before starting a new one.

**SQLite database growth:**
- Current capacity: No cleanup or archival mechanism for `execution_history`.
- Limit: Over time, the database will grow unbounded. With frequent use (10+ executions/day), the table will accumulate thousands of rows.
- Scaling path: Add periodic cleanup (e.g., delete records older than 30 days) or an archive mechanism.

**Native module compatibility with Electron upgrades:**
- Current capacity: Three native modules (`better-sqlite3`, `sherpa-onnx-node`, `uiohook-napi`) must be rebuilt for each Electron version via `npm run rebuild`.
- Limit: Upgrading Electron (currently ^35.0.0) requires rebuilding all native modules. If any module does not support the new Electron's Node.js ABI, the app breaks.
- Scaling path: Pin Electron versions and test native module compatibility before upgrading.

## Dependencies at Risk

**`uiohook-napi` (keyboard hooks):**
- Risk: This is a niche package for global keyboard/mouse hooks. It requires accessibility permissions and may break on macOS updates. It is the only package providing global hotkey functionality.
- Impact: If uIOhook breaks on a macOS update, the core feature (right Command to activate) stops working entirely.
- Migration plan: The `electron/native/key-event-tap/` Swift scaffold suggests a native CGEventTap was considered as an alternative. Completing that native module would eliminate the uiohook-napi dependency.

**`sherpa-onnx-node` (voice recognition):**
- Risk: This is a niche ONNX runtime wrapper. Model compatibility is tied to specific sherpa-onnx versions. The int8 model format may not be forward-compatible.
- Impact: If sherpa-onnx-node is abandoned or has breaking changes, the voice recognition pipeline breaks.
- Migration plan: Could fall back to Whisper.cpp or a cloud-based transcription API, but this would change the local-first architecture.

**`@anthropic-ai/claude-agent-sdk` (Claude execution):**
- Risk: This SDK is relatively new (^0.2.0 indicates pre-1.0). API shape may change significantly. The message types handled in `claude-client.ts` (assistant, tool_progress, tool_use_summary, system, result, rate_limit_event, auth_status) are all untyped with `as any` casts.
- Impact: SDK updates could break the execution pipeline silently if message types change.
- Migration plan: None obvious — this is the core dependency. Add type guards and runtime validation for SDK message types.

## Missing Critical Features

**No error recovery UI:**
- Problem: When the state machine enters 'error' state, there is no UI to inform the user what went wrong or how to recover. The voice-bar is closed before execution starts (line 237), so errors during execution have no visible feedback channel except the tray dot turning red.
- Files: `electron/main.ts` (lines 190-194, 252-253)
- Blocks: User understanding of failures. Currently only console.error logs the error.

**No model download resume:**
- Problem: The model download in onboarding has no resume capability. If the 230MB download is interrupted, it restarts from the beginning.
- Files: `electron/main.ts` (lines 329-353)
- Blocks: Users with slow/unstable connections may never complete onboarding.

**No auto-update mechanism:**
- Problem: The app has no auto-update system. Users must manually download new versions.
- Files: `electron-builder.yml` (no auto-update config)
- Blocks: Distributing fixes and new features to existing users.

**Unused settings fields:**
- Problem: `AppSettings` defines `claudePermissionMode`, `vadTimeout`, `voiceModel`, and `theme` fields but most are never read. `claudePermissionMode` is defined in settings but hardcoded to 'bypassPermissions' in `claude-client.ts`. `vadTimeout` has a UI slider but the value is never used by the recorder. `theme` has no effect.
- Files: `src/types/index.ts` (lines 42-49), `src/lib/claude-client.ts` (line 38), `src/app/settings/page.tsx` (lines 119-131)
- Blocks: Users cannot actually configure these settings despite the UI suggesting they can.

**`voice:ready` IPC channel defined but never used:**
- Problem: The types define a `'voice:ready'` channel that the voice-bar page should send to signal it has loaded, but no code sends or listens for it.
- Files: `src/types/index.ts` (line 57)
- Blocks: Reliable voice-bar message delivery.

## Test Coverage Gaps

**Electron main process:**
- What's not tested: All of `electron/main.ts` (499 lines) — IPC handlers, window creation, state coordination, recording flow, prompt execution, settings management, app lifecycle.
- Files: `electron/main.ts`
- Risk: Any change to main process code could break the core application loop without detection.
- Priority: High

**Claude client SDK integration:**
- What's not tested: `executeClaude()` in `claude-client.ts` — the AsyncGenerator consumption loop, abort handling, message type switching, error categorization.
- Files: `src/lib/claude-client.ts`
- Risk: SDK message format changes or abort race conditions will break silently.
- Priority: High

**Voice recognition pipeline:**
- What's not tested: `AudioRecorder` class (recording start/stop, file I/O), `VoiceRecognizer` class (sherpa-onnx loading, transcription).
- Files: `electron/recorder.ts`, `src/lib/sherpa.ts`
- Risk: OS updates breaking `afrecord` or sherpa-onnx compatibility issues go undetected.
- Priority: Medium

**UI components:**
- What's not tested: All React components — `VoiceInput`, `SummaryPanel`, `Onboarding`, `SettingsPage`, `StatusDot`.
- Files: `src/components/*.tsx`, `src/app/*/page.tsx`
- Risk: UI regressions from style or logic changes.
- Priority: Medium

**Keyboard shortcut handling:**
- What's not tested: `ShortcutManager` class — uIOhook initialization, key event filtering, debounce logic.
- Files: `electron/shortcuts.ts`
- Risk: Shortcut detection changes or accessibility permission issues.
- Priority: Medium

**Window managers:**
- What's not tested: `VoiceBarWindow` and `SummaryPopupWindow` — creation, positioning, IPC send/receive, lifecycle.
- Files: `electron/voice-bar.ts`, `electron/summary-popup.ts`
- Risk: Window positioning bugs on multi-display setups or macOS version differences.
- Priority: Low

---

*Concerns audit: 2026-04-22*
