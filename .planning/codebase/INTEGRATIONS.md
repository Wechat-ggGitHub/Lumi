# External Integrations

**Analysis Date:** 2026-04-22

## APIs & External Services

**AI / LLM:**
- Anthropic Claude API - Core AI execution engine
  - SDK: `@anthropic-ai/claude-agent-sdk` ^0.2.0 (dynamically imported in `src/lib/claude-client.ts` line 26)
  - Auth: `ANTHROPIC_API_KEY` passed via `options.env` at SDK invocation time (`src/lib/claude-client.ts` line 41)
  - API validation: Direct `fetch()` to `https://api.anthropic.com/v1/messages` during onboarding (`electron/main.ts` line 357)
  - API version header: `anthropic-version: 2023-06-01`
  - Validation model: `claude-haiku-4-5-20251001`
  - SDK features used: `query()` AsyncGenerator streaming, `AbortController` support, `bypassPermissions` mode
  - Message types handled: `assistant`, `tool_progress`, `tool_use_summary`, `system`, `result`, `rate_limit_event`, `auth_status`
  - Permission mode: `bypassPermissions` with `allowDangerouslySkipPermissions: true` (no human-in-the-loop approval)

**Voice Model Download:**
- ModelScope (modelscope.cn) - Downloads SenseVoice Small ONNX model
  - URL: `https://modelscope.cn/models/iic/SenseVoiceSmall/resolve/master/model.onnx`
  - Implementation: Direct `fetch()` with streaming response body in `electron/main.ts` line 335
  - Progress callback via IPC (`onProgress` parameter)
  - Used during onboarding flow only, not at runtime
  - Model stored at: `~/Library/Application Support/Shrew/models/sensevoice-small-int8.onnx`

**macOS System Commands:**
- `afrecord` - Built-in macOS audio recording utility
  - Invoked via `child_process.spawn()` in `electron/recorder.ts` line 34
  - Parameters: WAVE format (`-f WAVE`), 16000 Hz sample rate (`-r 16000`), mono (`-c 1`)
  - Stopped via `SIGINT` signal
  - No additional dependencies required; available on all macOS installations

## Data Storage

**Databases:**
- SQLite 3 (via better-sqlite3 ^11.0.0)
  - Connection: File-based at `~/Library/Application Support/Shrew/shrew.db`
  - Client: `better-sqlite3` synchronous driver, instantiated in `electron/main.ts` line 408
  - ORM: None - raw parameterized SQL queries in `src/lib/db.ts`
  - Mode: WAL (`journal_mode = WAL`), `synchronous = NORMAL`
  - Schema: Single `execution_history` table
    - Columns: `id` (TEXT PK, UUID), `sdk_session_id` (TEXT), `cwd` (TEXT NOT NULL), `user_prompt` (TEXT NOT NULL), `summary` (TEXT), `cost_usd` (REAL), `duration_ms` (INTEGER), `num_turns` (INTEGER), `status` (TEXT NOT NULL DEFAULT 'running'), `created_at` (DATETIME), `completed_at` (DATETIME)
    - Index: `idx_execution_history_created` on `created_at DESC`
  - Initialized via `initDb()` at app startup
  - Operations: `insertExecution()`, `updateExecution()`, `getActiveExecution()`, `getRecentExecutions()`, `getExecutionById()`

**File Storage:**
- Local filesystem only (no cloud storage)
  - Settings: `~/Library/Application Support/Shrew/settings.json`
  - Encrypted API key: `~/Library/Application Support/Shrew/secure/anthropic-key.enc`
  - Voice model: `~/Library/Application Support/Shrew/models/sensevoice-small-int8.onnx`
  - Temporary recordings: `~/Library/Application Support/Shrew/tmp/recording-<timestamp>.wav` (deleted after transcription in `electron/recorder.ts` line 73)

**Caching:**
- None (no Redis, no in-memory cache beyond the `ShrewStore` runtime state object)

## Authentication & Identity

**Auth Provider:**
- Anthropic API Key (user-provided)
  - Implementation: User enters API key during onboarding, validated against Anthropic Messages API (`electron/main.ts` line 357)
  - Storage: Encrypted via Electron `safeStorage.encryptString()` in `src/lib/keychain.ts`
  - File: `~/Library/Application Support/Shrew/secure/anthropic-key.enc`
  - Decrypted at runtime via `safeStorage.decryptString()` in `src/lib/keychain.ts` line 24, passed to Claude SDK
  - Electron `safeStorage` uses macOS Keychain under the hood for encryption key management
  - Validation checks: `safeStorage.isEncryptionAvailable()` before encrypt/decrypt operations

**macOS Permissions:**
- Accessibility permission - Required for `uiohook-napi` global keyboard hook
  - Check: `systemPreferences.isTrustedAccessibilityClient(false)` in `electron/shortcuts.ts` line 43
  - Onboarding guides user to System Preferences accessibility panel
  - Deep link: `x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility`
  - Hook listens exclusively for Right Command key (keycode `UiohookKey.MetaRight`)
