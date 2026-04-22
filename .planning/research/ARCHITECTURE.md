# Architecture Patterns

**Domain:** Electron + Next.js standalone hybrid desktop app packaging
**Researched:** 2026-04-22
**Focus:** Fixing packaging and E2E flow -- how the build pipeline, module resolution, and runtime must be structured for correct electron-builder output

## Recommended Architecture

The application has two distinct runtime environments that must both function inside the final DMG:

```
+----------------------------------------------------------+
| Packaged App (Shrew.app)                                 |
|                                                          |
|  Contents/Resources/                                     |
|    app.asar                                              |
|      dist-electron/main.js  <-- Electron entry point     |
|                                                          |
|    .next/standalone/         <-- Next.js server (extra)  |
|      server.js                                           |
|      node_modules/ (trace-minimal)                       |
|      .next/server/ (server bundles)                      |
|                                                          |
|    .next/static/             <-- Static assets (extra)   |
|    public/                   <-- Public assets (extra)   |
|                                                          |
|  Contents/Frameworks/                                    |
|    Electron Framework (Chromium + Node)                  |
+----------------------------------------------------------+
```

### Key Architectural Insight: Two Separate Module Resolution Paths

The critical complexity in this hybrid architecture is that native modules are loaded by **two different processes** in **two different locations**:

1. **Electron main process** (`dist-electron/main.js` inside `app.asar`) loads:
   - `better-sqlite3` -- for SQLite database
   - `sherpa-onnx-node` (via `src/lib/sherpa.ts`) -- for voice recognition
   - `uiohook-napi` -- for global keyboard hooks
   - `@anthropic-ai/claude-agent-sdk` -- for Claude execution
   - `src/lib/store.ts`, `src/lib/db.ts`, `src/lib/keychain.ts` -- bundled by esbuild

2. **Next.js standalone server** (`process.resourcesPath/.next/standalone/server.js`) loads:
   - Its own `node_modules` (traced by Next.js output file tracing)
   - API routes that may import shared code from `src/lib/`

### Component Boundaries

| Component | Process | Location in Package | Loads Natives? |
|-----------|---------|---------------------|----------------|
| Electron main | Main process | `app.asar/dist-electron/main.js` | YES: better-sqlite3, sherpa-onnx-node, uiohook-napi |
| Next.js server | Spawned child | `Resources/.next/standalone/server.js` | YES: anything in its node_modules |
| Voice bar window | Renderer (main proc) | Loads via `http://localhost:PORT/voice-bar` | NO (renderer) |
| Summary popup | Renderer (main proc) | Loads via `http://localhost:PORT/summary` | NO (renderer) |
| Settings window | Renderer (main proc) | Loads via `http://localhost:PORT/settings` | NO (renderer) |
| Onboarding window | Renderer (main proc) | Loads via `http://localhost:PORT/onboarding` | NO (renderer) |

### Data Flow

```
User Input Flow:
  Right Command key
    -> uiohook-napi (main process, native)
    -> ShortcutManager.handleRightCommand()
    -> state machine transition
    -> AudioRecorder.startRecording() (afrecord via child_process)
    -> AudioRecorder.stopRecording()
    -> VoiceRecognizer.transcribe() (sherpa-onnx-node, native)
    -> state machine: editing
    -> voice-bar IPC: voice:send
    -> executePrompt()
    -> executeClaude() (@anthropic-ai/claude-agent-sdk, dynamic import)
    -> state machine: executing -> idle
    -> tray dot color update
    -> summary popup update (via SQLite query)

Window Management Flow:
  main.ts creates windows with loadURL("http://127.0.0.1:{port}/{route}")
  In production: port comes from startNextServer() which spawns standalone server.js
  In dev: port is 3000 from next dev

State Communication:
  Main process -> Renderer: ipcMain/webContents.send
  Renderer -> Main process: ipcRenderer.send/handle (via nodeIntegration:true)
  Main process <-> Next.js API routes: globalThis.__shrewStore / __shrewExecutor
  Next.js server health: main polls /api/health endpoint
```

## Critical Build Pipeline Architecture

The build pipeline must produce a self-contained app where:

1. **Step 1: `next build`** produces `.next/standalone/` with traced `node_modules/`
2. **Step 2: `esbuild`** bundles `electron/main.ts` -> `dist-electron/main.js`, marking natives as external
3. **Step 3: `electron-builder`** assembles the final package

