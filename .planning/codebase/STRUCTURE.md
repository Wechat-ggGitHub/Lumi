# Codebase Structure

**Analysis Date:** 2026-04-22

## Directory Layout

```
Shrew/                             # Project root (Electron + Next.js hybrid)
├── electron/                      # Electron main process source (CJS, built by esbuild)
│   ├── main.ts                    # Application entry point, orchestrator of all subsystems
│   ├── tray.ts                    # Menu bar tray icon with dynamic status dot
│   ├── voice-bar.ts               # Voice input floating bar window manager
│   ├── summary-popup.ts           # Summary popup window manager (below tray icon)
│   ├── shortcuts.ts               # Global keyboard shortcut listener (Right Command)
│   ├── recorder.ts                # Audio recording (afrecord) + transcription coordinator
│   └── native/                    # Native Swift modules
│       └── key-event-tap/         # Swift N-API module for CGEventTap (alternative to uiohook)
│           ├── Package.swift
│           └── Sources/
│               ├── KeyEventTap.swift
│               └── CNodeAPI/
│                   └── module.modulemap
├── src/                           # Next.js application (React 19, App Router)
│   ├── app/                       # Next.js App Router pages and API routes
│   │   ├── layout.tsx             # Root layout (HTML shell)
│   │   ├── api/                   # API route handlers
│   │   │   ├── chat/route.ts      # Claude execution API endpoint
│   │   │   ├── health/route.ts    # Server readiness probe
│   │   │   └── status/route.ts    # Runtime state query
│   │   ├── voice-bar/page.tsx     # Voice input floating bar UI
│   │   ├── summary/page.tsx       # Summary popup UI
│   │   ├── settings/page.tsx      # Settings page (API key, workdir, VAD timeout)
│   │   └── onboarding/page.tsx    # First-launch setup wizard
│   ├── components/                # React components (shared across pages)
│   │   ├── VoiceInput.tsx         # Voice input bar with transcript editing
│   │   ├── SummaryPanel.tsx       # Execution summary and history display
│   │   ├── StatusDot.tsx          # Colored status indicator dot
│   │   └── Onboarding.tsx         # Multi-step onboarding wizard component
│   ├── lib/                       # Shared business logic (used by both Electron and Next.js)
│   │   ├── store.ts               # ShrewStore state machine (AppState + SdkSubState)
│   │   ├── claude-client.ts       # Claude Agent SDK AsyncGenerator streaming wrapper
│   │   ├── db.ts                  # SQLite data layer (better-sqlite3, WAL mode)
│   │   ├── sherpa.ts              # sherpa-onnx SenseVoice local speech recognition
│   │   └── keychain.ts            # API key encryption via Electron safeStorage
│   ├── types/                     # TypeScript type definitions
│   │   ├── index.ts               # Core types (AppState, SdkSubState, ExecutionRecord, etc.)
│   │   └── declarations.d.ts      # Module declarations (sherpa-onnx-node)
│   └── __tests__/                 # Test files
│       ├── store.test.ts          # State machine unit tests
│       └── db.test.ts             # Database layer unit tests
├── scripts/                       # Build and tooling scripts
│   └── build-electron.mjs         # esbuild config for Electron main process
├── resources/                     # Static resources bundled into app
│   └── tray/                      # Tray icon assets (currently .gitkeep)
├── dist-electron/                 # Built Electron output (gitignored, generated)
├── release/                       # Electron-builder output (gitignored, generated)
├── .next/                         # Next.js build output (gitignored, generated)
├── package.json                   # Dependencies and scripts
├── tsconfig.json                  # TypeScript config (path alias @/* -> ./src/*)
├── next.config.ts                 # Next.js config (standalone output, webpack fallbacks)
├── jest.config.ts                 # Jest config (ts-jest, module aliases)
├── electron-builder.yml           # Electron-builder packaging config (DMG/ZIP)
└── CLAUDE.md                      # Project instructions for Claude Code
```

## Directory Purposes

**`electron/`:**
- Purpose: Electron main process modules — system-level integration, window management, hardware access
- Contains: TypeScript files compiled to CJS by esbuild
- Key files: `Shrew/electron/main.ts` (orchestrator), `Shrew/electron/voice-bar.ts`, `Shrew/electron/tray.ts`
- Note: These files import directly from `../src/lib/` — the shared library layer

