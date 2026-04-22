# Feature Research

**Domain:** Voice-driven AI coding assistant (macOS desktop)
**Researched:** 2026-04-22
**Confidence:** HIGH (codebase fully analyzed; competitor landscape researched via web)

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Push-to-talk voice input | Core value prop: "press key, speak, done". Without it the product is not what it claims to be. | LOW | Already implemented: uiohook-napi right Cmd hook + afrecord. Debounce at 200ms works. |
| Local speech-to-text transcription | Users expect voice to work without internet latency. Privacy expectation for developer tools. | MEDIUM | sherpa-onnx SenseVoice Int8 integrated. Model download (~230MB) during onboarding. Needs testing on Intel Macs where ONNX runtime behavior differs. |
| Real-time status feedback | "Did it hear me? Is it working?" Users need continuous confirmation. Without it, voice tools feel broken. | LOW | Two-layer state machine (AppState + SdkSubState) drives tray dot colors (gray/blue/green/red/yellow). Voice bar shows recording/transcribing/editing states. |
| Secure API key storage | Developers know their API key is sensitive. Plaintext storage = instant distrust. | LOW | Electron safeStorage wraps macOS Keychain. Implemented in keychain.ts. |
| Transcript review before execution | Users want to verify/correct what was heard before it hits Claude. Voice recognition is imperfect. | LOW | Voice bar editing state shows textarea with transcript. Send and Append buttons. Already implemented in VoiceInput.tsx. |
| Cancel execution | Long-running Claude tasks need abort. Users expect Cmd+C equivalent. | MEDIUM | AbortController passed through to Claude Agent SDK query(). IPC voice:cancel channel. Needs verification that abort cleans up DB state correctly. |
| Onboarding flow | First-launch must guide through: permissions, model download, API key, working directory. Missing any step = user stuck. | HIGH | 6-step Onboarding component exists: welcome, accessibility (polling), model-download (progress bar + skip), api-key (live validate), cwd picker, done. Needs end-to-end validation in packaged build. |
| Basic error handling | Network failures, invalid API keys, microphone permission denied, model not downloaded. Each needs a clear user-visible message, not a silent failure. | MEDIUM | Partially implemented: store transitions to 'error' state, voice bar shows error messages. Gaps: error recovery paths not all tested, no retry mechanism for transient failures. |
| Working directory selection | Claude needs a cwd to operate in. Users must be able to set and change this. | LOW | Settings page with directory picker (native dialog). Stored in settings.json. Default ~/Documents. |
| Menu bar presence | macOS utility apps live in the menu bar. Users expect to find it there, not in Dock. | LOW | ShrewTray implemented with dynamic icon generation. Context menu with Settings and Quit. Click toggles summary popup. |

### Differentiators (Competitive Advantage)

Features that set the product apart from using Claude Code directly, or from competitors like Superwhisper + Claude Code combo.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Single-keystroke activation (right Cmd) | Friction reduction: no modal, no click, no Cmd+Tab. One keypress from any app. This is the core differentiator vs. typing or clicking. | LOW | uiohook-napi global hook. 200ms debounce prevents double-fire. Right Cmd is chosen because it has no standard macOS binding. |
| Voice append mode | User can add more speech to a transcript without starting over. Handles the "wait, let me also say..." case naturally. | MEDIUM | voice:request-append IPC + append-recording action in state machine. Voice bar appends new transcript to existing text. |
| Pixel-level tray status dot | Subtle, always-visible, zero-click status. 5 colors encode full state without opening any window. Information density in minimal pixels. | LOW | 22x22 RGBA buffer dynamically generated in tray.ts. 3-second green-to-gray timer on completion. Pattern: gray=idle, blue=active, green=success, red=error, yellow=rate-limited. |
| Execution history with cost tracking | Developers want to see what Claude did and how much it cost. Makes the tool trustworthy and auditable. | LOW | SQLite execution_history table: prompt, summary, duration, turns, cost_usd, timestamps. SummaryPopup shows last 5 executions. Already functional. |
| Local-only voice processing | Zero audio data leaves the machine. Privacy advantage over cloud STT (Whisper API, Google, etc.). Important for enterprise developers working on proprietary code. | MEDIUM | sherpa-onnx runs entirely in-process. SenseVoice model is ~230MB one-time download. Tradeoff: slightly lower accuracy than cloud Whisper for English-heavy content. |
| Transparent floating voice bar | Non-intrusive overlay at screen bottom. Doesn't steal focus or disrupt workflow. Appears only when speaking, disappears after send. | MEDIUM | VoiceBarWindow: frameless, transparent, always-on-top, positioned at cursor's screen bottom center. BrowserWindow lifecycle managed per-recording session. |
| Summary popup with live execution status | Click tray icon to see current execution details. Quick access without switching to a full app window. | MEDIUM | SummaryPopupWindow: positioned below tray, blur-to-close, shows active execution + last 5 history items. Real-time updates via IPC. |

