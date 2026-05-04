# Shrew UI 设计系统刷新 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 Shrew 的视觉系统从冷蓝深色主题刷新为暖调双模式（Dark + Light），品牌色从蓝色换成暖紫藤。

**Architecture:** CSS 变量双模式切换。`globals.css` 定义两套变量（`:root` 为 Light，`:root.dark` 为 Dark），`tailwind.config.ts` 继续通过变量引用。所有已有组件自动级联更新，只需重写脱离系统的文件（detail、VoiceInput）。

**Tech Stack:** Next.js 15, Tailwind CSS v4, React 19, CSS Variables, localStorage

---

## 策略说明

本计划的核心策略是 **CSS 变量级联**：

1. 现有的所有 UI 组件（Button、StatusBadge、ChipGroup 等）已经完全使用 `bg-brand`、`text-text-primary` 等 Tailwind token class
2. 这些 token 全部映射到 CSS 变量（如 `var(--brand-primary)`）
3. **只需改变 CSS 变量的值，所有组件自动变色**
4. 因此，绝大部分页面不需要修改代码——颜色会自动更新

需要手动修改的只有：
- 脱离 design system 的文件（detail 页、VoiceInput）
- 少量硬编码色值（memory 页的 purple、skills 页的 black）
- 新增组件和功能（HeaderDropdown、外观设置）

---

### Task 1: 更新 CSS 变量（双模式基础）

**Files:**
- Modify: `src/app/globals.css`

**说明：** 这是整个刷新的核心。改变 CSS 变量后，所有使用 token 的组件自动更新。

- [ ] **Step 1: 重写 globals.css 的 CSS 变量部分**

将 `src/app/globals.css` 中 `:root { ... }` 的全部变量替换为以下内容：

```css
:root {
  /* Light 模式（默认） */
  --bg-app: #f5f0e8;
  --bg-window: #faf9f5;
  --bg-surface-1: #efe9de;
  --bg-surface-2: #e6dfd8;
  --bg-surface-3: #ddd5c8;
  --line-default: #e6dfd8;
  --line-strong: #d4cbc0;
  --text-primary: #141413;
  --text-secondary: #3d3d3a;
  --text-muted: #6c6a64;
  --brand-primary: #82699b;
  --brand-primary-hover: #947db0;
  --brand-primary-active: #725a8a;
  --brand-soft: rgba(130, 105, 155, 0.12);
  --success: #4a9e5f;
  --warning: #b88a0f;
  --danger: #b33a3a;
  --info: #6a9ec7;
}

:root.dark {
  --bg-app: #111110;
  --bg-window: #1a1918;
  --bg-surface-1: #242321;
  --bg-surface-2: #2e2c29;
  --bg-surface-3: #38352f;
  --line-default: rgba(255, 255, 255, 0.06);
  --line-strong: rgba(255, 255, 255, 0.10);
  --text-primary: #faf9f5;
  --text-secondary: #c7c4bb;
  --text-muted: #8e8b82;
  --brand-primary: #a382ba;
  --brand-primary-hover: #b395c8;
  --brand-primary-active: #9170a8;
  --brand-soft: rgba(163, 130, 186, 0.12);
  --success: #5db872;
  --warning: #d4a017;
  --danger: #c64545;
  --info: #7db8d4;
}
```

保留文件中其他部分不变（body 样式、@keyframes 动画、滚动条样式）。

注意：body 的 `background: var(--bg-app)` 和 `color: var(--text-primary)` 保持不变，它们会自动跟随模式切换。

- [ ] **Step 2: 更新 pulse-blue 动画**

将 `pulse-blue` keyframe 中的 `#7c9cff` 替换为 `var(--brand-primary)`：

```css
@keyframes pulse-blue {
  0%, 100% { box-shadow: 0 0 0 0 var(--brand-primary); }
  50% { box-shadow: 0 0 0 6px transparent; }
}
```

- [ ] **Step 3: 启动 dev server 验证**

Run: `npm run dev`

在浏览器中打开，验证所有页面已自动变为 Light 模式（奶油白底 + 紫藤品牌色）。所有使用 token 的组件应已自动更新颜色。

- [ ] **Step 4: Commit**

```bash
git add src/app/globals.css
git commit -m "feat: dual-mode CSS variables — light cream + warm dark with mauve brand"
```

---

### Task 2: 更新 Tailwind 配置

**Files:**
- Modify: `tailwind.config.ts`

