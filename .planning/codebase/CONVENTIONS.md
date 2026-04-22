# Coding Conventions

**Analysis Date:** 2026-04-22

## Naming Patterns

**Files:**
- `kebab-case` for all files: `voice-bar.ts`, `summary-popup.ts`, `claude-client.ts`, `keychain.ts`
- Test files mirror source name with `.test.ts` suffix: `store.test.ts` for `store.ts`
- React components use `PascalCase` filenames: `VoiceInput.tsx`, `SummaryPanel.tsx`, `Onboarding.tsx`
- Type declaration files use `lowercase.d.ts`: `declarations.d.ts`

**Classes:**
- `PascalCase` with descriptive noun: `ShrewStore`, `ShrewTray`, `VoiceBarWindow`, `SummaryPopupWindow`, `ShortcutManager`, `AudioRecorder`, `VoiceRecognizer`

**Functions (exported):**
- `camelCase` for utility/data functions: `initDb()`, `insertExecution()`, `updateExecution()`, `executeClaude()`, `saveApiKey()`, `loadApiKey()`
- `camelCase` for private methods: `handleRightCommand()`, `updateTrayDot()`, `registerIpcHandlers()`
- React components as `PascalCase` named exports: `export function VoiceInput(...)`, `export function SummaryPanel(...)`

**Variables:**
- `camelCase` for locals and module-level state: `serverPort`, `currentAbortController`, `recordingProcess`
- `SCREAMING_SNAKE_CASE` for constants: `VALID_TRANSITIONS`, `SCHEMA`
- Private fields prefixed with underscore: `_appState`, `_sdkSubState`, `_listeners`, `_isLoaded`

**Types:**
- `PascalCase` type aliases: `AppState`, `SdkSubState`, `DotColor`, `RightCommandAction`
- `PascalCase` interfaces: `ExecutionRecord`, `AppSettings`, `IpcMessages`, `ClaudeExecutionResult`, `ClaudeCallbacks`
- Type parameters use descriptive names: not observed (no generics in codebase)

## Code Style

**Formatting:**
- No formatter config detected (no `.prettierrc`, `biome.json`, or `eslint` config)
- 2-space indentation throughout
- Single quotes for strings
- Semicolons used consistently
- Trailing commas in multi-line objects/arrays

**Linting:**
- No ESLint or Biome configuration detected
- TypeScript `strict: true` in `tsconfig.json` provides compile-time type checking
- `skipLibCheck: true` skips type checking of declaration files

**Module Systems (dual):**
- `electron/` modules: CJS (compiled by esbuild with `format: 'cjs'` in `scripts/build-electron.mjs`)
- `src/` modules: ESM (Next.js handles bundling; `"module": "esnext"` in `tsconfig.json`)
- Path alias `@/*` maps to `./src/*` in both `tsconfig.json` and esbuild alias config

## Import Organization

**Order (Electron main process):**
1. Electron APIs: `import { app, BrowserWindow, ipcMain } from 'electron';`
2. Node.js built-ins: `import path from 'path';`, `import fs from 'fs';`
3. External packages: `import Database from 'better-sqlite3';`
4. Local modules (relative): `import { ShrewTray } from './tray';`
5. Shared modules (path alias): `import { ShrewStore } from '../src/lib/store';`
6. Type-only imports: `import type { ExecutionRecord, AppSettings, DotColor } from '../src/types';`

**Order (Next.js / React):**
1. React: `import { useState, useEffect, useRef, useCallback } from 'react';`
2. External packages: `import Database from 'better-sqlite3';`
3. Path alias imports: `import type { AppState, SdkSubState } from '@/types';`
4. Relative imports: `import { StatusDot } from './StatusDot';`

**Path Aliases:**
- `@/*` -> `./src/*` (configured in `tsconfig.json` and `scripts/build-electron.mjs`)
- Electron modules use relative paths to `../src/` to access shared code

## Error Handling

**Patterns:**
- **State machine guard:** Invalid state transitions are silently ignored (no throw):
  ```typescript
  // src/lib/store.ts
  transition(newState: AppState): void {
    const allowed = VALID_TRANSITIONS[this._appState];
    if (!allowed.includes(newState)) return; // silent guard
  }
  ```

- **Promise chains with catch:** Error flows through `.catch()` to state machine:
  ```typescript
  // electron/main.ts
  recorder.stopRecording().then(...).catch(err => {
    voiceBar.send('voice:error', { message: err.message });
    store.transition('error');
    store.transition('idle');
  });
  ```

- **Try/catch with re-throw:** Native module failures re-throw with context:
  ```typescript
  // src/lib/sherpa.ts
  } catch (error) {
    throw new Error(`Failed to load voice model: ${(error as Error).message}`);
  }
  ```

