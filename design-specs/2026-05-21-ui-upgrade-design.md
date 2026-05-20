# Lumi UI 全面升级设计文档

**日期**: 2026-05-21
**范围**: 全量升级 — 设计 token + 组件库 + 图标系统 + 所有页面

---

## 1. 设计方向

**保留暖色调基底，全面提升质感。** 受 PilotDeck 暗色模式启发，但在暖色体系下重新诠释：
- 无边框设计（背景色差替代显式边框）
- 玻璃形态感（半透明 + backdrop-filter blur）
- 精致间距体系（4px 基数，更克制的留白）
- 微交互动效（hover/active/focus 平滑过渡）

---

## 2. 色彩系统

### Dark Mode

| Token | 值 | 用途 |
|---|---|---|
| `--bg-app` | `#111110` | 最外层背景 |
| `--bg-window` | `#1a1918` | 窗口/页面背景 |
| `--bg-surface-1` | `#242320` | 卡片、提升层 |
| `--bg-surface-2` | `#2e2c28` | 输入框、二级表面 |
| `--bg-surface-3` | `#383530` | 深层表面、芯片 |
| `--line-default` | `rgba(255,255,255,0.06)` | 默认边框 |
| `--line-strong` | `rgba(255,255,255,0.10)` | 强调边框 |
| `--text-primary` | `#faf9f5` | 主文字 |
| `--text-secondary` | `#c7c4bb` | 次文字 |
| `--text-muted` | `#8e8b82` | 占位/弱化文字 |
| `--brand-primary` | `#D4915C` | 品牌主色（暖琥珀铜） |
| `--brand-primary-hover` | `#E0A46F` | 品牌 hover |
| `--brand-primary-active` | `#C07E4A` | 品牌 active/pressed |
| `--brand-soft` | `rgba(212,145,92,0.15)` | 品牌色底色 |
| `--success` | `#5db872` | 成功状态圆点色 |
| `--warning` | `#d4a017` | 警告状态圆点色 |
| `--danger` | `#c64545` | 危险状态圆点色 |

### Light Mode

| Token | 值 | 用途 |
|---|---|---|
| `--bg-app` | `#f5f0e8` | 最外层背景 |
| `--bg-window` | `#faf9f5` | 窗口/页面背景 |
| `--bg-surface-1` | `#efe9de` | 卡片、提升层 |
| `--bg-surface-2` | `#e6dfd8` | 输入框、二级表面 |
| `--bg-surface-3` | `#ddd5c8` | 深层表面、芯片 |
| `--line-default` | `#e6dfd8` | 默认边框 |
| `--line-strong` | `#d4cbc0` | 强调边框 |
| `--text-primary` | `#141413` | 主文字 |
| `--text-secondary` | `#3d3d3a` | 次文字 |
| `--text-muted` | `#6c6a64` | 占位/弱化文字 |
| `--brand-primary` | `#B8723D` | 品牌主色 |
| `--brand-primary-hover` | `#CA8350` | 品牌 hover |
| `--brand-primary-active` | `#A06130` | 品牌 active |
| `--brand-soft` | `rgba(184,114,61,0.12)` | 品牌色底色 |
| `--success` | `#4a9e5f` | 成功 |
| `--warning` | `#b88a0f` | 警告 |
| `--danger` | `#b33a3a` | 危险 |

### 状态指示

使用 **圆点 + 统一微底色** 方案（选项 D）：
- 胶囊容器：`rgba(255,255,255,0.03)`（Dark）/ `rgba(0,0,0,0.03)`（Light），圆角 999px
- 内含 6px 彩色圆点 + 文字
- 文字颜色统一为 `--text-secondary`，不随状态变色
- 只有圆点携带状态颜色信息

---

## 3. 字体与排版

### 字体栈

- **英文页面标题**：`'Playfair Display', serif` — 仅用于 h1 级英文装饰标题
- **所有其他文字**：`'Clash Display', Inter, system-ui, -apple-system, 'PingFang SC', sans-serif`
- Clash Display 不覆盖的中文字符自然回退到 PingFang SC

### 字号层级

