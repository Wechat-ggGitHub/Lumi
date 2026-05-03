# 标题栏统一 & Tray 菜单文案优化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the macOS title bar visually unified with the page content, and simplify the tray right-click menu text.

**Architecture:** Switch both BrowserWindow instances to `titleBarStyle: 'hidden'` so the page content extends behind the native traffic lights. Add drag region CSS to header components so the window remains movable. Adjust top padding on all headers to accommodate the traffic light buttons.

**Tech Stack:** Electron BrowserWindow API, Tailwind CSS, React components

---

### Task 1: Update BrowserWindow config in electron/main.ts

**Files:**
- Modify: `electron/main.ts:978-992` (createMainWindow)
- Modify: `electron/main.ts:994-1007` (createOnboardingWindow)

- [ ] **Step 1: Update createMainWindow with hidden titlebar**

In `electron/main.ts`, find `createMainWindow()` (line 978). Replace the BrowserWindow options:

```typescript
function createMainWindow(): void {
  mainWindow = new BrowserWindow({
    width: 920,
    height: 640,
    minWidth: 880,
    minHeight: 620,
    show: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#faf9f5',
    trafficLightPosition: { x: 16, y: 18 },
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });
  mainWindow.loadURL(`http://127.0.0.1:${serverPort}/chat`);
  mainWindow.once('ready-to-show', () => mainWindow?.show());
}
```

- [ ] **Step 2: Update createOnboardingWindow with hidden titlebar**

Find `createOnboardingWindow()` (line 994). Replace:

```typescript
function createOnboardingWindow(): void {
  mainWindow = new BrowserWindow({
    width: 600,
    height: 500,
    show: false,
    resizable: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#faf9f5',
    trafficLightPosition: { x: 16, y: 18 },
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });
  mainWindow.loadURL(`http://127.0.0.1:${serverPort}/onboarding`);
  mainWindow.once('ready-to-show', () => mainWindow?.show());
}
```

- [ ] **Step 3: Commit**

```bash
git add electron/main.ts
git commit -m "feat: use hidden titlebar for unified background color"
```

---

### Task 2: Add drag region to PageHeader component

**Files:**
- Modify: `src/components/ui/PageHeader.tsx`

`PageHeader` is shared by 10 pages (settings, memory, persona, skills, services, detail, and 4 settings sub-pages). Adding drag region and top padding here covers all of them at once.

- [ ] **Step 1: Update PageHeader with drag region and traffic light padding**

Replace the entire `PageHeader` component:

```typescript
'use client';

import { type ReactNode } from 'react';
import { Button } from './Button';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  actions?: ReactNode;
}

export function PageHeader({ title, subtitle, onBack, actions }: PageHeaderProps) {
  return (
    <div className="flex-shrink-0 px-page-x pt-12 pb-4" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
      <div className="flex items-center justify-between mb-1" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <div className="flex items-center gap-3">
          {onBack && (
            <Button variant="ghost" size="sm" onClick={onBack}>
              ← 返回
            </Button>
          )}
          <h1 className="text-page-title text-text-primary">{title}</h1>
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
      {subtitle && (
        <p className="text-page-subtitle text-text-muted mt-1">
          {subtitle}
        </p>
      )}
    </div>
  );
}
```

Key changes:
- Outer div: `pt-page-top` → `pt-12` (48px top padding to clear traffic lights), added `WebkitAppRegion: 'drag'`
- Inner content row: added `WebkitAppRegion: 'no-drag'` so buttons and text are clickable/selectable

- [ ] **Step 2: Commit**

```bash
git add src/components/ui/PageHeader.tsx
git commit -m "feat: add drag region and traffic light padding to PageHeader"
```

---

### Task 3: Add drag region to ChatHeader component

**Files:**
- Modify: `src/components/chat/ChatHeader.tsx`

ChatHeader is only used by `/chat` page and has its own layout distinct from PageHeader.

- [ ] **Step 1: Update ChatHeader with drag region and traffic light padding**

Replace the return JSX in the `ChatHeader` function. Change the outer div from:

```tsx
<div className="flex-shrink-0 px-4 py-3 border-b border-line-default flex items-center gap-2.5">
```

to:

```tsx
<div className="flex-shrink-0 px-4 pt-12 pb-3 border-b border-line-default flex items-center gap-2.5" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
```

And wrap the inner content (everything inside the outer div) in a `no-drag` container. The full updated return:

```tsx
  return (
    <div className="flex-shrink-0 px-4 pt-12 pb-3 border-b border-line-default flex items-center gap-2.5" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
      <div className="w-9 h-9 rounded-full bg-brand-soft flex items-center justify-center text-label text-brand font-semibold flex-shrink-0" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        S
      </div>
      <div className="flex-1 min-w-0" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <div className="text-card-title text-text-primary">Shrew</div>
        {isActive && (
          <div className="text-label-xs text-text-muted flex items-center gap-1 mt-0.5">
            <span className={`w-1.5 h-1.5 rounded-full ${dotColor} animate-pulse`} />
            {statusText}
          </div>
        )}
      </div>
      <div style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <HeaderDropdown
          items={menuItems}
          dividerIndex={4}
          trigger={
            <svg className="w-5 h-5 text-text-muted hover:text-text-primary transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5ZM12 12.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5ZM12 18.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5Z" />
            </svg>
          }
        />
      </div>
    </div>
  );