### Anti-Features (Commonly Requested, Often Problematic)

Features deliberately excluded from v1, with rationale.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Full conversation UI (message stream, code blocks, tool call details) | "I want to see what Claude is doing step by step." | Turns Shrew into a Claude Code GUI clone. Massive UI surface area. Duplicates existing tools (claude.ai, Cursor, Claude Code itself). Undermines the "speak and forget" minimal-interaction value. | Tray dot + summary popup give just-enough status. For detailed inspection, users should use Claude Code directly. v2 can add a minimal "last result" view. |
| Text input box | "What if I'm in a meeting and can't talk?" | Adds a second input modality that must be maintained and tested. Encourages use as a general Claude client rather than a voice tool. Scope creep toward chat app. | Users can already edit the transcript in the voice bar before sending. For silent work, use Claude Code CLI directly. |
| Tool call confirmation dialogs | "I want to approve file writes before they happen." | Breaks the hands-free flow. Every confirmation requires a click, defeating the voice-driven workflow. Adds complex UI for permissions that Claude Agent SDK already handles via permission modes. | Use Claude's bypassPermissions mode for trusted workflows. Use default permission mode (which auto-approves reads, prompts for writes) for cautious use. Permission mode is configurable in settings. |
| Multi-session management | "I want to run multiple Claude tasks in parallel." | Requires session isolation, parallel state management, window-per-session or tab UI. Significant complexity for a tool whose value is single-action simplicity. | One execution at a time. Queue or abort pattern. The tray dot communicates whether Shrew is busy. |
| Custom shortcut key configuration | "I want to use a different key." | Exponential testing matrix: every key combination has different interactions with different apps. uiohook-napi behavior varies by key. Support burden is high. | Right Command is chosen because it has no standard macOS binding and is ergonomically accessible. Revisit if user demand is strong. |
| Windows support | "Why is this Mac only?" | uiohook-napi (global hooks), afrecord (audio recording), safeStorage (Keychain), Accessibility permission flow -- all platform-specific. Porting means rebuilding 60% of the native layer. | macOS-only for v1. The architecture (Electron + Next.js) could theoretically port, but every native module integration needs a Windows equivalent. |
| Auto-update | "How do I get new versions?" | Adds update server infrastructure, code signing requirements, delta update logic. Significant operational complexity for a v1 tool. | Manual download for now. Electron's autoUpdater module can be added later once distribution is established. Requires Apple Developer certificate for signed DMGs. |
| Voice command grammar / natural language intent parsing | "Say 'create a file called X' and it understands the intent." | Adds NLU layer on top of STT. Increases latency. Duplicates what Claude already does. The whole point is to pass raw speech to Claude and let it figure out intent. | Raw transcript goes directly to Claude. Let the LLM handle intent understanding -- that is literally its job. |
| Plugin/extension system | "Let me add custom voice commands." | Massive architecture change. Requires plugin API, sandboxing, lifecycle management. v1 product with zero users does not need an ecosystem. | Direct Claude Agent SDK integration handles any task. If a user can describe it, Claude can do it. |

## Feature Dependencies

```
[Push-to-talk voice input]
    |
    +--requires--> [Global keyboard hook (uiohook-napi)]
    |                  +--requires--> [macOS Accessibility permission]
    |
    +--triggers--> [Audio recording (afrecord)]
                       +--triggers--> [Local transcription (sherpa-onnx)]
                                          +--requires--> [SenseVoice model download]
                                          |                 +--requires--> [Onboarding: model step]
                                          |
                                          +--produces--> [Transcript text]
                                                            |
                                                            v
                                                     [Voice bar: editing state]
                                                            |
                                                            +--user sends--> [Claude execution]
                                                            |                    +--requires--> [API key (safeStorage)]
                                                            |                    |                 +--requires--> [Onboarding: API key step]
                                                            |                    |
                                                            |                    +--requires--> [Working directory]
                                                            |                    |                 +--requires--> [Onboarding: cwd step]
                                                            |                    |
                                                            |                    +--produces--> [Execution result]
                                                            |                                      |
                                                            |                                      v
                                                            |                               [SQLite history record]
                                                            |                               [Tray dot: green (success) / red (error)]
                                                            |
                                                            +--user appends--> [Append recording]
                                                                                    +--loops back to--> [Audio recording]

[Menu bar tray] --always visible--> [Tray status dot]
                                       |
                                       +--reflects--> [AppState + SdkSubState]
                                       |
                                       +--click--> [Summary popup]
                                                       +--shows--> [Active execution]
                                                       +--shows--> [Last 5 history items]
                                                       +--requires--> [SQLite DB]

[Onboarding flow]
    +--step 1--> [Welcome]
    +--step 2--> [Accessibility permission check]
    +--step 3--> [Model download (skippable)]
    +--step 4--> [API key validation]
    +--step 5--> [Working directory selection]
    +--step 6--> [Done]

[Cancel execution] --conflicts with--> [Active Claude execution]
    (abort terminates the running process; state must transition cleanly to idle)
```

