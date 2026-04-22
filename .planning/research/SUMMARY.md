# Project Research Summary

**Project:** Shrew
**Domain:** macOS desktop app -- voice-driven AI coding assistant (Electron + Next.js standalone + native modules)
**Researched:** 2026-04-22
**Confidence:** HIGH

## Executive Summary

Shrew is a macOS menu-bar utility that lets developers press a single key (right Command), speak a task, and have it executed by Claude via the Agent SDK -- all with zero cloud dependency for voice processing. Most of the product is already built: voice capture, local transcription (sherpa-onnx SenseVoice), transcript editing, Claude execution, tray status feedback, and onboarding are all implemented and functional in development mode. The critical gap is packaging -- the current `electron-builder.yml` excludes `node_modules` entirely while esbuild marks native modules as external, so the DMG builds but crashes on launch because `require('better-sqlite3')` and its peers fail.

The recommended approach is to fix the electron-builder configuration to selectively include native modules in the asar (with asarUnpack for `.node`/`.dylib` binaries), add `electron-rebuild` to the build pipeline, fix the static file layout for Next.js standalone, and replace the `globalThis` cross-process communication pattern with IPC. These are configuration and wiring fixes, not new feature development. Once resolved, the end-to-end voice-to-Claude loop should work in the packaged DMG.

The key risks are: (1) sherpa-onnx `.dylib` resolution from the unpacked asar location may require explicit `DYLD_LIBRARY_PATH` management, (2) `globalThis` sharing between the Electron main process and the spawned Next.js server silently breaks in production (it only works in dev), and (3) safeStorage encryption is tied to code signing identity, so users who store API keys in unsigned builds may lose access after signing is added. All three are addressed in the research and have clear mitigation paths.

## Key Findings

### Recommended Stack

The stack is already in place and well-chosen. No technology changes are needed -- the work is purely in build configuration and runtime wiring.

**Core technologies:**
- **electron-builder 25.1.8:** macOS DMG packaging -- de facto standard, handles asar, native module discovery, DMG creation. Current config is wrong but the tool is correct.
- **@electron/rebuild 4.0.4:** Rebuilds native modules against Electron's Node.js ABI -- required for better-sqlite3 (C++ addon). Missing from the `electron:build` script today.
- **esbuild 0.28.0:** Bundles Electron main process TypeScript to CJS -- already working, marks native modules as external (correct).
- **Electron 35.7.5 + Next.js 15 standalone:** Hybrid architecture -- Electron manages windows/system, Next.js serves UI pages on a random port. Two separate module resolution paths must both function.
- **sherpa-onnx-node + SenseVoice Int8:** Local speech-to-text -- privacy advantage, Chinese support stronger than Whisper. ~72MB native binaries + ~230MB lazy-downloaded model.
- **better-sqlite3:** SQLite with WAL mode for execution history -- requires rebuild for Electron ABI, must be in packaged app.
- **uiohook-napi:** Global keyboard hooks for right Command key -- N-API prebuilds, small (~84KB).

### Expected Features

**Must have (table stakes) -- mostly implemented, need packaged-build validation:**
- Push-to-talk voice input (right Command) -- implemented via uiohook-napi
- Local speech-to-text -- implemented via sherpa-onnx SenseVoice, needs Intel Mac testing
- Transcript review and editing before send -- implemented in voice bar
- Real-time status via 5-color tray dot -- implemented, pixel-level RGBA buffer
- Secure API key storage -- implemented via Electron safeStorage + macOS Keychain
- Working directory selection -- implemented in settings
- Onboarding flow (6 steps) -- code exists, untested in DMG
- Error handling for all failure modes -- partially implemented, gaps identified (no retry, some silent failures)

**Should have (competitive differentiators) -- implemented, need polish:**
- Single-keystroke activation -- core differentiator vs. typing or clicking
- Voice append mode -- add more speech without starting over
- Execution history with cost tracking -- SQLite-backed, summary popup shows last 5
- Local-only voice processing -- zero audio data leaves the machine, privacy advantage over Superwhisper

**Defer (v2+):**
- Full conversation UI -- would make Shrew a Claude Code GUI clone, undermines "speak and forget" value
- Text input box -- scope creep toward chat app
- Auto-update -- requires code signing infrastructure
- Windows support -- 60% of native layer needs rewriting
- Multi-session management -- one execution at a time is the simplicity value

### Architecture Approach