### Build Pipeline Diagram

```
next build                    esbuild                    electron-builder
    |                            |                             |
    v                            v                             v
.next/standalone/         dist-electron/main.js        Shrew.app / DMG
  server.js                   (CJS bundle)                |
  node_modules/                   |                       +-- app.asar
    (traced only)                 |                       |    dist-electron/
  .next/server/                   |                       |    node_modules/ (for main proc)
    (server bundles)              |                       |
                                 |                       +-- .next/standalone/ (extraResources)
                                 |                       +-- .next/static/ (extraResources)
                                 |                       +-- public/ (extraResources)
```

### The Native Module Problem (Current Architecture Bug)

**Problem identified:** The current `electron-builder.yml` has a critical gap in how native modules are handled.

Current config:
```yaml
files:
  - "dist-electron/**/*"
  - "!node_modules/**/*"    # <-- EXCLUDES ALL node_modules
extraResources:
  - from: ".next/standalone"
    to: ".next/standalone"
asarUnpack:
  - "**/*.node"
  - "**/*.dylib"
```

The `files` directive includes `dist-electron/**/*` and explicitly excludes `node_modules/**/*`. But `dist-electron/main.js` is an esbuild bundle that marks `better-sqlite3`, `sherpa-onnx-node`, and `uiohook-napi` as `external`. This means the Electron main process will try to `require()` these modules at runtime, but they are not in the package.

There are two resolution paths, and the architecture must pick one:

### Pattern 1: Include node_modules for Electron Main Process (Recommended)

```yaml
files:
  - "dist-electron/**/*"
  - "node_modules/better-sqlite3/**/*"
  - "node_modules/sherpa-onnx-node/**/*"
  - "node_modules/sherpa-onnx-darwin-arm64/**/*"
  - "node_modules/uiohook-napi/**/*"
  - "node_modules/@anthropic-ai/**/*"
  # Exclude everything else
  - "!node_modules/@{esbuild,electron,types,jest,ts-*,concurrently,wait-on}/**/*"
```

**Why this is correct:** The Electron main process loads native modules via Node.js `require()`. These modules must be resolvable relative to the app's `node_modules`. The `asarUnpack` config ensures `.node` and `.dylib` files are extracted from the asar archive so the OS can load them.

### Pattern 2: Bundle natives into extraResources

Copy native modules alongside the standalone server, then use a custom `require` path in the main process. This is fragile and not recommended.

### Next.js Standalone Native Module Situation

The standalone output currently does NOT include `better-sqlite3`, `sherpa-onnx-node`, or `uiohook-napi` in its `node_modules/`. This is actually correct for the current architecture because:

- `better-sqlite3` is only used in the Electron main process (`electron/main.ts` imports `src/lib/db.ts`)
- `sherpa-onnx-node` is only used in the Electron main process (`electron/recorder.ts` imports `src/lib/sherpa.ts`)
- `uiohook-napi` is only used in the Electron main process (`electron/shortcuts.ts`)

The Next.js API routes (`src/app/api/chat/route.ts`, `src/app/api/status/route.ts`) access state via `globalThis.__shrewStore` and `globalThis.__shrewExecutor`, which are set by the Electron main process. This works because in the packaged app, the Next.js server runs as a child process of the Electron app and shares the same `globalThis` space (note: actually this is WRONG -- child_process.spawn creates a separate process with its own globalThis, so `globalThis` sharing does not work across processes).

### Critical Bug: globalThis Sharing Does Not Work Across Processes

In `electron/main.ts`:
```typescript
(globalThis as any).__shrewStore = store;
(globalThis as any).__shrewExecutor = { execute: executePrompt };
```

The Next.js server is spawned as a `child_process.spawn()`, which means it is a **separate Node.js process** with its own `globalThis`. The API routes cannot access `__shrewStore` or `__shrewExecutor` this way.

This works in `electron:dev` mode only because `next dev` runs in the same process group as Electron (concurrently launches them both, but they are still separate processes -- this likely works by accident in dev because the API routes may not actually need globalThis in the current implementation, or the dev workflow has a different code path).

For the packaged app, this will break. The API routes need an alternative communication mechanism:
- HTTP-based IPC (API routes call back to the Electron main process via a local HTTP server)
- Or the API routes should be self-sufficient (not need main process state)

## Patterns to Follow

