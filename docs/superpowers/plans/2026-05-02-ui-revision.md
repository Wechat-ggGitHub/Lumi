# Aiva UI Revision Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite all Aiva desktop pages using a unified Tailwind + CSS variables design system, 12 shared UI components, and consistent deep dark visual language per the approved spec.

**Architecture:** Component-first approach — build the design token foundation and shared component library first, then rewrite pages one by one. All IPC contracts preserved. No backend changes.

**Tech Stack:** Next.js 15, React 19, Tailwind CSS 4 (via `@tailwindcss/postcss`), TypeScript, Electron 35

---

## Phase 1: Foundation

### Task 1: Install Tailwind CSS and configure PostCSS

**Files:**
- Create: `postcss.config.mjs`
- Create: `tailwind.config.ts`
- Create: `src/app/globals.css`
- Modify: `package.json` (add devDependencies)

- [ ] **Step 1: Install Tailwind CSS and PostCSS dependencies**

```bash
npm install -D tailwindcss @tailwindcss/postcss postcss
```

- [ ] **Step 2: Create PostCSS config**

Create `postcss.config.mjs`:

```js
export default {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};
```

- [ ] **Step 3: Create Tailwind config**

Create `tailwind.config.ts`:

```ts
import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/**/*.{ts,tsx}',
    './src/components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        'bg-app': 'var(--bg-app)',
        'bg-window': 'var(--bg-window)',
        'bg-surface-1': 'var(--bg-surface-1)',
        'bg-surface-2': 'var(--bg-surface-2)',
        'bg-surface-3': 'var(--bg-surface-3)',
        'line-default': 'var(--line-default)',
        'line-strong': 'var(--line-strong)',
        'text-primary': 'var(--text-primary)',
        'text-secondary': 'var(--text-secondary)',
        'text-muted': 'var(--text-muted)',
        'brand': {
          DEFAULT: 'var(--brand-primary)',
          hover: 'var(--brand-primary-hover)',
          soft: 'var(--brand-soft)',
        },
        success: 'var(--success)',
        warning: 'var(--warning)',
        danger: 'var(--danger)',
        info: 'var(--info)',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'BlinkMacSystemFont', '"PingFang SC"', '"Hiragino Sans GB"', '"Microsoft YaHei"', 'sans-serif'],
      },
      fontSize: {
        'window-title': ['13px', { lineHeight: '1.2', fontWeight: '500' }],
        'page-title': ['28px', { lineHeight: '1.2', fontWeight: '700' }],
        'page-subtitle': ['14px', { lineHeight: '1.5', fontWeight: '400' }],
        'section-title': ['16px', { lineHeight: '1.4', fontWeight: '600' }],
        'card-title': ['15px', { lineHeight: '1.4', fontWeight: '600' }],
        body: ['14px', { lineHeight: '1.6', fontWeight: '400' }],
        'body-sm': ['13px', { lineHeight: '1.6', fontWeight: '400' }],
        label: ['12px', { lineHeight: '1.4', fontWeight: '500' }],
        'label-xs': ['11px', { lineHeight: '1.4', fontWeight: '500' }],
      },
      borderRadius: {
        window: '20px',
        card: '16px',
        'card-sm': '14px',
        btn: '12px',
        input: '12px',
        chip: '999px',
      },
      spacing: {
        'page-x': '24px',
        'page-top': '20px',
        'section-gap': '20px',
        'card-p': '16px',
        'widget-gap': '8px',
        'block-gap': '12px',
      },
    },
  },
};

export default config;
```

- [ ] **Step 4: Create globals.css with design tokens and animations**

Create `src/app/globals.css`:

```css
@import "tailwindcss";

:root {
  --bg-app: #0b1020;
  --bg-window: #11172a;
  --bg-surface-1: #151d33;
  --bg-surface-2: #1a2440;
  --bg-surface-3: #202b49;
  --line-default: rgba(255, 255, 255, 0.08);
  --line-strong: rgba(255, 255, 255, 0.14);
  --text-primary: #eef2ff;
  --text-secondary: #c7d0ee;
  --text-muted: #97a3c7;
  --brand-primary: #7c9cff;
  --brand-primary-hover: #92adff;
  --brand-soft: rgba(124, 156, 255, 0.16);
  --success: #6ee7b7;
  --warning: #f6c177;
  --danger: #ff8a8a;
  --info: #7dd3fc;
}

body {
  margin: 0;
  background: var(--bg-app);
  color: var(--text-primary);
}

/* Shared animations */
@keyframes pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.5; transform: scale(1.3); }
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

@keyframes pulse-blue {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

@keyframes blink-yellow {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}

/* Scrollbar styling */
::-webkit-scrollbar {
  width: 6px;
}
::-webkit-scrollbar-track {
  background: transparent;
}
::-webkit-scrollbar-thumb {
  background: var(--line-default);
  border-radius: 3px;
}
::-webkit-scrollbar-thumb:hover {
  background: var(--line-strong);
}
```

- [ ] **Step 5: Update layout.tsx to import globals.css**

Replace `src/app/layout.tsx` entirely:

```tsx
import './globals.css';

export const metadata = { title: 'Aiva' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="font-sans text-text-primary bg-bg-app">
        {children}
      </body>
    </html>
  );
}
```

- [ ] **Step 6: Verify dev server starts**

Run: `npm run dev`
Expected: Server starts at localhost:3000 without errors. Existing pages render (still with old inline styles, which coexist fine with Tailwind).

- [ ] **Step 7: Commit**

```bash
git add postcss.config.mjs tailwind.config.ts src/app/globals.css src/app/layout.tsx package.json package-lock.json
git commit -m "feat: add Tailwind CSS foundation with design tokens"
```

---

### Task 2: Adjust Electron main window dimensions

**Files:**
- Modify: `electron/main.ts:972-984`

- [ ] **Step 1: Update createMainWindow dimensions**

In `electron/main.ts`, change the `createMainWindow` function (lines 972-984) to:

```ts
function createMainWindow(): void {
  mainWindow = new BrowserWindow({
    width: 920,
    height: 640,
    minWidth: 880,
    minHeight: 620,
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });
  mainWindow.loadURL(`http://127.0.0.1:${serverPort}/chat`);
  mainWindow.once('ready-to-show', () => mainWindow?.show());
}
```

- [ ] **Step 2: Commit**

```bash
git add electron/main.ts
git commit -m "feat: set main window to 920x640 with min constraints"
```

---

## Phase 2: Shared Components

### Task 3: Button component

**Files:**
- Create: `src/components/ui/Button.tsx`

- [ ] **Step 1: Create Button component**

Create `src/components/ui/Button.tsx`:

```tsx
'use client';

import { type ButtonHTMLAttributes } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost';
type ButtonSize = 'default' | 'sm' | 'icon';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary: 'bg-brand text-white hover:bg-brand-hover shadow-sm',
  secondary: 'bg-bg-surface-2 border border-line-default text-text-primary hover:border-line-strong',
  ghost: 'bg-transparent text-text-muted hover:text-text-primary hover:bg-bg-surface-2',
};

const sizeStyles: Record<ButtonSize, string> = {
  default: 'h-9 px-3.5 rounded-btn text-body-sm',
  sm: 'h-[30px] px-3 rounded-btn text-label',
  icon: 'w-8 h-8 rounded-btn flex items-center justify-center',
};

