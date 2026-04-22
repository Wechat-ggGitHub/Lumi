# Codebase Structure

**Analysis Date:** 2026-04-22

## Directory Layout

```
Shrew/                          # Project root
├── electron/                   # Electron main process modules
│   ├── main.ts                 # App lifecycle, window mgmt, IPC, orchestration hub
│   ├── tray.ts                 # Menu bar tray icon with dynamic status dots
│   ├── voice-bar.ts            # Voice input floating bar window manager
│   ├── summary-popup.ts        # Summary popup window manager (below tray icon)
│   ├── shortcuts.ts            # Global Right Command key listener (uIOhook)
│   ├── recorder.ts             # Audio recording (afrecord) + transcription (sherpa-onnx)
│   └── native/                 # Swift native modules
│       └── key-event-tap/      # macOS key event tap (Swift/CNodeAPI)
├── src/                        # Next.js application + shared libraries
│   ├── app/                    # Next.js App Router pages and API routes
│   │   ├── layout.tsx          # Root HTML layout
│   │   ├── api/                # API route handlers
│   │   │   ├── chat/route.ts   # Claude execution entry (POST)
│   │   │   ├── health/route.ts # Health check (GET) for server readiness
│   │   │   └── status/route.ts # Runtime state query (GET)
│   │   ├── voice-bar/page.tsx  # Voice input floating bar UI
│   │   ├── summary/page.tsx    # Summary popup UI
│   │   ├── settings/page.tsx   # Settings page (API key, cwd, VAD timeout)
│   │   └── onboarding/page.tsx # First-launch onboarding flow
│   ├── components/             # React UI components
│   │   ├── VoiceInput.tsx      # Voice input bar with recording/transcribing/editing states
│   │   ├── SummaryPanel.tsx    # Execution status summary with history list
│   │   ├── StatusDot.tsx       # Colored dot indicator with CSS animations
│   │   └── Onboarding.tsx      # Multi-step onboarding wizard
│   ├── lib/                    # Shared business logic (used by both electron/ and src/)
│   │   ├── store.ts            # ShrewStore state machine (app state + SDK sub-state)
│   │   ├── claude-client.ts    # Claude Agent SDK wrapper (AsyncGenerator streaming)
│   │   ├── db.ts               # SQLite data layer (better-sqlite3, WAL mode)
│   │   ├── sherpa.ts           # sherpa-onnx SenseVoice speech recognition wrapper
│   │   └── keychain.ts         # API key encryption (Electron safeStorage)
│   ├── types/                  # TypeScript type definitions
│   │   ├── index.ts            # Domain types (AppState, SdkSubState, ExecutionRecord, etc.)
│   │   └── declarations.d.ts   # Ambient module declarations (sherpa-onnx-node)
│   └── __tests__/              # Test files
│       ├── store.test.ts       # ShrewStore state machine tests
│       └── db.test.ts          # Database layer tests
├── scripts/                    # Build scripts
│   └── build-electron.mjs      # esbuild config for Electron main process
├── resources/                  # Static resources bundled with app
│   └── tray/                   # Tray icon resources (currently placeholder)
├── dist-electron/              # Built Electron main process output (gitignored)
├── .next/                      # Next.js build output (gitignored)
├── release/                    # Electron Builder output (DMG/ZIP)
├── package.json                # Dependencies and scripts
├── tsconfig.json               # TypeScript config for Next.js (src/)
├── tsconfig.electron.json      # TypeScript config for Electron (electron/)
├── next.config.ts              # Next.js config (standalone output, externals)
├── electron-builder.yml        # Electron Builder packaging config
└── jest.config.ts              # Jest test config (ts-jest, module aliases)
```

## Directory Purposes

**`electron/`:**
- Purpose: Electron main process modules -- system integration, window management, hardware access
- Contains: TypeScript source files (CJS output via esbuild), native Swift module
- Key files: `electron/main.ts` (central orchestrator), `electron/tray.ts` (menu bar presence)
- Build output: `dist-electron/main.js`

**`src/app/`:**
- Purpose: Next.js 15 App Router -- all pages and API routes
- Contains: Page components (`page.tsx`), API route handlers (`route.ts`), root layout
- Key files: `src/app/api/chat/route.ts` (Claude execution endpoint), `src/app/voice-bar/page.tsx` (voice UI)

