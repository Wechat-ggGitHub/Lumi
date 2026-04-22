# Stack Research

**Domain:** macOS desktop app packaging (Electron + Next.js standalone + native modules)
**Researched:** 2026-04-22
**Confidence:** HIGH (core tooling), MEDIUM (sherpa-onnx DYLD_LIBRARY_PATH in packaged app)

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| electron-builder | 25.1.8 (installed) | macOS DMG/ZIP packaging | De facto standard for Electron packaging. Handles code signing, notarization, asar, native module discovery, DMG creation. No viable alternative for this use case. |
| @electron/rebuild | 4.0.4 (installed) | Rebuild native modules against Electron ABI | Required because better-sqlite3 (C++ addon) must be compiled against Electron's Node.js headers, not system Node.js. sherpa-onnx-node uses prebuilds but rebuild validates them. uiohook-napi uses prebuilds that match by Electron version. |
| esbuild | 0.28.0 (installed) | Bundle Electron main process TypeScript to CJS | Already in use. Fast, handles path aliases, marks native modules as external. No reason to switch. |
| Electron | 35.7.5 (installed) | Desktop runtime | Required by the app. v35 uses Node.js 22, which is current LTS. |
| Next.js 15 | ^15.0.0 (installed) | UI framework in standalone mode | Already in use. `output: 'standalone'` produces self-contained server output. |

### Supporting Libraries (Packaging Concerns)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| better-sqlite3 | 11.10.0 (installed) | SQLite C++ addon | Requires `@electron/rebuild` before packaging. Output: `build/Release/better_sqlite3.node` (~26MB with build artifacts). Must be in `node_modules` at runtime. |
| sherpa-onnx-node | 1.12.39 (installed) | Voice recognition JS wrapper | Loads native binary from sibling package `sherpa-onnx-darwin-arm64` via `require('../sherpa-onnx-darwin-arm64/sherpa-onnx.node')`. The sibling package contains `.node` + 4 `.dylib` files totaling ~72MB. |
| sherpa-onnx-darwin-arm64 | (optional dep of sherpa-onnx-node) | Native ONNX runtime binaries | Platform-specific. Contains `sherpa-onnx.node`, `libsherpa-onnx-c-api.dylib`, `libsherpa-onnx-cxx-api.dylib`, `libonnxruntime.dylib`, `libonnxruntime.1.24.4.dylib`. On macOS, dylibs must be resolvable at runtime. |
| uiohook-napi | 1.5.5 (installed) | Global keyboard/mouse hooks | Uses prebuilds at `prebuilds/darwin-arm64/uiohook-napi.node` (~84KB). No rebuild needed if Electron version matches prebuild target. |
| @anthropic-ai/claude-agent-sdk | 0.2.117 (installed) | Claude execution | Pure JS/ESM module (~3.8MB). No native code. Marked external in esbuild. Must be resolvable at runtime. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| electron-builder | Build + package | Config via `electron-builder.yml`. Run as `electron-builder` CLI. |
| esbuild | Bundle main process | Config in `scripts/build-electron.mjs`. Marks native modules as `external`. |
| @electron/rebuild | Rebuild native modules | Run as `npm run rebuild` before packaging. Must run AFTER `npm install`, BEFORE `electron-builder`. |

## Installation

```bash
# Already installed. If rebuilding from scratch:
npm install

# Rebuild native modules against Electron's Node.js headers
npm run rebuild

# Build and package
npm run electron:build
```

## The Core Problem: Why the Current DMG is Broken

The current `electron-builder.yml` has this configuration:

```yaml
files:
  - "dist-electron/**/*"
  - "!node_modules/**/*"
```

This **completely excludes** `node_modules` from the packaged app. But the Electron main process (`dist-electron/main.js`, built by esbuild) has `better-sqlite3`, `sherpa-onnx-node`, `uiohook-napi`, and `@anthropic-ai/claude-agent-sdk` marked as `external`. At runtime, `require('better-sqlite3')` resolves through `node_modules`. With `node_modules` excluded, every native module load fails.

The `asarUnpack` patterns (`**/*.node`, `**/*.dylib`, `**/*.so`) are correct in principle but have nothing to unpack because the files they reference were never included in the asar.

## The Fix: Correct electron-builder.yml

There are two approaches. **Approach A (recommended)** keeps the single-package.json structure. **Approach B** uses the two-package.json structure that electron-builder officially documents.

### Approach A: Single package.json (Recommended for This Project)