**`src/app/`:**
- Purpose: Next.js App Router — each subdirectory is a route
- Contains: `page.tsx` files for UI routes, `route.ts` files for API endpoints
- Key files: `Shrew/src/app/api/chat/route.ts`, `Shrew/src/app/voice-bar/page.tsx`

**`src/components/`:**
- Purpose: Reusable React components used by page files
- Contains: UI components with `'use client'` directive (all are client components)
- Key files: `Shrew/src/components/VoiceInput.tsx`, `Shrew/src/components/SummaryPanel.tsx`

**`src/lib/`:**
- Purpose: Shared business logic and data access — imported by both Electron and Next.js code
- Contains: Pure TypeScript modules (classes and functions)
- Key files: `Shrew/src/lib/store.ts`, `Shrew/src/lib/claude-client.ts`, `Shrew/src/lib/db.ts`
- Note: Some modules depend on Electron APIs (e.g., `keychain.ts` uses `electron.safeStorage`, `sherpa.ts` uses `electron.app`)

**`src/types/`:**
- Purpose: Shared TypeScript type definitions
- Contains: `index.ts` (all core types), `declarations.d.ts` (ambient module declarations)
- Key files: `Shrew/src/types/index.ts`

**`src/__tests__/`:**
- Purpose: Unit tests for `src/lib/` modules
- Contains: Jest test files using ts-jest
- Key files: `Shrew/src/__tests__/store.test.ts`, `Shrew/src/__tests__/db.test.ts`

**`scripts/`:**
- Purpose: Build tooling
- Contains: esbuild configuration for Electron main process compilation
- Key files: `Shrew/scripts/build-electron.mjs`

**`electron/native/`:**
- Purpose: Swift native modules for macOS system APIs
- Contains: Swift Package Manager projects with N-API bindings
- Key files: `Shrew/electron/native/key-event-tap/Sources/KeyEventTap.swift`
- Note: Currently scaffolding/prototype — production uses uiohook-napi instead

**`resources/`:**
- Purpose: Static assets bundled into the application package
- Contains: Tray icon assets directory (currently empty with .gitkeep)
- Key files: `Shrew/resources/tray/.gitkeep`

## Key File Locations

**Entry Points:**
- `Shrew/electron/main.ts`: Electron main process entry (app lifecycle, all initialization)
- `Shrew/src/app/layout.tsx`: Next.js root layout

**Configuration:**
- `Shrew/package.json`: Dependencies and npm scripts
- `Shrew/tsconfig.json`: TypeScript config with `@/*` path alias
- `Shrew/next.config.ts`: Next.js standalone output + webpack fallbacks for browser context
- `Shrew/jest.config.ts`: Jest test runner config
- `Shrew/electron-builder.yml`: macOS app packaging (DMG/ZIP)
- `Shrew/scripts/build-electron.mjs`: esbuild bundler for Electron main process

**Core Logic:**
- `Shrew/src/lib/store.ts`: Application state machine (`ShrewStore` class)
- `Shrew/src/lib/claude-client.ts`: Claude Agent SDK streaming wrapper
- `Shrew/src/lib/db.ts`: SQLite database layer (schema, CRUD operations)
- `Shrew/src/lib/sherpa.ts`: sherpa-onnx local voice recognition
- `Shrew/src/lib/keychain.ts`: Encrypted API key storage

**IPC & Communication:**
- `Shrew/src/types/index.ts`: Type definitions including `IpcMessages` interface
- IPC handlers registered in `Shrew/electron/main.ts` (function `registerIpcHandlers`, lines 277-389)

**Window Managers:**
- `Shrew/electron/voice-bar.ts`: Floating voice input window
- `Shrew/electron/summary-popup.ts`: Summary popup below tray icon
- `Shrew/electron/tray.ts`: Menu bar tray with status dot

**Hardware Controllers:**
- `Shrew/electron/shortcuts.ts`: Global keyboard hook (uiohook-napi)
- `Shrew/electron/recorder.ts`: Audio recording via macOS afrecord

**Testing:**
- `Shrew/src/__tests__/store.test.ts`: State machine tests (transitions, dotColor, actions)
- `Shrew/src/__tests__/db.test.ts`: Database CRUD tests with temp SQLite files