### Dependency Notes

- **Voice input requires Accessibility permission:** uiohook-napi cannot capture global keyboard events without it. Onboarding must check and guide the user through System Preferences. Permission can be revoked by the user at any time; Shrew must detect this gracefully.
- **Transcription requires model download:** sherpa-onnx needs the SenseVoice ONNX file (~230MB) at runtime. The model download step in onboarding is skippable (user can download later), but first voice use will fail without it. A lazy-download or clearer warning is needed.
- **Execution requires API key + working directory:** Both are configured during onboarding. If either is missing at execution time, the tool must surface a clear error (not just a red dot).
- **Cancel execution conflicts with active execution:** AbortController.abort() must cleanly terminate the Claude SDK query. The state machine must transition to 'idle' regardless of whether the abort succeeds cleanly. DB record should be updated to status='cancelled'.
- **Tray dot reflects combined state:** The dot color is determined by both AppState and SdkSubState. The 3-second green-to-gray timer on completion means the user has a brief window to see success before it fades to idle.
- **Onboarding is a prerequisite gate:** The app checks hasApiKey() on launch. If false, it opens the onboarding window instead of the main window. Onboarding completion triggers window recreation.

## MVP Definition

### Launch With (v1)

Minimum viable product -- what is needed to validate that voice-driven Claude execution works.

- [x] Push-to-talk voice input (right Cmd) -- already implemented, needs packaged-build validation
- [x] Local speech-to-text (sherpa-onnx SenseVoice) -- implemented, needs Intel Mac testing
- [x] Transcript editing before send -- implemented in voice bar
- [x] Claude execution via Agent SDK -- implemented, streaming works in dev
- [x] Real-time status via tray dot -- implemented, 5 color states
- [x] Secure API key storage -- implemented via safeStorage
- [x] Working directory selection -- implemented in settings
- [ ] **Complete onboarding flow in packaged build** -- code exists but untested in DMG
- [ ] **End-to-end flow works after packaging** -- dev mode works, production build untested
- [ ] **Error handling covers all failure modes** -- gaps identified (see below)
- [ ] **DMG installs and runs on both Apple Silicon and Intel Macs** -- native module rebuild must target both architectures

### Add After Validation (v1.x)

Features to add once the core voice-to-Claude loop is proven in a real DMG.

- [ ] Voice append improvement -- smoother transition, visual feedback during append recording
- [ ] Better error recovery -- retry for transient failures (network, rate limit), auto-recover from error state
- [ ] Summary popup enhancements -- execution duration formatting, tool count display, cost breakdown
- [ ] Model download resilience -- resume interrupted downloads, verify model integrity after download
- [ ] Accessibility permission re-check -- detect when permission is revoked and re-prompt
- [ ] Settings page polish -- validate API key on save, test working directory writability

### Future Consideration (v2+)

Features to defer until product-market fit is established.

- [ ] Full conversation UI -- only if users consistently need to see detailed Claude output
- [ ] Text input mode -- only if voice-first workflow has proven adoption
- [ ] Custom shortcut keys -- only after user feedback demands it
- [ ] Auto-update -- requires code signing and update infrastructure
- [ ] Windows support -- requires rebuilding the native layer
- [ ] Multi-session management -- only if single-session proves insufficient

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Push-to-talk voice input | HIGH | LOW (done) | P1 |
| Local transcription | HIGH | MEDIUM (done, needs validation) | P1 |
| Transcript editing | HIGH | LOW (done) | P1 |
| Claude execution | HIGH | MEDIUM (done, needs validation) | P1 |
| Tray status dot | HIGH | LOW (done) | P1 |
| Onboarding flow | HIGH | HIGH (exists, needs DMG testing) | P1 |
| End-to-end in packaged build | HIGH | HIGH (native module rebuild + electron-builder) | P1 |
| Secure API key storage | HIGH | LOW (done) | P1 |
| Working directory selection | MEDIUM | LOW (done) | P1 |
| Error handling completeness | HIGH | MEDIUM (partial, gaps exist) | P1 |
| Voice append mode | MEDIUM | MEDIUM (done, needs polish) | P2 |
| Execution history display | MEDIUM | LOW (done) | P2 |
| Summary popup | MEDIUM | MEDIUM (done, needs polish) | P2 |
| Model download resilience | MEDIUM | MEDIUM | P2 |
| Settings page polish | LOW | LOW | P2 |
| Better error recovery | MEDIUM | MEDIUM | P2 |
| Full conversation UI | MEDIUM | HIGH | P3 |
| Text input mode | LOW | MEDIUM | P3 |
| Custom shortcuts | LOW | HIGH | P3 |
| Auto-update | LOW | HIGH | P3 |
| Windows support | LOW | VERY HIGH | P3 |