This is simpler and avoids restructuring the project. The key insight: electron-builder automatically includes production `dependencies` from `package.json` and excludes `devDependencies`. You do NOT need to explicitly exclude `node_modules` -- electron-builder handles this.

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
asar: true
asarUnpack:
  - "**/*.node"
  - "**/*.dylib"
  - "**/*.so"
  - "node_modules/better-sqlite3/**"
  - "node_modules/sherpa-onnx-node/**"
  - "node_modules/sherpa-onnx-darwin-arm64/**"
  - "node_modules/sherpa-onnx-darwin-x64/**"
  - "node_modules/uiohook-napi/**"
extraResources:
  - from: ".next/standalone"
    to: ".next/standalone"
    filter:
      - "**/*"
  - from: ".next/static"
    to: ".next/static"
  - from: "public"
    to: "public"
files:
  - "dist-electron/**/*"
  - "package.json"
  # Do NOT exclude node_modules -- let electron-builder handle it.
  # It auto-includes production dependencies and excludes devDependencies.
```

**Why this works:**
1. `files` includes `dist-electron/**/*` (the bundled main process) and `package.json`
2. electron-builder reads `dependencies` from `package.json` and auto-includes them in the asar
3. `asarUnpack` tells electron-builder to extract the native `.node`/`.dylib` files from the asar archive so they can be loaded via `require()` (Electron cannot load native modules from inside an asar)
4. `extraResources` copies the Next.js standalone output outside the asar to `Contents/Resources/.next/standalone/`
5. `devDependencies` (electron, electron-builder, esbuild, typescript, etc.) are automatically excluded

**Confidence: HIGH** -- This follows the standard electron-builder single-package.json pattern documented in the official README: "A key feature is the automatic exclusion of development dependencies."

### Critical: sherpa-onnx DYLD_LIBRARY_PATH

sherpa-onnx-node loads `sherpa-onnx.node` from the sibling `sherpa-onnx-darwin-arm64` package. The `.node` file depends on companion `.dylib` files (`libsherpa-onnx-c-api.dylib`, `libonnxruntime.dylib`, etc.) being resolvable at runtime.

On macOS, **SIP (System Integrity Protection) strips `DYLD_LIBRARY_PATH` for all system processes**. Electron apps launched from DMG or `/Applications` are subject to this. The `.dylib` files must be co-located with the `.node` file so they can be found via `@rpath` or relative paths.

The `asarUnpack` patterns above extract the entire `sherpa-onnx-darwin-arm64` directory with all `.dylib` files intact. The directory structure is preserved: `node_modules/sherpa-onnx-darwin-arm64/sherpa-onnx.node` stays alongside the `.dylib` files.

**Potential issue:** If the `.dylib` files use `@rpath`-based install_name entries, they may not resolve when loaded from the unpacked asar location (`app.asar.unpacked/node_modules/sherpa-onnx-darwin-arm64/`). This may require either:
1. Setting `DYLD_LIBRARY_PATH` in the Electron main process before loading sherpa-onnx (works because Electron sets env for its own process)
2. Using `@electron/rebuild` which may handle rpath correction
3. As a last resort, using `extraResources` to copy the dylib files to a known location and setting `DYLD_LIBRARY_PATH` explicitly

**Confidence: MEDIUM** -- The dylib resolution depends on how the sherpa-onnx prebuilds were linked. Needs testing after the basic packaging fix.

**Mitigation code for electron/main.ts:**
```typescript
// Before loading sherpa-onnx, ensure dylibs are resolvable
if (!isDev) {
  const sherpaNativeDir = path.join(
    process.resourcesPath, 'app.asar.unpacked',
    'node_modules', 'sherpa-onnx-darwin-arm64'
  );
  if (fs.existsSync(sherpaNativeDir)) {
    const existing = process.env.DYLD_LIBRARY_PATH || '';
    if (!existing.includes(sherpaNativeDir)) {
      process.env.DYLD_LIBRARY_PATH = `${sherpaNativeDir}:${existing}`;
    }
  }
}
```

### Approach B: Two-package.json Structure (Alternative)

electron-builder's official tutorial recommends splitting into root `package.json` (dev) and `app/package.json` (production). This avoids the `node_modules` inclusion problem entirely because only `app/node_modules` is packaged.

**Why NOT recommended for this project:**
1. Requires restructuring the project (moving `electron/`, `src/`, `dist-electron/` into an `app/` subdirectory)
2. Breaks the existing `electron:dev` workflow that references root-level paths
3. The Next.js standalone output references root-level `node_modules` for `serverExternalPackages`
4. esbuild aliases (`@` -> `src`) reference root-level paths
5. Significant refactoring for no clear benefit over Approach A

**Confidence: HIGH** that Approach A is better for this project's existing structure.

## Build Pipeline (Corrected)

The build pipeline remains the same but the order and configuration matter:

```
1. npm install                    # Install all deps
2. npm run rebuild                # Rebuild native modules for Electron
3. next build                     # Produces .next/standalone/ + .next/static/
4. node scripts/build-electron.mjs # esbuild bundles electron/main.ts -> dist-electron/main.js
5. electron-builder               # Packages into DMG using corrected electron-builder.yml
```

This is already what `electron:build` script does:
```json
"electron:build": "next build && node scripts/build-electron.mjs && electron-builder"
```

The `rebuild` step must happen before this (it's a separate `npm run rebuild` command).

## @electron/rebuild Specifics

```bash
# Rebuild ALL native modules against Electron's Node.js
npm run rebuild