- **Empty catch blocks:** Used deliberately for non-critical cleanup:
  ```typescript
  try { fs.unlinkSync(filePath); } catch {}
  ```

- **API route error handling:** Returns JSON with appropriate HTTP status:
  ```typescript
  // src/app/api/chat/route.ts
  return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  ```

- **Type assertions for error access:** `(error as Error).message` pattern used consistently

## Logging

**Framework:** `console` only (no logging library)

**Patterns:**
- `console.log` for informational output with prefix: `console.log('[next-server]', msg.trim());`
- `console.error` for errors: `console.error('Failed to start Next.js server:', err);`
- Logging is confined to `electron/main.ts` and `electron/shortcuts.ts` only
- No logging in shared `src/lib/` modules or React components

## Comments

**When to Comment:**
- Module-level comments explain the runtime context:
  ```typescript
  // src/lib/keychain.ts
  // 注意：此文件在 Electron main process 中使用
  // safeStorage 在 renderer 中不可用
  ```
- Inline comments explain non-obvious decisions:
  ```typescript
  // electron/main.ts
  // 超时保护：5秒后如果还没 Ready 就 resolve
  // 语音模型延迟加载：应用启动时不加载，首次使用语音时才加载
  ```
- Chinese language used for user-facing strings and comments describing behavior
- Technical terms kept in English (e.g., "AbortController", "IPC")

**JSDoc/TSDoc:**
- Not used. The codebase relies on TypeScript types for documentation.
- Function signatures with typed parameters serve as self-documentation.

## Function Design

**Size:** Functions vary from 1-liners to ~80 lines. The longest function is `executeClaude()` at ~100 lines (`src/lib/claude-client.ts`), followed by `handleRightCommand()` at ~50 lines (`electron/main.ts`).

**Parameters:**
- Object parameters for multi-arg functions: `insertExecution(db, { cwd, user_prompt, sdk_session_id? })`
- Callback objects for event-driven patterns: `executeClaude(prompt, cwd, apiKey, { onSubState, onError }, abortSignal?)`
- Database connection passed as first argument to all DB functions (not stored globally)

**Return Values:**
- Synchronous functions return directly or `void`
- Async functions return `Promise<T>` where T is a specific interface (e.g., `ClaudeExecutionResult`)
- Null for optional results: `getActiveExecution()` returns `ExecutionRecord | null`
- Functions that create resources return the ID: `insertExecution()` returns `string`

## Module Design

**Exports:**
- Named exports only (no default exports in library code)
- React page components use `export default function PageName()` (Next.js convention)
- Shared components use named exports: `export function VoiceInput(...)`
- One export per file for classes; multiple for utility function files

**Barrel Files:**
- Not used. No `index.ts` re-export files in any directory.
- Import directly from the module file: `import { ShrewStore } from '@/lib/store'`

**Class vs Function Pattern:**
- Classes for stateful/stateful-singleton objects: `ShrewStore`, `ShrewTray`, `VoiceBarWindow`, `AudioRecorder`, `VoiceRecognizer`, `ShortcutManager`
- Functions for stateless operations: DB operations (`insertExecution`, `updateExecution`), keychain operations (`saveApiKey`, `loadApiKey`), SDK wrapper (`executeClaude`)

## React Patterns

**Component Style:**
- Function components only (no class components)
- `'use client'` directive on all interactive components and pages
- Inline styles throughout (no CSS modules, no Tailwind, no styled-components)
- Style objects defined as module-level constants for reuse: `const stepStyle: React.CSSProperties = { ... }`

**State Management:**
- `useState` for local component state
- `useEffect` for IPC listener registration with cleanup
- `useRef` for DOM references
- `useCallback` for memoized handlers passed as props
- No global state library; Electron IPC is the cross-window state mechanism

**IPC in React:**
- Direct `require('electron').ipcRenderer` inside `useEffect` or event handlers
- No preload script / contextBridge pattern (nodeIntegration enabled, contextIsolation disabled)
- Type-safe channel names defined in `src/types/index.ts` (`IpcMessages` interface) but not enforced at IPC call sites

## TypeScript Conventions

**Strictness:**
- `strict: true` enabled (includes `strictNullChecks`, `noImplicitAny`, etc.)
- Type-only imports use `import type` syntax consistently
- Generic `any` used sparingly, mainly for Electron SDK interop:
  ```typescript
  (globalThis as any).__shrewStore = store;
  (srv.address() as any).port
  ```

**Type Organization:**
- All shared types in `src/types/index.ts`
- Module-specific types defined inline (e.g., `ClaudeCallbacks`, `ClaudeExecutionResult` in `claude-client.ts`)
- Ambient declarations for untyped packages in `src/types/declarations.d.ts`

---

*Convention analysis: 2026-04-22*