- [ ] **Step 1: 在 brand 颜色中添加 active 变体**

在 `tailwind.config.ts` 的 `colors` 对象中，`brand` 部分添加 `active`：

```ts
brand: {
  DEFAULT: 'var(--brand-primary)',
  hover: 'var(--brand-primary-hover)',
  active: 'var(--brand-primary-active)',
  soft: 'var(--brand-soft)',
},
```

- [ ] **Step 2: 验证 dev server 无报错**

Run: `npm run dev`

确认页面正常加载。

- [ ] **Step 3: Commit**

```bash
git add tailwind.config.ts
git commit -m "feat: add brand-active token to tailwind config"
```

---

### Task 3: 主题检测与切换逻辑

**Files:**
- Modify: `src/app/layout.tsx`
- Create: `src/lib/theme.ts`

- [ ] **Step 1: 创建 theme 工具模块**

创建 `src/lib/theme.ts`：

```ts
type ThemePreference = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'shrew-theme-preference';

export function getThemePreference(): ThemePreference {
  if (typeof window === 'undefined') return 'system';
  return (localStorage.getItem(STORAGE_KEY) as ThemePreference) || 'system';
}

export function setThemePreference(preference: ThemePreference) {
  localStorage.setItem(STORAGE_KEY, preference);
  applyTheme(preference);
}

export function applyTheme(preference: ThemePreference) {
  const root = document.documentElement;
  root.classList.remove('light', 'dark');

  if (preference === 'dark') {
    root.classList.add('dark');
  } else if (preference === 'light') {
    root.classList.add('light');
  } else {
    // system
    if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      root.classList.add('dark');
    }
  }
}

export function initTheme() {
  const preference = getThemePreference();
  applyTheme(preference);

  // 监听系统主题变化
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    if (getThemePreference() === 'system') {
      const root = document.documentElement;
      root.classList.remove('light', 'dark');
      if (e.matches) {
        root.classList.add('dark');
      }
    }
  });
}
```

注意：此文件不引入任何 Node.js 模块，仅使用 browser API，可在客户端组件中使用。

- [ ] **Step 2: 在 layout.tsx 中初始化主题**

修改 `src/app/layout.tsx`，添加一个内联 script 在页面渲染前设置主题 class（避免闪烁）：

```tsx
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Shrew',
  description: 'Voice-driven AI assistant',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var pref = localStorage.getItem('shrew-theme-preference');
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
      <body className="font-sans text-text-primary bg-bg-app">
        {children}
      </body>
    </html>
  );
}
```

关键点：
- `suppressHydrationWarning` 避免 React 对 class 不匹配报错
- 内联 script 同步执行，在 React hydration 前设置 class，避免主题闪烁
- 默认无 class → Light 模式（`:root` 变量）

- [ ] **Step 3: 验证主题切换**

Run: `npm run dev`

在浏览器 DevTools 中手动执行：
```js
document.documentElement.classList.add('dark')  // 切换到 Dark
document.documentElement.classList.remove('dark') // 切换到 Light
```

确认页面颜色正确切换。

- [ ] **Step 4: Commit**

```bash
git add src/lib/theme.ts src/app/layout.tsx
git commit -m "feat: dual-mode theme system with system preference detection"
```

---

### Task 4: 修复硬编码色值

**Files:**
- Modify: `src/app/memory/page.tsx`
- Modify: `src/app/skills/page.tsx`

- [ ] **Step 1: 修复 memory 页的 purple 硬编码**

在 `src/app/memory/page.tsx` 中，找到 `TYPE_COLORS` 对象（约行 16-22），将 `bg-purple-500/15 text-purple-400` 替换为 `bg-brand-soft text-brand`：

将类似这样的行：
```tsx
const TYPE_COLORS: Record<string, string> = {
  habit: 'bg-brand-soft text-brand',
  fact: 'bg-purple-500/15 text-purple-400',  // ← 修改这行
  ...
};
```

改为：
```tsx
  fact: 'bg-info/15 text-info',
```

- [ ] **Step 2: 修复 skills 页的 black 硬编码**

在 `src/app/skills/page.tsx` 中，找到模态遮罩（约行 124），将 `bg-black/70` 替换为：

```tsx
className="fixed inset-0 bg-bg-app/80 backdrop-blur-sm"
```

- [ ] **Step 3: 验证**

Run: `npm run dev`

打开 memory 页和 skills 页，确认颜色正确。

