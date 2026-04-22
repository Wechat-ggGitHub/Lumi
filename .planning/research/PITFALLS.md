# Pitfalls Research

**Domain:** macOS Electron + Next.js 15 standalone + native modules desktop app packaging
**Researched:** 2026-04-22
**Confidence:** HIGH (verified against Context7 docs for Electron, electron-builder, and Next.js)

## Critical Pitfalls

### Pitfall 1: Native modules excluded from package but required at runtime

**What goes wrong:**
The `electron-builder.yml` contains `files: ["dist-electron/**/*", "!node_modules/**/*"]`. This tells electron-builder to exclude ALL of `node_modules` from the asar archive. Meanwhile, the esbuild config marks `better-sqlite3`, `sherpa-onnx-node`, and `uiohook-napi` as `external`, meaning they are NOT bundled into `dist-electron/main.js`. At runtime, when `require('better-sqlite3')` executes, the module cannot be found because it was never included in the package. The app crashes immediately on launch with `MODULE_NOT_FOUND`.

Additionally, `asarUnpack` patterns like `**/*.node` only apply to files already inside the asar. If `node_modules` is excluded entirely, there are no `.node` files inside the asar to unpack -- `asarUnpack` becomes a no-op.

**Why it happens:**
Developers see that esbuild bundles everything and assume native modules are included. But esbuild's `external` flag explicitly prevents bundling. The `!node_modules/**/*` exclusion in electron-builder config is intended to avoid bundling the entire node_modules (which includes dev dependencies), but it also excludes the production native modules that esbuild left as external requires.

**How to avoid:**
One of two approaches:

Approach A (recommended for this project): Let electron-builder handle native modules naturally. Remove `!node_modules/**/*` from files, or change files to only include what is needed:
```yaml
files:
  - "dist-electron/**/*"
  - "node_modules/better-sqlite3/**/*"
  - "node_modules/sherpa-onnx-node/**/*"
  - "node_modules/uiohook-napi/**/*"
  - "package.json"
asarUnpack:
  - "**/*.node"
  - "**/*.dylib"
  - "**/*.so"
```
electron-builder will automatically exclude devDependencies and only include production dependencies.

Approach B: Use `node_modules` inclusion with electron-builder's default behavior (it automatically excludes devDependencies):
```yaml
files:
  - "dist-electron/**/*"
asarUnpack:
  - "**/*.node"
  - "**/*.dylib"
  - "**/*.so"
```

**Warning signs:**
- `asarUnpack` patterns present but `!node_modules/**/*` in files -- these contradict each other
- `MODULE_NOT_FOUND` errors in packaged app logs
- App window shows but is blank / crashes silently (Next.js server fails to start because better-sqlite3 is used by the main process before server starts)

**Phase to address:**
Phase 1 (DMG packaging fix) -- this is the single most important configuration fix.

---

### Pitfall 2: Next.js standalone static files not served

**What goes wrong:**
The `electron-builder.yml` copies `.next/standalone` and `.next/static` into `extraResources`, which places them at `Contents/Resources/.next/standalone` and `Contents/Resources/.next/static`. But Next.js standalone expects static files at `.next/standalone/.next/static` and `.next/standalone/public` -- relative to the `server.js` working directory. The static and public folders end up as siblings of standalone, not inside it.

Result: CSS, JS bundles, images, and fonts return 404. Pages render as unstyled HTML or break entirely.

**Why it happens:**
Next.js docs explicitly state: "This minimal server does not copy the `public` or `.next/static` folders by default." The documented fix is to copy them into the standalone directory before packaging:
```bash
cp -r public .next/standalone/ && cp -r .next/static .next/standalone/.next/
```
But when using `extraResources`, each `from`/`to` pair copies independently. The standalone directory inside the package does not have static files merged into it.

**How to avoid:**
Add a build step between `next build` and `electron-builder` that merges the static and public folders into the standalone directory:

Option 1 -- Add to `electron:build` script:
```json
"electron:build": "next build && node scripts/build-electron.mjs && node scripts/prepare-standalone.mjs && electron-builder"
```

