# Voice Bar 透明渲染 Bug 修复 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复语音条窗口渲染为黑色大块的 bug，通过 Route Group 隔离透明路由与主应用路由。

**Architecture:** 将 Next.js App Router 的页面分为两组：`(main)` 组带 `bg-bg-app` 背景的 layout，`(transparent)` 组不带背景。根 layout 只保留最小公共样式。所有 URL 路径不变。

**Tech Stack:** Next.js 15 App Router, Tailwind CSS, Electron BrowserWindow

---

## File Structure

| 操作 | 文件路径 | 职责 |
|------|----------|------|
| 修改 | `src/app/layout.tsx` | 根布局，body 移除 bg-bg-app |
| 新建 | `src/app/(main)/layout.tsx` | 主应用 layout，包裹 bg-bg-app |
| 新建 | `src/app/(transparent)/layout.tsx` | 透明 layout，只传 children |
| 移动 | `src/app/chat/` → `src/app/(main)/chat/` | |
| 移动 | `src/app/detail/` → `src/app/(main)/detail/` | |
| 移动 | `src/app/memory/` → `src/app/(main)/memory/` | |
| 移动 | `src/app/onboarding/` → `src/app/(main)/onboarding/` | |
| 移动 | `src/app/persona/` → `src/app/(main)/persona/` | |
| 移动 | `src/app/services/` → `src/app/(main)/services/` | |
| 移动 | `src/app/settings/` → `src/app/(main)/settings/` | |
| 移动 | `src/app/skills/` → `src/app/(main)/skills/` | |
| 移动 | `src/app/voice-bar/` → `src/app/(transparent)/voice-bar/` | |
| 移动 | `src/app/subtitle/` → `src/app/(transparent)/subtitle/` | |
| 修改 | `src/app/(transparent)/voice-bar/page.tsx` | 删除 body 透明覆盖 CSS |
| 修改 | `src/app/(transparent)/subtitle/page.tsx` | 删除 body 透明覆盖 CSS |
| 不动 | `src/app/api/` | API 路由不需要 layout，留在根目录 |
| 不动 | `src/app/globals.css` | 由根 layout 导入，所有页面共享 |
| 不动 | `src/components/VoiceInput.tsx` | 组件本身无问题 |
| 不动 | `electron/voice-bar.ts` | BrowserWindow 配置无问题 |

---

### Task 1: 创建 Route Group 目录和 layout 文件

**Files:**
- Create: `src/app/(main)/layout.tsx`
- Create: `src/app/(transparent)/layout.tsx`

- [ ] **Step 1: 创建 (main) 目录和 layout**

```bash
mkdir -p "src/app/(main)"
```

创建 `src/app/(main)/layout.tsx`：

```tsx
export default function MainLayout({ children }: { children: React.ReactNode }) {
  return <div className="bg-bg-app min-h-screen">{children}</div>;
}
```

- [ ] **Step 2: 创建 (transparent) 目录和 layout**

```bash
mkdir -p "src/app/(transparent)"
```

创建 `src/app/(transparent)/layout.tsx`：

```tsx
export default function TransparentLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
```

- [ ] **Step 3: Commit**

```bash
git add "src/app/(main)/layout.tsx" "src/app/(transparent)/layout.tsx"
git commit -m "feat: add (main) and (transparent) route group layouts"
```

---

### Task 2: 移动主应用页面到 (main) 组

**Files:**
- Move: 8 个页面目录 → `src/app/(main)/`

- [ ] **Step 1: git mv 所有主应用路由目录**

```bash
git mv src/app/chat "src/app/(main)/chat"
git mv src/app/detail "src/app/(main)/detail"
git mv src/app/memory "src/app/(main)/memory"
git mv src/app/onboarding "src/app/(main)/onboarding"
git mv src/app/persona "src/app/(main)/persona"
git mv src/app/services "src/app/(main)/services"
git mv src/app/settings "src/app/(main)/settings"
git mv src/app/skills "src/app/(main)/skills"
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "refactor: move main app routes into (main) route group"
```

---

### Task 3: 移动透明页面到 (transparent) 组

**Files:**
- Move: 2 个页面目录 → `src/app/(transparent)/`

- [ ] **Step 1: git mv 透明路由目录**

