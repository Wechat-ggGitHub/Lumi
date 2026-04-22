# Technology Stack

**Analysis Date:** 2026-04-22

## Languages

**Primary:**
- TypeScript 5.7+ - All source code in both `src/` (Next.js pages, components, API routes, lib modules) and `electron/` (Electron main process modules). Strict mode enabled (`strict: true` in `tsconfig.json`).

**Secondary:**
- JavaScript (ESM) - Build scripts in `scripts/build-electron.mjs` (esbuild configuration)
- SQL - Schema definitions in `src/lib/db.ts` for SQLite `execution_history` table
- Swift 5.9 - Native macOS module scaffold in `electron/native/key-event-tap/` (Package.swift, N-API CGEventTap binding). Currently pseudocode only, not compiled or used at runtime.
- CSS (inline) - All React components use inline `style` objects; no CSS files, CSS modules, or styling frameworks.

## Runtime

**Environment:**
- Node.js 22 - Target for both Next.js server-side and Electron main process (esbuild target: `node22`, TypeScript target: `ES2022`)
- Electron 35+ - Desktop runtime, manages BrowserWindow lifecycle, tray icon, IPC, system integrations
- Chromium (via Electron) - Renderer process for all UI pages

**Package Manager:**
- npm - Package manager
- Lockfile: `package-lock.json` present (lockfileVersion 3, ~435KB)

## Frameworks

**Core:**
- Next.js 15 - UI framework with standalone server output (`output: 'standalone'` in `next.config.ts`). Provides React pages under `src/app/` and API routes under `src/app/api/`.
- React 19 - Component library for all UI (`src/components/`, `src/app/` pages)
- Electron 35+ - Desktop shell: window management, tray, global shortcuts, safeStorage encryption

**Testing:**
- Jest 30.3+ - Test runner
- ts-jest 29.4+ - TypeScript support for Jest

**Build/Dev:**
- esbuild 0.28+ - Bundles Electron main process (`electron/main.ts` -> `dist-electron/main.js`, CJS format)
- electron-builder 25+ - Packages Electron app into DMG/ZIP for macOS distribution
- TypeScript 5.7+ - Type checking (noEmit for Next.js; outputs CJS via esbuild for Electron)
- concurrently 9+ - Runs Next.js dev server and Electron in parallel during `npm run electron:dev`
- wait-on 8+ - Waits for `http://127.0.0.1:3000/api/health` before launching Electron in dev mode

## Key Dependencies

**Critical:**
- `@anthropic-ai/claude-agent-sdk` ^0.2.0 - Claude Agent SDK; provides `query()` AsyncGenerator for streaming Claude Code execution. Core integration driving the entire app. Used in `src/lib/claude-client.ts`. Dynamic import pattern.
- `better-sqlite3` ^11.0.0 - Synchronous SQLite3 bindings. Used for `execution_history` persistence in `src/lib/db.ts`. WAL mode, NORMAL synchronous. Listed in `serverExternalPackages` in `next.config.ts`.
- `sherpa-onnx-node` ^1.10.0 - ONNX-based speech recognition inference engine. Uses SenseVoice Small model (Int8 quantized) for local voice-to-text in `src/lib/sherpa.ts`. Also in `serverExternalPackages`.
- `uiohook-napi` ^1.5.5 - Global keyboard/mouse hook via libuiohook N-API binding. Listens for Right Command key in `electron/shortcuts.ts`. Requires macOS Accessibility permission.

**Infrastructure:**
- `react` ^19.0.0 / `react-dom` ^19.0.0 - UI rendering
- `next` ^15.0.0 - Framework (standalone server mode for Electron embedding)
- `electron` ^35.0.0 - Desktop runtime
- `@electron/rebuild` ^4.0.4 - Rebuilds native modules against Electron's Node.js headers

## Native Dependencies

All native modules require `@electron/rebuild` after dependency version changes:

| Module | Purpose | Location | Rebuild Command |
|--------|---------|----------|----------------|
| `better-sqlite3` | SQLite database | `src/lib/db.ts` | `npm run rebuild` |
| `sherpa-onnx-node` | Voice recognition inference | `src/lib/sherpa.ts` | `npm run rebuild` |
| `uiohook-napi` | Global keyboard hooks | `electron/shortcuts.ts` | `npm run rebuild` |

## Configuration

**TypeScript:**
- `tsconfig.json` - Next.js: target ES2022, module `esnext`, moduleResolution `bundler`, strict mode, path alias `@/*` -> `./src/*`, Next.js plugin
- `tsconfig.electron.json` - Electron: extends base, outputs CJS to `dist-electron/`, includes `electron/**/*.ts`

**Next.js (`next.config.ts`):**
- `output: 'standalone'` - Self-contained server for Electron embedding
- `serverExternalPackages: ['better-sqlite3', 'sherpa-onnx-node']` - Native modules excluded from webpack
- Client-side fallbacks: `fs`, `path`, `os`, `crypto`, `stream`, `child_process` all set to `false`
- `electron` added as webpack external to prevent bundling in client

**Electron Build (`electron-builder.yml`):**
- App ID: `com.shrew.app`, Product: `Shrew`
- macOS target: DMG + ZIP
- Minimum macOS: 13.0.0 (Ventura)
- Hardened runtime enabled, Gatekeeper assessment disabled
- ASAR unpack for `*.node`, `*.dylib`, `*.so` files
- Extra resources: `.next/standalone`, `.next/static`, `public` bundled into app

**esbuild (`scripts/build-electron.mjs`):**
- Entry: `electron/main.ts` -> Output: `dist-electron/main.js`
- Format: CJS, platform: Node, target: node22
- External: `electron`, `better-sqlite3`, `sherpa-onnx-node`, `uiohook-napi`, `@anthropic-ai/claude-agent-sdk`
- Path alias `@` -> `src/` for shared code imports from Electron main process
- Sourcemaps enabled, no minification

**Jest (`jest.config.ts`):**
- Preset: `ts-jest`, environment: `node`, roots: `src/`
- Module alias: `@/*` -> `<rootDir>/src/$1`

## Path Aliases

- `@/*` maps to `./src/*` - Configured in both `tsconfig.json` (Next.js) and `scripts/build-electron.mjs` (esbuild alias)
- Enables shared code imports from Electron main process: e.g., `import { ShrewStore } from '@/lib/store'` in `electron/main.ts`

## Build Pipeline

1. `next build` -> `.next/standalone/` outputs self-contained server
2. `scripts/build-electron.mjs` -> esbuild bundles `electron/main.ts` to `dist-electron/main.js`, native modules marked external
3. `electron-builder` -> packages DMG/ZIP with `.next/standalone` and `.next/static` as extraResources

Full production build: `npm run electron:build` (runs all three steps sequentially)

## Platform Requirements

**Development:**
- macOS 13+ (Ventura or later)
- Node.js 22+
- npm
- Xcode Command Line Tools (for native module compilation)
- macOS Accessibility permission (for global keyboard shortcuts via `uiohook-napi`)
- Network access to `api.anthropic.com` (Claude API)
- Network access to `modelscope.cn` (voice model download during onboarding)

**Production:**
- macOS 13+ (Ventura or later, enforced by `electron-builder.yml` `minimumSystemVersion`)
- macOS Accessibility permission (for Right Command key capture)
- macOS Microphone permission (for voice recording via `afrecord`)
- Anthropic API key (stored encrypted via Electron safeStorage)
- SenseVoice Small ONNX model file (downloaded during onboarding)

---

*Stack analysis: 2026-04-22*