# Or target specific modules only:
npx electron-rebuild -m . -o better-sqlite3 sherpa-onnx-node uiohook-napi
```

**Important:** `@electron/rebuild` v4.x automatically detects:
- Electron version from `devDependencies`
- Native modules via `node-gyp` build detection
- `prebuild`/`prebuild-install` based modules (like uiohook-napi)

For **better-sqlite3**: Rebuild is mandatory. It's a C++ addon that compiles against Node.js headers.

For **sherpa-onnx-node**: Uses platform-specific prebuilds (not node-gyp). `@electron/rebuild` may skip it, but the prebuilds should work if the Node.js ABI version matches. Electron 35 uses Node.js 22 -- verify that sherpa-onnx-darwin-arm64 prebuilds target Node.js 22 or N-API v9+.

For **uiohook-napi**: Uses N-API prebuilds. N-API is ABI-stable across Node.js versions, so prebuilds should work without rebuild. Verify by checking if `napi` is in the prebuild filename or if the `.node` file uses N-API symbols.

**Confidence: HIGH** for better-sqlite3, MEDIUM for sherpa-onnx/uiohook-napi prebuild compatibility.

## asar vs asarUnpack Strategy

### What asar does
electron-builder packs the app directory into a single `app.asar` archive. Electron can read files from asar transparently for most operations, but **cannot load native `.node` modules from asar** because Node.js's `dlopen` requires a real file path.

### What asarUnpack does
Patterns listed in `asarUnpack` are extracted from the asar into `app.asar.unpacked/` alongside the asar archive. Electron's `require()` automatically checks `app.asar.unpacked` when a file exists there.

### Recommended asarUnpack patterns
```yaml
asarUnpack:
  # Generic: extract all native binaries
  - "**/*.node"
  - "**/*.dylib"
  - "**/*.so"
  # Specific: ensure entire native module directories are unpacked
  # (needed because JS loader files must coexist with .node files)
  - "node_modules/better-sqlite3/**"
  - "node_modules/sherpa-onnx-node/**"
  - "node_modules/sherpa-onnx-darwin-arm64/**"
  - "node_modules/sherpa-onnx-darwin-x64/**"  # Include x64 for Intel Macs
  - "node_modules/uiohook-napi/**"
```

**Why both generic patterns AND specific directories:**
- `**/*.node` catches any native addon binary anywhere
- `**/*.dylib` catches shared libraries
- Specific directory patterns ensure the JS wrapper files (like `sherpa-onnx-node/addon.js`) are also unpacked, maintaining the relative path structure between JS loader and native binary

**Confidence: HIGH**

## extraResources Strategy

```yaml
extraResources:
  - from: ".next/standalone"
    to: ".next/standalone"
    filter:
      - "**/*"
  - from: ".next/static"
    to: ".next/static"
  - from: "public"
    to: "public"