**`src/components/`:**
- Purpose: Reusable React UI components used by page components
- Contains: React functional components with `'use client'` directive
- Key files: `src/components/VoiceInput.tsx` (voice input bar), `src/components/SummaryPanel.tsx` (execution summary)

**`src/lib/`:**
- Purpose: Shared business logic used by both Electron main process and Next.js API routes
- Contains: TypeScript modules with no framework-specific coupling (except `keychain.ts` and `sherpa.ts` which depend on Electron APIs)
- Key files: `src/lib/store.ts` (state machine), `src/lib/claude-client.ts` (SDK wrapper), `src/lib/db.ts` (data layer)

**`src/types/`:**
- Purpose: Shared TypeScript type definitions for the entire application
- Contains: Type exports and ambient module declarations
- Key files: `src/types/index.ts` (all domain types), `src/types/declarations.d.ts` (sherpa-onnx-node)

**`src/__tests__/`:**
- Purpose: Unit tests
- Contains: Jest test files co-located by module name (not by directory)
- Key files: `src/__tests__/store.test.ts`, `src/__tests__/db.test.ts`

**`scripts/`:**
- Purpose: Build automation scripts
- Contains: esbuild configuration for Electron main process bundling
- Key files: `scripts/build-electron.mjs`

**`electron/native/`:**
- Purpose: Platform-native Swift modules for macOS system APIs
- Contains: Swift source files with CNodeAPI bindings
- Key files: `electron/native/key-event-tap/Sources/KeyEventTap.swift`

## Key File Locations

**Entry Points:**
- `electron/main.ts`: Electron main process entry (built to `dist-electron/main.js`, referenced by `package.json` `"main"`)
- `src/app/layout.tsx`: Next.js root layout
- `scripts/build-electron.mjs`: Electron build script

**Configuration:**
- `package.json`: Dependencies, npm scripts, Electron entry point
- `tsconfig.json`: TypeScript config for Next.js/`src/` (ES2022, bundler resolution, `@/*` alias)
- `tsconfig.electron.json`: TypeScript config for `electron/` (extends base, CJS output)
- `next.config.ts`: Next.js config (`output: 'standalone'`, server externals, client fallbacks)
- `electron-builder.yml`: Packaging config (DMG/ZIP targets, extraResources for .next standalone)
- `jest.config.ts`: Test config (ts-jest, node environment, `@/*` alias)

**Core Logic:**
- `src/lib/store.ts`: Application state machine (`ShrewStore` class)
- `src/lib/claude-client.ts`: Claude Agent SDK execution wrapper
- `src/lib/db.ts`: SQLite database layer (schema, CRUD functions)
- `src/lib/sherpa.ts`: sherpa-onnx speech recognition wrapper
- `src/lib/keychain.ts`: API key encryption/storage

**Type Definitions:**
- `src/types/index.ts`: All shared types (`AppState`, `SdkSubState`, `DotColor`, `ExecutionRecord`, `AppSettings`, `IpcMessages`)
- `src/types/declarations.d.ts`: Ambient module declarations for native packages

**UI Components:**
- `src/components/VoiceInput.tsx`: Voice input bar (recording pulse, transcribing spinner, editing textarea)
- `src/components/SummaryPanel.tsx`: Execution summary with history list
- `src/components/StatusDot.tsx`: Animated colored dot component
- `src/components/Onboarding.tsx`: Multi-step setup wizard

**Electron Modules:**
- `electron/tray.ts`: Menu bar tray with pixel-rendered status dots
- `electron/voice-bar.ts`: Floating voice input window manager
- `electron/summary-popup.ts`: Summary popup window manager
- `electron/shortcuts.ts`: Global Right Command key listener
- `electron/recorder.ts`: Audio recording and transcription orchestration

**Testing:**
- `src/__tests__/store.test.ts`: State machine transition tests
- `src/__tests__/db.test.ts`: Database CRUD tests

## Naming Conventions

**Files:**
- Electron modules: kebab-case (`voice-bar.ts`, `summary-popup.ts`, `build-electron.mjs`)
- Next.js pages: kebab-case directories with `page.tsx` (`voice-bar/page.tsx`, `summary/page.tsx`)
- API routes: kebab-case directories with `route.ts` (`api/chat/route.ts`, `api/health/route.ts`)
- React components: PascalCase (`VoiceInput.tsx`, `SummaryPanel.tsx`, `StatusDot.tsx`)
- Library modules: kebab-case (`claude-client.ts`, `keychain.ts`)
- Test files: `<module-name>.test.ts` (`store.test.ts`, `db.test.ts`)
- Config files: kebab-case or dot-prefix per tool convention (`electron-builder.yml`, `jest.config.ts`)