Where `scripts/prepare-standalone.mjs`:
```javascript
import fs from 'fs';
import path from 'path';

const root = import.meta.dirname;
const standalone = path.join(root, '.next/standalone');
fs.cpSync(path.join(root, '.next/static'), path.join(standalone, '.next/static'), { recursive: true });
fs.cpSync(path.join(root, 'public'), path.join(standalone, 'public'), { recursive: true });
```

Then simplify `extraResources` to only copy the standalone directory:
```yaml
extraResources:
  - from: ".next/standalone"
    to: ".next/standalone"
```

Option 2 -- Use `extraResources` with careful `from`/`to` mapping to place static inside standalone:
```yaml
extraResources:
  - from: ".next/standalone"
    to: ".next/standalone"
  - from: ".next/static"
    to: ".next/standalone/.next/static"
  - from: "public"
    to: ".next/standalone/public"
```
This is simpler and avoids an extra build script.

**Warning signs:**
- Packaged app shows unstyled pages
- Browser dev tools show 404s for `_next/static/...` URLs
- Pages work in dev (`npm run electron:dev`) but not in packaged DMG

**Phase to address:**
Phase 1 (DMG packaging fix) -- static file serving must be verified in first successful DMG build.

---

### Pitfall 3: Native modules compiled for system Node, not Electron

**What goes wrong:**
Native modules (`better-sqlite3`, `sherpa-onnx-node`, `uiohook-napi`) are compiled against the system Node.js ABI during `npm install`. Electron uses a different V8 engine version and therefore a different ABI. At runtime, loading these modules throws:
```
Error: The module was compiled against a different Node.js version using NODE_MODULE_VERSION $XYZ
```

**Why it happens:**
`npm install` builds native modules against the Node.js version running npm (system Node). Electron's Node is a fork with a different ABI. The project has `@electron/rebuild` as a devDependency and a `rebuild` script, but the `electron:build` script does not call `npm run rebuild` before packaging. The existing DMG in `release/` was likely built with mismatched native modules.

**How to avoid:**
Ensure `electron:build` always runs `electron-rebuild` before packaging:
```json
"electron:build": "next build && npm run rebuild && node scripts/build-electron.mjs && electron-builder"
```

Or add a postinstall hook:
```json
"postinstall": "electron-builder install-app-deps"
```
This ensures every `npm install` automatically rebuilds native modules for Electron.

