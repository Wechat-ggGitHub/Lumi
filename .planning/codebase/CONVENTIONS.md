# Coding Conventions

**Analysis Date:** 2026-04-22

## Language & Module Systems

**Two code paths, two module systems:**
- `src/` files (Next.js): ESM (`import`/`export`), TypeScript strict mode, ES2022 target
- `electron/` files: Written in ESM TypeScript, compiled to CJS via esbuild (`format: 'cjs'` in `scripts/build-electron.mjs`)
- Path alias `@/*` maps to `./src/*` in both `tsconfig.json` and esbuild alias config

## Naming Patterns

**Files:**
- Library modules: `kebab-case` -- `claude-client.ts`, `keychain.ts`, `sherpa.ts`
- Electron modules: `kebab-case` -- `voice-bar.ts`, `summary-popup.ts`, `shortcuts.ts`
- React components: `PascalCase` -- `VoiceInput.tsx`, `StatusDot.tsx`, `SummaryPanel.tsx`, `Onboarding.tsx`
- Test files: `kebab-case.test.ts` -- `store.test.ts`, `db.test.ts`
- Types: Single `index.ts` barrel in `src/types/`
- API routes: `route.ts` inside `src/app/api/<name>/route.ts`

**Types & Interfaces:**
- Union type literals for state enums: `type AppState = 'idle' | 'recording' | ...`
- `PascalCase` for types and interfaces: `AppState`, `SdkSubState`, `ExecutionRecord`, `AppSettings`, `DotColor`
- Interface suffix for callback contracts: `ClaudeCallbacks`, `IpcMessages`
- `Record<X, Y>` for constant maps: `Record<DotColor, [number, number, number, number]>`, `Record<DotColor, string>`

**Functions:**
- `camelCase` for all functions: `insertExecution()`, `updateExecution()`, `getActiveExecution()`
- Boolean getters use `is`/`has` prefix: `isLoaded`, `hasApiKey()`
- Descriptive verb-noun naming: `loadApiKey()`, `saveApiKey()`, `deleteApiKey()`

**Classes:**
- `PascalCase` class names: `ShrewStore`, `VoiceRecognizer`, `AudioRecorder`, `ShrewTray`, `VoiceBarWindow`, `SummaryPopupWindow`, `ShortcutManager`
- Private members prefixed with underscore: `_appState`, `_sdkSubState`, `_listeners`, `_isLoaded`
- Public getters without underscore: `get appState()`, `get sdkSubState()`, `get dotColor()`

**Variables:**
- `camelCase` for local variables: `serverPort`, `nextServer`, `currentAbortController`
- `SCREAMING_SNAKE_CASE` for constants: `VALID_TRANSITIONS`, `SCHEMA`
- Module-level single-instance variables use simple names: `db`, `store`, `tray`, `recorder`

## Code Style

**Formatting:**
- No formatter config detected (no `.prettierrc`, no `eslint`, no `biome.json`)
- 2-space indentation used consistently throughout
- Single quotes for strings
- Semicolons used
- Trailing commas in multi-line objects/arrays

**TypeScript Configuration:**
- Strict mode enabled (`"strict": true` in `tsconfig.json`)
- ES2022 target
- `moduleResolution: "bundler"`
- JSX: `"preserve"` (Next.js handles transform)
- `noEmit: true` for Next.js path; `noEmit: false` for electron build

## Import Organization

**Order (observed pattern in `electron/main.ts` and others):**
1. External packages: `electron`, `path`, `fs`, `child_process`, `crypto`
2. Internal modules from `electron/`: `./tray`, `./voice-bar`, `./shortcuts`
3. Cross-boundary internal from `../src/`: `../src/lib/store`, `../src/lib/db`, `../src/types`
4. Type-only imports use `import type`: `import type { AppState, SdkSubState } from '@/types'`

**Path Aliases:**
- `@/*` maps to `./src/*` -- used in Next.js pages and lib files
- Cross-boundary imports from `electron/` to `src/` use relative paths: `../src/lib/store`, `../src/types`
- Dynamic `import()` used for native modules to handle lazy loading: `await import('sherpa-onnx-node')`, `await import('@anthropic-ai/claude-agent-sdk')`

## Error Handling

**Patterns:**
- Synchronous functions throw directly: `throw new Error('Recognizer not loaded')` in `src/lib/sherpa.ts`
- Async functions use try/catch with typed error casting: `catch (error) { ... (error as Error).message }`
- IPC handlers catch and propagate errors via IPC channels: `voice:error` with `{ message: string }`
- API routes use `NextResponse.json({ error: ... }, { status: ... })` pattern
- Empty catch blocks used sparingly for non-critical cleanup: `try { fs.unlinkSync(filePath); } catch {}` in `electron/recorder.ts`
- Guard clauses at function entry: `if (!this.recognizer) throw new Error(...)`, `if (fields.length === 0) return`

**Error propagation flow:**
1. Native/SDK errors caught in `executeClaude()` (`src/lib/claude-client.ts`)
2. Passed to `callbacks.onError()` which logs via `console.error`
3. Status set to `'failed'` in store state machine
4. Tray dot turns red for visual feedback

## Logging

**Framework:** Console (`console.log`, `console.error`)