**Directories:**
- Next.js routes: kebab-case matching URL paths (`voice-bar/`, `summary/`, `settings/`, `onboarding/`)
- Feature directories: kebab-case (`key-event-tap/`)
- Build output: kebab-case with prefix (`dist-electron/`)

**Exports:**
- Classes: PascalCase (`ShrewStore`, `VoiceBarWindow`, `AudioRecorder`, `VoiceRecognizer`, `ShrewTray`, `ShortcutManager`, `SummaryPopupWindow`)
- Functions: camelCase (`executeClaude`, `initDb`, `insertExecution`, `saveApiKey`, `loadApiKey`)
- Types: PascalCase (`AppState`, `SdkSubState`, `DotColor`, `ExecutionRecord`, `AppSettings`, `ClaudeExecutionResult`, `ClaudeCallbacks`)

**Constants:**
- UPPERCASE_SNAKE_CASE for true constants (`VALID_TRANSITIONS`, `SCHEMA`)
- camelCase for computed config objects in components (`stepStyle`, `buttonStyle`, `descStyle`)

## Where to Add New Code

**New Feature (full stack):**
- Electron module: `electron/<feature>.ts` -- new module class
- Import and wire in: `electron/main.ts` -- add to initialization, register IPC handlers
- Next.js page: `src/app/<feature>/page.tsx` -- new route page
- React component: `src/components/<ComponentName>.tsx` -- UI component
- API route (if needed): `src/app/api/<feature>/route.ts` -- server endpoint
- Types: Add to `src/types/index.ts`
- Build: Add native dependencies to `external` array in `scripts/build-electron.mjs`

**New UI Page:**
- Page: `src/app/<route>/page.tsx`
- Component: `src/components/<ComponentName>.tsx`
- Must include `'use client'` directive if using hooks or Electron IPC
- Load in BrowserWindow from `electron/main.ts` via `http://127.0.0.1:${serverPort}/<route>`

**New Shared Library Module:**
- Implementation: `src/lib/<module-name>.ts`
- Types: `src/types/index.ts`
- Accessible from both `electron/` and `src/app/` via `@/lib/<module-name>`

**New IPC Channel:**
- Define message type in `src/types/index.ts` under `IpcMessages` interface
- Register handler in `registerIpcHandlers()` in `electron/main.ts`
- Send from renderer via `ipcRenderer.send()` or `ipcRenderer.invoke()`
- Push to renderer via `win.webContents.send()`

**New Window Manager:**
- Create class in `electron/<window-name>.ts` following `VoiceBarWindow` pattern
- Accept `serverPort` in constructor
- Implement `show()`, `close()`, `send()` methods
- Instantiate in `electron/main.ts` initialization

**New Test:**
- Test file: `src/__tests__/<module-name>.test.ts`
- Import via `@/lib/<module-name>` alias (configured in `jest.config.ts`)

## Special Directories

**`dist-electron/`:**
- Purpose: Compiled Electron main process output
- Generated: Yes (by `scripts/build-electron.mjs` via esbuild)
- Committed: No (build artifact)

**`.next/`:**
- Purpose: Next.js build output including standalone server
- Generated: Yes (by `next build`)
- Committed: No (build artifact)

**`release/`:**
- Purpose: Electron Builder output (DMG, ZIP, .app bundles)
- Generated: Yes (by `electron-builder`)
- Committed: No (build artifact)

**`electron/native/`:**
- Purpose: Swift native modules compiled for macOS
- Generated: Partially (`.build/` artifacts are generated, `Sources/` is committed)
- Committed: Source files yes, build artifacts no

**`resources/`:**
- Purpose: Static resources bundled into the app
- Generated: No
- Committed: Yes (currently placeholder with `.gitkeep`)

**Runtime Data Locations (not in repo):**
- `~/Library/Application Support/Shrew/shrew.db` -- SQLite database
- `~/Library/Application Support/Shrew/secure/anthropic-key.enc` -- Encrypted API key
- `~/Library/Application Support/Shrew/models/sensevoice-small-int8.onnx` -- Voice model
- `~/Library/Application Support/Shrew/settings.json` -- App settings
- `~/Library/Application Support/Shrew/tmp/` -- Temporary audio recordings

---

*Structure analysis: 2026-04-22*