```

Files in `extraResources` are copied to `Contents/Resources/` in the macOS app bundle. The Electron main process accesses them via `process.resourcesPath`.

The current code in `electron/main.ts` correctly references this:
```typescript
const standaloneDir = path.join(process.resourcesPath, '.next', 'standalone');
const serverScript = path.join(standaloneDir, 'server.js');
```

**Potential issue with standalone node_modules:** The Next.js standalone output includes its own `node_modules` (next, react, react-dom, sharp, etc.). The standalone server.js uses these. This is separate from the Electron main process's native module requirements. Both coexist because:
- Electron main process loads native modules from `app.asar.unpacked/node_modules/`
- Next.js standalone server loads its deps from `Contents/Resources/.next/standalone/node_modules/`

**Confidence: HIGH**

## Package Size Estimate

| Component | Size | Notes |
|-----------|------|-------|
| Electron runtime | ~80MB | Compressed in DMG |
| dist-electron/ | <1MB | Bundled JS |
| better-sqlite3 | ~5MB | After stripping build artifacts |
| sherpa-onnx-darwin-arm64 | ~72MB | 4 dylibs + 1 .node file |
| uiohook-napi | ~84KB | Small prebuild |
| @anthropic-ai/claude-agent-sdk | ~3.8MB | Pure JS |
| Next.js standalone | ~61MB | Includes server + runtime deps |
| .next/static | ~1MB | Static assets |
| **Total estimate** | **~150-200MB DMG** | Compressed |

The current broken DMG was 122MB. With native modules properly included, expect ~150-200MB.

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| single package.json + explicit files | two-package.json structure | Only if starting from scratch or project already structured that way |
| asarUnpack for native modules | `asar: false` entirely | If asar causes persistent issues with native module loading, but increases install size and slows startup |
| @electron/rebuild | node-gyp rebuild manually | Only for debugging; @electron/rebuild is the standard tool |
| electron-builder | electron-forge | If you need multi-platform CI, custom makers, or prefer webpack. But electron-builder has simpler YAML config and better DMG support. Not worth migrating. |
| esbuild for main process | webpack for main process | If you need webpack's plugin ecosystem. esbuild is 100x faster and sufficient. |
| native modules in node_modules | native modules via extraResources + custom require path | Only as last resort. The `node_modules` approach preserves the `require()` resolution chain. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `!node_modules/**/*` in files | Excludes ALL dependencies including native modules the app needs at runtime. This is the root cause of the current broken build. | Remove this exclusion. Let electron-builder auto-include production dependencies. |
| Nextron | Opinionated Electron+Next.js integration that conflicts with the existing standalone server architecture. Would require complete rewrite. | Current esbuild + standalone server approach |
| electron-builder `nodeGypRebuild: true` | Triggers rebuild during packaging, but the rebuild needs to happen before `next build` because standalone output may reference the rebuilt modules. | Run `npm run rebuild` explicitly as a separate step |
| `app.asar.unpacked` require paths in code | Hardcoding `app.asar.unpacked` paths breaks in dev mode. | Use standard `require()` -- Electron resolves asar.unpacked transparently |
| Code signing / notarization in initial fix | Adds complexity. Get the build working first, then add signing. | Add `entitlements` and `notarize` config in a follow-up |
| electron-builder `buildDependenciesFromSource` | Rebuilds all deps from source -- overkill and slow for prebuild-based modules | `@electron/rebuild` targeting only native modules |

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| electron@35.7.5 | Node.js 22 ABI | Electron 35 ships Node.js 22.x |
| better-sqlite3@11.10.0 | Node.js 22 after rebuild | Must be rebuilt with @electron/rebuild. Prebuild may also work if it targets N-API. |
| sherpa-onnx-node@1.12.39 | N-API (ABI stable) | Uses prebuilds. Should work across Node.js versions if N-API compatible. Verify the .node file uses N-API symbols. |
| uiohook-napi@1.5.5 | N-API (ABI stable) | Uses prebuilds at `prebuilds/darwin-arm64/`. N-API is ABI-stable so no rebuild needed. |
| electron-builder@25.1.8 | Electron 35.x | Compatible. electron-builder 25.x supports Electron 30+. |
| @electron/rebuild@4.0.4 | Electron 35.x | Compatible. Auto-detects Electron version. |
| esbuild@0.28.0 | Node.js 22 | Compatible. esbuild is not sensitive to Node.js versions. |

## Key Decision: Why NOT Migrate to electron-forge

electron-forge is the other major Electron packaging tool (officially supported by the Electron team). Reasons to stay with electron-builder:

1. **DMG creation**: electron-builder has native DMG support with customizable window layout. electron-forge requires external makers.
2. **Existing config**: Already have `electron-builder.yml`. Migration would be wasted effort.
3. **native module handling**: electron-builder's auto-dependency-detection and asarUnpack are well-documented and proven.
4. **Community**: electron-builder has more Stack Overflow answers and examples for native module packaging.
5. **Notarization**: electron-builder has built-in notarization support. electron-forge delegates to external tools.

## Sources

- electron-builder official docs (Context7: `/electron-userland/electron-builder`) -- files, asarUnpack, two-package.json, mac config
- @electron/rebuild README (Context7: `/electron/rebuild`) -- rebuild API, options
- Project source: `electron-builder.yml`, `scripts/build-electron.mjs`, `electron/main.ts`, `package.json`
- sherpa-onnx-node source: `addon.js`, `addon-static-import.js` -- native resolution logic
- Standalone output: `.next/standalone/` directory inspection

---
*Stack research for: Shrew macOS DMG packaging*
*Researched: 2026-04-22*
