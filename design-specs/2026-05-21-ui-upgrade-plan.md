# Lumi UI 全面升级实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 Lumi 全产品 UI 从暖色淡紫风格升级为暖琥珀铜 + 玻璃质感 + Lucide 图标的统一设计系统。

**Architecture:** 方案 B（组件重构 + 视觉升级）。先更新全局 token，再逐个重写组件，最后逐页迁移。每完成一个 task 即可提交验证。

**Tech Stack:** Tailwind CSS v4 + Lucide React + Clash Display + Playfair Display

**设计文档:** `design-specs/2026-05-21-ui-upgrade-design.md`

---

## File Map

### 新增文件
- `src/components/ui/GlassCard.tsx` — 替代 SummaryCard + ListCard 的统一卡片组件
- `public/fonts/clash-display/` — Clash Display 字体文件
- `public/fonts/playfair-display/` — Playfair Display 字体文件

### 修改文件（按依赖顺序）

**全局层：**
- `src/app/globals.css` — 颜色变量
- `tailwind.config.ts` — 字体、间距、圆角、字号
- `src/app/layout.tsx` — 字体加载

**组件层：**
- `src/components/ui/Button.tsx` — 新变体样式
- `src/components/ui/StatusBadge.tsx` — 圆点 + 微底色
- `src/components/ui/SummaryCard.tsx` → 删除（由 GlassCard 替代）
- `src/components/ui/ListCard.tsx` → 删除（由 GlassCard 替代）
- `src/components/ui/PageHeader.tsx` — Lucide 图标
- `src/components/ui/SectionHeader.tsx` — 新分组标签样式
- `src/components/ui/SingleLineInput.tsx` — 玻璃输入框
- `src/components/ui/Textarea.tsx` — 同上
- `src/components/ui/Select.tsx` — 同上
- `src/components/ui/ChipGroup.tsx` — 新切换样式
- `src/components/ui/BottomActionBar.tsx` — 模糊底栏
- `src/components/ui/EmptyState.tsx` — Lucide 图标
- `src/components/ui/HeaderDropdown.tsx` — Lucide 图标

**页面层（全部使用新组件迁移）：**
- `src/app/(main)/settings/page.tsx`
- `src/app/(main)/settings/appearance/page.tsx`
- `src/app/(main)/settings/runtime/page.tsx`
- `src/app/(main)/settings/provider/page.tsx`
- `src/app/(main)/settings/voice/page.tsx`
- `src/app/(main)/settings/voice/tutorial/page.tsx`
- `src/app/(main)/settings/wake-word/page.tsx`
- `src/app/(main)/memory/page.tsx`
- `src/app/(main)/persona/page.tsx`
- `src/app/(main)/skills/page.tsx`
- `src/app/(main)/services/page.tsx`
- `src/app/(main)/chat/page.tsx`
- `src/app/(main)/detail/page.tsx`
- `src/app/(main)/onboarding/page.tsx`

**Chat 组件：**
- `src/components/chat/ChatHeader.tsx`
- `src/components/chat/ChatStream.tsx`
- `src/components/chat/ChatInput.tsx`

**Onboarding 组件：**
- `src/components/Onboarding.tsx`
- `src/components/OnboardingShell.tsx`
- `src/components/CompletionScreen.tsx`

**其他组件：**
- `src/components/VoiceInput.tsx`
- `src/components/AvatarCropModal.tsx`

**透明页面：**
- `src/app/(transparent)/voice-bar/page.tsx`
- `src/app/(transparent)/subtitle/page.tsx`

**Electron：**
- `electron/main.ts` — 窗口尺寸
- `electron/detail-window.ts` — 窗口尺寸

---

## Task 1: 全局 Token 更新 + 依赖安装

**Files:**
- Modify: `src/app/globals.css`
- Modify: `tailwind.config.ts`
- Modify: `src/app/layout.tsx`
- Modify: `package.json` (via npm install)

- [ ] **Step 1: 安装依赖**

```bash
cd /Users/rikiwang/Documents/Agent/Lumi
npm install lucide-react
```

- [ ] **Step 2: 下载字体文件到本地**

下载 Clash Display 和 Playfair Display 的 WOFF2 文件到 `public/fonts/` 目录：

```bash
mkdir -p public/fonts/clash-display public/fonts/playfair-display
```

