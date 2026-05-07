# Voice Bar 透明渲染 Bug 修复 — 设计文档

**日期**：2026-05-08
**作者**：riki + Claude
**状态**：待审核

---

## 1. 问题

底部语音条窗口渲染为一个大黑色不透明矩形，而非预期的 200×48px 透明小药丸。

**根因**：`src/app/layout.tsx` 的 `<body>` 设置了 `bg-bg-app`（dark mode 下 `#111110`），这个根布局包裹所有路由，包括需要透明背景的 `/voice-bar` 和 `/subtitle`。Electron 透明窗口 + 不透明 body = 黑块。

---

## 2. 修复方案：Next.js Route Group 隔离

将主应用路由与透明窗口路由分离到不同的 Route Group，各自拥有独立 layout。

### 文件改动

| 操作 | 文件 | 说明 |
|------|------|------|
| 修改 | `src/app/layout.tsx` | body 移除 `bg-bg-app`，只保留 `font-sans text-text-primary` |
| 新建 | `src/app/(main)/layout.tsx` | 用 `<div className="bg-bg-app min-h-screen">` 包裹 children |
| 新建 | `src/app/(transparent)/layout.tsx` | 只传 `{children}`，无背景、无额外样式 |
| 移动 | 12 个页面目录 → `(main)/` | chat, detail, memory, onboarding, persona, services, settings, skills |
| 移动 | 2 个页面目录 → `(transparent)/` | voice-bar, subtitle |
| 修改 | `src/app/(transparent)/voice-bar/page.tsx` | 删除 `<style>` 中 body 透明覆盖 |
| 修改 | `src/app/(transparent)/subtitle/page.tsx` | 删除 `<style>` 中 body 透明覆盖 |

### URL 不变

Route Group 的括号目录不影响 URL 路径。`/voice-bar`、`/subtitle`、`/chat` 等路径完全不变。

---

## 3. 文件内容

### `src/app/layout.tsx`（修改后）

```tsx
import './globals.css';

export const metadata = { title: 'Shrew' };

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
      <body className="font-sans text-text-primary">
        {children}
      </body>
    </html>
  );
}
```

### `src/app/(main)/layout.tsx`（新建）

```tsx
export default function MainLayout({ children }: { children: React.ReactNode }) {
  return <div className="bg-bg-app min-h-screen">{children}</div>;
}
```

### `src/app/(transparent)/layout.tsx`（新建）

```tsx
export default function TransparentLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
```

### `src/app/(transparent)/voice-bar/page.tsx`（修改后）

删除 `<style>` 标签中的 `html, body { background: transparent !important; overflow: hidden !important; }` 和相关的 globals 覆盖。保留 `@keyframes vbWaveSlow`（如果 VoiceInput 需要）。

实际上 VoiceInput 已经自带了 `<style>` 注入 keyframe，所以 voice-bar page 的 `<style>` 可以整个删除。

### `src/app/(transparent)/subtitle/page.tsx`（修改后）

从 `<style>` 中删除 `html, body { background: transparent !important; overflow: hidden !important; }`。保留其余 CSS（keyframes、scrollbar 样式等）。

---

## 4. 移动文件清单

```bash
# 主应用路由 → (main)
git mv src/app/chat    src/app/(main)/chat
git mv src/app/detail  src/app/(main)/detail
git mv src/app/memory  src/app/(main)/memory
git mv src/app/onboarding src/app/(main)/onboarding
git mv src/app/persona src/app/(main)/persona
git mv src/app/services src/app/(main)/services
git mv src/app/settings src/app/(main)/settings
git mv src/app/skills  src/app/(main)/skills

# 透明路由 → (transparent)
git mv src/app/voice-bar src/app/(transparent)/voice-bar
git mv src/app/subtitle  src/app/(transparent)/subtitle
```

---

## 5. 不变式

- 所有 URL 路径不变
- Electron 侧代码零改动（BrowserWindow 配置、IPC、voice-bar.ts 等）
- VoiceInput / SubtitleContent 组件内部逻辑零改动
- globals.css 零改动

---

## 6. 验证标准

1. 右 Option 触发录音 → 底部出现透明小药丸（不是黑块）
2. `/chat` 页面背景色正常（dark mode = `#111110`）
3. `/settings` 页面背景色正常
4. 字幕弹窗透明渲染正常
5. `npx next build` 无报错
6. 所有 URL 路径可正常访问