| Token | 大小 | 字重 | 行高 | 用途 |
|---|---|---|---|---|
| `text-page-title` | 24px | 700 | 1.2 | 页面标题（英文用 Playfair） |
| `text-section-title` | 15px | 600 | 1.4 | 分组标题 |
| `text-card-title` | 14px | 600 | 1.4 | 卡片标题 |
| `text-body` | 14px | 400 | 1.6 | 正文 |
| `text-body-sm` | 13px | 400 | 1.6 | 辅助说明 |
| `text-label` | 12px | 500 | 1.4 | 表单标签 |
| `text-section-tag` | 11px | 600 | 1.0 | 分组标签（大写 + letter-spacing: 0.08em + 品牌色） |

### 字重

常规使用 400/500/600/700，标题不使用超过 700 的字重。

---

## 4. 间距与圆角

### 圆角

| Token | 值 | 用途 |
|---|---|---|
| `rounded-card` | 12px | 卡片、容器 |
| `rounded-btn` | 10px | 按钮、输入框 |
| `rounded-icon-box` | 9px | 图标容器方块 |
| `rounded-chip` | 999px | 胶囊/药丸 |

### 间距

| Token | 值 | 用途 |
|---|---|---|
| `page-x` | 20px | 页面水平内边距 |
| `page-top` | 16px | 页面顶部内边距 |
| `section-gap` | 24px | 分组间距 |
| `card-p` | 14-16px | 卡片内边距 |
| `card-gap` | 8px | 同组卡片间距 |
| `item-gap` | 12px | 列表项间距 |

---

## 5. 图标系统

引入 **Lucide React** 作为统一图标库：
- `lucide-react` — React 组件，支持 tree-shaking
- 默认尺寸 18px，描边宽度 1.8px
- 颜色通过 CSS `color` 属性控制，使用 `--text-muted` 或 `--brand-primary`
- 替换所有现有内联 SVG 和 Unicode 字符（`←` `▾` `✓` `➤` 等）

---

## 6. 组件设计

### 6.1 PageHeader

- 返回按钮：30×30px 方块，`rounded-btn`，`bg-surface-1` 微底色
- 标题：`text-page-title`，英文用 Playfair Display
- 右侧操作区：图标按钮，Lucide 图标
- 整体无底边框，用 spacing 自然分隔

### 6.2 SectionHeader

- 标题：`text-section-title`，普通字重
- 描述：`text-body-sm`，`--text-muted`
- 右侧操作：品牌色文字链接，12px
- 分组标签（可选）：`text-section-tag`，大写，品牌色

### 6.3 GlassCard（替代 SummaryCard + ListCard）

统一为一种卡片样式：
- 背景：`rgba(surface-1, 0.5)` + `backdrop-filter: blur(16px)`
- 边框：`1px solid rgba(255,255,255,0.04)`（Dark）/ `1px solid var(--line-default)`（Light）
- 圆角：`rounded-card` (12px)
- 内边距：14-16px
- hover 效果：背景微亮 + 轻微位移（`transition: all 0.2s`）

**变体**：
- **导航卡片**：左侧 36×36 图标容器 + 标题/描述 + 右侧箭头
- **内容卡片**：标题 + 正文 + 底部操作标签
- **状态卡片**：同导航卡片，右侧加状态徽章

### 6.4 Button

五种变体：
- **Primary**：实心 `--brand-primary` 底，白色文字，`rounded-btn`
- **Secondary**：`--brand-primary` 30% 描边，品牌色文字
- **Ghost**：无边框，`--text-muted` 文字
- **Danger**：红色 25% 描边，灰红色文字
- **Icon**：36×36 方块，`bg-surface-1` 底色

尺寸：高度 36px，内边距 9px 18px，字号 13px。
所有按钮有 `transition: all 0.15s`。

### 6.5 SingleLineInput / Textarea

- 背景：`rgba(surface-1, 0.6)`
- 边框：`1px solid var(--line-default)`
- 圆角：`rounded-btn` (10px)
- 内边距：10px 14px
- focus 状态：边框变 `--brand-primary` 30% + 轻微 glow
- 标签在上方，帮助文字在下方

### 6.6 StatusBadge