- [ ] **Step 4: Commit**

```bash
git add src/app/memory/page.tsx src/app/skills/page.tsx
git commit -m "fix: replace hardcoded colors with design tokens in memory and skills"
```

---

### Task 5: 新增 HeaderDropdown 组件

**Files:**
- Create: `src/components/ui/HeaderDropdown.tsx`

- [ ] **Step 1: 创建 HeaderDropdown 组件**

创建 `src/components/ui/HeaderDropdown.tsx`：

```tsx
'use client';

import { useState, useRef, useEffect, ReactNode } from 'react';

interface DropdownItem {
  label: string;
  href: string;
  icon?: string;
}

interface HeaderDropdownProps {
  items: DropdownItem[];
  dividerIndex?: number;
  trigger: ReactNode;
}

export function HeaderDropdown({ items, dividerIndex, trigger }: HeaderDropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  function handleSelect(item: DropdownItem) {
    setOpen(false);
    window.location.href = item.href;
  }

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(!open)} className="flex items-center">
        {trigger}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 w-52 bg-bg-surface-1 border border-line-default rounded-btn shadow-lg py-1 z-50">
          {items.map((item, i) => (
            <div key={item.href}>
              {dividerIndex !== undefined && i === dividerIndex && (
                <div className="border-t border-line-default my-1" />
              )}
              <button
                onClick={() => handleSelect(item)}
                className="w-full text-left px-4 py-2 text-body text-text-secondary hover:bg-bg-surface-2 hover:text-text-primary transition-colors flex items-center gap-3"
              >
                {item.icon && <span className="text-base">{item.icon}</span>}
                <span>{item.label}</span>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 验证组件可导入**

在任意页面临时 import 确认无编译错误。

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/HeaderDropdown.tsx
git commit -m "feat: add HeaderDropdown component for chat page navigation"
```

---

### Task 6: 更新 ChatHeader 集成下拉菜单

**Files:**
- Modify: `src/components/chat/ChatHeader.tsx`

- [ ] **Step 1: 在 ChatHeader 中集成 HeaderDropdown**

修改 `src/components/chat/ChatHeader.tsx`：

1. 在文件顶部添加 import：
```tsx
import { HeaderDropdown } from '@/components/ui/HeaderDropdown';
```

2. 定义菜单项（在组件函数内部）：
```tsx
const menuItems = [
  { label: '分身设定', href: '/persona', icon: '👤' },
  { label: '记忆管理', href: '/memory', icon: '🧠' },
  { label: '技能管理', href: '/skills', icon: '⚡' },
  { label: '服务连接', href: '/services', icon: '🔗' },
  { label: '设置', href: '/settings', icon: '⚙️' },
];
```

3. 将现有的设置齿轮按钮替换为 HeaderDropdown：
```tsx
<HeaderDropdown
  items={menuItems}
  dividerIndex={4}
  trigger={
    <svg className="w-5 h-5 text-text-muted hover:text-text-primary transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5ZM12 12.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5ZM12 18.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5Z" />
    </svg>
  }
/>
```

4. 移除 `onSettingsClick` prop（不再需要单独的设置按钮），但保留 props 接口以避免破坏 chat/page.tsx 的调用——或者同时更新 chat/page.tsx 移除该 prop 传递。选择后者：从 `ChatHeaderProps` 中删除 `onSettingsClick`。

- [ ] **Step 2: 更新 chat/page.tsx 移除 onSettingsClick**

在 `src/app/chat/page.tsx` 中，找到 `<ChatHeader>` 的调用处，移除 `onSettingsClick` prop。

- [ ] **Step 3: 验证**

Run: `npm run dev`

打开聊天页，点击右上角三点按钮，确认下拉菜单显示，点击菜单项可导航。

- [ ] **Step 4: Commit**

```bash
git add src/components/chat/ChatHeader.tsx src/app/chat/page.tsx
git commit -m "feat: integrate HeaderDropdown in chat header for page navigation"
```

---

### Task 7: 重写 detail 页

**Files:**
- Modify: `src/app/detail/page.tsx`

**说明：** 这是工作量最大的任务。359 行全部 inline styles 需要替换为 Tailwind + CSS 变量。同时移除 240px 左侧边栏。

- [ ] **Step 1: 重写 detail 页**

完整重写 `src/app/detail/page.tsx`，使用设计系统 token。关键结构：