- Microphone permission - Required for audio recording
  - Check: `systemPreferences.askForMediaAccess('microphone')` in `electron/recorder.ts` line 21

## Monitoring & Observability

**Error Tracking:**
- None (no Sentry, Bugsnag, or similar service)

**Logs:**
- `console.log` / `console.error` throughout codebase
  - Next.js server stdout logged with `[next-server]` prefix in `electron/main.ts` lines 68-69
  - Claude SDK errors logged to console in `executePrompt()` error callback
  - No structured logging framework or log file output

## CI/CD & Deployment

**Hosting:**
- Local macOS desktop application only (not a web service)
- Packaged as DMG and ZIP via `electron-builder` 25+
  - Config: `electron-builder.yml`
  - App ID: `com.shrew.app`
  - Output directory: `release/`
  - hardenedRuntime enabled, Gatekeeper assessment disabled
  - `.next/standalone` and `.next/static` bundled as extraResources
  - Native `.node` and `.dylib` files unpacked from ASAR archive

**CI Pipeline:**
- None detected (no `.github/workflows/`, no Makefile, no CI configuration files)

## Environment Configuration

**Required env vars:**
- `ANTHROPIC_API_KEY` - Set programmatically via `options.env` in `executeClaude()` at `src/lib/claude-client.ts` line 41. Value sourced from encrypted file, not from shell environment.
- `PORT` - Set dynamically when spawning Next.js standalone server in production mode (`electron/main.ts` line 57)
- `HOSTNAME` - Set to `127.0.0.1` for Next.js standalone server (`electron/main.ts` line 59)
- `ELECTRON_RUN_AS_NODE` - Set to `'1'` when spawning Next.js standalone server (`electron/main.ts` line 58)

**Secrets location:**
- `~/Library/Application Support/Shrew/secure/anthropic-key.enc` - Electron safeStorage encrypted API key
- No `.env` files in project (correctly excluded from codebase)

**Application settings:**
- `~/Library/Application Support/Shrew/settings.json` - User preferences with structure defined in `src/types/index.ts` `AppSettings` interface:
  - `shortcut: string` (default: `'right_cmd'`)
  - `voiceModel: string` (default: `'sensevoice'`)
  - `claudePermissionMode: string` (default: `'bypassPermissions'`)
  - `defaultCwd: string` (default: `'~/Documents'`)
  - `vadTimeout: number` (default: `2`)
  - `theme: string` (default: `'system'`)

## Webhooks & Callbacks

**Incoming:**
- None

**Outgoing:**
- None (Claude SDK operates via direct API calls with AsyncGenerator streaming, not webhooks)

## IPC Architecture (Internal Integration)

**Electron <-> Renderer Communication:**
- `ipcMain`/`ipcRenderer` for Electron main process <-> BrowserWindow messaging
  - All channel names defined in `src/types/index.ts` `IpcMessages` interface
  - Voice bar channels: `voice:send`, `voice:cancel`, `voice:ready`, `voice:start-recording`, `voice:stop-recording`, `voice:transcript`, `voice:transcribing`, `voice:error`, `voice:request-append`
  - Summary channels: `summary:ready`, `summary:update`
  - Settings channels: `settings:load` (handle), `settings:save-api-key` (handle), `settings:save` (handle), `settings:pick-directory` (handle)
  - Onboarding channels: `onboarding:check-accessibility` (handle), `onboarding:open-accessibility`, `onboarding:download-model` (handle), `onboarding:validate-api-key` (handle), `onboarding:finish` (handle), `onboarding:complete`
  - State channels: `state:app-state`, `state:sdk-substate`, `tray:click`

**Next.js API Routes <-> Electron Main Process:**
- `globalThis` bridge for cross-process communication
  - `globalThis.__shrewStore` - Exposes `ShrewStore` instance to API routes (set in `electron/main.ts` line 385)
  - `globalThis.__shrewExecutor` - Exposes `executePrompt()` function to API routes (set in `electron/main.ts` line 386)
  - Used by `src/app/api/chat/route.ts` (accesses `__shrewExecutor`) and `src/app/api/status/route.ts` (accesses `__shrewStore`)
  - Works because Next.js standalone server runs in the same Node.js process as Electron main process

## Voice Recognition Pipeline

**Local Speech-to-Text (no external API):**
- Recording: `afrecord` (macOS built-in) captures WAV audio at 16kHz mono
- Transcription: `sherpa-onnx-node` runs SenseVoice Small ONNX model locally
  - Model type: `sensevoice`, modeling unit: `auto`
  - Feature config: 16000 Hz sample rate, 80 feature dimensions
  - Inverse text normalization enabled
  - Model loaded lazily on first voice use (not at app startup)
  - Model path: `~/Library/Application Support/Shrew/models/sensevoice-small-int8.onnx`
- All processing is on-device; no audio data sent to external services

---

*Integration audit: 2026-04-22*