### Pattern 1: Separate Concerns by Process
**What:** The Electron main process handles all native module interactions. The Next.js server handles only UI rendering and API endpoints that do not require native modules.
**When:** Always in this architecture.
**Rationale:** Native modules must be rebuilt for Electron's Node.js version, not the system Node.js. Keeping them in the main process avoids double-rebuilding.

### Pattern 2: Process-Local Port Communication
**What:** The Electron main process spawns the Next.js server on a random port, then communicates the port to windows via `loadURL()`. For main-to-server communication, use HTTP requests to the local server. For server-to-main communication, use an IPC bridge or local socket.
**When:** Any time the Next.js server needs data from the main process.
**Example:**
```typescript
// In main process: expose a local control channel
import http from 'http';
const controlServer = http.createServer((req, res) => {
  // Handle requests from Next.js API routes
  if (req.url === '/internal/state') {
    res.end(JSON.stringify(store.getState()));
  }
});
controlServer.listen(0, '127.0.0.1'); // random port
// Pass control port to Next.js via environment variable
```

### Pattern 3: esbuild Bundle with Selective Externals
**What:** Use esbuild to bundle the Electron main process code, marking only truly native/Electron modules as external.
**When:** Building `electron/main.ts`.
**Current config is correct:**
```javascript
external: [
  'electron',              // Provided by Electron runtime
  'better-sqlite3',        // Native module, must be loaded at runtime
  'sherpa-onnx-node',      // Native module
  'uiohook-napi',          // Native module
  '@anthropic-ai/claude-agent-sdk',  // Has native dependencies / subprocess spawning
],
```

### Pattern 4: outputFileTracingIncludes for Standalone
**What:** If any native modules ARE needed by Next.js API routes, use `outputFileTracingIncludes` in `next.config.ts` to force-include them.
**When:** Only if API routes directly use native modules.
**Example:**
```typescript
const nextConfig: NextConfig = {
  output: 'standalone',
  serverExternalPackages: ['better-sqlite3'],
  outputFileTracingIncludes: {
    '/*': ['node_modules/better-sqlite3/**/*'],
  },
};
```

## Anti-Patterns to Avoid

### Anti-Pattern 1: globalThis Sharing Across Processes
**What:** Setting `(globalThis).__shrewStore` in the Electron main process and expecting it to be readable from a Next.js server spawned via `child_process.spawn()`.
**Why bad:** `spawn()` creates a separate OS process with its own memory space. `globalThis` is not shared. This will silently fail in production.
**Instead:** Use HTTP-based communication between the Next.js server and Electron main process, or restructure so API routes do not need main-process state.

### Anti-Pattern 2: Excluding All node_modules from Package
**What:** Using `!node_modules/**/*` in `files` while also marking native modules as `external` in esbuild.
**Why bad:** The Electron main process will fail to `require()` the native modules at runtime.
**Instead:** Selectively include the native module directories that the Electron main process needs.

### Anti-Pattern 3: Assuming asarUnpack Handles Everything
**What:** Relying solely on `asarUnpack: ["**/*.node", "**/*.dylib"]` to fix native module loading.
**Why bad:** `asarUnpack` only extracts matching files that are ALREADY inside the asar. If `node_modules` is excluded from the files list entirely, there is nothing to unpack. The native modules must first be included, THEN unpacked from the asar.
**Instead:** Include native module directories in `files`, then use `asarUnpack` to ensure the OS can load the binaries.

### Anti-Pattern 4: Forgetting Platform-Specific Native Dependencies
**What:** Including `sherpa-onnx-node` but not `sherpa-onnx-darwin-arm64` (the platform-specific helper package).
**Why bad:** `sherpa-onnx-node` loads its native addon from `sherpa-onnx-darwin-arm64/sherpa-onnx.node` via `require('../sherpa-onnx-darwin-arm64/sherpa-onnx.node')`. If the platform package is missing, the addon fails to load.
**Instead:** Include both the main package AND its platform-specific helper in the files list.

### Anti-Pattern 5: Using ELECTRON_RUN_AS_NODE for the Next.js Server
**What:** Setting `ELECTRON_RUN_AS_NODE: '1'` when spawning the Next.js server.
**Why bad:** This tells Electron to run as a plain Node.js process. However, the Next.js server is spawned using `process.execPath` (which is the Electron executable). With `ELECTRON_RUN_AS_NODE`, it becomes a plain Node.js process, which means:
- It uses Electron's bundled Node.js (correct version)
- But it will NOT be able to use Electron-specific APIs
- Native modules must be built for Electron's Node.js version
**Impact:** This is actually the correct approach for running a plain Node.js server inside Electron. The Next.js server does not need Electron APIs. Just be aware that native modules used by the server (if any) must be rebuilt for Electron's Node.js.