```
PageHeader（返回 + 标题 + 耗时/费用）
Main Content（消息流）
  - UserMessage: bg-brand-soft border border-brand/30, 右对齐
  - AssistantMessage: bg-bg-surface-1 text-text-secondary, 左对齐
  - ToolCallItem: bg-bg-surface-2, 可展开
Bottom Input（仅 completed 状态可见）
```

重写要点：
1. 移除 `HistorySidebar` 组件和相关状态
2. 所有 inline style 替换为 Tailwind class
3. 所有硬编码色值（`#AF52DE`, `#1a1a1e` 等）替换为 design token
4. 消息气泡使用与 ChatStream 一致的样式 class
5. 工具调用展示使用 `bg-bg-surface-2` + `text-text-muted`
6. 保留所有功能逻辑（状态显示、工具调用展开/收起、底部输入框）

具体替换映射：
- `#1a1a1e` → `bg-bg-window`
- `#e0e0e0` → `text-text-secondary`
- `#666` → `text-text-muted`
- `rgba(175,82,222,0.2)` (用户消息) → `bg-brand-soft border border-brand/30`
- `#AF52DE` → `text-brand` / `bg-brand`
- `rgba(255,255,255,0.05)` → `bg-bg-surface-1`
- `rgba(255,255,255,0.08)` → `border-line-default`
- `#34C759` → `text-success`
- `#FF453A` → `text-danger`
- `#aaa` → `text-text-muted`

- [ ] **Step 2: 验证**

Run: `npm run dev`

打开 `/detail` 页面（可能需要从执行历史中点击进入），确认：
- 无 inline styles 残留
- 消息气泡颜色与聊天页一致
- 工具调用可展开/收起
- Dark/Light 模式都正确

- [ ] **Step 3: Commit**

```bash
git add src/app/detail/page.tsx
git commit -m "refactor: rewrite detail page with design system tokens, remove inline styles"
```

---

### Task 8: 更新 VoiceInput

**Files:**
- Modify: `src/components/VoiceInput.tsx`

- [ ] **Step 1: 替换 VoiceInput 中的硬编码色值**

在 `src/components/VoiceInput.tsx` 中，逐个替换 inline style 中的硬编码色值：

| 原值 | 替换为 | 位置 |
|------|--------|------|
| `rgba(17, 23, 42, 0.95)` | `var(--bg-window)` | 容器背景 |
| `#fff` (文本) | `var(--text-primary)` | 各处文本 |
| `rgba(80, 80, 80, 0.95)` | `var(--bg-surface-3)` | 关闭按钮 |
| `rgba(255,255,255,0.8)` | `var(--text-muted)` | 关闭按钮文字 |
| `rgba(200, 60, 60, 0.95)` | `var(--danger)` | 关闭按钮 hover |
| `#FF453A` | `var(--danger)` | 错误文本、录音脉冲 |
| `rgba(255,255,255,0.05)` | `var(--bg-surface-1)` | 助手消息背景 |

对于 inline style 的修改方式：将 `style={{ background: '#xxx' }}` 改为 `style={{ background: 'var(--bg-window)' }}`。

注意：保留毛玻璃效果 `backdropFilter: 'blur(20px)'`。

- [ ] **Step 2: 验证**

在 Electron 模式下测试语音输入浮窗。如果无法启动 Electron，在 dev 模式下访问 `/voice-bar` 页面确认样式。

- [ ] **Step 3: Commit**

```bash
git add src/components/VoiceInput.tsx
git commit -m "refactor: unify VoiceInput colors with CSS variables"
```

---

### Task 9: 更新 Onboarding 组件

**Files:**
- Modify: `src/components/Onboarding.tsx`

- [ ] **Step 1: 将内联输入框替换为 SingleLineInput 组件**

在 `src/components/Onboarding.tsx` 中：

1. 添加 import：
```tsx
import { SingleLineInput } from '@/components/ui/SingleLineInput';
```

2. 找到 volcengine、api-key、cwd 步骤中的内联 `<input>` 元素（约行 98, 105, 123, 138），替换为 `<SingleLineInput>` 组件。

例如，将：
```tsx
<input
  type="text"
  value={volcAppId}
  onChange={(e) => setVolcAppId(e.target.value)}
  className="w-full h-10 px-3 bg-bg-surface-2 border border-line-default text-text-primary focus:border-brand placeholder:text-text-muted rounded-input outline-none"
  placeholder="App ID"
/>
```