export function Button({ variant = 'primary', size = 'default', className = '', disabled, children, ...props }: ButtonProps) {
  return (
    <button
      className={`
        inline-flex items-center justify-center gap-1.5
        transition-colors duration-150 cursor-pointer
        disabled:opacity-40 disabled:cursor-default
        ${variantStyles[variant]}
        ${sizeStyles[size]}
        ${className}
      `}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/ui/Button.tsx
git commit -m "feat: add Button UI component (primary/secondary/ghost)"
```

---

### Task 4: PageHeader component

**Files:**
- Create: `src/components/ui/PageHeader.tsx`

- [ ] **Step 1: Create PageHeader component**

Create `src/components/ui/PageHeader.tsx`:

```tsx
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
    <div className="flex-shrink-0 px-page-x pt-page-top pb-4">
      <div className="flex items-center justify-between mb-1">
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
        <p className="text-page-subtitle text-text-muted mt-1">{subtitle}</p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/ui/PageHeader.tsx
git commit -m "feat: add PageHeader UI component"
```

---

### Task 5: BottomActionBar component

**Files:**
- Create: `src/components/ui/BottomActionBar.tsx`

- [ ] **Step 1: Create BottomActionBar component**

Create `src/components/ui/BottomActionBar.tsx`:

```tsx
'use client';

import { type ReactNode } from 'react';

interface BottomActionBarProps {
  children: ReactNode;
}

export function BottomActionBar({ children }: BottomActionBarProps) {
  return (
    <div className="flex-shrink-0 px-page-x py-4 border-t border-line-default flex items-center justify-end gap-3">
      {children}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/ui/BottomActionBar.tsx
git commit -m "feat: add BottomActionBar UI component"
```

---

### Task 6: SectionHeader component

**Files:**
- Create: `src/components/ui/SectionHeader.tsx`

- [ ] **Step 1: Create SectionHeader component**

Create `src/components/ui/SectionHeader.tsx`:

```tsx
'use client';

import { type ReactNode } from 'react';

interface SectionHeaderProps {
  title: string;
  description?: string;
  action?: ReactNode;
}

export function SectionHeader({ title, description, action }: SectionHeaderProps) {
  return (
    <div className="flex items-center justify-between mb-3">
      <div>
        <h2 className="text-section-title text-text-primary">{title}</h2>
        {description && (
          <p className="text-body-sm text-text-muted mt-0.5">{description}</p>
        )}
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/ui/SectionHeader.tsx
git commit -m "feat: add SectionHeader UI component"
```

---

### Task 7: SummaryCard component

**Files:**
- Create: `src/components/ui/SummaryCard.tsx`

- [ ] **Step 1: Create SummaryCard component**

Create `src/components/ui/SummaryCard.tsx`:

```tsx
'use client';

import { StatusBadge } from './StatusBadge';

type SummaryCardStatus = 'configured' | 'unconfigured' | 'default';

interface SummaryCardProps {
  title: string;
  summary: string;
  status?: SummaryCardStatus;
  onClick?: () => void;
}

const statusLabels: Record<SummaryCardStatus, string> = {
  configured: '已配置',
  unconfigured: '未配置',
  default: '',
};

export function SummaryCard({ title, summary, status, onClick }: SummaryCardProps) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-bg-surface-1 border border-line-default rounded-card p-card-p
        hover:border-line-strong transition-colors duration-150 cursor-pointer"
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-card-title text-text-primary">{title}</span>
        <div className="flex items-center gap-2">
          {status && statusLabels[status] && (
            <StatusBadge status={status === 'configured' ? 'success' : status === 'unconfigured' ? 'warning' : 'default'} label={statusLabels[status]} />
          )}
          <span className="text-text-muted text-label">→</span>
        </div>
      </div>
      <p className="text-body-sm text-text-muted">{summary}</p>
    </button>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/ui/SummaryCard.tsx
git commit -m "feat: add SummaryCard UI component"
```

---

### Task 8: StatusBadge component

**Files:**
- Create: `src/components/ui/StatusBadge.tsx`

- [ ] **Step 1: Create StatusBadge component**

Create `src/components/ui/StatusBadge.tsx`:

```tsx
'use client';

type BadgeStatus = 'success' | 'warning' | 'danger' | 'info' | 'default';

interface StatusBadgeProps {
  status: BadgeStatus;
  label: string;
}

const statusColors: Record<BadgeStatus, string> = {
  success: 'bg-success/15 text-success',
  warning: 'bg-warning/15 text-warning',
  danger: 'bg-danger/15 text-danger',
  info: 'bg-info/15 text-info',
  default: 'bg-bg-surface-3 text-text-muted',
};

export function StatusBadge({ status, label }: StatusBadgeProps) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-chip text-label-xs ${statusColors[status]}`}>
      {label}
    </span>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/ui/StatusBadge.tsx
git commit -m "feat: add StatusBadge UI component"
```

---

### Task 9: ListCard component

**Files:**
- Create: `src/components/ui/ListCard.tsx`

- [ ] **Step 1: Create ListCard component**

Create `src/components/ui/ListCard.tsx`:

```tsx
'use client';

import { type ReactNode } from 'react';

interface ListCardProps {
  children: ReactNode;
  className?: string;
}

export function ListCard({ children, className = '' }: ListCardProps) {
  return (
    <div className={`bg-bg-surface-1 border border-line-default rounded-card-sm p-card-p ${className}`}>
      {children}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/ui/ListCard.tsx
git commit -m "feat: add ListCard UI component"
```

---

### Task 10: Form components (SingleLineInput, Textarea, Select)

**Files:**
- Create: `src/components/ui/SingleLineInput.tsx`
- Create: `src/components/ui/Textarea.tsx`
- Create: `src/components/ui/Select.tsx`

- [ ] **Step 1: Create SingleLineInput component**

Create `src/components/ui/SingleLineInput.tsx`:

```tsx
'use client';

import { type InputHTMLAttributes } from 'react';

interface SingleLineInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: string;
  helperText?: string;
}

export function SingleLineInput({ label, helperText, className = '', ...props }: SingleLineInputProps) {
  return (
    <div className="mb-block-gap">
      {label && <label className="block text-label text-text-muted mb-1">{label}</label>}
      <input
        className={`w-full h-10 px-3 rounded-input bg-bg-surface-2 border border-line-default text-body text-text-primary
          outline-none transition-colors duration-150
          placeholder:text-text-muted
          focus:border-brand
          disabled:opacity-40 ${className}`}
        {...props}
      />
      {helperText && <p className="text-label-xs text-text-muted mt-1">{helperText}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Create Textarea component**

Create `src/components/ui/Textarea.tsx`:

```tsx
'use client';

import { type TextareaHTMLAttributes } from 'react';

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  helperText?: string;
}

export function Textarea({ label, helperText, className = '', ...props }: TextareaProps) {
  return (
    <div className="mb-block-gap">
      {label && <label className="block text-label text-text-muted mb-1">{label}</label>}
      <textarea
        className={`w-full min-h-[88px] px-3 py-2 rounded-input bg-bg-surface-2 border border-line-default text-body text-text-primary
          outline-none resize-y transition-colors duration-150
          placeholder:text-text-muted
          focus:border-brand
          disabled:opacity-40 ${className}`}
        {...props}
      />
      {helperText && <p className="text-label-xs text-text-muted mt-1">{helperText}</p>}
    </div>
  );
}
```

- [ ] **Step 3: Create Select component**

Create `src/components/ui/Select.tsx`:

```tsx
'use client';

interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  label?: string;
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export function Select({ label, options, value, onChange, className = '' }: SelectProps) {
  return (
    <div className="mb-block-gap">
      {label && <label className="block text-label text-text-muted mb-1">{label}</label>}
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className={`w-full h-10 px-3 rounded-input bg-bg-surface-2 border border-line-default text-body text-text-primary
          outline-none cursor-pointer transition-colors duration-150
          focus:border-brand ${className}`}
      >
        {options.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add src/components/ui/SingleLineInput.tsx src/components/ui/Textarea.tsx src/components/ui/Select.tsx
git commit -m "feat: add form UI components (Input, Textarea, Select)"
```

---

### Task 11: ChipGroup component

**Files:**
- Create: `src/components/ui/ChipGroup.tsx`

- [ ] **Step 1: Create ChipGroup component**

Create `src/components/ui/ChipGroup.tsx`:

```tsx
'use client';

interface ChipGroupProps {
  options: string[];
  value: string;
  onChange: (value: string) => void;
}

export function ChipGroup({ options, value, onChange }: ChipGroupProps) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(opt => (
        <button
          key={opt}
          onClick={() => onChange(opt)}
          className={`px-3 py-1 rounded-chip text-body-sm transition-colors duration-150 cursor-pointer
            ${value === opt
              ? 'bg-brand-soft text-brand border border-brand/30'
              : 'bg-bg-surface-2 text-text-muted border border-line-default hover:border-line-strong'
            }`}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/ui/ChipGroup.tsx
git commit -m "feat: add ChipGroup UI component"
```

---

### Task 12: EmptyState component

**Files:**
- Create: `src/components/ui/EmptyState.tsx`

- [ ] **Step 1: Create EmptyState component**

Create `src/components/ui/EmptyState.tsx`:

```tsx
'use client';

import { type ReactNode } from 'react';

interface EmptyStateProps {
  icon?: string;
  title: string;
  description: string;
  action?: ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      {icon && <span className="text-3xl mb-3 opacity-40">{icon}</span>}
      <h3 className="text-section-title text-text-secondary mb-1">{title}</h3>
      <p className="text-body-sm text-text-muted max-w-xs">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/ui/EmptyState.tsx
git commit -m "feat: add EmptyState UI component"
```

---

### Task 13: Delete unused old components

**Files:**
- Delete: `src/components/StatusDot.tsx`
- Delete: `src/components/TaskCardExpanded.tsx`
- Delete: `src/components/TaskRowCollapsed.tsx`

- [ ] **Step 1: Verify these components are unused**

Run: `grep -r "StatusDot\|TaskCardExpanded\|TaskRowCollapsed" src/ --include="*.tsx" --include="*.ts" | grep -v "StatusDot.tsx\|TaskCardExpanded.tsx\|TaskRowCollapsed.tsx"`

Expected: No output (no imports found outside the files themselves).

- [ ] **Step 2: Delete the files**

```bash
rm src/components/StatusDot.tsx src/components/TaskCardExpanded.tsx src/components/TaskRowCollapsed.tsx
```

- [ ] **Step 3: Verify build still works**

Run: `npm run build`
Expected: Build succeeds without errors.

- [ ] **Step 4: Commit**

```bash
git add -u
git commit -m "chore: remove unused StatusDot, TaskCardExpanded, TaskRowCollapsed"
```

---

## Phase 3: Chat Page Rewrite

### Task 14: Rewrite ChatHeader with Tailwind

**Files:**
- Modify: `src/components/chat/ChatHeader.tsx` (full rewrite)

- [ ] **Step 1: Rewrite ChatHeader**

Replace the entire content of `src/components/chat/ChatHeader.tsx`:

```tsx
'use client';

import type { AppState, SdkSubState } from '@/types';
import { Button } from '@/components/ui/Button';

interface ChatHeaderProps {
  appState: AppState;
  sdkSubState: SdkSubState;
  currentToolName?: string;
  onSettingsClick: () => void;
}

function getStatusText(appState: AppState, sdkSubState: SdkSubState, currentToolName?: string): string {
  switch (appState) {
    case 'recording': return '正在听...';
    case 'transcribing': return '正在转写...';
    case 'editing': return '等待发送';
    case 'thinking': return '正在思考...';
    case 'executing':
      if (currentToolName) return `正在执行: ${currentToolName}`;
      return '正在执行...';
    case 'completed': return '已完成';
    case 'error': return '出错';
    default: return '';
  }
}

function getDotColorClass(appState: AppState): string {
  switch (appState) {
    case 'thinking':
    case 'executing': return 'bg-brand';
    case 'completed': return 'bg-success';
    case 'error': return 'bg-danger';
    case 'recording': return 'bg-warning';
    default: return '';
  }
}

export function ChatHeader({ appState, sdkSubState, currentToolName, onSettingsClick }: ChatHeaderProps) {
  const statusText = getStatusText(appState, sdkSubState, currentToolName);
  const dotColor = getDotColorClass(appState);
  const isActive = appState !== 'idle';

  return (
    <div className="flex-shrink-0 px-4 py-3 border-b border-line-default flex items-center gap-2.5">
      <div className="w-9 h-9 rounded-full bg-brand-soft flex items-center justify-center text-label text-brand font-semibold flex-shrink-0">
        S
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-card-title text-text-primary">Aiva</div>
        {isActive && (
          <div className="text-label-xs text-text-muted flex items-center gap-1 mt-0.5">
            <span className={`w-1.5 h-1.5 rounded-full ${dotColor} animate-pulse-blue`} />
            {statusText}
          </div>
        )}
      </div>
      <Button variant="ghost" size="icon" onClick={onSettingsClick}>
        ⚙
      </Button>
    </div>
  );
}
```

- [ ] **Step 2: Verify chat page renders**

Run: `npm run dev`
Expected: Chat page loads, header shows "Aiva" with new brand-soft avatar style.

- [ ] **Step 3: Commit**

```bash
git add src/components/chat/ChatHeader.tsx
git commit -m "feat: rewrite ChatHeader with Tailwind and design tokens"
```

---

### Task 15: Rewrite ChatStream with Tailwind

**Files:**
- Modify: `src/components/chat/ChatStream.tsx` (full rewrite)

- [ ] **Step 1: Rewrite ChatStream**

Replace the entire content of `src/components/chat/ChatStream.tsx`:

```tsx
'use client';

import { useEffect, useRef } from 'react';
import type { ChatMessage } from '@/types';

interface ChatStreamProps {
  messages: ChatMessage[];
  isStreaming: boolean;
}

function formatDate(isoString: string): string {
  const d = new Date(isoString);
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const hours = d.getHours().toString().padStart(2, '0');
  const minutes = d.getMinutes().toString().padStart(2, '0');
  return `${month}月${day}日 ${hours}:${minutes}`;
}

function shouldShowDateDivider(messages: ChatMessage[], index: number): boolean {
  if (index === 0) return true;
  const prev = new Date(messages[index - 1].created_at).toDateString();
  const curr = new Date(messages[index].created_at).toDateString();
  return prev !== curr;
}

function UserMessage({ message }: { message: ChatMessage }) {
  return (
    <div className="flex justify-end mb-3">
      <div className="bg-brand-soft border border-brand/30 rounded-[12px_12px_4px_12px] px-3.5 py-2 max-w-[75%] text-body-sm leading-relaxed whitespace-pre-wrap break-words">
        {message.content}
      </div>
    </div>
  );
}

function AssistantMessage({ message }: { message: ChatMessage }) {
  return (
    <div className="mb-3">
      <div className="bg-bg-surface-1 rounded-[4px_12px_12px_12px] px-3.5 py-2.5 text-body-sm leading-relaxed whitespace-pre-wrap break-words text-text-secondary">
        {message.content || '...'}
      </div>
    </div>
  );
}

function SystemMessage({ message }: { message: ChatMessage }) {
  return (
    <div className="text-center my-2 text-label-xs text-text-muted">
      {message.content}
    </div>
  );
}

export function ChatStream({ messages, isStreaming }: ChatStreamProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <div ref={scrollRef} className="flex-1 overflow-auto px-4 py-4">
      {messages.length === 0 && (
        <div className="h-full flex items-center justify-center text-body-sm text-text-muted">
          按 ⌘ 开始语音对话，或在下方输入文字
        </div>
      )}
      {messages.map((msg, i) => (
        <div key={msg.id}>
          {shouldShowDateDivider(messages, i) && (
            <div className="text-center my-4 text-label-xs text-text-muted">
              {formatDate(msg.created_at)}
            </div>
          )}
          {msg.role === 'user' && <UserMessage message={msg} />}
          {msg.role === 'assistant' && <AssistantMessage message={msg} />}
          {msg.role === 'system' && <SystemMessage message={msg} />}
        </div>
      ))}
      {isStreaming && (
        <div className="flex items-center gap-2 py-1">
          <div className="w-3 h-3 border-2 border-brand/30 border-t-brand rounded-full animate-spin" />
          <span className="text-label text-text-muted">Aiva 正在回复...</span>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify chat page renders with messages**

Run: `npm run dev`
Expected: Chat stream renders with new dark styling, user bubbles right-aligned with brand-soft background.

- [ ] **Step 3: Commit**

```bash
git add src/components/chat/ChatStream.tsx
git commit -m "feat: rewrite ChatStream with Tailwind and design tokens"
```

---

### Task 16: Rewrite ChatInput with Tailwind (multi-line)

**Files:**
- Modify: `src/components/chat/ChatInput.tsx` (full rewrite)

- [ ] **Step 1: Rewrite ChatInput as multi-line**

Replace the entire content of `src/components/chat/ChatInput.tsx`:

```tsx
'use client';

import { useState, useRef, useEffect } from 'react';
import type { AppState } from '@/types';
import { Button } from '@/components/ui/Button';

interface ChatInputProps {
  appState: AppState;
  onSend: (text: string) => void;
  onClear: () => void;
}

export function ChatInput({ appState, onSend, onClear }: ChatInputProps) {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isBusy = appState === 'thinking' || appState === 'executing' || appState === 'recording' || appState === 'transcribing';

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + 'px';
    }
  }, [text]);

  const handleSubmit = () => {
    const trimmed = text.trim();
    if (!trimmed || isBusy) return;

    if (trimmed === '/clear') {
      onClear();
      setText('');
      return;
    }

    onSend(trimmed);
    setText('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="flex-shrink-0 px-page-x py-2.5 border-t border-line-default">
      <div className="flex items-end gap-2 bg-bg-surface-2 border border-line-default rounded-btn p-2 transition-colors focus-within:border-brand">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={isBusy ? '处理中...' : '输入消息，/clear 清空对话'}
          disabled={isBusy}
          rows={1}
          className="flex-1 bg-transparent text-body text-text-primary outline-none resize-none
            placeholder:text-text-muted disabled:opacity-40 min-h-[24px] max-h-[120px] leading-relaxed"
        />
        <Button
          variant="primary"
          size="icon"
          onClick={handleSubmit}
          disabled={isBusy || !text.trim()}
          className="!rounded-full !w-9 !h-9 flex-shrink-0"
        >
          ➤
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify chat page input area**

Run: `npm run dev`
Expected: Multi-line textarea that grows, enter sends, shift+enter newlines.

- [ ] **Step 3: Commit**

```bash
git add src/components/chat/ChatInput.tsx
git commit -m "feat: rewrite ChatInput as multi-line with Tailwind"
```

---

### Task 17: Rewrite chat page container

**Files:**
- Modify: `src/app/chat/page.tsx` (full rewrite of render, preserve IPC logic)

- [ ] **Step 1: Rewrite chat page JSX**

Replace only the `return` block in `src/app/chat/page.tsx` (lines 100-124). The hooks and IPC logic (lines 1-99) stay the same. The new return:

```tsx
  return (
    <div className="h-screen flex flex-col bg-bg-window">
      <ChatHeader
        appState={appState}
        sdkSubState={sdkSubState}
        currentToolName={currentToolName}
        onSettingsClick={handleSettingsClick}
      />
      <ChatStream messages={messages} isStreaming={isStreaming} />
      <ChatInput
        appState={appState}
        onSend={handleSend}
        onClear={handleClear}
      />
    </div>
  );
```

And remove the `ipcRenderer` variable from line 15, since it's used inside hooks via `getIpcRenderer()` directly. Update all references in the hooks to use `getIpcRenderer()` instead.

The full rewritten file:

```tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { ChatHeader } from '@/components/chat/ChatHeader';
import { ChatStream } from '@/components/chat/ChatStream';
import { ChatInput } from '@/components/chat/ChatInput';
import { getIpcRenderer } from '@/lib/electron-ipc';
import type { ChatMessage, AppState, SdkSubState } from '@/types';

export default function ChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [appState, setAppState] = useState<AppState>('idle');
  const [sdkSubState, setSdkSubState] = useState<SdkSubState>(null);
  const [currentToolName, setCurrentToolName] = useState<string | undefined>();

  useEffect(() => {
    const ipcRenderer = getIpcRenderer();
    if (!ipcRenderer) return;

    const historyHandler = (_: unknown, data: { messages: ChatMessage[]; segmentId: string }) => {
      setMessages(data.messages);
    };
    ipcRenderer.on('chat:history', historyHandler);

    const chunkHandler = (_: unknown, data: { messageId: string; content: string; done: boolean }) => {
      if (data.done) return;

      setMessages(prev => {
        const existing = prev.find(m => m.id === data.messageId);
        if (existing) {
          return prev.map(m =>
            m.id === data.messageId
              ? { ...m, content: m.content + data.content }
              : m
          );
        }
        return [...prev, {
          id: data.messageId,
          segment_id: '',
          role: 'assistant' as const,
          content: data.content,
          metadata: null,
          execution_id: null,
          created_at: new Date().toISOString(),
        }];
      });
    };
    ipcRenderer.on('chat:stream-chunk', chunkHandler);

    const stateHandler = (_: unknown, data: { appState: AppState; sdkSubState: SdkSubState; currentToolName?: string }) => {
      setAppState(data.appState);
      setSdkSubState(data.sdkSubState);
      setCurrentToolName(data.currentToolName);
    };
    ipcRenderer.on('chat:state-update', stateHandler);

    const userMessageHandler = (_: unknown, data: { content: string }) => {
      setMessages(prev => [...prev, {
        id: `user-${Date.now()}`,
        segment_id: '',
        role: 'user',
        content: data.content,
        metadata: null,
        execution_id: null,
        created_at: new Date().toISOString(),
      }]);
    };
    ipcRenderer.on('chat:user-message', userMessageHandler);

    const completeHandler = (_: unknown, data: { executionId: string }) => {
      ipcRenderer.send('chat:ready');
    };
    ipcRenderer.on('chat:execution-complete', completeHandler);

    ipcRenderer.send('chat:ready');

    return () => {
      ipcRenderer.removeListener('chat:history', historyHandler);
      ipcRenderer.removeListener('chat:stream-chunk', chunkHandler);
      ipcRenderer.removeListener('chat:state-update', stateHandler);
      ipcRenderer.removeListener('chat:user-message', userMessageHandler);
      ipcRenderer.removeListener('chat:execution-complete', completeHandler);
    };
  }, []);

  const handleSend = useCallback((text: string) => {
    getIpcRenderer()?.send('chat:send-message', { text });
  }, []);

  const handleClear = useCallback(() => {
    getIpcRenderer()?.send('chat:clear');
  }, []);

  const handleSettingsClick = useCallback(() => {
    getIpcRenderer()?.send('navigate:route', { path: '/settings' });
  }, []);

  const isStreaming = appState === 'thinking' || appState === 'executing';

  return (
    <div className="h-screen flex flex-col bg-bg-window">
      <ChatHeader
        appState={appState}
        sdkSubState={sdkSubState}
        currentToolName={currentToolName}
        onSettingsClick={handleSettingsClick}
      />
      <ChatStream messages={messages} isStreaming={isStreaming} />
      <ChatInput
        appState={appState}
        onSend={handleSend}
        onClear={handleClear}
      />
    </div>
  );
}
```

- [ ] **Step 2: Verify full chat page renders**

Run: `npm run dev`
Expected: Chat page with dark bg-window background, new header, message bubbles, multi-line input.

- [ ] **Step 3: Commit**

```bash
git add src/app/chat/page.tsx
git commit -m "feat: rewrite chat page with Tailwind layout"
```

---

## Phase 4: Settings System Rewrite

### Task 18: Rewrite settings home page as card directory

**Files:**
- Modify: `src/app/settings/page.tsx` (full rewrite)

- [ ] **Step 1: Rewrite settings page as card directory**

Replace the entire content of `src/app/settings/page.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { getIpcRenderer } from '@/lib/electron-ipc';
import { PageHeader } from '@/components/ui/PageHeader';
import { SummaryCard } from '@/components/ui/SummaryCard';
import { Button } from '@/components/ui/Button';

type ProviderKey = 'glm-cn' | 'glm-global' | 'anthropic';

interface SettingsSummary {
  provider: ProviderKey;
  modelPreset: string;
  hasApiKey: boolean;
  hasVolcCreds: boolean;
  defaultCwd: string;
  vadTimeout: number;
}

export default function SettingsPage() {
  const [summary, setSummary] = useState<SettingsSummary>({
    provider: 'glm-cn',
    modelPreset: 'opus',
    hasApiKey: false,
    hasVolcCreds: false,
    defaultCwd: '~/Documents',
    vadTimeout: 2,
  });

  useEffect(() => {
    const ipcRenderer = getIpcRenderer();
    ipcRenderer?.invoke('settings:load').then((settings: any) => {
      setSummary(prev => ({
        ...prev,
        provider: settings.provider || 'glm-cn',
        modelPreset: settings.modelPreset || 'opus',
        hasApiKey: settings.hasApiKey || false,
        defaultCwd: settings.defaultCwd || '~/Documents',
        vadTimeout: settings.vadTimeout || 2,
      }));
    });
    ipcRenderer?.invoke('settings:load-volcengine-credentials').then((creds: any) => {
      if (creds) {
        setSummary(prev => ({ ...prev, hasVolcCreds: creds.hasCredentials || false }));
      }
    });
  }, []);

  const navigate = (path: string) => {
    getIpcRenderer()?.send('navigate:route', { path });
  };

  const providerNames: Record<ProviderKey, string> = {
    'glm-cn': 'GLM (国内)',
    'glm-global': 'GLM (国际)',
    anthropic: 'Anthropic',
  };

  const settingsGroups = [
    {
      title: '模型与凭证',
      summary: summary.hasApiKey
        ? `${providerNames[summary.provider]} / ${summary.modelPreset}`
        : '尚未配置 API Key',
      status: summary.hasApiKey ? 'configured' as const : 'unconfigured' as const,
      path: '/settings/provider',
    },
    {
      title: '语音',
      summary: summary.hasVolcCreds ? '豆包语音识别已配置' : '语音识别服务未配置',
      status: summary.hasVolcCreds ? 'configured' as const : 'unconfigured' as const,
      path: '/settings/voice',
    },
    {
      title: '运行环境',
      summary: summary.defaultCwd,
      status: 'configured' as const,
      path: '/settings/runtime',
    },
    {
      title: '交互偏好',
      summary: '发送方式、清空确认等',
      status: 'default' as const,
      path: '/settings/preferences',
    },
    {
      title: '数据与隐私',
      summary: '日志、历史、缓存管理',
      status: 'default' as const,
      path: '/settings/privacy',
    },
  ];

  return (
    <div className="min-h-screen bg-bg-window flex flex-col">
      <PageHeader
        title="设置"
        subtitle="系统配置与偏好"
        onBack={() => navigate('/chat')}
      />

      <div className="flex-1 overflow-auto px-page-x pb-6">
        {/* Navigation cards for related pages */}
        <div className="flex gap-2 mb-section-gap">
          {[
            { path: '/persona', label: '分身设定' },
            { path: '/memory', label: '记忆管理' },
            { path: '/skills', label: '技能管理' },
            { path: '/services', label: '服务连接' },
          ].map(item => (
            <Button key={item.path} variant="secondary" size="sm" onClick={() => navigate(item.path)}>
              {item.label}
            </Button>
          ))}
        </div>

        <div className="flex flex-col gap-3">
          {settingsGroups.map(group => (
            <SummaryCard
              key={group.path}
              title={group.title}
              summary={group.summary}
              status={group.status}
              onClick={() => navigate(group.path)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify settings home page renders**

Run: `npm run dev`, navigate to `/settings`.
Expected: Dark background, 5 SummaryCards with status badges, navigation buttons at top.

- [ ] **Step 3: Commit**

```bash
git add src/app/settings/page.tsx
git commit -m "feat: rewrite settings home as card directory with SummaryCards"
```

---

### Task 19: Create settings detail pages (5 pages)

**Files:**
- Create: `src/app/settings/provider/page.tsx`
- Create: `src/app/settings/voice/page.tsx`
- Create: `src/app/settings/runtime/page.tsx`
- Create: `src/app/settings/preferences/page.tsx`
- Create: `src/app/settings/privacy/page.tsx`

- [ ] **Step 1: Create provider detail page**

Create `src/app/settings/provider/page.tsx`:

```tsx
'use client';

import { useState, useEffect } from 'react';
import { getIpcRenderer } from '@/lib/electron-ipc';
import { PageHeader } from '@/components/ui/PageHeader';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { SingleLineInput } from '@/components/ui/SingleLineInput';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { BottomActionBar } from '@/components/ui/BottomActionBar';
import { StatusBadge } from '@/components/ui/StatusBadge';

type ProviderKey = 'glm-cn' | 'glm-global' | 'anthropic';
type ModelPreset = 'opus' | 'sonnet' | 'haiku';

const PROVIDER_OPTIONS = [
  { value: 'glm-cn', label: 'GLM (国内)' },
  { value: 'glm-global', label: 'GLM (国际)' },
  { value: 'anthropic', label: 'Anthropic' },
];

const MODEL_OPTIONS_MAP: Record<ProviderKey, { value: string; label: string }[]> = {
  'glm-cn': [
    { value: 'opus', label: 'GLM-5.1 — 高性能' },
    { value: 'sonnet', label: 'GLM-5-Turbo — 均衡' },
    { value: 'haiku', label: 'GLM-4.5-Air — 快速' },
  ],
  'glm-global': [
    { value: 'opus', label: 'GLM-5.1 — 高性能' },
    { value: 'sonnet', label: 'GLM-5-Turbo — 均衡' },
    { value: 'haiku', label: 'GLM-4.5-Air — 快速' },
  ],
  anthropic: [
    { value: 'opus', label: 'Claude Opus 4.6 — 高性能' },
    { value: 'sonnet', label: 'Claude Sonnet 4.6 — 均衡' },
    { value: 'haiku', label: 'Claude Haiku 4.5 — 快速' },
  ],
};

export default function ProviderSettingsPage() {
  const [provider, setProvider] = useState<ProviderKey>('glm-cn');
  const [modelPreset, setModelPreset] = useState<ModelPreset>('opus');
  const [apiKey, setApiKey] = useState('');
  const [hasKey, setHasKey] = useState(false);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  useEffect(() => {
    getIpcRenderer()?.invoke('settings:load').then((settings: any) => {
      setProvider(settings.provider || 'glm-cn');
      setModelPreset(settings.modelPreset || 'opus');
      setHasKey(settings.hasApiKey || false);
    });
  }, []);

  const handleSave = async () => {
    setStatus('saving');
    try {
      await getIpcRenderer()?.invoke('settings:save', { provider, modelPreset });
      if (apiKey.trim()) {
        await getIpcRenderer()?.invoke('settings:save-api-key', { key: apiKey.trim() });
        setHasKey(true);
        setApiKey('');
      }
      setStatus('saved');
      setTimeout(() => setStatus('idle'), 2000);
    } catch {
      setStatus('error');
      setTimeout(() => setStatus('idle'), 2000);
    }
  };

  return (
    <div className="min-h-screen bg-bg-window flex flex-col">
      <PageHeader
        title="模型与凭证"
        subtitle="配置 API 服务商和密钥"
        onBack={() => getIpcRenderer()?.send('navigate:route', { path: '/settings' })}
      />

      <div className="flex-1 overflow-auto px-page-x pb-6">
        <div className="mb-section-gap">
          <SectionHeader title="服务商" />
          <Select
            options={PROVIDER_OPTIONS}
            value={provider}
            onChange={v => setProvider(v as ProviderKey)}
          />
        </div>

        <div className="mb-section-gap">
          <SectionHeader title="模型" />
          <Select
            options={MODEL_OPTIONS_MAP[provider]}
            value={modelPreset}
            onChange={v => setModelPreset(v as ModelPreset)}
          />
        </div>

        <div className="mb-section-gap">
          <SectionHeader title="API Key" description="Key 将安全存储在 macOS 钥匙串中" />
          <div className="flex items-center gap-2 mb-2">
            <span className="text-body-sm text-text-muted">当前状态:</span>
            <StatusBadge status={hasKey ? 'success' : 'warning'} label={hasKey ? '已保存' : '未配置'} />
          </div>
          <SingleLineInput
            type="password"
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            placeholder={hasKey ? '输入新 Key 替换' : '输入 API Key'}
          />
          {status === 'saved' && <p className="text-body-sm text-success mt-1">已保存</p>}
          {status === 'error' && <p className="text-body-sm text-danger mt-1">API Key 验证失败，请检查是否正确</p>}
        </div>
      </div>

      <BottomActionBar>
        <Button variant="primary" onClick={handleSave} disabled={status === 'saving'}>
          {status === 'saving' ? '保存中...' : '保存更改'}
        </Button>
      </BottomActionBar>
    </div>
  );
}
```

- [ ] **Step 2: Create voice detail page**

Create `src/app/settings/voice/page.tsx`:

```tsx
'use client';

import { useState, useEffect } from 'react';
import { getIpcRenderer } from '@/lib/electron-ipc';
import { PageHeader } from '@/components/ui/PageHeader';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { SingleLineInput } from '@/components/ui/SingleLineInput';
import { Button } from '@/components/ui/Button';
import { BottomActionBar } from '@/components/ui/BottomActionBar';
import { StatusBadge } from '@/components/ui/StatusBadge';

export default function VoiceSettingsPage() {
  const [appId, setAppId] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [hasCredentials, setHasCredentials] = useState(false);
  const [vadTimeout, setVadTimeout] = useState(2);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [error, setError] = useState('');

  useEffect(() => {
    const ipcRenderer = getIpcRenderer();
    ipcRenderer?.invoke('settings:load').then((settings: any) => {
      setVadTimeout(settings.vadTimeout || 2);
    });
    ipcRenderer?.invoke('settings:load-volcengine-credentials').then((creds: any) => {
      if (creds) {
        setAppId(creds.appId || '');
        setHasCredentials(creds.hasCredentials || false);
      }
    });
  }, []);

  const handleSave = async () => {
    if (appId.trim() && accessToken.trim()) {
      setStatus('saving');
      setError('');
      try {
        await getIpcRenderer()?.invoke('settings:save-volcengine-credentials', {
          appId: appId.trim(),
          accessToken: accessToken.trim(),
        });
        setHasCredentials(true);
        setAccessToken('');
        setStatus('saved');
      } catch (e: any) {
        setError(e?.message || '未知错误');
        setStatus('error');
      }
    }
    await getIpcRenderer()?.invoke('settings:save', { vadTimeout });
    if (status !== 'error') {
      setStatus('saved');
    }
    setTimeout(() => { setStatus('idle'); setError(''); }, 2000);
  };

  return (
    <div className="min-h-screen bg-bg-window flex flex-col">
      <PageHeader
        title="语音"
        subtitle="语音识别服务配置"
        onBack={() => getIpcRenderer()?.send('navigate:route', { path: '/settings' })}
      />

      <div className="flex-1 overflow-auto px-page-x pb-6">
        <div className="mb-section-gap">
          <SectionHeader title="识别服务" description="豆包语音大模型（火山引擎在线识别）" />
          <div className="flex items-center gap-2 mb-3">
            <span className="text-body-sm text-text-muted">连接状态:</span>
            <StatusBadge status={hasCredentials ? 'success' : 'warning'} label={hasCredentials ? '已配置' : '未配置'} />
          </div>
          <SingleLineInput
            label="App ID"
            value={appId}
            onChange={e => setAppId(e.target.value)}
            placeholder={hasCredentials ? '已存储（输入新 ID 替换）' : '输入 App ID'}
          />
          <SingleLineInput
            label="Access Token"
            type="password"
            value={accessToken}
            onChange={e => setAccessToken(e.target.value)}
            placeholder={hasCredentials ? '输入新 Token 替换' : '输入 Access Token'}
          />
          {status === 'error' && <p className="text-body-sm text-danger mt-1">凭证验证失败：{error}</p>}
          {status === 'saved' && <p className="text-body-sm text-success mt-1">已保存</p>}
        </div>

        <div className="mb-section-gap">
          <SectionHeader title="语音静音超时" description="停止说话后多少秒自动结束录音" />
          <input
            type="range" min={1} max={5} step={0.5}
            value={vadTimeout}
            onChange={e => setVadTimeout(Number(e.target.value))}
            className="w-full"
          />
          <span className="text-body-sm text-text-muted">{vadTimeout} 秒</span>
        </div>
      </div>

      <BottomActionBar>
        <Button variant="primary" onClick={handleSave} disabled={status === 'saving'}>
          {status === 'saving' ? '保存中...' : '保存更改'}
        </Button>
      </BottomActionBar>
    </div>
  );
}
```

- [ ] **Step 3: Create runtime detail page**

Create `src/app/settings/runtime/page.tsx`:

```tsx
'use client';

import { useState, useEffect } from 'react';
import { getIpcRenderer } from '@/lib/electron-ipc';
import { PageHeader } from '@/components/ui/PageHeader';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { SingleLineInput } from '@/components/ui/SingleLineInput';
import { Button } from '@/components/ui/Button';
import { BottomActionBar } from '@/components/ui/BottomActionBar';

export default function RuntimeSettingsPage() {
  const [defaultCwd, setDefaultCwd] = useState('~/Documents');
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  useEffect(() => {
    getIpcRenderer()?.invoke('settings:load').then((settings: any) => {
      setDefaultCwd(settings.defaultCwd || '~/Documents');
    });
  }, []);

  const handleBrowse = async () => {
    const path = await getIpcRenderer()?.invoke('settings:pick-directory');
    if (path) setDefaultCwd(path);
  };

  const handleSave = async () => {
    setStatus('saving');
    try {
      await getIpcRenderer()?.invoke('settings:save', { defaultCwd });
      setStatus('saved');
      setTimeout(() => setStatus('idle'), 2000);
    } catch {
      setStatus('error');
      setTimeout(() => setStatus('idle'), 2000);
    }
  };

  return (
    <div className="min-h-screen bg-bg-window flex flex-col">
      <PageHeader
        title="运行环境"
        subtitle="Claude Code 将在工作目录下执行命令"
        onBack={() => getIpcRenderer()?.send('navigate:route', { path: '/settings' })}
      />

      <div className="flex-1 overflow-auto px-page-x pb-6">
        <SectionHeader title="默认工作目录" />
        <div className="flex gap-2">
          <div className="flex-1">
            <SingleLineInput
              value={defaultCwd}
              onChange={e => setDefaultCwd(e.target.value)}
            />
          </div>
          <Button variant="secondary" onClick={handleBrowse}>浏览</Button>
        </div>
      </div>

      <BottomActionBar>
        <Button variant="primary" onClick={handleSave} disabled={status === 'saving'}>
          {status === 'saving' ? '保存中...' : '保存更改'}
        </Button>
      </BottomActionBar>
    </div>
  );
}
```

- [ ] **Step 4: Create preferences detail page**

Create `src/app/settings/preferences/page.tsx`:

```tsx
'use client';

import { PageHeader } from '@/components/ui/PageHeader';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { getIpcRenderer } from '@/lib/electron-ipc';

export default function PreferencesSettingsPage() {
  return (
    <div className="min-h-screen bg-bg-window flex flex-col">
      <PageHeader
        title="交互偏好"
        subtitle="发送方式、清空确认等"
        onBack={() => getIpcRenderer()?.send('navigate:route', { path: '/settings' })}
      />

      <div className="flex-1 overflow-auto px-page-x">
        <EmptyState
          title="即将推出"
          description="交互偏好设置正在开发中，包括发送方式、清空确认等选项。"
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Create privacy detail page**

Create `src/app/settings/privacy/page.tsx`:

```tsx
'use client';

import { PageHeader } from '@/components/ui/PageHeader';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { getIpcRenderer } from '@/lib/electron-ipc';

export default function PrivacySettingsPage() {
  return (
    <div className="min-h-screen bg-bg-window flex flex-col">
      <PageHeader
        title="数据与隐私"
        subtitle="日志、历史、缓存管理"
        onBack={() => getIpcRenderer()?.send('navigate:route', { path: '/settings' })}
      />

      <div className="flex-1 overflow-auto px-page-x">
        <EmptyState
          title="即将推出"
          description="数据与隐私管理功能正在开发中，包括日志查看、历史记录管理和缓存清理。"
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Verify all settings routes render**

Run: `npm run dev`, navigate to `/settings`, then click into each card.
Expected: Settings home shows 5 cards, each navigates to its detail page with dark theme, proper headers, and back buttons.

- [ ] **Step 7: Commit**

```bash
git add src/app/settings/
git commit -m "feat: add 5 settings detail pages (provider, voice, runtime, preferences, privacy)"
```

---

## Phase 5: Secondary Pages Rewrite

### Task 20: Rewrite persona page

**Files:**
- Modify: `src/app/persona/page.tsx` (full rewrite)

- [ ] **Step 1: Rewrite persona page**

Replace the entire content of `src/app/persona/page.tsx`:

```tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { getIpcRenderer } from '@/lib/electron-ipc';
import type { Persona } from '@/types';
import { PageHeader } from '@/components/ui/PageHeader';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { SingleLineInput } from '@/components/ui/SingleLineInput';
import { Textarea } from '@/components/ui/Textarea';
import { ChipGroup } from '@/components/ui/ChipGroup';
import { Button } from '@/components/ui/Button';
import { BottomActionBar } from '@/components/ui/BottomActionBar';

const PERSONALITY_OPTIONS = ['专业', '友好', '严谨', '活泼', '温和'];
const TONE_OPTIONS = ['自然', '正式', '轻松', '简洁'];
const DETAIL_OPTIONS = ['详细', '平衡', '简洁'];
const CLARIFY_OPTIONS = ['总是先确认', '视情况平衡', '先执行再问'];
const WORK_STYLE_OPTIONS = ['先执行再总结', '逐步确认', '一步到位'];

export default function PersonaPage() {
  const [persona, setPersona] = useState<Persona | null>(null);
  const [saved, setSaved] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const ipcRenderer = typeof window !== 'undefined' ? getIpcRenderer() : null;

  useEffect(() => {
    ipcRenderer?.invoke('persona:load').then((data: Persona) => {
      setPersona(data);
      if (data.system_prompt) setAdvancedOpen(true);
    });
  }, [ipcRenderer]);

  const handleSave = useCallback(() => {
    if (!persona || !ipcRenderer) return;
    ipcRenderer.invoke('persona:save', {
      name: persona.name,
      bio: persona.bio,
      personality: persona.personality,
      tone: persona.tone,
      detail_level: persona.detail_level,
      clarify_pref: persona.clarify_pref,
      work_style: persona.work_style,
      system_prompt: persona.system_prompt,
    }).then((updated: Persona) => {
      setPersona(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    });
  }, [persona, ipcRenderer]);

  if (!persona) {
    return <div className="p-6 text-text-muted">加载中...</div>;
  }

  return (
    <div className="min-h-screen bg-bg-window flex flex-col">
      <PageHeader
        title="分身设定"
        subtitle="配置你的 AI 分身身份和行为风格"
        onBack={() => window.history.back()}
      />

      <div className="flex-1 overflow-auto px-page-x pb-6">
        {/* Basic Identity */}
        <div className="mb-section-gap">
          <SectionHeader title="基础身份" />
          <div className="flex items-center gap-4 mb-block-gap">
            <div className="w-12 h-12 rounded-full bg-brand-soft flex items-center justify-center text-section-title text-brand font-semibold flex-shrink-0">
              {persona.name?.[0] || 'S'}
            </div>
            <div className="flex-1">
              <SingleLineInput
                value={persona.name}
                onChange={e => setPersona({ ...persona, name: e.target.value })}
                placeholder="分身名称"
              />
            </div>
          </div>
          <Textarea
            value={persona.bio || ''}
            onChange={e => setPersona({ ...persona, bio: e.target.value })}
            placeholder="一句话描述你的分身..."
          />
        </div>

        {/* Personality Expression */}
        <div className="mb-section-gap">
          <SectionHeader title="人格表达" />
          <div className="mb-block-gap">
            <label className="block text-label text-text-muted mb-1">性格</label>
            <ChipGroup options={PERSONALITY_OPTIONS} value={persona.personality} onChange={v => setPersona({ ...persona, personality: v })} />
          </div>
          <div className="mb-block-gap">
            <label className="block text-label text-text-muted mb-1">语气</label>
            <ChipGroup options={TONE_OPTIONS} value={persona.tone} onChange={v => setPersona({ ...persona, tone: v })} />
          </div>
          <div>
            <label className="block text-label text-text-muted mb-1">回答详略</label>
            <ChipGroup options={DETAIL_OPTIONS} value={persona.detail_level} onChange={v => setPersona({ ...persona, detail_level: v })} />
          </div>
        </div>

        {/* Collaboration Preferences */}
        <div className="mb-section-gap">
          <SectionHeader title="协作偏好" />
          <div className="mb-block-gap">
            <label className="block text-label text-text-muted mb-1">澄清偏好</label>
            <ChipGroup options={CLARIFY_OPTIONS} value={persona.clarify_pref} onChange={v => setPersona({ ...persona, clarify_pref: v })} />
          </div>
          <div>
            <label className="block text-label text-text-muted mb-1">工作方式</label>
            <ChipGroup options={WORK_STYLE_OPTIONS} value={persona.work_style} onChange={v => setPersona({ ...persona, work_style: v })} />
          </div>
        </div>

        {/* Advanced Settings */}
        <div className="mb-section-gap">
          <button
            onClick={() => setAdvancedOpen(!advancedOpen)}
            className="flex items-center gap-2 text-section-title text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
          >
            <span className={`transition-transform ${advancedOpen ? 'rotate-90' : ''}`}>▸</span>
            高级设置
          </button>
          {advancedOpen && (
            <div className="mt-3">
              <Textarea
                label="自定义 System Prompt"
                helperText="追加到分身上下文末尾的额外指令"
                value={persona.system_prompt || ''}
                onChange={e => setPersona({ ...persona, system_prompt: e.target.value })}
                placeholder="输入自定义指令..."
                className="!font-mono"
              />
            </div>
          )}
        </div>
      </div>

      <BottomActionBar>
        <Button variant="primary" onClick={handleSave}>
          {saved ? '已保存' : '保存更改'}
        </Button>
      </BottomActionBar>
    </div>
  );
}
```

- [ ] **Step 2: Verify persona page renders**

Run: `npm run dev`, navigate to `/persona`.
Expected: 4 grouped sections with ChipGroup selectors, collapsible advanced section, dark theme.

- [ ] **Step 3: Commit**

```bash
git add src/app/persona/page.tsx
git commit -m "feat: rewrite persona page with Tailwind and shared components"
```

---

### Task 21: Rewrite memory page

**Files:**
- Modify: `src/app/memory/page.tsx` (full rewrite)

- [ ] **Step 1: Rewrite memory page**

Replace the entire content of `src/app/memory/page.tsx`:

```tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { getIpcRenderer } from '@/lib/electron-ipc';
import type { MemoryItem } from '@/types';
import { PageHeader } from '@/components/ui/PageHeader';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Textarea } from '@/components/ui/Textarea';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ChipGroup } from '@/components/ui/ChipGroup';

const TYPE_OPTIONS = ['偏好', '习惯', '项目背景', '约束', '事实', '其他'];
const TYPE_COLORS: Record<string, string> = {
  '偏好': 'bg-brand-soft text-brand',
  '习惯': 'bg-info/15 text-info',
  '项目背景': 'bg-purple-500/15 text-purple-400',
  '约束': 'bg-warning/15 text-warning',
  '事实': 'bg-success/15 text-success',
  '其他': 'bg-bg-surface-3 text-text-muted',
};

export default function MemoryPage() {
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [newType, setNewType] = useState('偏好');
  const [newContent, setNewContent] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [filter, setFilter] = useState('全部');
  const ipcRenderer = typeof window !== 'undefined' ? getIpcRenderer() : null;

  useEffect(() => {
    ipcRenderer?.invoke('memory:list').then((data: MemoryItem[]) => {
      setMemories(data);
    });
  }, [ipcRenderer]);

  const refresh = useCallback(() => {
    ipcRenderer?.invoke('memory:list').then((data: MemoryItem[]) => {
      setMemories(data);
    });
  }, [ipcRenderer]);

  const handleAdd = useCallback(() => {
    if (!newContent.trim()) return;
    ipcRenderer?.invoke('memory:add', {
      type: newType,
      content: newContent.trim(),
      source: '手动新增',
    }).then(() => {
      setNewContent('');
      setShowAdd(false);
      refresh();
    });
  }, [ipcRenderer, newType, newContent, refresh]);

  const handleDelete = useCallback((id: string) => {
    ipcRenderer?.invoke('memory:delete', { id }).then(refresh);
  }, [ipcRenderer, refresh]);

  const handleToggleStatus = useCallback((id: string) => {
    ipcRenderer?.invoke('memory:toggle-status', { id }).then(refresh);
  }, [ipcRenderer, refresh]);

  const handleTogglePin = useCallback((id: string) => {
    ipcRenderer?.invoke('memory:toggle-pin', { id }).then(refresh);
  }, [ipcRenderer, refresh]);

  const handleStartEdit = useCallback((memory: MemoryItem) => {
    setEditingId(memory.id);
    setEditContent(memory.content);
  }, []);

  const handleSaveEdit = useCallback(() => {
    if (!editingId || !editContent.trim()) return;
    ipcRenderer?.invoke('memory:update', {
      id: editingId,
      content: editContent.trim(),
    }).then(() => {
      setEditingId(null);
      setEditContent('');
      refresh();
    });
  }, [ipcRenderer, editingId, editContent, refresh]);

  const activeMemories = memories.filter(m => m.status !== '已失效');
  const overviewBullets = activeMemories.slice(0, 4).map(m => m.content.slice(0, 40) + (m.content.length > 40 ? '...' : ''));
  const filteredMemories = filter === '全部' ? memories : memories.filter(m => m.type === filter);

  return (
    <div className="min-h-screen bg-bg-window flex flex-col">
      <PageHeader
        title="记忆管理"
        subtitle="Aiva 记住了什么"
        onBack={() => window.history.back()}
        actions={
          <Button variant="primary" size="sm" onClick={() => setShowAdd(!showAdd)}>
            {showAdd ? '取消' : '+ 新增记忆'}
          </Button>
        }
      />

      <div className="flex-1 overflow-auto px-page-x pb-6">
        {/* Memory Overview */}
        {memories.length > 0 && (
          <div className="mb-section-gap bg-bg-surface-1 border border-line-default rounded-card p-card-p">
            <h3 className="text-card-title text-text-primary mb-2">Aiva 当前记住了 {activeMemories.length} 条信息</h3>
            {overviewBullets.length > 0 && (
              <ul className="text-body-sm text-text-muted space-y-1">
                {overviewBullets.map((bullet, i) => (
                  <li key={i}>• {bullet}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Add Memory */}
        {showAdd && (
          <div className="mb-section-gap bg-bg-surface-1 border border-line-default rounded-card-sm p-card-p">
            <div className="mb-block-gap">
              <label className="block text-label text-text-muted mb-1">类型</label>
              <ChipGroup options={TYPE_OPTIONS} value={newType} onChange={setNewType} />
            </div>
            <Textarea
              value={newContent}
              onChange={e => setNewContent(e.target.value)}
              placeholder="输入记忆内容..."
            />
            <div className="flex justify-end mt-2">
              <Button variant="primary" size="sm" onClick={handleAdd} disabled={!newContent.trim()}>
                添加
              </Button>
            </div>
          </div>
        )}

        {/* Filter */}
        {memories.length > 0 && (
          <div className="flex items-center gap-2 mb-block-gap">
            <ChipGroup
              options={['全部', ...TYPE_OPTIONS]}
              value={filter}
              onChange={setFilter}
            />
          </div>
        )}

        {/* Memory List */}
        {memories.length === 0 && (
          <EmptyState
            title="暂无记忆"
            description="任务完成后会自动提炼，也可以手动新增记忆条目"
            action={<Button variant="primary" size="sm" onClick={() => setShowAdd(true)}>新增记忆</Button>}
          />
        )}

        {filteredMemories.map(memory => (
          <div
            key={memory.id}
            className={`bg-bg-surface-1 border rounded-card-sm p-card-p mb-2 ${
              memory.pinned ? 'border-brand/30' : 'border-line-default'
            } ${memory.status === '已失效' ? 'opacity-50' : ''}`}
          >
            <div className="flex items-start gap-2">
              <span className={`px-2 py-0.5 rounded text-label-xs flex-shrink-0 mt-0.5 ${TYPE_COLORS[memory.type] || TYPE_COLORS['其他']}`}>
                {memory.type}
              </span>
              <div className="flex-1 min-w-0">
                {editingId === memory.id ? (
                  <div className="flex gap-2">
                    <textarea
                      value={editContent}
                      onChange={e => setEditContent(e.target.value)}
                      rows={2}
                      className="flex-1 bg-bg-surface-2 border border-line-default rounded-input px-2 py-1 text-body-sm text-text-primary outline-none resize-none focus:border-brand"
                    />
                    <div className="flex flex-col gap-1">
                      <Button variant="primary" size="sm" onClick={handleSaveEdit}>保存</Button>
                      <Button variant="ghost" size="sm" onClick={() => setEditingId(null)}>取消</Button>
                    </div>
                  </div>
                ) : (
                  <div className="text-body-sm leading-relaxed whitespace-pre-wrap">{memory.content}</div>
                )}
                <div className="flex items-center gap-2 mt-1.5 text-label-xs text-text-muted">
                  <span>{memory.source}</span>
                  <span>{new Date(memory.created_at).toLocaleDateString()}</span>
                  {memory.pinned === 1 && <span className="text-brand">已置顶</span>}
                  <StatusBadge status={memory.status === '生效中' ? 'success' : 'default'} label={memory.status} />
                </div>
              </div>
              <div className="flex gap-1 flex-shrink-0">
                <Button variant="ghost" size="sm" onClick={() => handleTogglePin(memory.id)}>
                  {memory.pinned ? '★' : '☆'}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => handleStartEdit(memory)}>
                  编辑
                </Button>
                <Button variant="ghost" size="sm" onClick={() => handleToggleStatus(memory.id)}>
                  {memory.status === '生效中' ? '失效' : '启用'}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => handleDelete(memory.id)} className="!text-danger">
                  删除
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify memory page renders**

Run: `npm run dev`, navigate to `/memory`.
Expected: Overview card, filter chips, memory list with type badges and action buttons.

- [ ] **Step 3: Commit**

```bash
git add src/app/memory/page.tsx
git commit -m "feat: rewrite memory page with Tailwind and shared components"
```

---

### Task 22: Rewrite skills page

**Files:**
- Modify: `src/app/skills/page.tsx` (full rewrite)

- [ ] **Step 1: Rewrite skills page**

Replace the entire content of `src/app/skills/page.tsx`:

```tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { getIpcRenderer } from '@/lib/electron-ipc';
import { PageHeader } from '@/components/ui/PageHeader';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Button } from '@/components/ui/Button';
import { ListCard } from '@/components/ui/ListCard';
import { EmptyState } from '@/components/ui/EmptyState';

interface SkillInfo {
  name: string;
  description: string;
  enabled: boolean;
  skillDir: string;
}

export default function SkillsPage() {
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [detailSkill, setDetailSkill] = useState<{ name: string; content: string } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const ipcRenderer = typeof window !== 'undefined' ? getIpcRenderer() : null;

  const loadSkills = useCallback(() => {
    ipcRenderer?.invoke('skills:list').then((data: SkillInfo[]) => {
      setSkills(data);
    });
  }, [ipcRenderer]);

  useEffect(() => {
    loadSkills();
  }, [loadSkills]);

  const handleImport = async () => {
    setImportError(null);
    const result = await ipcRenderer?.invoke('skills:import');
    if (result?.error) {
      setImportError(result.error);
    } else if (result) {
      setSkills(result);
    }
  };

  const handleToggle = async (name: string, enabled: boolean) => {
    const updated = await ipcRenderer?.invoke('skills:toggle', { name, enabled });
    if (updated) setSkills(updated);
  };

  const handleDelete = async (name: string) => {
    if (!confirm(`确定删除技能「${name}」？`)) return;
    const updated = await ipcRenderer?.invoke('skills:delete', { name });
    if (updated) setSkills(updated);
    setDetailSkill(null);
  };

  const handleViewDetail = async (name: string) => {
    const content = await ipcRenderer?.invoke('skills:read', { name });
    if (content) {
      setDetailSkill({ name, content });
    }
  };

  const enabledSkills = skills.filter(s => s.enabled);
  const disabledSkills = skills.filter(s => !s.enabled);

  return (
    <div className="min-h-screen bg-bg-window flex flex-col">
      <PageHeader
        title="技能管理"
        subtitle="Aiva 当前具备的技能"
        onBack={() => window.history.back()}
      />

      <div className="flex-1 overflow-auto px-page-x pb-6">
        {/* Enabled Skills */}
        {enabledSkills.length > 0 && (
          <div className="mb-section-gap">
            <SectionHeader title="已启用技能" description={`${enabledSkills.length} 个`} />
            <div className="flex flex-col gap-2">
              {enabledSkills.map(skill => (
                <ListCard key={skill.name}>
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="text-card-title text-text-primary">{skill.name}</div>
                      <div className="text-body-sm text-text-muted mt-0.5">{skill.description}</div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                      <StatusBadge status="success" label="已启用" />
                      <Button variant="ghost" size="sm" onClick={() => handleViewDetail(skill.name)}>配置</Button>
                      <Button variant="ghost" size="sm" onClick={() => handleToggle(skill.name, false)}>停用</Button>
                    </div>
                  </div>
                </ListCard>
              ))}
            </div>
          </div>
        )}

        {/* Pending / Disabled Skills */}
        {disabledSkills.length > 0 && (
          <div className="mb-section-gap">
            <SectionHeader title="待配置" description={`${disabledSkills.length} 个`} />
            <div className="flex flex-col gap-2">
              {disabledSkills.map(skill => (
                <ListCard key={skill.name} className="opacity-60">
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="text-card-title text-text-primary">{skill.name}</div>
                      <div className="text-body-sm text-text-muted mt-0.5">{skill.description}</div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                      <StatusBadge status="default" label="已停用" />
                      <Button variant="ghost" size="sm" onClick={() => handleToggle(skill.name, true)}>启用</Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(skill.name)} className="!text-danger">删除</Button>
                    </div>
                  </div>
                </ListCard>
              ))}
            </div>
          </div>
        )}

        {/* Empty State */}
        {skills.length === 0 && (
          <div className="mb-section-gap">
            <EmptyState
              title="暂无技能"
              description="导入 .md 文件、.zip 压缩包或包含 SKILL.md 的文件夹来添加技能"
            />
          </div>
        )}

        {/* Add Skills */}
        <div className="mb-section-gap">
          <SectionHeader title="新增技能" />
          <div className="bg-bg-surface-1 border border-line-default rounded-card p-card-p">
            <div className="flex gap-2 mb-3">
              <Button variant="secondary" size="sm" onClick={handleImport}>导入 .md</Button>
              <Button variant="secondary" size="sm" onClick={handleImport}>导入 .zip</Button>
              <Button variant="secondary" size="sm" onClick={handleImport}>导入文件夹</Button>
            </div>
            <p className="text-label-xs text-text-muted">需要包含 SKILL.md 文件</p>
          </div>
        </div>

        {importError && <p className="text-body-sm text-danger">{importError}</p>}
      </div>

      {/* Detail Modal */}
      {detailSkill && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={() => setDetailSkill(null)}>
          <div className="bg-bg-surface-2 rounded-card p-6 max-w-xl w-[90%] max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-section-title text-text-primary">{detailSkill.name}</h2>
              <Button variant="ghost" size="sm" onClick={() => setDetailSkill(null)}>关闭</Button>
            </div>
            <pre className="bg-bg-app rounded-input p-4 overflow-auto flex-1 text-body-sm leading-relaxed whitespace-pre-wrap break-words text-text-secondary">
              {detailSkill.content}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify skills page renders**

Run: `npm run dev`, navigate to `/skills`.
Expected: Enabled/disabled sections, import area, detail modal.

- [ ] **Step 3: Commit**

```bash
git add src/app/skills/page.tsx
git commit -m "feat: rewrite skills page with Tailwind and shared components"
```

---

### Task 23: Rewrite services page

**Files:**
- Modify: `src/app/services/page.tsx` (full rewrite)

- [ ] **Step 1: Rewrite services page**

Replace the entire content of `src/app/services/page.tsx`:

```tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { getIpcRenderer } from '@/lib/electron-ipc';
import type { McpServerConfig } from '@/types';
import { PageHeader } from '@/components/ui/PageHeader';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { SingleLineInput } from '@/components/ui/SingleLineInput';
import { Button } from '@/components/ui/Button';
import { ListCard } from '@/components/ui/ListCard';
import { EmptyState } from '@/components/ui/EmptyState';

export default function ServicesPage() {
  const [servers, setServers] = useState<McpServerConfig[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formCommand, setFormCommand] = useState('');
  const [formArgs, setFormArgs] = useState('');
  const ipcRenderer = typeof window !== 'undefined' ? getIpcRenderer() : null;

  useEffect(() => {
    ipcRenderer?.invoke('services:list').then((data: McpServerConfig[]) => {
      setServers(data);
    });
  }, [ipcRenderer]);

  const handleAdd = useCallback(() => {
    if (!formName.trim() || !formCommand.trim()) return;
    ipcRenderer?.invoke('services:add', {
      name: formName.trim(),
      command: formCommand.trim(),
      args: formArgs.trim() ? formArgs.trim().split(/\s+/) : [],
      enabled: true,
    }).then((updated: McpServerConfig[]) => {
      setServers(updated);
      setFormName('');
      setFormCommand('');
      setFormArgs('');
      setShowForm(false);
    });
  }, [ipcRenderer, formName, formCommand, formArgs]);

  const handleRemove = useCallback((id: string) => {
    ipcRenderer?.invoke('services:remove', { id }).then((updated: McpServerConfig[]) => {
      setServers(updated);
    });
  }, [ipcRenderer]);

  const handleTest = useCallback(async (id: string) => {
    setTesting(id);
    try {
      const result = await ipcRenderer?.invoke('services:test', { id }) as { success: boolean; error?: string };
      if (result?.success) {
        alert('连接测试成功');
      } else {
        alert(`连接测试失败: ${result?.error || '未知错误'}`);
      }
    } catch (err) {
      alert(`测试出错: ${err}`);
    } finally {
      setTesting(null);
    }
  }, [ipcRenderer]);

  return (
    <div className="min-h-screen bg-bg-window flex flex-col">
      <PageHeader
        title="服务连接"
        subtitle="Aiva 能访问的外部服务"
        onBack={() => window.history.back()}
        actions={
          <Button variant="primary" size="sm" onClick={() => setShowForm(!showForm)}>
            {showForm ? '取消' : '+ 新增连接'}
          </Button>
        }
      />

      <div className="flex-1 overflow-auto px-page-x pb-6">
        {/* Description Card */}
        <div className="mb-section-gap bg-bg-surface-1 border border-line-default rounded-card p-card-p">
          <p className="text-body-sm text-text-secondary">
            服务连接让 Aiva 通过标准协议访问外部工具和数据源，例如 GitHub、数据库、搜索引擎等。
          </p>
        </div>

        {/* Add Form */}
        {showForm && (
          <div className="mb-section-gap bg-bg-surface-1 border border-line-default rounded-card p-card-p">
            <SectionHeader title="新增连接" />
            <SingleLineInput
              label="名称"
              value={formName}
              onChange={e => setFormName(e.target.value)}
              placeholder="例如：GitHub MCP"
            />
            <SingleLineInput
              label="命令"
              value={formCommand}
              onChange={e => setFormCommand(e.target.value)}
              placeholder="例如：npx @modelcontextprotocol/server-github"
            />
            <SingleLineInput
              label="参数（空格分隔）"
              value={formArgs}
              onChange={e => setFormArgs(e.target.value)}
              placeholder="可选"
            />
            <Button variant="primary" size="sm" onClick={handleAdd} disabled={!formName.trim() || !formCommand.trim()}>
              添加
            </Button>
          </div>
        )}

        {/* Server List */}
        {servers.length > 0 && (
          <div className="mb-section-gap">
            <SectionHeader title="已连接服务" description={`${servers.length} 个`} />
            <div className="flex flex-col gap-2">
              {servers.map(server => (
                <ListCard key={server.id}>
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-card-title text-text-primary">{server.name}</span>
                        <StatusBadge status="success" label="已连接" />
                      </div>
                      <div className="text-label text-text-muted font-mono mt-0.5">{server.command}</div>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0 ml-3">
                      <Button variant="secondary" size="sm" onClick={() => handleTest(server.id)} disabled={testing === server.id}>
                        {testing === server.id ? '测试中...' : '测试连接'}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleRemove(server.id)} className="!text-danger">
                        断开
                      </Button>
                    </div>
                  </div>
                </ListCard>
              ))}
            </div>
          </div>
        )}

        {/* Empty State */}
        {servers.length === 0 && !showForm && (
          <EmptyState
            title="还没有连接任何服务"
            description="服务连接让 Aiva 访问外部工具和数据源。添加第一个服务连接来开始使用。"
            action={<Button variant="primary" size="sm" onClick={() => setShowForm(true)}>添加第一个连接</Button>}
          />
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify services page renders**

Run: `npm run dev`, navigate to `/services`.
Expected: Description card, empty state, add form.

- [ ] **Step 3: Commit**

```bash
git add src/app/services/page.tsx
git commit -m "feat: rewrite services page with Tailwind and shared components"
```

---

## Phase 6: Onboarding & Voice-bar Updates

### Task 24: Rewrite onboarding to dark theme

**Files:**
- Modify: `src/components/Onboarding.tsx` (full rewrite of styles)

- [ ] **Step 1: Rewrite Onboarding component with dark theme**

Replace the entire content of `src/components/Onboarding.tsx`. Keep all logic identical, change only the styling:

```tsx
'use client';

import { useState } from 'react';
import { getIpcRenderer } from '@/lib/electron-ipc';
import { Button } from '@/components/ui/Button';

type Step = 'welcome' | 'accessibility' | 'volcengine' | 'api-key' | 'cwd' | 'done';

export function Onboarding({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState<Step>('welcome');
  const [apiKey, setApiKey] = useState('');
  const [volcAppId, setVolcAppId] = useState('');
  const [volcToken, setVolcToken] = useState('');
  const [defaultCwd, setDefaultCwd] = useState('~/Documents');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const ipcRenderer = getIpcRenderer();

  const checkAccessibility = async () => {
    const granted = await ipcRenderer?.invoke('onboarding:check-accessibility');
    if (granted) setStep('volcengine');
  };

  const saveVolcengine = async () => {
    if (!volcAppId.trim() || !volcToken.trim()) {
      setError('请填写 App ID 和 Access Token');
      return;
    }
    setError('');
    setSaving(true);
    try {
      await ipcRenderer?.invoke('settings:save-volcengine-credentials', {
        appId: volcAppId.trim(),
        accessToken: volcToken.trim(),
      });
      setStep('api-key');
    } catch (e: any) {
      setError(e.message || '凭证验证失败');
    } finally {
      setSaving(false);
    }
  };

  const validateApiKey = async () => {
    setError('');
    try {
      await ipcRenderer?.invoke('onboarding:validate-api-key', { key: apiKey.trim(), providerKey: 'glm-cn' });
      setStep('cwd');
    } catch {
      setError('API Key 验证失败，请检查后重试');
    }
  };

  const finish = async () => {
    await ipcRenderer?.invoke('onboarding:finish', { defaultCwd });
    setStep('done');
    onComplete();
  };

  const steps: Record<Step, React.ReactNode> = {
    welcome: (
      <OnboardingStep
        title="欢迎使用 Aiva"
        description="Aiva 让你用语音驱动 Claude Code。按下右 Command，说一句话，Claude 帮你干活。"
        buttonText="开始设置"
        onAction={() => setStep('accessibility')}
      />
    ),
    accessibility: (
      <OnboardingStep
        title="辅助功能权限"
        description="为了响应右 Command 键唤起语音，Aiva 需要辅助功能权限。这与 Raycast、Alfred 等应用所需的权限相同。Aiva 只会监听右 Command 键，不会记录任何其他按键。"
        buttonText="打开系统设置"
        onAction={() => {
          ipcRenderer?.send('onboarding:open-accessibility');
          const interval = setInterval(async () => {
            const granted = await ipcRenderer?.invoke('onboarding:check-accessibility');
            if (granted) {
              clearInterval(interval);
              setStep('volcengine');
            }
          }, 1000);
        }}
        secondaryButton="已授权，下一步"
        onSecondary={() => checkAccessibility()}
      />
    ),
    volcengine: (
      <div className="text-center">
        <h2 className="text-page-title text-text-primary mb-3">语音识别配置</h2>
        <p className="text-body text-text-muted mb-6">Aiva 使用豆包语音大模型进行在线语音识别。请填写火山引擎的凭证。</p>
        <input
          type="text"
          value={volcAppId}
          onChange={e => setVolcAppId(e.target.value)}
          placeholder="App ID"
          className="w-full h-10 px-3 rounded-input bg-bg-surface-2 border border-line-default text-body text-text-primary outline-none mb-2 placeholder:text-text-muted focus:border-brand"
        />
        <input
          type="password"
          value={volcToken}
          onChange={e => setVolcToken(e.target.value)}
          placeholder="Access Token"
          className="w-full h-10 px-3 rounded-input bg-bg-surface-2 border border-line-default text-body text-text-primary outline-none mb-3 placeholder:text-text-muted focus:border-brand"
        />
        {error && <p className="text-body-sm text-danger mb-2">{error}</p>}
        <Button variant="primary" onClick={saveVolcengine} disabled={saving || !volcAppId.trim() || !volcToken.trim()}>
          {saving ? '验证中...' : '验证并保存'}
        </Button>
      </div>
    ),
    'api-key': (
      <div className="text-center">
        <h2 className="text-page-title text-text-primary mb-3">API Key</h2>
        <p className="text-body text-text-muted mb-6">需要 API Key 来调用 Claude。Key 将安全存储在 macOS 钥匙串中。</p>
        <input
          type="password"
          value={apiKey}
          onChange={e => setApiKey(e.target.value)}
          placeholder="从 open.bigmodel.cn 获取您的 API Key"
          className="w-full h-10 px-3 rounded-input bg-bg-surface-2 border border-line-default text-body text-text-primary outline-none mb-3 placeholder:text-text-muted focus:border-brand"
        />
        {error && <p className="text-body-sm text-danger mb-2">{error}</p>}
        <Button variant="primary" onClick={validateApiKey} disabled={!apiKey.trim()}>
          验证并保存
        </Button>
      </div>
    ),
    cwd: (
      <div className="text-center">
        <h2 className="text-page-title text-text-primary mb-3">工作目录</h2>
        <p className="text-body text-text-muted mb-6">Claude Code 将在此目录下执行命令。</p>
        <input
          type="text"
          value={defaultCwd}
          onChange={e => setDefaultCwd(e.target.value)}
          className="w-full h-10 px-3 rounded-input bg-bg-surface-2 border border-line-default text-body text-text-primary outline-none mb-3 placeholder:text-text-muted focus:border-brand"
        />
        <div className="flex gap-2 justify-center">
          <Button variant="secondary" onClick={() => {
            ipcRenderer?.invoke('settings:pick-directory').then((p: string | null) => {
              if (p) setDefaultCwd(p);
            });
          }}>
            浏览
          </Button>
          <Button variant="primary" onClick={finish}>完成设置</Button>
        </div>
      </div>
    ),
    done: (
      <OnboardingStep
        title="设置完成！"
        description="按下右 Command 开始使用 Aiva。"
        buttonText="开始使用"
        onAction={onComplete}
      />
    ),
  };

  return (
    <div className="flex justify-center items-center min-h-screen bg-bg-app">
      <div className="max-w-md px-10 py-10">
        {steps[step]}
      </div>
    </div>
  );
}

function OnboardingStep({ title, description, buttonText, onAction, secondaryButton, onSecondary }: {
  title: string; description: string; buttonText: string;
  onAction: () => void; secondaryButton?: string; onSecondary?: () => void;
}) {
  return (
    <div className="text-center">
      <h2 className="text-page-title text-text-primary mb-3">{title}</h2>
      <p className="text-body text-text-muted leading-relaxed mb-6">{description}</p>
      <Button variant="primary" onClick={onAction}>{buttonText}</Button>
      {secondaryButton && onSecondary && (
        <button onClick={onSecondary} className="block mx-auto mt-2 bg-transparent border-none text-brand text-body-sm cursor-pointer hover:underline">
          {secondaryButton}
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify onboarding renders with dark theme**

Run: `npm run dev`, navigate to `/onboarding`.
Expected: Dark bg-app background, dark inputs, brand-colored buttons.

- [ ] **Step 3: Commit**

```bash
git add src/components/Onboarding.tsx
git commit -m "feat: rewrite onboarding with dark theme and Tailwind"
```

---

### Task 25: Update voice-bar color palette

**Files:**
- Modify: `src/components/VoiceInput.tsx` (style-only changes)

- [ ] **Step 1: Update VoiceInput colors to new palette**

In `src/components/VoiceInput.tsx`, make these targeted color replacements:

1. Line ~113: `background: 'rgba(30, 30, 30, 0.95)'` → `background: 'rgba(17, 23, 42, 0.95)'` (bg-window with alpha)
2. Line ~221: `background: text.trim() ? '#007AFF' : '#333'` → `background: text.trim() ? 'var(--brand-primary)' : 'var(--bg-surface-3)'`
3. Line ~222: `color: text.trim() ? '#fff' : '#666'` → `color: text.trim() ? '#fff' : 'var(--text-muted)'`

- [ ] **Step 2: Verify voice-bar renders**

Run: `npm run electron:dev`
Expected: Voice bar has the new deep navy translucent background instead of gray.

- [ ] **Step 3: Commit**

```bash
git add src/components/VoiceInput.tsx
git commit -m "style: update voice-bar colors to new design palette"
```

---

## Phase 7: Verification & Cleanup

### Task 26: Full build verification

- [ ] **Step 1: Run Next.js build**

Run: `npm run build`
Expected: Build completes without errors.

- [ ] **Step 2: Run tests**

Run: `npx jest`
Expected: All tests pass (UI-only changes shouldn't affect tests).

- [ ] **Step 3: Run Electron build**

Run: `npm run build:electron`
Expected: Electron build completes without errors.

- [ ] **Step 4: Visual verification**

Run: `npm run electron:dev`
Check each page:
- `/chat` — dark bg-window, brand-soft avatar, multi-line input
- `/settings` — card directory, 5 summary cards
- `/settings/provider` — dark form with StatusBadge
- `/settings/voice` — dark form with range slider
- `/settings/runtime` — dark form with browse button
- `/settings/preferences` — empty state placeholder
- `/settings/privacy` — empty state placeholder
- `/persona` — 4 grouped sections with ChipGroup
- `/memory` — overview card, filter chips, memory list
- `/skills` — enabled/disabled sections, import area
- `/services` — description card, empty state
- `/onboarding` — dark theme

- [ ] **Step 5: Commit verification status**

```bash
git commit --allow-empty -m "verify: all pages build and render with new design system"
```

---

## Summary

| Phase | Tasks | Key Deliverables |
|-------|-------|-----------------|
| 1. Foundation | 1-2 | Tailwind + CSS variables, window resize |
| 2. Components | 3-13 | 12 shared UI components, cleanup old components |
| 3. Chat | 14-17 | Header, Stream, Input, Page rewrite |
| 4. Settings | 18-19 | Settings home + 5 detail pages |
| 5. Secondary | 20-23 | Persona, Memory, Skills, Services |
| 6. Onboarding | 24-25 | Dark theme onboarding, voice-bar palette |
| 7. Verify | 26 | Build + visual verification |

**Total: 26 tasks, ~50 commits**