**Priority key:**
- P1: Must have for launch -- the DMG must have these working
- P2: Should have, add when possible -- polish and resilience
- P3: Nice to have, future consideration -- scope expansion

## Competitor Feature Analysis

| Feature | Superwhisper | Cursor | Claude Code (CLI) | Shrew |
|---------|-------------|--------|-------------------|-------|
| Voice input | System-wide, always listening or push-to-talk | None | None | Push-to-talk (right Cmd) |
| Speech-to-text | Cloud + local options (Whisper) | N/A | N/A | Local only (SenseVoice) |
| AI code execution | No -- outputs text to active app | Inline tab completion, chat pane | Terminal-based agentic tool | Voice to Claude Agent SDK |
| Status feedback | System overlay | Inline in editor | Terminal output | Menu bar dot + voice bar |
| Chinese language support | Limited | N/A | N/A | Strong (SenseVoice) |
| Privacy (voice data) | Sends to cloud for some modes | N/A | N/A | Fully local voice processing |
| Execution history | No | Session-based | Terminal history | SQLite with cost tracking |
| Setup complexity | Download + permissions | Download + open project | npm install + API key | Onboarding wizard (6 steps) |
| Hands-free operation | Yes (dictation) | No | No | Yes (voice to execution) |

**Key competitive insight:** Superwhisper users have been observed using it to "talk to Cursor and Claude Code" -- they dictate voice into those tools manually. Shrew integrates this workflow natively: voice goes directly to Claude execution without the copy-paste middle step. The tradeoff is that Shrew gives up Superwhisper's system-wide text insertion in favor of task execution.

**Key competitive insight:** Claude Code CLI requires typing commands in a terminal. For developers already in a text editor or browser, switching to terminal to type a command is friction. Shrew removes that friction: one keystroke from any context.

## Error Handling Patterns (Expected by Users)

| Error Scenario | User Expectation | Current Handling | Gap |
|----------------|-----------------|------------------|-----|
| No microphone permission | Clear message + link to System Preferences | Voice bar shows generic error | Needs specific "open System Preferences" action |
| No Accessibility permission | Clear message + link to System Preferences | uIOhook silently fails | ShortcutManager.start() logs error but user sees nothing |
| API key invalid/expired | "Check your API key" with link to settings | API validation in onboarding only | Runtime 401 errors from Claude need to surface to user |
| Model not downloaded | "Download the voice model first" with action | Transcription will fail silently | Needs pre-flight check before recording starts |
| Network offline | "No internet connection" -- clear and actionable | No explicit handling | Claude SDK will fail but error message may be unclear |
| Rate limited by Anthropic | "Rate limited, try again in X seconds" | Tray turns yellow | Good start, but no duration estimate or auto-retry |
| Claude execution timeout | "Task took too long" with option to retry or abort | No explicit timeout | AbortController exists but no timeout threshold set |
| Recording too short / no speech | "Didn't hear anything, try again" | voice:error with Chinese message | Works but message could be more specific |
| SQLite corruption / disk full | Graceful degradation, don't crash | Unhandled | DB operations have no try-catch in several paths |
| Working directory not found | "Directory does not exist, pick a new one" | Claude will fail with path error | Settings should validate directory exists on save |

## Sources

- **Codebase analysis:** Full read of all 15+ source files in electron/ and src/ directories
- **Competitor: Superwhisper** -- superwhisper.com (web analysis April 2026)
- **Competitor: Cursor** -- cursor.sh (known from training data, HIGH confidence)
- **Competitor: Claude Code CLI** -- Anthropic documentation, direct product knowledge
- **Sherpa-onnx SenseVoice:** Official ModelScope repository for model details
- **uiohook-napi:** npm registry documentation for global hook capabilities
- **Claude Agent SDK:** @anthropic-ai/claude-agent-sdk ^0.2.0, query() API with AsyncGenerator

---
*Feature research for: Voice-driven AI coding assistant (macOS desktop)*
*Researched: 2026-04-22*