Clash Display: 从 https://fontshare.com/fonts/clash-display 下载，放入 `public/fonts/clash-display/`
Playfair Display: 从 Google Fonts 下载，放入 `public/fonts/playfair-display/`

- [ ] **Step 3: 添加 @font-face 到 globals.css**

在 `src/app/globals.css` 文件顶部，`@import` 之前，添加字体声明：

```css
@font-face {
  font-family: 'Clash Display';
  src: url('/fonts/clash-display/ClashDisplay-Regular.woff2') format('woff2');
  font-weight: 400;
  font-style: normal;
  font-display: swap;
}
@font-face {
  font-family: 'Clash Display';
  src: url('/fonts/clash-display/ClashDisplay-Medium.woff2') format('woff2');
  font-weight: 500;
  font-style: normal;
  font-display: swap;
}
@font-face {
  font-family: 'Clash Display';
  src: url('/fonts/clash-display/ClashDisplay-Semibold.woff2') format('woff2');
  font-weight: 600;
  font-style: normal;
  font-display: swap;
}
@font-face {
  font-family: 'Clash Display';
  src: url('/fonts/clash-display/ClashDisplay-Bold.woff2') format('woff2');
  font-weight: 700;
  font-style: normal;
  font-display: swap;
}
@font-face {
  font-family: 'Playfair Display';
  src: url('/fonts/playfair-display/PlayfairDisplay-Bold.woff2') format('woff2');
  font-weight: 700;
  font-style: normal;
  font-display: swap;
}
@font-face {
  font-family: 'Playfair Display';
  src: url('/fonts/playfair-display/PlayfairDisplay-Semibold.woff2') format('woff2');
  font-weight: 600;
  font-style: normal;
  font-display: swap;
}
```

- [ ] **Step 4: 更新 globals.css 颜色变量**

替换 `:root` (light mode) 中的品牌色变量：

```css
:root {
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
  --brand-primary: #B8723D;
  --brand-primary-hover: #CA8350;
  --brand-primary-active: #A06130;
  --brand-soft: rgba(184, 114, 61, 0.12);
  --success: #4a9e5f;
  --warning: #b88a0f;
  --danger: #b33a3a;
  --info: #6a9ec7;
}
```

替换 `:root.dark` 中的变量：

```css
:root.dark {
  --bg-app: #111110;
  --bg-window: #1a1918;
  --bg-surface-1: #242320;
  --bg-surface-2: #2e2c28;
  --bg-surface-3: #383530;
  --line-default: rgba(255, 255, 255, 0.06);
  --line-strong: rgba(255, 255, 255, 0.10);
  --text-primary: #faf9f5;
  --text-secondary: #c7c4bb;
  --text-muted: #8e8b82;
  --brand-primary: #D4915C;
  --brand-primary-hover: #E0A46F;
  --brand-primary-active: #C07E4A;
  --brand-soft: rgba(212, 145, 92, 0.15);
  --success: #5db872;
  --warning: #d4a017;
  --danger: #c64545;
  --info: #7db8d4;
}
```

- [ ] **Step 5: 更新 tailwind.config.ts**

替换 `theme.extend` 内容：

```ts
// fontFamily
fontFamily: {
  sans: ["'Clash Display'", "Inter", "system-ui", "-apple-system", "BlinkMacSystemFont", "'PingFang SC'", "'Hiragino Sans GB'", "'Microsoft YaHei'", "sans-serif"],
  display: ["'Playfair Display'", "serif"],
},

// fontSize — 调整层级
fontSize: {
  "page-title": ["24px", { lineHeight: "1.2", fontWeight: "700" }],
  "section-title": ["15px", { lineHeight: "1.4", fontWeight: "600" }],
  "card-title": ["14px", { lineHeight: "1.4", fontWeight: "600" }],
  body: ["14px", { lineHeight: "1.6" }],
  "body-sm": ["13px", { lineHeight: "1.6" }],
  label: ["12px", { lineHeight: "1.4", fontWeight: "500" }],
  "label-xs": ["11px", { lineHeight: "1.4", fontWeight: "500" }],
  "section-tag": ["11px", { lineHeight: "1.0", fontWeight: "600", letterSpacing: "0.08em" }],
},

// borderRadius — 简化
borderRadius: {
  card: "12px",
  btn: "10px",
  "icon-box": "9px",
  chip: "999px",
},

// spacing — 微调
spacing: {
  "page-x": "20px",
  "page-top": "16px",
  "section-gap": "24px",
  "card-p": "16px",
  "card-gap": "8px",
  "item-gap": "12px",
},
```

