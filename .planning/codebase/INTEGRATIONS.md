# External Integrations

**Analysis Date:** 2026-04-22

## APIs & External Services

**AI / LLM:**
- Anthropic Claude API - Core AI execution engine
  - SDK: `@anthropic-ai/claude-agent-sdk` 0.2.117 (imported dynamically in `src/lib/claude-client.ts`)
  - Auth: `ANTHROPIC_API_KEY` passed via `options.env` at SDK invocation time
  - API validation: Direct `fetch()` to `https://api.anthropic.com/v1/messages` during onboarding (`electron/main.ts` line 357)
  - API version header: `anthropic-version: 2023-06-01`
  - Validation model: `claude-haiku-4-5-20251001`
  - SDK features used: `query()` AsyncGenerator streaming, abort support, permission bypass mode
  - Message types handled: `assistant`, `tool_progress`, `tool_use_summary`, `system`, `result`, `rate_limit_event`, `auth_status`

**Voice Model Download:**
- ModelScope (modelscope.cn) - Downloads SenseVoice Small ONNX model
  - URL: `https://modelscope.cn/models/iic/SenseVoiceSmall/resolve/master/model.onnx`
  - Implementation: Direct `fetch()` with streaming response body in `electron/main.ts` line 335
  - Used during onboarding flow, not at runtime
  - Model stored at: `~/Library/Application Support/Shrew/models/sensevoice-small-int8.onnx`

**macOS System Commands:**
- `afrecord` - Built-in macOS audio recording utility
  - Invoked via `child_process.spawn()` in `electron/recorder.ts` line 34
  - Parameters: WAVE format, 16000 Hz sample rate, mono channel
  - No additional dependencies required

## Data Storage

**Databases:**
- SQLite 3 (via better-sqlite3 11.10.0)
  - Connection: File-based at `~/Library/Application Support/Shrew/shrew.db`
  - Client: `better-sqlite3` synchronous driver
  - ORM: None - raw SQL queries in `src/lib/db.ts`
  - Mode: WAL (`journal_mode = WAL`), `synchronous = NORMAL`
  - Schema: `execution_history` table with columns: id (UUID), sdk_session_id, cwd, user_prompt, summary, cost_usd, duration_ms, num_turns, status, created_at, completed_at
  - Index: `idx_execution_history_created` on `created_at DESC`
  - Initialized via `initDb()` at app startup in `electron/main.ts`

**File Storage:**
- Local filesystem only
  - Settings: `~/Library/Application Support/Shrew/settings.json`
  - Encrypted API key: `~/Library/Application Support/Shrew/secure/anthropic-key.enc`
  - Voice model: `~/Library/Application Support/Shrew/models/sensevoice-small-int8.onnx`
  - Temporary recordings: `~/Library/Application Support/Shrew/tmp/recording-*.wav` (deleted after transcription)

**Caching:**
- None (no Redis, no in-memory cache beyond ShrewStore state)

## Authentication & Identity

**Auth Provider:**
- Anthropic API Key (user-provided)
  - Implementation: User enters API key during onboarding, validated against Anthropic API
  - Storage: Encrypted via Electron `safeStorage.encryptString()` in `src/lib/keychain.ts`
  - File: `~/Library/Application Support/Shrew/secure/anthropic-key.enc`
  - Decrypted at runtime via `safeStorage.decryptString()` when needed for SDK calls
  - Electron `safeStorage` uses macOS Keychain under the hood

**macOS Permissions:**
- Accessibility permission - Required for `uiohook-napi` global keyboard hook
  - Check: `systemPreferences.isTrustedAccessibilityClient(false)` in `electron/main.ts`
  - Onboarding guides user to System Preferences accessibility panel
  - Deep link: `x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility`
- Microphone permission - Required for audio recording
  - Check: `systemPreferences.askForMediaAccess('microphone')` in `electron/recorder.ts`

## Monitoring & Observability

**Error Tracking:**
- None (no Sentry, Bugsnag, or similar service)

**Logs:**
- `console.log` / `console.error` throughout codebase
  - Next.js server stdout logged with `[next-server]` prefix in `electron/main.ts`
  - Claude SDK errors logged to console in `executePrompt()` callback
  - No structured logging framework

## CI/CD & Deployment

**Hosting:**
- Local macOS desktop application only
- Packaged as DMG and ZIP via `electron-builder` 25.1.8
  - Config: `electron-builder.yml`
  - App ID: `com.shrew.app`
  - Output directory: `release/`
  - hardenedRuntime enabled, Gatekeeper assessment disabled
  - `.next/standalone` and `.next/static` bundled as extraResources

**CI Pipeline:**
- None detected (no `.github/workflows/`, no Makefile, no CI config files)

## Environment Configuration

**Required env vars:**
- `ANTHROPIC_API_KEY` - Set programmatically via `options.env` in `executeClaude()` at `src/lib/claude-client.ts` line 41. Value sourced from encrypted file, not from shell environment.

**Secrets location:**
- `~/Library/Application Support/Shrew/secure/anthropic-key.enc` - Electron safeStorage encrypted API key
- No `.env` files in project (correctly excluded from codebase)

**Application settings:**
- `~/Library/Application Support/Shrew/settings.json` - User preferences (shortcut, voiceModel, claudePermissionMode, defaultCwd, vadTimeout, theme)

## Webhooks & Callbacks

**Incoming:**
- None

**Outgoing:**
- None (Claude SDK operates via direct API calls, not webhooks)

## IPC Architecture (Internal Integration)

**Electron <-> Next.js Communication:**
- `ipcMain`/`ipcRenderer` for Electron main process <-> BrowserWindow messaging
  - Channels defined in `src/types/index.ts` `IpcMessages` interface
  - Voice bar messages: `voice:send`, `voice:cancel`, `voice:transcript`, `voice:transcribing`, `voice:error`, `voice:request-append`
  - Summary messages: `summary:ready`, `summary:update`
  - Settings: `settings:load`, `settings:save-api-key`, `settings:save`, `settings:pick-directory`
  - Onboarding: `onboarding:check-accessibility`, `onboarding:open-accessibility`, `onboarding:download-model`, `onboarding:validate-api-key`, `onboarding:finish`, `onboarding:complete`
  - State updates: `state:app-state`, `state:sdk-substate`
- `globalThis` bridge for Next.js API routes -> Electron main process
  - `globalThis.__shrewStore` - Exposes `ShrewStore` instance to API routes
  - `globalThis.__shrewExecutor` - Exposes `executePrompt()` function to API routes
  - Used by `src/app/api/chat/route.ts` and `src/app/api/status/route.ts`

---

*Integration audit: 2026-04-22*