```

Key changes:
- `py-3` → `pt-12 pb-3` (top padding for traffic lights)
- Outer div: `WebkitAppRegion: 'drag'`
- Avatar div, text div, dropdown wrapper: `WebkitAppRegion: 'no-drag'`

- [ ] **Step 2: Commit**

```bash
git add src/components/chat/ChatHeader.tsx
git commit -m "feat: add drag region and traffic light padding to ChatHeader"
```

---

### Task 4: Add top padding to Onboarding component

**Files:**
- Modify: `src/components/Onboarding.tsx`

The onboarding page has no header — it centers content vertically. With `titleBarStyle: 'hidden'`, the traffic lights sit on top of the page content. We need to add top padding so the onboarding UI isn't obscured.

- [ ] **Step 1: Add top padding to Onboarding container**

In `src/components/Onboarding.tsx`, find the outer container div (line 160):

```tsx
<div className="flex justify-center items-center min-h-screen bg-bg-app">
```

Change to:

```tsx
<div className="flex justify-center items-center min-h-screen bg-bg-app pt-8">
```

This pushes content down enough to clear the traffic lights while keeping the centered layout.

- [ ] **Step 2: Commit**

```bash
git add src/components/Onboarding.tsx
git commit -m "feat: add top padding to onboarding for traffic light clearance"
```

---

### Task 5: Simplify Tray right-click menu text

**Files:**
- Modify: `electron/tray.ts:157-163`

- [ ] **Step 1: Update context menu template**

Find the contextMenu construction in `electron/tray.ts` (line 157):

```typescript
this.contextMenu = Menu.buildFromTemplate([
  { label: 'Shrew', type: 'normal', enabled: false },
  { type: 'separator' },
  { label: '设置...', click: () => this.openSettings() },
  { type: 'separator' },
  { label: '退出 Shrew', role: 'quit' },
]);
```

Replace with:

```typescript
this.contextMenu = Menu.buildFromTemplate([
  { label: '设置', click: () => this.openSettings() },
  { type: 'separator' },
  { label: '退出', role: 'quit' },
]);
```

Changes:
- Removed disabled "Shrew" title and its separator
- "设置..." → "设置" (removed ellipsis)
- "退出 Shrew" → "退出"
- One separator between the two items

- [ ] **Step 2: Commit**

```bash
git add electron/tray.ts
git commit -m "feat: simplify tray right-click menu text"
```

---

### Task 6: Build and verify

- [ ] **Step 1: Build Electron main process**

Run: `npm run build:electron`
Expected: Build succeeds with no errors

- [ ] **Step 2: Run dev mode and visually verify**

Run: `npm run electron:dev`

Verify:
1. Main window title bar is hidden — page background extends to top edge
2. Traffic light buttons (close/minimize/maximize) are visible and don't overlap header content
3. Header area is draggable (click and drag in the header area moves the window)
4. Buttons and interactive elements in headers still work (not swallowed by drag)
5. Tray icon right-click shows "设置" and "退出" (simplified text)
6. Onboarding page content is not obscured by traffic lights
7. Settings page, chat page, and other sub-pages all have proper top padding

- [ ] **Step 3: Final commit if any adjustments needed**

If any visual tweaks are needed (padding values, traffic light position), commit them:

```bash
git add -A
git commit -m "fix: adjust titlebar padding and drag regions after visual verification"
```