The app runs two processes: the Electron main process (native modules, window management, Claude SDK execution, keyboard hooks) and a Next.js standalone server (UI rendering for voice bar, settings, onboarding). The main process spawns the Next.js server with `ELECTRON_RUN_AS_NODE=1` on a random port, then loads windows via `loadURL("http://127.0.0.1:{port}/{route}")`. The critical architectural bug is that `globalThis` is used to share state between these two processes -- this works in dev (where they share a process group) but silently fails in production (separate OS processes, separate memory spaces).

**Major components:**
1. **Electron main process** (`dist-electron/main.js`) -- state machine, native module orchestration, window lifecycle, Claude SDK execution, tray management
2. **Next.js standalone server** (`.next/standalone/server.js`) -- UI page rendering, API routes for chat/status/health
3. **Renderer windows** (voice bar, summary popup, settings, onboarding) -- BrowserWindow instances loading Next.js pages, communicate with main process via IPC
4. **State machine** (`src/lib/store.ts`) -- two-layer architecture: AppState (idle/recording/transcribing/editing/sending/executing) + SdkSubState (thinking/executing_tool/compacting), whitelist-validated transitions

### Critical Pitfalls

1. **Native modules excluded from package** -- `!node_modules/**/*` in electron-builder.yml contradicts the `external` flag in esbuild. Fix: selectively include native module directories, use asarUnpack for binaries.
2. **Next.js static files not served** -- `.next/static` and `public` are copied as siblings of standalone, not inside it. Fix: adjust extraResources `to` paths or add a merge step.
3. **Native modules built for wrong ABI** -- `electron-rebuild` not in the `electron:build` script. Fix: add `npm run rebuild` before packaging.
4. **globalThis does not cross process boundaries** -- main process and spawned Next.js server are separate OS processes. Fix: replace with IPC or eliminate the API route dependency.
5. **safeStorage tied to signing identity** -- unsigned dev builds encrypt differently than signed releases. Fix: decide signing strategy early, plan for key re-entry.

## Implications for Roadmap

### Phase 1: Build Configuration Fix
**Rationale:** Everything else is blocked until the DMG actually runs. The current DMG builds but crashes on launch. This is a configuration-only fix with zero feature code changes.
**Delivers:** A DMG that launches, shows the tray icon, and serves Next.js pages correctly.
**Addresses:** Native module inclusion, static file layout, ABI rebuild, asar unpacking.
**Avoids:** Pitfalls 1-3, 6-7 from PITFALLS.md.

### Phase 2: Cross-Process Communication Fix
**Rationale:** The `globalThis` pattern is a hard blocker for the `/api/chat` endpoint in production. The main process and Next.js server cannot share objects across process boundaries. This must be resolved before any end-to-end flow can work in the packaged app.
**Delivers:** Working Claude execution from the packaged app (voice input -> Claude SDK -> result).
**Addresses:** Pitfall 4 from PITFALLS.md. Recommends Option C (eliminate the API route, use IPC directly) as the cleanest approach.
**Avoids:** Pitfalls 4, 5 from PITFALLS.md.

### Phase 3: End-to-End Validation
**Rationale:** With the DMG building and cross-process communication working, the full voice-to-Claude loop must be validated in the packaged app. This includes onboarding, voice input, transcription, execution, status feedback, and settings persistence.
**Delivers:** A working product that can be used daily.
**Addresses:** All table-stakes features from FEATURES.md -- push-to-talk, transcription, editing, execution, status, API key storage, working directory, onboarding, error handling.
**Avoids:** Pitfall 8 (safeStorage signing), UX pitfalls (silent failures, blank windows).

### Phase 4: Polish and Hardening
**Rationale:** After the core loop works, address resilience gaps: error recovery, model download integrity, accessibility permission re-check, settings validation, and SQLite WAL cleanup.
**Delivers:** A product that degrades gracefully under failure conditions.
**Addresses:** Error handling gaps from FEATURES.md, voice append polish, summary popup enhancements.
**Uses:** All stack elements as validated in Phase 3.

### Phase 5: Distribution Preparation
**Rationale:** Code signing, notarization, and universal binary (arm64 + x64) support are needed before public distribution. These require an Apple Developer certificate and add build pipeline complexity.
**Delivers:** A distributable DMG that passes Gatekeeper on macOS 13+.
**Addresses:** safeStorage signing identity issue (Pitfall 8), Intel Mac support, hardened runtime configuration.

### Phase Ordering Rationale

