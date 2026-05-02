# Shrew UI Revision Design

Date: 2026-05-02
Status: Approved

## Overview

Full UI revision of Shrew desktop app to unify visual language, establish a component library, and align with the detailed spec in `shrew-claude-code-ui-revision-spec.md`.

## Scope

**10 pages** to create or revise:
1. Chat main page (`/chat`) — revamp
2. Settings home (`/settings`) — restructure from single page to card directory
3. Settings detail: Provider (`/settings/provider`) — new
4. Settings detail: Voice (`/settings/voice`) — new
5. Settings detail: Runtime (`/settings/runtime`) — new
6. Settings detail: Preferences (`/settings/preferences`) — new
7. Settings detail: Privacy (`/settings/privacy`) — new
8. Persona page (`/persona`) — revamp
9. Memory page (`/memory`) — revamp
10. Skills page (`/skills`) — revamp
11. Services page (`/services`) — revamp
12. Onboarding (`/onboarding`) — switch to dark theme
13. Voice-bar (`/voice-bar`) — minor color adjustments

**Preserved as-is:** `/detail` page

**Total shared components:** 12

**Data layer:** UI-only. No backend/store/IPC changes. Missing data points (memory summaries, skill last-used, service last-checked) use frontend placeholders.

## Approach: Component-First, Page-by-Page Rewrite

1. Set up Tailwind + CSS variables foundation
2. Build 12 shared components in `src/components/ui/`
3. Rewrite pages one by one in priority order (chat → settings → persona → memory → skills → services → onboarding → voice-bar)

## Section 1: Foundation Layer

### 1.1 Tailwind + CSS Variables

Add `src/app/globals.css` with the full color palette from spec §6 as CSS variables. Configure `tailwind.config.ts` to reference these variables as theme colors, font sizes (spec §7.2), border radii (spec §8.1), and spacing (spec §5.2).

Font stack (spec §7.1):
```
Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif
```

### 1.2 Layout Root

Modify `layout.tsx` to import `globals.css` and set body background to `var(--bg-app)`.

### 1.3 Window Size

In `electron/main.ts`, adjust main window dimensions:
- Width: 920px (min 880px)
- Height: 640px (min 620px)
- Corner radius: 20px

Native macOS title bar (no custom Window Bar component needed).

## Section 2: Component Library

All components live in `src/components/ui/`.

### 2.1 Page Skeleton

| Component | Purpose | Key Props |
|-----------|---------|-----------|
| `PageHeader` | Back button + title + subtitle + right actions | `title, subtitle, onBack, actions` |
| `BottomActionBar` | Fixed bottom bar for edit pages | `children` |

### 2.2 Content Organization

| Component | Purpose | Key Props |
|-----------|---------|-----------|
| `SectionHeader` | Section title with optional action | `title, description, action` |
| `SummaryCard` | Overview card for settings home | `title, status, summary, onClick` |
| `ListCard` | List item card | `children, className` |

### 2.3 Form Controls

| Component | Purpose | Key Props |
|-----------|---------|-----------|
| `SingleLineInput` | 40px single-line input | `label, helperText, value, onChange` |
| `Textarea` | Multi-line input, min 88px | `label, helperText, value, onChange` |
| `Select` | 40px dropdown | `label, options, value, onChange` |

### 2.4 Actions

| Component | Purpose | Key Props |
|-----------|---------|-----------|
| `Button` | Primary / secondary / ghost variants | `variant, size, children, onClick, disabled` |
| `ChipGroup` | Single-select chip group | `options, value, onChange` |

### 2.5 Status Display

| Component | Purpose | Key Props |
|-----------|---------|-----------|
| `StatusBadge` | Status tag (connected, unconfigured, enabled) | `status, label` |
| `EmptyState` | Empty state (icon + title + description + action) | `icon, title, description, action` |

### Cleanup

Delete unused components: `StatusDot.tsx`, `TaskCardExpanded.tsx`, `TaskRowCollapsed.tsx`.