删除不再使用的 token：`window-title`、`page-subtitle`、`rounded-window`、`rounded-card-sm`、`rounded-input`、`widget-gap`、`block-gap`。

- [ ] **Step 6: 提交**

```bash
git add -A
git commit -m "feat(ui): update global design tokens — amber brand color, Clash Display font, refined spacing"
```

---

## Task 2: 核心 UI 组件 — Button + StatusBadge + GlassCard + ChipGroup

**Files:**
- Create: `src/components/ui/GlassCard.tsx`
- Rewrite: `src/components/ui/Button.tsx`
- Rewrite: `src/components/ui/StatusBadge.tsx`
- Rewrite: `src/components/ui/ChipGroup.tsx`

- [ ] **Step 1: 重写 Button.tsx**

```tsx
'use client'

import { type LucideIcon } from 'lucide-react'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'icon'
type ButtonSize = 'default' | 'sm'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  icon?: LucideIcon
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'bg-brand-primary text-white hover:bg-brand-primary-hover active:bg-brand-primary-active',
  secondary: 'border border-brand-primary/30 text-brand-primary hover:bg-brand-primary/10 active:bg-brand-primary/15',
  ghost: 'text-text-muted hover:text-text-secondary hover:bg-bg-surface-1',
  danger: 'border border-danger/25 text-[#a06060] dark:text-[#a06060] hover:bg-danger/10 active:bg-danger/15',
  icon: 'w-9 h-9 bg-bg-surface-1 text-text-muted hover:text-text-secondary hover:bg-bg-surface-2',
}

const sizeClasses: Record<ButtonSize, string> = {
  default: 'h-9 px-[18px]',
  sm: 'h-[30px] px-3',
}

export default function Button({
  variant = 'primary',
  size = 'default',
  icon: Icon,
  children,
  className = '',
  ...props
}: ButtonProps) {
  return (
    <button
      className={`
        inline-flex items-center justify-center gap-1.5
        rounded-btn text-[13px] font-medium
        transition-all duration-150 ease-out
        disabled:opacity-40 disabled:pointer-events-none
        ${variant === 'icon' ? '' : sizeClasses[size]}
        ${variantClasses[variant]}
        ${className}
      `}
      {...props}
    >
      {Icon && <Icon size={variant === 'icon' ? 16 : 15} strokeWidth={1.8} />}
      {variant !== 'icon' && children}
    </button>
  )
}
```

- [ ] **Step 2: 重写 StatusBadge.tsx**

```tsx
'use client'

interface StatusBadgeProps {
  status: 'success' | 'warning' | 'danger' | 'info' | 'default'
  label: string
}

const dotColors: Record<StatusBadgeProps['status'], string> = {
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  info: 'bg-info',
  default: 'bg-text-muted',
}

export default function StatusBadge({ status, label }: StatusBadgeProps) {
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-chip bg-[rgba(255,255,255,0.03)] dark:bg-[rgba(255,255,255,0.03)] bg-[rgba(0,0,0,0.03)] text-label text-text-secondary">
      <span className={`w-1.5 h-1.5 rounded-full ${dotColors[status]}`} />
      {label}
    </span>
  )
}
```

- [ ] **Step 3: 创建 GlassCard.tsx**