替换为：
```tsx
<SingleLineInput
  value={volcAppId}
  onChange={(e) => setVolcAppId(e.target.value)}
  placeholder="App ID"
/>
```

对其他 3 个 input 做同样的替换。

- [ ] **Step 2: 验证**

Run: `npm run dev`

访问 `/onboarding`，确认所有步骤的输入框样式一致。

- [ ] **Step 3: Commit**

```bash
git add src/components/Onboarding.tsx
git commit -m "refactor: replace inline inputs with SingleLineInput in onboarding"
```

---

### Task 10: 新增外观设置

**Files:**
- Create: `src/app/settings/appearance/page.tsx`
- Modify: `src/app/settings/page.tsx`

- [ ] **Step 1: 创建外观设置详情页**

创建 `src/app/settings/appearance/page.tsx`：

```tsx
'use client';

import { PageHeader } from '@/components/ui/PageHeader';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { ChipGroup } from '@/components/ui/ChipGroup';
import { useEffect, useState } from 'react';
import { getThemePreference, setThemePreference, applyTheme } from '@/lib/theme';

type ThemeMode = 'system' | 'light' | 'dark';

export default function AppearanceSettingsPage() {
  const [mode, setMode] = useState<ThemeMode>('system');

  useEffect(() => {
    setMode(getThemePreference());
  }, []);

  function handleChange(value: string) {
    const newMode = value as ThemeMode;
    setMode(newMode);
    setThemePreference(newMode);
  }

  return (
    <div className="min-h-screen bg-bg-window flex flex-col">
      <PageHeader title="外观" subtitle="选择 Shrew 的外观模式" onBack={() => window.history.back()} />
      <div className="flex-1 px-page-x pt-page-top">
        <SectionHeader title="外观模式" description="选择你偏好的配色方案。选择后立即生效。" />
        <div className="mt-widget-gap">
          <ChipGroup
            options={['system', 'light', 'dark']}
            value={mode}
            onChange={handleChange}
          />
          <div className="mt-block-gap flex gap-4">
            <div className="flex-1 rounded-card p-card-p border border-line-default text-center">
              <div className="text-card-title text-text-primary mb-1">浅色</div>
              <div className="text-body-sm text-text-muted">适合明亮环境</div>
            </div>
            <div className="flex-1 rounded-card p-card-p border border-line-default text-center">
              <div className="text-card-title text-text-primary mb-1">深色</div>
              <div className="text-body-sm text-text-muted">适合暗光环境</div>
            </div>
            <div className="flex-1 rounded-card p-card-p border border-line-default text-center">
              <div className="text-card-title text-text-primary mb-1">跟随系统</div>
              <div className="text-body-sm text-text-muted">自动适配</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 在设置总页添加外观卡片**

修改 `src/app/settings/page.tsx`：

1. 在 SummaryCard 列表中（在"交互偏好"之后、"数据与隐私"之前），添加外观卡片：

```tsx
<SummaryCard
  title="外观"
  summary="选择浅色或深色模式"
  status="default"
  onClick={() => (window.location.href = '/settings/appearance')}
/>
```

2. 将现有的 5 张 SummaryCard 的 status 和 summary 更新为合适的中文描述。

- [ ] **Step 3: 验证**

Run: `npm run dev`

1. 打开设置页，确认出现"外观"卡片
2. 点击进入外观设置
3. 切换 mode 选择，确认页面立即变色
4. 刷新页面，确认选择被保留

- [ ] **Step 4: Commit**

```bash
git add src/app/settings/appearance/page.tsx src/app/settings/page.tsx
git commit -m "feat: add appearance settings with instant theme switching"
```

---

### Task 11: 填充交互偏好页

**Files:**
- Modify: `src/app/settings/preferences/page.tsx`

- [ ] **Step 1: 重写交互偏好页**

将 `src/app/settings/preferences/page.tsx` 从空壳改为包含实际配置项：

```tsx
'use client';

import { useState } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { ChipGroup } from '@/components/ui/ChipGroup';
import { BottomActionBar } from '@/components/ui/BottomActionBar';
import { Button } from '@/components/ui/Button';