**Patterns:**
- Prefixed log messages for subsystems: `console.log('[next-server]', msg.trim())` in `electron/main.ts`
- Error logging at catch sites: `console.error('Claude execution error:', error)`
- No structured logging library or log levels

## Comments

**Language:** Code comments are written in Chinese (Simplified) throughout:
- `// 全局状态` (global state)
- `// 使用 macOS 的 afrecord 或 sox 录音` (use macOS afrecord or sox for recording)
- `// 回调，由 main.ts 注入` (callbacks injected by main.ts)

**When to Comment:**
- Section separators with `//` comments for function grouping: `// IPC Handlers`, `// 启动应用`
- Inline explanations for non-obvious decisions: `// MVP 用 child_process 调用系统录音工具`
- Module-level comments for cross-boundary notes: `// 注意：此文件在 Electron main process 中使用` in `src/lib/keychain.ts`

**No JSDoc/TSDoc:** No doc comments observed on functions, classes, or types.

## Function Design

**Size:** Functions range from 3-50 lines. The largest function is `executeClaude()` at ~90 lines in `src/lib/claude-client.ts`.

**Parameters:**
- Object parameters for functions with 3+ args: `insertExecution(db, { cwd, user_prompt })`, `updateExecution(db, id, { status, summary, ... })`
- `Partial<Pick<...>>` for update patterns: `Partial<Pick<ExecutionRecord, 'status' | 'summary' | ...>>`
- Callback interfaces for async communication: `ClaudeCallbacks { onSubState, onError }`

**Return Values:**
- `void` for state-mutating functions that notify listeners
- Result interfaces for async operations: `ClaudeExecutionResult`
- `null` for optional returns: `loadApiKey(): string | null`, `getActiveExecution(): ExecutionRecord | null`
- Unsubscribe pattern for listeners: `onChange(callback): () => void`

## Module Design

**Exports:**
- Named exports exclusively -- no default exports in lib files
- React components use named exports: `export function VoiceInput(...)`, `export function SummaryPanel(...)`
- Page-level components use default exports (Next.js requirement): `export default function VoiceBarPage()`
- Electron classes use named exports: `export class ShrewTray`, `export class AudioRecorder`

**Barrel Files:**
- Types consolidated in `src/types/index.ts` -- single import point for all shared types
- No barrel files for lib or components -- direct imports from individual files

**Class pattern (Electron modules):**
- Each electron module is a single class in a single file
- Constructor sets up configuration, `show()`/`close()` lifecycle methods
- Optional callback properties for event injection: `onPopupRequested?: () => void`
- Null-safety pattern: `if (this.win && !this.win.isDestroyed())` before every window operation

**Data layer pattern (`src/lib/db.ts`):**
- Pure functions that accept a `Database` instance as first argument
- No module-level database connection -- always passed in
- SQL strings inline in functions, schema as module-level `SCHEMA` constant
- `as` type assertions for query results: `.get() as ExecutionRecord`

## React Component Conventions

**Directive:** All pages and components that use hooks or IPC start with `'use client'`

**State management:**
- Local `useState` only -- no global state library
- IPC via `require('electron').ipcRenderer` directly in components (no abstraction layer)
- Type unions for finite states: `type Step = 'welcome' | 'accessibility' | ...`

**Styling:**
- Inline styles exclusively -- no CSS modules, no Tailwind, no styled-components
- `React.CSSProperties` typed style objects for reusable styles: `const stepStyle: React.CSSProperties = {...}`
- Apple system font: `fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif'`
- CSS-in-JS animation via `<style>` tags: `<style>{`@keyframes pulse { ... }`}</style>`

**Component structure:**
- Helper components defined in same file: `RecordingPulse` and `Spinner` in `VoiceInput.tsx`
- Props interfaces defined inline: `type VoiceInputProps = { onSend: ...; onCancel: ... }`
- `useCallback` for event handlers that are dependencies of other hooks

## IPC Convention

**Channel naming:** `domain:action` pattern
- `voice:send`, `voice:cancel`, `voice:ready` (voice-bar to main)
- `voice:start-recording`, `voice:transcript` (main to voice-bar)
- `state:app-state`, `state:sdk-substate` (state updates)
- `summary:update`, `summary:ready`
- `settings:load`, `settings:save`, `settings:save-api-key`, `settings:pick-directory`
- `onboarding:check-accessibility`, `onboarding:download-model`, etc.

**Types defined centrally:** `IpcMessages` interface in `src/types/index.ts` documents all channels

**Communication pattern:**
- `ipcMain.on()` for fire-and-forget messages (voice:send, voice:cancel)
- `ipcMain.handle()` for request-response (settings:load, onboarding:validate-api-key)
- `webContents.send()` for main-to-renderer pushes (voice:transcript, summary:update)

## Cross-Boundary Sharing

**Electron to Next.js sharing via `globalThis`:**
- `(globalThis as any).__shrewStore = store` in `electron/main.ts`
- `(globalThis as any).__shrewExecutor = { execute: executePrompt }`
- Accessed in API routes: `const store = (globalThis as any).__shrewStore`

**Shared types:** `src/types/index.ts` imported by both electron and Next.js code

---

*Convention analysis: 2026-04-22*