## Section 3: Route Architecture

### 3.1 Routes

| Route | Type | Status |
|-------|------|--------|
| `/chat` | Revamp | Main page, always first |
| `/settings` | Restructure | Card directory page |
| `/settings/provider` | New | Model & credentials |
| `/settings/voice` | New | Voice recognition config |
| `/settings/runtime` | New | Working directory |
| `/settings/preferences` | New | Interaction preferences |
| `/settings/privacy` | New | Data & privacy |
| `/persona` | Revamp | Persona config |
| `/memory` | Revamp | Memory management |
| `/skills` | Revamp | Skill management |
| `/services` | Revamp | MCP connections |
| `/detail` | Preserved | No changes |
| `/onboarding` | Revamp | Dark theme |
| `/voice-bar` | Minor | Color palette update |

### 3.2 Navigation

Keep existing IPC-based navigation (`ipcRenderer.send('navigate:route', ...)`). Secondary pages use `PageHeader` back button with `window.history.back()`. Settings home cards link to `/settings/*` detail pages.

## Section 4: Chat Page

Structure: fixed header + scrollable message stream + fixed input area.

- **Header**: Avatar + "Shrew" + status text + settings button. Single status position only (spec §12.4).
- **Message stream**: User right-aligned, assistant left-aligned, system centered. Code/path highlighting.
- **Input area**: Multi-line textarea. Left: `/clear` hint. Right: mic button + send button. Enter sends, Shift+Enter newlines.
- **Busy state**: Input disabled with clear visual indicator.

## Section 5: Settings System

### 5.1 Settings Home

Grouped card directory with 5 `SummaryCard` components. Each card shows: group name, current status badge, one-line summary, right arrow.

Groups: Model & Credentials, Voice, Runtime Environment, Interaction Preferences, Data & Privacy.

### 5.2 Settings Detail Pages

Unified skeleton: `PageHeader` + scrollable form content + `BottomActionBar` with single "Save" button.

Each detail page uses `SectionHeader` for grouping and shared form components. "Test Connection" and "Browse" are local action buttons, not additional save buttons.

## Section 6: Remaining Pages

### 6.1 Persona Page

4 grouped sections with `SectionHeader`:
1. **Basic Identity**: Avatar, name, bio
2. **Personality Expression**: ChipGroup selectors for personality, tone, detail level
3. **Collaboration Preferences**: ChipGroup for clarification preference, work style
4. **Advanced Settings**: Collapsible custom System Prompt textarea

Bottom: single "Save Changes" button.

### 6.2 Memory Page

Top: title + "Add Memory" button.

1. **Memory Overview**: Summary card with 2-4 bullet points (frontend placeholder)
2. **Filter row**: Type filter dropdown
3. **Memory list**: ListCard per item with type badge, content, source, date, status, text-labeled action buttons (edit, pin, deactivate, delete)

### 6.3 Skills Page

3 sections:
1. **Enabled Skills**: ListCard per skill with name, description, status, config button
2. **Pending/Errored**: Conditional section for skills needing configuration
3. **Add Skills**: Import area (.md, .zip, folder) with SKILL.md hint

### 6.4 Services Page

Top: description card explaining MCP in user-friendly language.

1. **Connected Services**: ListCard per service with name, description, connection status, last-checked time, action buttons (configure, test, reconnect, disconnect)
2. **Empty State**: EmptyState component explaining what services are, why empty, how to start

### 6.5 Onboarding

Keep multi-step flow. Switch from light (`#fafafa`) to dark theme using new color palette.

### 6.6 Voice-bar

Minor color adjustments to match new palette. Structure unchanged.

## Section 7: Cleanup

- Remove all inline styles from rewritten pages
- Remove duplicate `@keyframes` definitions scattered across files
- Consolidate animation definitions into `globals.css`
- Delete unused components: `StatusDot.tsx`, `TaskCardExpanded.tsx`, `TaskRowCollapsed.tsx`
- Remove per-page repeated font-family declarations