export default function PreferencesSettingsPage() {
  const [permissionMode, setPermissionMode] = useState('confirm');
  const [enterBehavior, setEnterBehavior] = useState('send');

  return (
    <div className="min-h-screen bg-bg-window flex flex-col">
      <PageHeader title="交互偏好" subtitle="自定义 Shrew 的交互方式" onBack={() => window.history.back()} />
      <div className="flex-1 px-page-x pt-page-top space-y-section-gap">
        <div>
          <SectionHeader title="权限模式" description="Shrew 执行命令时的确认策略" />
          <div className="mt-widget-gap">
            <ChipGroup
              options={['confirm', 'auto']}
              value={permissionMode}
              onChange={setPermissionMode}
            />
          </div>
        </div>
        <div>
          <SectionHeader title="Enter 键行为" description="在输入框中按下 Enter 键的默认行为" />
          <div className="mt-widget-gap">
            <ChipGroup
              options={['send', 'newline']}
              value={enterBehavior}
              onChange={setEnterBehavior}
            />
          </div>
        </div>
      </div>
      <BottomActionBar>
        <Button variant="primary">保存更改</Button>
      </BottomActionBar>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/settings/preferences/page.tsx
git commit -m "feat: add permission mode and enter behavior preferences"
```

---

### Task 12: 填充数据与隐私页

**Files:**
- Modify: `src/app/settings/privacy/page.tsx`

- [ ] **Step 1: 重写数据与隐私页**

将 `src/app/settings/privacy/page.tsx` 从空壳改为包含实际配置项：

```tsx
'use client';

import { useState } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { SingleLineInput } from '@/components/ui/SingleLineInput';
import { Button } from '@/components/ui/Button';
import { BottomActionBar } from '@/components/ui/BottomActionBar';

export default function PrivacySettingsPage() {
  const [retentionDays, setRetentionDays] = useState('30');

  return (
    <div className="min-h-screen bg-bg-window flex flex-col">
      <PageHeader title="数据与隐私" subtitle="管理数据保留和清除" onBack={() => window.history.back()} />
      <div className="flex-1 px-page-x pt-page-top space-y-section-gap">
        <div>
          <SectionHeader title="执行历史" description="控制 Shrew 保留执行记录的时长" />
          <div className="mt-widget-gap">
            <SingleLineInput
              label="保留天数"
              type="number"
              value={retentionDays}
              onChange={(e) => setRetentionDays(e.target.value)}
              helperText="超过天数的历史记录将自动清除"
            />
          </div>
        </div>
        <div>
          <SectionHeader title="清除数据" description="立即清除所有执行历史" />
          <div className="mt-widget-gap">
            <Button variant="secondary" size="sm">清除执行历史</Button>
          </div>
        </div>
      </div>
      <BottomActionBar>
        <Button variant="primary">保存更改</Button>
      </BottomActionBar>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/settings/privacy/page.tsx
git commit -m "feat: add retention days and clear history to privacy settings"
```

---

### Task 13: 全局一致性检查

**Files:**
- 可能微调任何文件

- [ ] **Step 1: 搜索残留硬编码色值**

Run:
```bash
grep -rn '#[0-9a-fA-F]\{3,8\}' src/ --include="*.tsx" --include="*.ts" | grep -v node_modules | grep -v '.next' | grep -v 'globals.css' | grep -v 'tailwind.config'
```

检查结果中是否有遗漏的硬编码色值。如有，替换为 CSS 变量。

- [ ] **Step 2: 搜索残留的旧品牌色**

Run:
```bash
grep -rn '7c9cff\|7C9CFF' src/ --include="*.tsx" --include="*.ts" --include="*.css"
```

确认无蓝色品牌色残留。

- [ ] **Step 3: 逐页验证 Dark 和 Light 模式**

Run: `npm run dev`

访问每个页面，在 DevTools 中切换 `document.documentElement.classList.toggle('dark')`，确认：

- `/chat` — 消息气泡、输入区、header
- `/settings` — 卡片、导航按钮
- `/settings/provider` — 表单、状态徽章
- `/settings/voice` — 表单、slider
- `/settings/runtime` — 路径输入
- `/settings/preferences` — ChipGroup
- `/settings/privacy` — 表单
- `/settings/appearance` — ChipGroup 即时预览
- `/persona` — 头像、ChipGroup
- `/memory` — 记忆卡片、类型标签
- `/skills` — 技能列表、弹窗
- `/services` — 服务列表
- `/detail` — 消息气泡、工具调用
- `/onboarding` — 输入框、按钮
- `/voice-bar` — 录音状态、输入区

- [ ] **Step 4: 最终 Commit**

```bash
git add -A
git commit -m "chore: final consistency check — no hardcoded colors remaining"
```