```tsx
'use client'

import { ChevronRight, type LucideIcon } from 'lucide-react'

type GlassCardVariant = 'nav' | 'content' | 'status'

interface BaseProps {
  variant?: GlassCardVariant
  className?: string
  onClick?: () => void
  children: React.ReactNode
}

interface NavCardProps extends BaseProps {
  variant: 'nav'
  icon: LucideIcon
  iconColor?: string
  title: string
  description?: string
}

interface StatusCardProps extends BaseProps {
  variant: 'status'
  icon: LucideIcon
  iconColor?: string
  title: string
  description?: string
  badge?: React.ReactNode
}

interface ContentCardProps extends BaseProps {
  variant: 'content'
}

type GlassCardProps = NavCardProps | StatusCardProps | ContentCardProps

export default function GlassCard(props: GlassCardProps) {
  const { variant = 'content', className = '', onClick, children } = props

  const baseClass = `
    rounded-card p-card-p
    bg-bg-surface-1/50 dark:bg-bg-surface-1/50
    backdrop-blur-xl
    border border-line-default dark:border-[rgba(255,255,255,0.04)]
    transition-all duration-200 ease-out
    ${onClick ? 'cursor-pointer hover:bg-bg-surface-1/70 active:scale-[0.99]' : ''}
    ${className}
  `

  if (variant === 'nav' || variant === 'status') {
    const { icon: Icon, iconColor, title, description } = props
    return (
      <div className={baseClass} onClick={onClick}>
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-icon-box flex items-center justify-center ${iconColor ? `bg-[${iconColor}]/12` : 'bg-bg-surface-2'}`}>
            <Icon size={18} strokeWidth={1.8} className={iconColor || 'text-text-muted'} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-card-title text-text-primary">{title}</div>
            {description && <div className="text-body-sm text-text-muted mt-0.5 truncate">{description}</div>}
          </div>
          {variant === 'status' && 'badge' in props && props.badge}
          {variant === 'nav' && <ChevronRight size={14} className="text-text-muted" strokeWidth={2} />}
        </div>
      </div>
    )
  }

  return <div className={baseClass} onClick={onClick}>{children}</div>
}
```

注意：`iconColor` 传 Tailwind 颜色类名如 `text-brand-primary`。

- [ ] **Step 4: 重写 ChipGroup.tsx**

```tsx
'use client'

interface ChipGroupProps {
  options: string[]
  value: string
  onChange: (value: string) => void
}

export default function ChipGroup({ options, value, onChange }: ChipGroupProps) {
  return (
    <div className="flex gap-1.5 p-1 rounded-btn bg-bg-surface-1/40">
      {options.map((option) => (
        <button
          key={option}
          onClick={() => onChange(option)}
          className={`
            px-3.5 py-1.5 rounded-lg text-[13px] font-medium transition-all duration-150
            ${option === value
              ? 'bg-brand-soft text-text-primary border border-brand-primary/20'
              : 'text-text-muted hover:text-text-secondary'
            }
          `}
        >
          {option}
        </button>
      ))}
    </div>
  )
}
```

- [ ] **Step 5: 提交**

```bash
git add src/components/ui/Button.tsx src/components/ui/StatusBadge.tsx src/components/ui/GlassCard.tsx src/components/ui/ChipGroup.tsx
git commit -m "feat(ui): rewrite core components — Button, StatusBadge, GlassCard, ChipGroup"
```

---

## Task 3: 布局组件 — PageHeader + SectionHeader + BottomActionBar

**Files:**
- Rewrite: `src/components/ui/PageHeader.tsx`
- Rewrite: `src/components/ui/SectionHeader.tsx`
- Rewrite: `src/components/ui/BottomActionBar.tsx`

- [ ] **Step 1: 重写 PageHeader.tsx**

```tsx
'use client'

import { ArrowLeft, type LucideIcon } from 'lucide-react'

interface PageHeaderProps {
  title: string
  onBack?: () => void
  actions?: React.ReactNode
}