- Phase 1 must come first because the DMG does not run at all -- every other phase assumes a running app.
- Phase 2 must come before Phase 3 because the `/api/chat` route is the execution entry point; without cross-process communication, Claude execution is impossible in production.
- Phase 3 validates the entire feature set in a real packaged environment, catching integration issues that dev mode cannot surface.
- Phase 4 is deferred polish because "working but brittle" is better than "perfect but not shipped."
- Phase 5 is last because code signing infrastructure requires decisions (Apple Developer account, CI setup) that should not block functional validation.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 2:** The `globalThis` replacement strategy has three options (IPC over stdio, HTTP API, eliminate API route). Needs architectural decision during planning. The IPC pattern for Electron main-to-spawned-child communication has limited documentation for the Next.js standalone use case.
- **Phase 4:** Error recovery patterns (retry logic, state machine error transitions) need design. The current state machine has an `error` state but recovery paths are underspecified.
- **Phase 5:** Code signing and notarization for Electron apps with native modules has specific requirements (entitlements for hardened runtime, notarization with Apple). The sherpa-onnx dylibs may need special entitlement handling.

Phases with standard patterns (skip research-phase):
- **Phase 1:** electron-builder configuration fixes are well-documented. The corrected `electron-builder.yml` is provided verbatim in STACK.md and ARCHITECTURE.md. `asarUnpack` patterns are standard.
- **Phase 3:** End-to-end testing of an Electron app follows standard patterns. The "Looks Done But Isn't" checklist in PITFALLS.md provides a complete verification guide.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All technologies are already in use, versions verified, compatibility confirmed. electron-builder config fix is well-documented. |
| Features | HIGH | Codebase fully analyzed. 8 of 10 table-stakes features are implemented. Remaining work is validation, not implementation. |
| Architecture | HIGH | Component boundaries clearly identified. Two-process architecture is understood. The globalThis bug is precisely diagnosed with clear fix options. |
| Pitfalls | HIGH | All pitfalls verified against Context7 docs (Electron, electron-builder, Next.js). The root cause of the broken DMG is identified with line-level specificity. |

**Overall confidence:** HIGH

### Gaps to Address

- **sherpa-onnx dylib resolution from unpacked asar:** MEDIUM confidence that the current `asarUnpack` patterns are sufficient. May need explicit `DYLD_LIBRARY_PATH` management in `electron/main.ts` (mitigation code provided in STACK.md). Must be tested empirically in Phase 1.
- **Intel Mac compatibility:** sherpa-onnx-darwin-x64 and uiohook-napi prebuilds for Intel have not been verified. Needs testing on Intel hardware or CI in Phase 5.
- **Next.js standalone tracing completeness:** Dynamic imports of native modules (e.g., `await import('sherpa-onnx-node')`) may not be traced by `@vercel/nft`. Must verify `.next/standalone/node_modules/` contents after build. If missing, add `outputFileTracingIncludes`. But this may be moot if the native modules only run in the Electron main process (which is the current architecture).
- **Error state machine recovery paths:** The state machine transitions to `error` but transitions back to `idle` or other states are not all defined. Needs design during Phase 4 planning.

## Sources

### Primary (HIGH confidence)
- Context7: `/electron-userland/electron-builder` -- files config, asarUnpack, two-package.json, mac target
- Context7: `/electron/rebuild` -- rebuild API, native module handling
- Context7: `/vercel/next.js` -- standalone output, serverExternalPackages, outputFileTracingIncludes
- Electron official docs: asar archives, native modules, safeStorage API, app.isPackaged
- Project source code: electron-builder.yml, scripts/build-electron.mjs, electron/main.ts, src/lib/store.ts, src/app/api/chat/route.ts, package.json

### Secondary (MEDIUM confidence)
- sherpa-onnx-node source: addon.js, addon-static-import.js -- native resolution logic, dylib dependency chain
- Competitor analysis: Superwhisper (web, April 2026), Cursor (known from training data), Claude Code CLI (direct product knowledge)
- Standalone output inspection: `.next/standalone/` directory structure, traced node_modules contents

### Tertiary (LOW confidence, needs validation)
- sherpa-onnx DYLD_LIBRARY_PATH behavior in packaged Electron app -- depends on how prebuilds were linked, needs empirical testing
- Intel Mac (x64) native module compatibility -- not tested, needs hardware or CI verification
- macOS hardened runtime entitlements for sherpa-onnx dylibs -- needs testing with actual signing

---
*Research completed: 2026-04-22*
*Ready for roadmap: yes*