**Warning signs:**
- `NODE_MODULE_VERSION` mismatch error in console
- App launches but crashes when hitting any feature that uses a native module (DB access, voice recognition, keyboard hooks)
- Works in `electron:dev` (because dev mode uses Electron's Node directly) but fails in packaged DMG

**Phase to address:**
Phase 1 (DMG packaging fix) -- rebuild step must be in the build pipeline.

---

### Pitfall 4: globalThis sharing breaks between Electron main process and Next.js standalone server

**What goes wrong:**
The main process exposes objects on `globalThis`:
```typescript
(globalThis as any).__shrewStore = store;
(globalThis as any).__shrewExecutor = { execute: executePrompt };
```
The Next.js API route at `src/app/api/chat/route.ts` reads from `globalThis`:
```typescript
const executor = (globalThis as any).__shrewExecutor;
```
This works in dev because Electron spawns Next.js as a dev server within the same process. But in production, `startNextServer()` spawns a separate child process (`process.execPath` with `ELECTRON_RUN_AS_NODE=1`). A child process has its own `globalThis` -- the executor object is never shared across process boundaries. The API route always gets `undefined` and returns 503 "Executor not ready".

**Why it happens:**
`globalThis` is per-process. Spawning a child process with `ELECTRON_RUN_AS_NODE=1` creates a completely separate V8 context. The pattern of using `globalThis` for inter-process communication only works when both sides run in the same process (dev mode), not when they are separate processes (production).

**How to avoid:**
Replace the `globalThis` pattern with one of these approaches:

Option A -- IPC over stdio: The Next.js server already has stdio pipes. Implement a simple JSON message protocol over stdin/stdout to communicate between main process and Next.js server.

Option B -- HTTP API between processes: Add an internal HTTP endpoint in the main process that the Next.js server calls. The main process listens on a second port, and the Next.js API route forwards requests to it.

Option C -- Eliminate the API route entirely: Move all logic that needs the executor into the Electron main process via IPC. The voice-bar and other windows already use IPC (`ipcMain.on`, `ipcMain.handle`). Remove the `/api/chat` route dependency and use IPC directly.

Option C is the cleanest because the `/api/chat` route is essentially a passthrough. The actual execution happens in the main process anyway.

**Warning signs:**
- `/api/chat` returns 503 "Executor not ready" in packaged app
- `globalThis.__shrewExecutor` is `undefined` in the Next.js server process
- Works in `electron:dev` but not in packaged DMG

**Phase to address:**
Phase 1 (DMG packaging fix) -- the app cannot function end-to-end without this fix. This is a hard blocker for the packaged app.

---

### Pitfall 5: ELECTRON_RUN_AS_NODE=1 disables Electron APIs in Next.js server

**What goes wrong:**
In `startNextServer()`, the Next.js server is spawned with:
```typescript
const env = { ...process.env, ELECTRON_RUN_AS_NODE: '1', ... };
nextServer = spawn(process.execPath, [serverScript], { cwd: standaloneDir, env });
```
`ELECTRON_RUN_AS_NODE=1` tells the Electron binary to run as a plain Node.js process. This means `require('electron')` inside the Next.js server will fail or return stubs. Any code path in Next.js that tries to use Electron APIs (including `safeStorage`, `app`, `BrowserWindow`) will crash.

The current code imports `electron` in `src/lib/keychain.ts` and `src/lib/sherpa.ts`. If Next.js's server-side code imports these (even transitively through API routes), it will fail because the Electron binary running as Node.js does not provide Electron APIs.

**Why it happens:**
The `ELECTRON_RUN_AS_NODE` flag is correctly used to make the Electron executable behave like Node.js for running the standalone server. But the developer may not realize that all Electron-specific imports must be isolated to the main process and never used in any code path that Next.js server-side rendering or API routes might load.

**How to avoid:**
1. Ensure `serverExternalPackages` in `next.config.ts` includes all Electron-dependent packages (currently `better-sqlite3` and `sherpa-onnx-node` are listed, but `uiohook-napi` and any Electron imports need to be kept out of Next.js server code entirely).
2. The `src/lib/keychain.ts` and `src/lib/sherpa.ts` import from `electron`. They must NEVER be imported from any Next.js server-side code (API routes, server components, middleware). The current API route `/api/chat` does not import them directly, but verify no transitive import pulls them in.
3. Use dynamic imports (`await import(...)`) with try/catch for Electron-dependent modules in code that might run in either context.

**Warning signs:**
- `Cannot find module 'electron'` errors in Next.js server logs
- `electron.app is not a function` or similar in server stderr
- Server crashes on startup in packaged mode

**Phase to address:**
Phase 1 -- verify during end-to-end testing of packaged DMG.

---

### Pitfall 6: asar archive breaks native module loading via process.dlopen

**What goes wrong:**
Even if native module `.node` files are included in the package, they may be inside the asar archive. Electron's asar support works by intercepting `fs` calls, but `process.dlopen` (used internally by `require()` for native modules) cannot load from within an asar. Electron works around this by extracting the file to a temp directory at runtime, but this adds overhead and can trigger antivirus scanners on macOS.

The `asarUnpack` config in `electron-builder.yml` is correctly configured:
```yaml
asarUnpack:
  - "**/*.node"
  - "**/*.dylib"
  - "**/*.so"
```
However, `sherpa-onnx-node` and `uiohook-napi` may bundle their native `.node` files with additional native library dependencies (`.dylib` files). If any `.dylib` is loaded via `dlopen` with an absolute path that points inside the asar, it will fail because the dylib cannot be found in the expected location.

**Why it happens:**
Some native modules use `dlopen` internally to load companion shared libraries. These paths are often resolved at runtime based on `__dirname` of the JS wrapper. Inside an asar, `__dirname` is a virtual path (e.g., `/path/to/app.asar/node_modules/sherpa-onnx-node/...`). The actual `.dylib` files, even if unpacked, are at `/path/to/app.asar.unpacked/...`, and the module may not look there.

**How to avoid:**
1. Keep `asarUnpack` with broad patterns for `.node`, `.dylib`, and `.so`.
2. For each native module, verify after packaging that all its binary files appear in `app.asar.unpacked/node_modules/<module>/`.
3. Consider setting `asar: false` during initial packaging debugging to isolate asar-related issues from other problems.
4. Test each native module individually in the packaged app before testing the full flow.

**Warning signs:**
- `dlopen: library not loaded` errors in console
- `Error: dlopen(...)` with paths containing `app.asar/` instead of `app.asar.unpacked/`
- Native modules work when `asar: false` but fail with `asar: true`

**Phase to address:**
Phase 1 -- test after first successful DMG build. If native module loading fails, toggle `asar: false` to diagnose.

---

### Pitfall 7: Standalone server.js path resolution differs from development

**What goes wrong:**
In `startNextServer()`:
```typescript
const standaloneDir = path.join(process.resourcesPath, '.next', 'standalone');
const serverScript = path.join(standaloneDir, 'server.js');
```
`process.resourcesPath` in a packaged macOS app points to `Shrew.app/Contents/Resources`. So the standalone directory is expected at `Contents/Resources/.next/standalone/server.js`. This matches the `extraResources` config.

However, Next.js standalone `server.js` uses `__dirname` to resolve `.next/` and other paths. In the standalone output, `server.js` is at the root of the standalone directory. The `cwd` is set to `standaloneDir`, which is correct. But the standalone `server.js` may reference paths like `.next/server/...` relative to its own location, which should work because the standalone output has `.next/server/` inside it.

The real issue: Next.js standalone bundles a minimal `node_modules` with only the traced dependencies. If `serverExternalPackages` causes Next.js to `require()` a package that was NOT traced (because the tracing did not detect the import path), the require will fail at runtime. The `better-sqlite3` package is auto-detected, but `sherpa-onnx-node` was manually added -- verify it is actually traced into standalone output.

**Why it happens:**
Next.js output file tracing uses static analysis (`@vercel/nft`) to determine which files from `node_modules` are needed. Dynamic imports (`await import('sherpa-onnx-node')`) may not be traced correctly, especially when they are inside conditional code paths or inside Electron-specific files that Next.js does not analyze.

**How to avoid:**
1. After `next build`, inspect `.next/standalone/node_modules/` to verify that `better-sqlite3` and `sherpa-onnx-node` are present.
2. If missing, add them to `outputFileTracingIncludes` in `next.config.ts`:
```typescript
outputFileTracingIncludes: {
  '/*': ['node_modules/sherpa-onnx-node/**/*'],
}
```
3. Consider whether these native modules even need to run inside the Next.js server process. If they only run in the Electron main process, they should NOT be in the standalone output at all.

**Warning signs:**
- `Cannot find module 'sherpa-onnx-node'` in Next.js server stderr
- `.next/standalone/node_modules/` is missing expected packages after build
- API routes that depend on native modules fail in packaged mode

**Phase to address:**
Phase 1 -- verify standalone output contents after `next build`.

---

### Pitfall 8: safeStorage encryption tied to app signing identity

**What goes wrong:**
Electron's `safeStorage` uses macOS Keychain under the hood. The encryption key is derived from the app's code signing identity. If the app is unsigned during development/testing, `safeStorage` uses a fallback. When the app is later signed (or when the signing identity changes), previously encrypted data cannot be decrypted. Users who stored their API key in an unsigned build will lose access after updating to a signed build.

**Why it happens:**
`safeStorage.encryptString()` produces ciphertext that can only be decrypted by the same app with the same signing context. During development, the app is unsigned. The first DMG may also be unsigned. If users enter their API key in the unsigned build and then update to a signed build, the encrypted key becomes unreadable.

**How to avoid:**
1. Decide early whether the initial release will be signed or unsigned, and stay consistent.
2. If unsigned for initial release, add a migration path: store the API key in plaintext initially (behind a flag), or provide a UI to re-enter the key.
3. Document this for users: "If you update from version X to Y, you may need to re-enter your API key."
4. The `loadApiKey()` function already returns `null` when decryption fails (`safeStorage.isEncryptionAvailable()` check), which is a graceful degradation. But the user experience is silent failure -- consider logging a warning.

**Warning signs:**
- `safeStorage.decryptString()` returns garbage or throws after signing changes
- Users report needing to re-enter API key after update
- `hasApiKey()` returns true but `loadApiKey()` returns null

**Phase to address:**
Phase 1 -- document the signing strategy. Phase 2 (onboarding) -- handle the UX gracefully.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| `asar: false` to skip asar debugging | Faster to get native modules working | Larger app size, slower startup, antivirus false positives | Acceptable during initial packaging debug; must fix before release |
| Hardcoded port for Next.js server | Simpler code | Race conditions if port is in use, port conflicts with other instances | Never -- the current random port approach is correct |
| `nodeIntegration: true, contextIsolation: false` | Easy access to Node.js/Electron from renderer | Major security vulnerability -- any XSS gets full system access | Acceptable for MVP since all content is local; must fix before any remote content is loaded |
| `globalThis` for main process <-> Next.js communication | Works in dev, zero setup | Breaks in production due to process boundary | Never in production -- this is the current blocker (see Pitfall 4) |
| Skipping `electron-rebuild` in build script | Faster build iterations | Silent ABI mismatch failures in packaged app | Never -- must be in every production build |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| better-sqlite3 + Electron | Installing against system Node, packaging without rebuild | Run `electron-rebuild` as part of build pipeline; verify with `file node_modules/better-sqlite3/build/Release/better_sqlite3.node` showing correct arch |
| sherpa-onnx-node + Next.js standalone | Assuming Next.js tracing will include the native module and its model-loading code | Verify `.next/standalone/node_modules/sherpa-onnx-node/` exists after build; use `outputFileTracingIncludes` if missing |
| uiohook-napi + packaged app | Assuming the module can load from within asar | Add to `asarUnpack`; verify binary appears in `app.asar.unpacked/` |
| Electron safeStorage + unsigned DMG | Encrypting with unsigned app identity, then distributing signed updates | Decide signing strategy before first release; plan for key re-entry |
| macOS afrecord + packaged app | Assuming system utilities are available from packaged app context | `afrecord` is a system tool at `/usr/bin/afrecord` -- verify it is callable from the packaged app's spawn context |
| Claude Agent SDK + Electron spawn | Running SDK inside Next.js server process where Electron APIs are unavailable | Keep SDK calls in the Electron main process, communicate results to Next.js via IPC or HTTP |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Loading sherpa-onnx model on app startup | 2-3 second startup delay, 230MB memory spike | Keep lazy loading (current approach is correct -- only load on first voice use) | First voice use always has delay; acceptable |
| SQLite WAL mode without cleanup | `shrew.db-wal` grows unbounded over time | Add periodic checkpointing: `db.pragma('wal_checkpoint(TRUNCATE)')` on app quit | After hundreds of executions without restart |
| Multiple native module loads per session | Each `import()` re-resolves and `dlopen`s the module | Cache the import result; use singleton pattern (VoiceRecognizer already does this) | With many rapid voice commands |
| Large DMG from including full node_modules | DMG bloat (200MB+), slow download and install | Ensure electron-builder's default devDependency exclusion works; audit package size | Every build if native module inclusion is too broad |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| `nodeIntegration: true, contextIsolation: false` | Any loaded page has full Node.js access; XSS = RCE | Move to `contextIsolation: true` with `preload` scripts; acceptable for now since all pages are local |
| Storing API key in plaintext | Key readable by any process with file access | Current approach using `safeStorage` is correct; just be aware of signing identity issue |
| Loading Next.js pages from remote URLs in production | Could allow injection attacks via DNS poisoning | Never load remote URLs; always use local Next.js server (current approach is correct) |
| No Content Security Policy | Renderer can load arbitrary scripts | Add CSP headers in Next.js config for defense in depth |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Silent failure when native module fails to load | Voice input stops working with no indication | Show error state in voice bar; log to file for debugging |
| App appears in Dock when it should be menu-bar only | Confusing presence in Dock + menu bar | Ensure `app.dock.hide()` is called (check if this is in current code) |
| No feedback during model download (230MB) | User thinks app is frozen | Current onboarding has progress callback; verify it works with actual download speed |
| Next.js server crash shows blank window | User sees empty white window with no explanation | Add error handling that shows a native dialog if health check fails after timeout |

## "Looks Done But Isn't" Checklist

- [ ] **DMG builds without error:** electron-builder can produce a DMG even with broken native module paths -- verify the DMG actually runs, not just that it builds
- [ ] **App launches and shows tray icon:** Verify tray icon appears and has correct default state
- [ ] **Voice input flow works end-to-end:** Right Cmd -> record -> transcribe -> execute -> summary -- test the full chain in packaged app
- [ ] **Settings page loads:** Verify CSS/JS assets load (confirms Next.js static files are correct)
- [ ] **API key persists across restart:** Encrypt, quit, relaunch, verify decryption works
- [ ] **Database operations work:** Execute a prompt, verify it appears in history
- [ ] **Native modules load:** Check console for any `MODULE_NOT_FOUND` or `NODE_MODULE_VERSION` errors
- [ ] **Keyboard shortcut works in packaged app:** uIOhook may behave differently in packaged context (sandbox, hardened runtime)
- [ ] **Model download works from packaged app:** The fetch to modelscope.cn must work from within the app context
- [ ] **afrecord works when called from packaged app:** System utility spawning may have path differences

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Native modules not in package | LOW | Fix `electron-builder.yml` files config, rebuild DMG |
| Static files not served | LOW | Fix `extraResources` mapping, rebuild DMG |
| Native modules ABI mismatch | LOW | Add `electron-rebuild` to build pipeline, rebuild DMG |
| globalThis process boundary | MEDIUM | Replace with IPC or HTTP communication; requires code changes |
| safeStorage signing change | MEDIUM | Add migration logic or key re-entry UX |
| asar breaks dlopen paths | MEDIUM | Debug with `asar: false` first, then fix unpacking patterns |
| Next.js tracing misses packages | LOW | Add to `outputFileTracingIncludes`, rebuild |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Native modules excluded from package | Phase 1: DMG Packaging | `ls` inside the DMG/app to verify native module files present |
| Static files not served | Phase 1: DMG Packaging | Load `/settings` in packaged app, check browser dev tools for 404s |
| Native modules ABI mismatch | Phase 1: DMG Packaging | `electron-rebuild` in build script; test DB access in packaged app |
| globalThis process boundary | Phase 1: DMG Packaging | Test `/api/chat` endpoint in packaged app returns actual result, not 503 |
| asar breaks dlopen | Phase 1: DMG Packaging | Test voice recognition in packaged app |
| safeStorage signing identity | Phase 1: DMG Packaging | Test API key encrypt/decrypt round-trip in packaged app |
| Standalone path resolution | Phase 1: DMG Packaging | Verify Next.js server starts and serves pages |
| ELECTRON_RUN_AS_NODE limitations | Phase 2: End-to-end | Verify no Electron API imports in Next.js server code paths |

## Sources

- Electron asar archives documentation: https://github.com/electron/electron/blob/main/docs/tutorial/asar-archives.md (Context7 verified, HIGH confidence)
- Electron native modules guide: https://github.com/electron/electron/blob/main/docs/tutorial/using-native-node-modules.md (Context7 verified, HIGH confidence)
- electron-builder configuration docs: https://www.electron.build/configuration/contents (WebFetch verified, HIGH confidence)
- electron-builder two package.json structure: https://github.com/electron-userland/electron-builder/blob/master/pages/tutorials/two-package-structure.md (Context7 verified, HIGH confidence)
- Next.js standalone output docs: https://nextjs.org/docs/app/api-reference/config/next-config-js/output (WebFetch verified, HIGH confidence)
- Next.js serverExternalPackages docs: https://github.com/vercel/next.js/blob/canary/docs/01-app/03-api-reference/05-config/01-next-config-js/serverExternalPackages.mdx (Context7 verified, HIGH confidence)
- Electron safeStorage API: https://github.com/electron/electron/blob/main/docs/api/safe-storage.md (Context7 verified, HIGH confidence)
- Electron app.isPackaged: https://github.com/electron/electron/blob/main/docs/api/app.md (Context7 verified, HIGH confidence)
- Project source code analysis: electron-builder.yml, scripts/build-electron.mjs, electron/main.ts, src/app/api/chat/route.ts, src/lib/sherpa.ts, src/lib/keychain.ts (Direct code review, HIGH confidence)

---
*Pitfalls research for: macOS Electron + Next.js standalone + native modules packaging*
*Researched: 2026-04-22*