## Recommended electron-builder.yml (Fixed)

```yaml
appId: com.shrew.app
productName: Shrew
directories:
  output: release
mac:
  category: public.app-category.developer-tools
  target:
    - dmg
    - zip
  hardenedRuntime: true
  gatekeeperAssess: false
  minimumSystemVersion: "13.0.0"

# Files included in app.asar
files:
  - "dist-electron/**/*"
  # Native modules needed by Electron main process
  - "node_modules/better-sqlite3/**/*"
  - "node_modules/sherpa-onnx-node/**/*"
  - "node_modules/sherpa-onnx-darwin-arm64/**/*"
  - "node_modules/uiohook-napi/**/*"
  - "node_modules/@anthropic-ai/**/*"
  # Exclude unnecessary files from native packages
  - "!**/*.{md,ts,tsx,map}"
  - "!**/test/**"
  - "!**/tests/**"
  - "!**/__tests__/**"

# Unpack native binaries from asar so the OS can load them
asarUnpack:
  - "**/*.node"
  - "**/*.dylib"
  - "**/*.so"

# Next.js standalone server lives OUTSIDE the asar
extraResources:
  - from: ".next/standalone"
    to: ".next/standalone"
    filter:
      - "!**/*.{md,ts,tsx,map}"
  - from: ".next/static"
    to: ".next/static"
  - from: "public"
    to: "public"
```

## Corrected Build Script Order

```bash
# Full production build (electron:build)
1. npm run rebuild          # Rebuild natives for Electron's Node.js
2. next build               # Produces .next/standalone/ with traced deps
3. node scripts/build-electron.mjs  # esbuild: electron/main.ts -> dist-electron/main.js
4. electron-builder         # Packages everything into DMG
```

The current `electron:build` script (`next build && node scripts/build-electron.mjs && electron-builder`) is missing the `rebuild` step. While `rebuild` only needs to run when native module versions change, it should be included in the build script for safety.

## Suggested Build Order (Phase Dependencies)

```
Phase 1: Fix Build Configuration
  1.1 Fix electron-builder.yml (native module inclusion)
  1.2 Verify esbuild external list is complete
  1.3 Test: `npm run electron:build` produces valid DMG
  Depends on: nothing

Phase 2: Fix Runtime Module Resolution
  2.1 Fix globalThis sharing (replace with HTTP IPC or restructure)
  2.2 Verify native module loading from packaged app
  2.3 Verify Next.js standalone server starts from process.resourcesPath
  Depends on: Phase 1

Phase 3: Fix E2E Flow
  3.1 Test full voice -> Claude flow in packaged app
  3.2 Test onboarding flow in packaged app
  3.3 Test settings persistence
  Depends on: Phase 2

Phase 4: Polish
  4.1 App signing and notarization
  4.2 Universal binary (arm64 + x64)
  4.3 Auto-updater setup
  Depends on: Phase 3
```

## Scalability Considerations

| Concern | At Dev (1 user) | At DMG (1 install) | At Distribution |
|---------|-----------------|---------------------|-----------------|
| Native module size | ~50MB in node_modules | ~50MB in app.asar (unpacked) | Same per platform |
| sherpa-onnx model | ~230MB, lazy downloaded | Not in DMG, downloaded on first use | Same |
| Next.js server startup | ~2s (next dev) | ~1s (standalone) | Same |
| Memory footprint | ~300MB (Electron + Next.js) | ~200MB (optimized standalone) | Same |
| DMG size (estimated) | N/A | ~150MB (app + natives) | Per-platform builds needed |

## Sources

- Context7: electron-builder configuration documentation (/electron-userland/electron-builder)
- Context7: Next.js standalone output documentation (/vercel/next.js)
- Context7: Next.js serverExternalPackages documentation (/vercel/next.js)
- Project source code analysis: electron/main.ts, electron-builder.yml, next.config.ts, scripts/build-electron.mjs
- Verified: standalone output node_modules contents, native module binary locations, sherpa-onnx-node platform package structure