## Naming Conventions

**Files:**
- Electron modules: `kebab-case.ts` (e.g., `voice-bar.ts`, `summary-popup.ts`)
- React components: `PascalCase.tsx` (e.g., `VoiceInput.tsx`, `SummaryPanel.tsx`)
- Page files: Always `page.tsx` (Next.js App Router convention)
- API routes: Always `route.ts` (Next.js App Router convention)
- Test files: `{module-name}.test.ts` in `__tests__/` directory
- Type files: `index.ts` for barrel exports, `declarations.d.ts` for ambient types

**Directories:**
- Route directories: `kebab-case` matching URL path (e.g., `voice-bar/`, `settings/`)
- Library directories: Short lowercase (e.g., `lib/`, `types/`, `components/`)
- Electron modules: Flat files in `electron/` directory (no subdirectories for TS modules)

**Exports:**
- Classes: Named exports with PascalCase (e.g., `export class ShrewStore`)
- Functions: Named exports with camelCase (e.g., `export function executeClaude`)
- Types: Named exports with PascalCase (e.g., `export type AppState`)

## Where to Add New Code

**New Feature (with UI + Electron integration):**
- Primary UI page: `Shrew/src/app/{route-name}/page.tsx`
- React component: `Shrew/src/components/{ComponentName}.tsx`
- Shared logic: `Shrew/src/lib/{module-name}.ts`
- IPC types: Add to `IpcMessages` interface in `Shrew/src/types/index.ts`
- IPC handlers: Add to `registerIpcHandlers()` in `Shrew/electron/main.ts`
- Tests: `Shrew/src/__tests__/{module-name}.test.ts`

**New Electron Window:**
- Window manager class: `Shrew/electron/{window-name}.ts`
- Follow pattern from `Shrew/electron/voice-bar.ts` (class with `show()`, `close()`, `send()`)
- Create Next.js page for content: `Shrew/src/app/{route-name}/page.tsx`
- Register in `Shrew/electron/main.ts` initialization

**New API Route:**
- Route handler: `Shrew/src/app/api/{route-name}/route.ts`
- Export `GET` and/or `POST` named functions
- Access shared state via `(globalThis as any).__shrewStore`

**New Library Module:**
- Implementation: `Shrew/src/lib/{module-name}.ts`
- Access from Electron: Direct import (path `../src/lib/{module-name}`)
- Access from Next.js API routes: Via `globalThis` bridge or direct import
- Tests: `Shrew/src/__tests__/{module-name}.test.ts`

**New Type:**
- Core types: `Shrew/src/types/index.ts`
- Ambient declarations: `Shrew/src/types/declarations.d.ts`

**Utilities:**
- Shared helpers: `Shrew/src/lib/{utility-name}.ts`
- Build scripts: `Shrew/scripts/{script-name}.mjs`

## Special Directories

**`dist-electron/`:**
- Purpose: esbuild output for compiled Electron main process
- Generated: Yes (by `npm run build:electron`)
- Committed: No (gitignored)
- Output: Single `main.js` file (CJS bundle)

**`.next/`:**
- Purpose: Next.js build output including standalone server
- Generated: Yes (by `npm run build`)
- Committed: No (gitignored)
- Contains: `standalone/` server, `static/` assets

**`release/`:**
- Purpose: Electron-builder packaging output (DMG, ZIP)
- Generated: Yes (by `npm run electron:build`)
- Committed: No
- Contains: `mac-arm64/Shrew.app` and disk images

**`electron/native/key-event-tap/.build/`:**
- Purpose: Swift Package Manager build artifacts
- Generated: Yes (by Swift build)
- Committed: No
- Contains: Compiled Swift objects and module cache

**User Data (runtime, not in repo):**
- `~/Library/Application Support/Shrew/shrew.db` - SQLite database
- `~/Library/Application Support/Shrew/secure/anthropic-key.enc` - Encrypted API key
- `~/Library/Application Support/Shrew/models/sensevoice-small-int8.onnx` - Voice model
- `~/Library/Application Support/Shrew/tmp/` - Temporary audio recordings
- `~/Library/Application Support/Shrew/settings.json` - App settings

---

*Structure analysis: 2026-04-22*