- 胶囊容器：`rgba(255,255,255,0.03)` 底色，`rounded-chip`
- 内含 6px 彩色圆点 + 文字
- 文字颜色统一 `--text-secondary`
- 圆点颜色：`--brand-primary`（已连接）、`--text-muted`（待配置）、`--danger`（已断开）、`--warning`（警告）

### 6.7 ChipGroup

- 外壳：`rgba(surface-1, 0.4)` 底色，`rounded-btn`，内边距 4px
- 未选中项：透明底，`--text-muted` 文字
- 选中项：`--brand-soft` 底 + 品牌色 20% 描边，`--text-primary` 文字
- 圆角 8px

### 6.8 BottomActionBar

- 固定底部
- 背景：`rgba(window, 0.9)` + `backdrop-filter: blur(20px)`
- 顶部分隔：`1px solid rgba(255,255,255,0.04)`
- 按钮右对齐，取消 + 保存

---

## 7. 微交互动效

- **所有交互元素**：`transition: all 0.15s ease`
- **按钮 hover**：亮度微增 + 轻微上移（translateY -0.5px）
- **按钮 active**：亮度微降 + 轻微下压（translateY 0.5px）
- **卡片 hover**：背景微亮 + 边框微显
- **输入框 focus**：边框变色 + 轻微 glow（box-shadow）
- **页面切换**：fade-in 150ms
- **列表项**：交错 fade-in（stagger），每项延迟 30ms

---

## 8. 窗口尺寸

| 窗口 | 当前 | 新尺寸 | 最小尺寸 |
|---|---|---|---|
| Chat 主窗口 | 920×640 | **1080×720** | 960×640 |
| Detail 详情 | 840×600 | **960×680** | 720×480 |
| Onboarding | 600×500 | **680×540** | — |
| Voice Bar | 200×48 | 不变 | — |
| Subtitle | 340×150 | 不变 | — |

设置/记忆/人格/技能/服务页面在主窗口内导航，共享主窗口宽度。

---

## 9. 页面应用

### 9.1 Settings 页

- 使用 SectionHeader 分为「服务连接」「通用设置」「关于」三组
- 每组内用 GlassCard 导航变体（图标 + 标题/描述 + 箭头）
- 图标容器用品牌色 soft 底色（已连接）或灰色底色

### 9.2 Chat 页

- ChatHeader：头像圆点 + 名称 + 状态徽章 + 右侧图标按钮
- ChatStream：消息气泡用 GlassCard 样式，用户/AI 消息用背景色差区分
- ChatInput：底部固定，glass 背景样式

### 9.3 Memory 页

- ChipGroup 切换「核心记忆 / 每日记忆」
- 记忆卡片用 GlassCard 内容变体
- 编辑/删除用文字标签按钮

### 9.4 Persona 页

- 头像区域居中
- 输入框和文本区域用新的 Input 样式
- Personality prompt 用 Textarea

### 9.5 Skills / Services 页

- 列表用 GlassCard 导航变体
- 状态徽章用新 StatusBadge 样式

### 9.6 Detail 页

- 消息气泡重新设计，工具调用日志用 monospace 区块
- 利用更宽的窗口（960px）改善可读性

### 9.7 Onboarding

- 步骤指示用圆点样式
- 按钮用新的 Button 变体
- 整体间距拉大，呼吸感更强

### 9.8 Voice Bar / Subtitle

- 视觉样式跟随新色彩 token
- 布局和尺寸不变

---

## 10. 实施策略

采用方案 B（组件重构 + 视觉升级），按以下顺序：

1. **全局 token**：更新 `globals.css` 颜色变量 + `tailwind.config.ts` 字体/间距/圆角
2. **安装依赖**：`lucide-react`。字体文件下载到本地（Playfair Display, Clash Display），不依赖在线 CDN（Electron 离线可用）
3. **组件重构**：逐个重写 UI 组件（Button → StatusBadge → GlassCard → PageHeader → SectionHeader → Input → ChipGroup → BottomActionBar）
4. **页面迁移**：逐页应用新组件，从 Settings 开始（最标准），再到 Memory、Persona、Skills、Services
5. **Chat 重构**：ChatHeader + ChatStream + ChatInput
6. **Detail / Onboarding**
7. **窗口尺寸调整**：更新 Electron 窗口配置
8. **动效打磨**：统一 transition / animation