```bash
git mv src/app/voice-bar "src/app/(transparent)/voice-bar"
git mv src/app/subtitle "src/app/(transparent)/subtitle"
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "refactor: move voice-bar and subtitle into (transparent) route group"
```

---

### Task 4: 修改根 layout 移除 bg-bg-app

**Files:**
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: 编辑 layout.tsx，从 body className 中移除 bg-bg-app**

将第 30 行：
```tsx
<body className="font-sans text-text-primary bg-bg-app">
```

改为：
```tsx
<body className="font-sans text-text-primary">
```

完整的 `src/app/layout.tsx` 改动后：

```tsx
import './globals.css';

export const metadata = { title: 'Aiva' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var pref = localStorage.getItem('aiva-theme-preference');
                  var root = document.documentElement;
                  root.classList.remove('light', 'dark');
                  if (pref === 'dark') {
                    root.classList.add('dark');
                  } else if (pref === 'light') {
                    root.classList.add('light');
                  } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
                    root.classList.add('dark');
                  }
                } catch(e) {}
              })();
            `,
          }}
        />
      </head>
      <body className="font-sans text-text-primary">
        {children}
      </body>
    </html>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/layout.tsx
git commit -m "fix: remove bg-bg-app from root layout body"
```

---

### Task 5: 清理 voice-bar 页面的透明覆盖 CSS

**Files:**
- Modify: `src/app/(transparent)/voice-bar/page.tsx`

- [ ] **Step 1: 编辑 voice-bar/page.tsx，删除 `<style>` 标签**

VoiceInput 组件自身已注入 `@keyframes vbWaveSlow`，页面级的 `<style>` 唯一作用是覆盖 body 背景，现在 layout 已处理，可以整个删除。

将 `src/app/(transparent)/voice-bar/page.tsx` 改为：

```tsx
'use client';

import { VoiceInput } from '@/components/VoiceInput';
import { useCallback } from 'react';

export default function VoiceBarPage() {
  const handleCancel = useCallback(() => {
    const { ipcRenderer } = require('electron');
    ipcRenderer.send('voice:cancel');
  }, []);

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100vh',
    }}>
      <VoiceInput onCancel={handleCancel} />
    </div>
  );
}
```

变化说明：
- 删除了 `<>` Fragment 包裹和 `<style>` 标签
- 从外层 div 移除了 `background: 'transparent'`（layout 已保证透明）
- VoiceInput 组件自带的 `<style>` 负责注入 keyframe

- [ ] **Step 2: Commit**

```bash
git add "src/app/(transparent)/voice-bar/page.tsx"
git commit -m "fix: remove body transparency override from voice-bar page"
```

---

### Task 6: 清理 subtitle 页面的透明覆盖 CSS

**Files:**
- Modify: `src/app/(transparent)/subtitle/page.tsx`

- [ ] **Step 1: 编辑 subtitle/page.tsx 的 `<style>` 标签，只删除 body 透明覆盖行**

将 `<style>` 标签中这一行删除：
```css
html, body { background: transparent !important; overflow: hidden !important; }
```

保留其余 CSS（keyframes、scrollbar 样式）。

修改后的 `<style>` 部分（SubtitlePage 组件的 return 中）：

```tsx
<style>{`
@keyframes waveBar { from { height: 4px; } to { height: 14px; } }
@keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
::-webkit-scrollbar { width: 4px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 2px; }
::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.3); }`}</style>
```

- [ ] **Step 2: Commit**

```bash
git add "src/app/(transparent)/subtitle/page.tsx"
git commit -m "fix: remove body transparency override from subtitle page"
```

---

### Task 7: 构建验证

- [ ] **Step 1: 运行 Next.js build 确认无报错**

```bash
npx next build
```

Expected: 构建成功，无错误。确认输出中包含 `/voice-bar`、`/subtitle`、`/chat` 等路由。

- [ ] **Step 2: 确认 Electron 主进程构建**

```bash
node scripts/build-electron.mjs
```

Expected: `Electron main process built to dist-electron/main.js`

- [ ] **Step 3: 启动 dev 模式手动验证**

```bash
npm run electron:dev
```

验证清单：
1. 主窗口 `/chat` 背景 color 正常（dark mode = `#111110`）
2. 设置页面 `/settings` 背景正常
3. 右 Option 触发录音 → 底部出现透明小药丸（不是黑块）
4. 字幕弹窗透明渲染正常