export default function PageHeader({ title, onBack, actions }: PageHeaderProps) {
  return (
    <div className="flex items-center gap-2.5 pt-12 pb-3" style={{ WebkitAppRegion: 'drag' } as any}>
      {onBack && (
        <button
          onClick={onBack}
          style={{ WebkitAppRegion: 'no-drag' } as any}
          className="w-[30px] h-[30px] rounded-btn bg-bg-surface-1/60 flex items-center justify-center text-text-muted hover:text-text-secondary transition-colors duration-150"
        >
          <ArrowLeft size={14} strokeWidth={2} />
        </button>
      )}
      <h1 className="font-display text-page-title text-text-primary">{title}</h1>
      {actions && (
        <div className="ml-auto flex items-center gap-2" style={{ WebkitAppRegion: 'no-drag' } as any}>
          {actions}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: 重写 SectionHeader.tsx**

```tsx
'use client'

interface SectionHeaderProps {
  title: string
  description?: string
  action?: React.ReactNode
  tag?: string
}

export default function SectionHeader({ title, description, action, tag }: SectionHeaderProps) {
  return (
    <div className="flex justify-between items-start">
      <div>
        {tag && (
          <div className="text-section-tag text-brand-primary uppercase mb-2">{tag}</div>
        )}
        <div className="text-section-title text-text-primary">{title}</div>
        {description && <div className="text-body-sm text-text-muted mt-1">{description}</div>}
      </div>
      {action && <div className="flex-shrink-0">{action}</div>}
    </div>
  )
}
```

- [ ] **Step 3: 重写 BottomActionBar.tsx**

```tsx
export default function BottomActionBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="
      sticky bottom-0 px-page-x py-3.5
      bg-bg-window/90 dark:bg-bg-window/90 backdrop-blur-xl
      border-t border-[rgba(255,255,255,0.04)] dark:border-[rgba(255,255,255,0.04)]
      flex justify-end gap-2.5
    ">
      {children}
    </div>
  )
}
```

- [ ] **Step 4: 提交**

```bash
git add src/components/ui/PageHeader.tsx src/components/ui/SectionHeader.tsx src/components/ui/BottomActionBar.tsx
git commit -m "feat(ui): rewrite layout components — PageHeader with Lucide, SectionHeader with tag, blur BottomActionBar"
```

---

## Task 4: 表单组件 — SingleLineInput + Textarea + Select + EmptyState + HeaderDropdown

**Files:**
- Rewrite: `src/components/ui/SingleLineInput.tsx`
- Rewrite: `src/components/ui/Textarea.tsx`
- Rewrite: `src/components/ui/Select.tsx`
- Rewrite: `src/components/ui/EmptyState.tsx`
- Rewrite: `src/components/ui/HeaderDropdown.tsx`

- [ ] **Step 1: 重写 SingleLineInput.tsx**

保持现有 props 接口不变，更新样式类：

- 容器：`bg-bg-surface-1/60 border border-line-default rounded-btn` → focus 时 `border-brand-primary/30`
- 标签：`text-label text-text-muted`
- 帮助文字：`text-label-xs text-text-muted`

- [ ] **Step 2: 重写 Textarea.tsx**

同 SingleLineInput 的样式方向，`min-h-[88px]`。

- [ ] **Step 3: 重写 Select.tsx**

同上样式方向，`h-10`。

- [ ] **Step 4: 重写 EmptyState.tsx**

将 `icon?: string`（emoji）改为接受 Lucide 图标组件。现有调用处需更新传入方式：

```tsx
import { type LucideIcon } from 'lucide-react'

interface EmptyStateProps {
  icon?: LucideIcon
  title: string
  description?: string
  action?: React.ReactNode
}
```

图标容器：`w-12 h-12 rounded-icon-box bg-bg-surface-1 flex items-center justify-center`，颜色 `text-text-muted`。

- [ ] **Step 5: 重写 HeaderDropdown.tsx**

将内联 SVG 三点图标替换为 `<MoreVertical size={16} />` from Lucide。
将 `icon` 属性从 emoji 改为 Lucide 图标组件引用。

- [ ] **Step 6: 提交**

```bash
git add src/components/ui/SingleLineInput.tsx src/components/ui/Textarea.tsx src/components/ui/Select.tsx src/components/ui/EmptyState.tsx src/components/ui/HeaderDropdown.tsx
git commit -m "feat(ui): rewrite form components with glass style, Lucide icons"
```

---

## Task 5: 迁移 Settings 页面（Hub + 全部子页面）

**Files:**
- Rewrite: `src/app/(main)/settings/page.tsx`
- Modify: `src/app/(main)/settings/appearance/page.tsx`
- Modify: `src/app/(main)/settings/runtime/page.tsx`
- Modify: `src/app/(main)/settings/provider/page.tsx`
- Modify: `src/app/(main)/settings/voice/page.tsx`
- Modify: `src/app/(main)/settings/voice/tutorial/page.tsx`
- Rewrite: `src/app/(main)/settings/wake-word/page.tsx`
- Delete: `src/components/ui/SummaryCard.tsx`
- Delete: `src/components/ui/ListCard.tsx`

- [ ] **Step 1: 重写 settings/page.tsx**

- 用 SectionHeader 的 `tag` 属性做分组标签（「服务连接」「通用设置」「关于」）
- SummaryCard → GlassCard variant="status"（带 StatusBadge）或 variant="nav"
- Lucide 图标替代 emoji：`Cpu`（AI）、`Mic`（语音）、`Sun`（外观）、`Terminal`（运行时）、`AudioWaveform`（唤醒词）

- [ ] **Step 2: 更新 settings/appearance/page.tsx**

- ChipGroup 已自动获得新样式（Task 2 重写）
- 预览卡片用 GlassCard variant="content" 包裹

- [ ] **Step 3: 更新 settings/runtime/page.tsx**

- 组件接口不变，只需确认新 Input + Button 样式正确应用

- [ ] **Step 4: 更新 settings/provider/page.tsx**

- ProviderCard（页面内局部组件）的 `border-brand` 样式会自动跟随新品牌色
- Unicode `▾` → `<ChevronDown size={14} />`
- toast 样式跟随新 `success`/`danger` 色

- [ ] **Step 5: 更新 settings/voice/page.tsx**

- 分隔线从 `border-t border-line-default my-section-gap` 更新为更含蓄的 `border-t border-[rgba(255,255,255,0.04)]`
- 确认新 Input 和 Select 组件样式

- [ ] **Step 6: 更新 settings/voice/tutorial/page.tsx**

- Tab 切换用 ChipGroup 替代手动按钮
- Unicode `→` → `<ArrowRight size={12} />`

- [ ] **Step 7: 重写 settings/wake-word/page.tsx**

这是唯一混用硬编码 Tailwind 类的页面。全部改为设计 token：
- `bg-red-50 dark:bg-red-900/20` → `bg-danger/10 text-danger`
- `bg-blue-500` → `bg-brand-primary`（toggle）
- `bg-gray-300 dark:bg-gray-600` → `bg-bg-surface-2`（toggle off）
- `bg-green-100 dark:bg-green-900/30` → StatusBadge `status="success"`
- `bg-blue-50 dark:bg-blue-900/20` → `bg-brand-soft`

- [ ] **Step 8: 删除旧组件，提交**

```bash
rm src/components/ui/SummaryCard.tsx src/components/ui/ListCard.tsx
git add -A
git commit -m "feat(ui): migrate settings pages to new design system with GlassCard and Lucide"
```

---

## Task 6: 迁移 Memory + Persona 页面

**Files:**
- Modify: `src/app/(main)/memory/page.tsx`
- Modify: `src/app/(main)/persona/page.tsx`

- [ ] **Step 1: 更新 memory/page.tsx**

- 手动 tab 按钮 → ChipGroup
- `▲`/`▼` → `<ChevronUp size={14} />` / `<ChevronDown size={14} />`
- ListCard → GlassCard variant="content"
- 编辑/删除按钮用 Button variant="ghost"

- [ ] **Step 2: 更新 persona/page.tsx**

- 头像 hover overlay 保持不变
- 输入区域已使用 SingleLineInput + Textarea，新样式自动生效
- BottomActionBar 已使用新模糊底栏

- [ ] **Step 3: 提交**

```bash
git add src/app/\(main\)/memory/page.tsx src/app/\(main\)/persona/page.tsx
git commit -m "feat(ui): migrate memory and persona pages to new design system"
```

---

## Task 7: 迁移 Skills + Services 页面

**Files:**
- Modify: `src/app/(main)/skills/page.tsx`
- Modify: `src/app/(main)/services/page.tsx`

- [ ] **Step 1: 更新 skills/page.tsx**

- Modal overlay：`bg-bg-app/80 backdrop-blur-sm` 保持
- ListCard → GlassCard variant="content"
- `opacity-60` 禁用状态保持

- [ ] **Step 2: 更新 services/page.tsx**

- ListCard → GlassCard variant="content"
- 状态显示用新 StatusBadge

- [ ] **Step 3: 提交**

```bash
git add src/app/\(main\)/skills/page.tsx src/app/\(main\)/services/page.tsx
git commit -m "feat(ui): migrate skills and services pages"
```

---

## Task 8: 重写 Chat 组件（ChatHeader + ChatStream + ChatInput）

**Files:**
- Rewrite: `src/components/chat/ChatHeader.tsx`
- Rewrite: `src/components/chat/ChatStream.tsx`
- Rewrite: `src/components/chat/ChatInput.tsx`
- Modify: `src/app/(main)/chat/page.tsx`

- [ ] **Step 1: 重写 ChatHeader.tsx**

- Emoji 图标 → Lucide：`👤`→`User`，`🧠`→`Brain`，`⚡`→`Zap`，`⚙️`→`Settings`
- 内联 SVG 三点菜单 → `<MoreVertical size={16} />`（通过 HeaderDropdown）
- 状态点保持当前 CSS 动画，颜色跟随新 token

- [ ] **Step 2: 重写 ChatStream.tsx**

- 用户消息气泡：`bg-brand-soft border border-brand-primary/20 rounded-[12px_12px_4px_12px]`
- AI 消息气泡：`bg-bg-surface-1/50 backdrop-blur-xl rounded-[4px_12px_12px_12px]`（玻璃效果）
- 系统消息：不变
- 流式指示器保持动画，颜色跟随新品牌色

- [ ] **Step 3: 重写 ChatInput.tsx**

- 外壳：`bg-bg-surface-1/60 backdrop-blur-xl border border-line-default rounded-btn`
- 发送按钮：`➤` → `<Send size={14} />` from Lucide，品牌色
- focus 状态：`border-brand-primary/30`

- [ ] **Step 4: 更新 chat/page.tsx**

- 确认组件组装正确，间距一致

- [ ] **Step 5: 提交**

```bash
git add src/components/chat/ src/app/\(main\)/chat/page.tsx
git commit -m "feat(ui): rewrite chat components with glass style and Lucide icons"
```

---

## Task 9: 迁移 Detail 页面

**Files:**
- Modify: `src/app/(main)/detail/page.tsx`

- [ ] **Step 1: 更新 detail/page.tsx**

- PageHeader 已自动获得 Lucide 返回按钮（Task 3）
- 消息气泡样式跟随 ChatStream 的新风格
- `➤` → `<Send size={14} />`
- 工具调用项用 GlassCard 包裹
- StatusBadge 已自动获得新样式

- [ ] **Step 2: 提交**

```bash
git add src/app/\(main\)/detail/page.tsx
git commit -m "feat(ui): migrate detail page to new design system"
```

---

## Task 10: 迁移 Onboarding 流程

**Files:**
- Modify: `src/components/Onboarding.tsx`
- Modify: `src/components/OnboardingShell.tsx`
- Modify: `src/components/CompletionScreen.tsx`

- [ ] **Step 1: 更新 OnboardingShell.tsx**

- `← 返回` → `<ArrowLeft size={14} />`
- 进度圆点颜色跟随新 `brand-primary`

- [ ] **Step 2: 更新 CompletionScreen.tsx**

- Emoji `🎙️` `⌥` → Lucide 图标 `Mic` `Option`（或 `Keyboard`）
- 内联样式按钮 → Button 组件

- [ ] **Step 3: 更新 Onboarding.tsx**

- `✓` → `<Check size={14} />`
- `▾` → `<ChevronDown size={14} />`
- ProviderCard 样式跟随新品牌色
- SummaryCard 引用 → GlassCard

- [ ] **Step 4: 提交**

```bash
git add src/components/Onboarding.tsx src/components/OnboardingShell.tsx src/components/CompletionScreen.tsx
git commit -m "feat(ui): migrate onboarding flow to new design system"
```

---

## Task 11: 透明页面 + VoiceInput + AvatarCropModal

**Files:**
- Modify: `src/app/(transparent)/voice-bar/page.tsx`
- Modify: `src/app/(transparent)/subtitle/page.tsx`
- Modify: `src/components/VoiceInput.tsx`
- Modify: `src/components/AvatarCropModal.tsx`

- [ ] **Step 1: 更新 voice-bar/page.tsx**

- 硬编码颜色替换为 CSS 变量引用（通过 `getComputedStyle` 或直接映射）
- 布局不变

- [ ] **Step 2: 更新 subtitle/page.tsx**

- `rgb(28, 28, 35)` → `var(--bg-window)` 颜色映射
- `#4CAF50` → `var(--brand-primary)`（播放指示色）
- 内联 SVG close → `<X size={14} />` from Lucide
- 动画保持

- [ ] **Step 3: 更新 VoiceInput.tsx**

- `rgb(40, 40, 52)` → `var(--bg-surface-1)`
- `#4CAF50` → `var(--success)`（录制状态）
- `#7AA8FF` → `var(--brand-primary)`（thinking 状态）
- `#cfa44a` → `var(--warning)`（transcribing 状态）
- `#ff6b6b` → `var(--danger)`（error 状态）
- 内联 SVG close → `<X size={14} />`

- [ ] **Step 4: 更新 AvatarCropModal.tsx**

- `bg-bg-surface`（未定义）→ `bg-bg-surface-1`

- [ ] **Step 5: 提交**

```bash
git add src/app/\(transparent\)/ src/components/VoiceInput.tsx src/components/AvatarCropModal.tsx
git commit -m "feat(ui): update transparent pages, VoiceInput, and AvatarCropModal to use design tokens"
```

---

## Task 12: Electron 窗口尺寸

**Files:**
- Modify: `electron/main.ts` (createMainWindow, createOnboardingWindow)
- Modify: `electron/detail-window.ts`

- [ ] **Step 1: 更新 main.ts createMainWindow**

在 `createMainWindow()` 函数中（约 line 1781）：
- `width: 920` → `width: 1080`
- `height: 640` → `height: 720`
- `minWidth: 880` → `minWidth: 960`
- `minHeight: 620` → `minHeight: 640`

- [ ] **Step 2: 更新 main.ts createOnboardingWindow**

在 `createOnboardingWindow()` 函数中（约 line 1832）：
- `width: 600` → `width: 680`
- `height: 500` → `height: 540`

- [ ] **Step 3: 更新 detail-window.ts**

在 `createWindow()` 函数中（约 line 70）：
- `WINDOW_WIDTH = 840` → `WINDOW_WIDTH = 960`
- `WINDOW_HEIGHT = 600` → `WINDOW_HEIGHT = 680`
- `minWidth: 600` → `minWidth: 720`
- `minHeight: 400` → `minHeight: 480`
- 定位 `x = screenWidth - 840 - 40` → `x = screenWidth - 960 - 40`

- [ ] **Step 4: 提交**

```bash
git add electron/main.ts electron/detail-window.ts
git commit -m "feat(ui): increase default window sizes for better layout breathing room"
```

---

## Task 13: 全局动效 + 收尾验证

**Files:**
- Modify: `src/app/globals.css` (添加全局 transition 和 animation)
- Modify: `src/app/(main)/layout.tsx` (页面切换 fade)

- [ ] **Step 1: 在 globals.css 添加微交互动效**

在 keyframes 部分添加：

```css
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes staggerItem {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
```

添加全局交互样式：

```css
button, a, [role="button"] {
  transition: all 0.15s ease-out;
}

button:active:not(:disabled) {
  transform: translateY(0.5px);
}
```

- [ ] **Step 2: 在 (main)/layout.tsx 添加页面淡入**

给 children wrapper 添加 `animate-[fadeIn_150ms_ease-out]`

- [ ] **Step 3: 全局验证**

```bash
npm run electron:dev
```

逐页检查所有页面：
- [ ] Chat 页消息流 + 输入 + Header
- [ ] Settings hub → 各子页面
- [ ] Memory 页切换 + 卡片
- [ ] Persona 页
- [ ] Skills 页
- [ ] Services 页
- [ ] Detail 页
- [ ] Dark/Light 模式切换

- [ ] **Step 4: 最终提交**

```bash
git add -A
git commit -m "feat(ui): add micro-interaction animations and finalize UI upgrade"
```

---

## 自审清单

**Spec 覆盖度：**
- [x] 色彩系统（Dark + Light + 品牌 + 状态）→ Task 1
- [x] 字体系统（Playfair + Clash Display）→ Task 1
- [x] 图标系统（Lucide）→ Task 1 + 各迁移 task
- [x] 无边框设计 → GlassCard Task 2 + 全局 token Task 1
- [x] 玻璃形态感 → GlassCard + BottomActionBar + ChatInput
- [x] 精致间距 → tailwind.config.ts Task 1
- [x] 微交互动效 → Task 13
- [x] 窗口尺寸 → Task 12
- [x] StatusBadge 圆点方案 → Task 2
- [x] 所有页面迁移 → Task 5-11
- [x] SummaryCard/ListCard 删除 → Task 5

**无占位符：** 所有步骤包含具体代码或明确的样式方向。

**类型一致性：** GlassCard 的 props 在各页面调用处一致；Lucide 图标通过 `type LucideIcon` 传入。
