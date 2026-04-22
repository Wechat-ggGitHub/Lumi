# Technology Stack

**Analysis Date:** 2026-04-22

## Languages

**Primary:**
- TypeScript 5.9.3 - All source code in both `src/` (Next.js) and `electron/` (Electron main process)

**Secondary:**
- JavaScript (ESM) - Build scripts in `scripts/build-electron.mjs`
- SQL - Schema definition in `src/lib/db.ts` for SQLite tables
- CSS (inline styles) - Components use inline `style` objects, no CSS files or frameworks

## Runtime

**Environment:**
- Node.js 22 (target: `node22` in esbuild, `ES2022` TypeScript target)
- Electron 35.7.5 - Desktop runtime wrapping the application
- macOS 13+ minimum system version (configured in `electron-builder.yml`)

**Package Manager:**
- npm - Lockfile: `package-lock.json` present (lockfileVersion 3)
- Node version: v24.8.0 on development machine (no `.nvmrc` or `.node-version` pinning)

## Frameworks

**Core:**
- Next.js 15.5.15 - UI framework with standalone server output, provides pages and API routes
- React 19.2.5 - UI component library (with `react-dom` 19.2.5)
- Electron 35.7.5 - Desktop shell, window management, system integration, safeStorage

**Testing:**
- Jest 30.3.0 - Test runner, configured in `jest.config.ts`
- ts-jest 29.4.9 - TypeScript support for Jest

**Build/Dev:**
- esbuild 0.28.0 - Bundles Electron main process to `dist-electron/main.js`
- electron-builder 25.1.8 - Packages DMG/ZIP for macOS distribution
- TypeScript 5.9.3 - Type checking (`tsconfig.json` for Next.js, `tsconfig.electron.json` for Electron)
- concurrently 9.2.1 - Runs Next.js dev server and Electron in parallel during development
- wait-on 8.0.5 - Waits for dev server health check before launching Electron

## Key Dependencies

**Critical:**
- `@anthropic-ai/claude-agent-sdk` 0.2.117 - Claude Agent SDK integration, provides `query()` AsyncGenerator for streaming Claude execution results. Used in `src/lib/claude-client.ts`
- `better-sqlite3` 11.10.0 - Synchronous SQLite3 bindings, WAL mode. Used in `src/lib/db.ts` for execution history persistence
- `sherpa-onnx-node` 1.12.39 - ONNX-based speech recognition inference. Used in `src/lib/sherpa.ts` with SenseVoice Small Int8 model
- `uiohook-napi` 1.5.5 - Global keyboard/mouse hook via N-API. Used in `electron/shortcuts.ts` to listen for Right Command key

**Infrastructure:**
- `@electron/rebuild` 4.0.4 - Rebuilds native modules (better-sqlite3, sherpa-onnx-node, uiohook-napi) against Electron's Node.js headers

## Configuration

**Environment:**
- No `.env` files detected - configuration stored in files within `~/Library/Application Support/Shrew/`
- Settings: `~/Library/Application Support/Shrew/settings.json` (JSON file, managed via `electron/main.ts`)
- API Key: `~/Library/Application Support/Shrew/secure/anthropic-key.enc` (encrypted via Electron safeStorage)
- Database: `~/Library/Application Support/Shrew/shrew.db` (SQLite, WAL mode)
- Voice model: `~/Library/Application Support/Shrew/models/sensevoice-small-int8.onnx` (downloaded during onboarding)
- API Key passed at runtime via `ANTHROPIC_API_KEY` env var to Claude SDK in `src/lib/claude-client.ts`

**Build:**
- `tsconfig.json` - Next.js TypeScript config (ES2022 target, bundler module resolution, `@/*` path alias)
- `tsconfig.electron.json` - Electron TypeScript config (extends base, CJS output, includes `electron/**/*.ts`)
- `next.config.ts` - Next.js config: standalone output, serverExternalPackages for native modules, webpack fallbacks for client-side
- `jest.config.ts` - Jest config: ts-jest preset, node environment, `@/*` module mapper
- `electron-builder.yml` - Packaging config: macOS DMG/ZIP targets, hardened runtime, asarUnpack for native `.node`/`.dylib` files
- `scripts/build-electron.mjs` - esbuild config: bundles `electron/main.ts` to CJS, marks native modules as external, `@/*` alias

## Platform Requirements

**Development:**
- macOS 13+ (required for Electron and uiohook-napi)
- Node.js 22+ (esbuild target, TypeScript ES2022 features)
- macOS Accessibility permission (required for `uiohook-napi` global keyboard hook)
- macOS Microphone permission (required for `afrecord` audio recording)
- Network access to `api.anthropic.com` (Claude API)
- Network access to `modelscope.cn` (voice model download)

**Production:**
- macOS 13+ (enforced by `electron-builder.yml` minimumSystemVersion)
- Electron runtime (packaged via electron-builder as DMG/ZIP)
- Hardened Runtime enabled (`hardenedRuntime: true` in electron-builder.yml)

---

*Stack analysis: 2026-04-22*
