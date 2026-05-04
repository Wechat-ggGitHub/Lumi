# Shrew UI 设计系统刷新 — 设计规范

## 1. 概述

对 Shrew 桌面应用进行设计系统全面刷新。核心变化：

- **品牌色**：从冷蓝 `#7c9cff` → 暖紫藤 `#a382ba`
- **色彩温度**：从冷蓝黑底 → 中性暖黑底（Dark）/ 奶油米白底（Light）
- **双模式**：新增 Light 模式，跟随系统 + 设置页手动覆盖
- **导航优化**：聊天页 header 新增下拉菜单，直通二级页面
- **一致性修复**：修复 detail 页、voice-bar 等偏离设计系统的页面

设计哲学：保留桌面工具的专业克制感，注入温暖人文气质。参照 Anthropic DESIGN.md 的表面系统和排版层级思想，但不照搬营销站的视觉风格。

## 2. 色彩系统

### 2.1 实现方式

使用 CSS 变量 + `.dark` / `.light` class 切换。默认跟随 `prefers-color-scheme`，设置页可手动覆盖。

```css
:root {
  /* Light 作为默认 */
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

### 2.2 色彩层级规则

1. 主背景使用 `--bg-app`
2. 窗口/页面使用 `--bg-window`
3. 卡片/消息使用 `--bg-surface-1` 或 `--bg-surface-2`
4. 主按钮、选中态使用 `--brand-primary`
5. 淡底/高亮背景使用 `--brand-soft`
6. 不允许使用纯黑纯白作为大面积背景
7. 不允许直接写色值，全部引用 CSS 变量

## 3. 不变部分

以下内容保持现有设计不变：

- **圆角系统**：window(20px) / card(16px) / btn(12px) / input(12px) / chip(999px)
- **间距系统**：page-x(24px) / section-gap(20px) / card-p(16px) 等
- **字体栈**：Inter + PingFang SC + 系统回退
- **字号层级**：window-title(13px) / page-title(28px) / section-title(16px) / card-title(15px) / body(14px) / body-sm(13px) / label(12px) / label-xs(11px)
- **页面骨架**：PageHeader → Content → BottomActionBar 三段结构
- **所有 UI 组件的 API 和结构**：Button、ChipGroup、Select、SingleLineInput、Textarea、StatusBadge、SummaryCard、ListCard、EmptyState、PageHeader、SectionHeader、BottomActionBar

## 4. 组件更新

所有组件只需更新颜色引用，结构和 API 不变：

### 4.1 Button
- primary 背景：`--brand-primary`，hover: `--brand-primary-hover`，active: `--brand-primary-active`
- secondary 背景：`--bg-surface-1`，边框：`--line-default`
- ghost 文字：`--text-secondary`，hover 背景：`--bg-surface-2`

### 4.2 StatusBadge
- success 背景：`--success` 12% 透明度，文字：`--success`
- warning / danger / info 同理
- default 背景：`--bg-surface-2`，文字：`--text-muted`

### 4.3 ChipGroup
- 选中态背景：`--brand-primary`，文字：白色
- 未选中态背景：`--bg-surface-2`，文字：`--text-secondary`

### 4.4 SummaryCard
- 背景：`--bg-surface-1`，边框：`--line-default`
- hover 边框：`--line-strong`

### 4.5 单行输入 / Textarea
- 背景：`--bg-surface-2`，边框：`--line-default`
- focus 边框：`--brand-primary`

### 4.6 新增组件：HeaderDropdown

聊天页 header 右侧新增下拉菜单组件。

**Props：**
- `items: Array<{ label: string; href: string; icon?: string }>`
- `dividerIndex?: number`（在哪个位置插入分割线）

**行为：**
- 点击 header 右侧按钮触发
- 菜单项：分身设定、记忆管理、技能管理、服务连接
- 分割线后：设置
- 点击菜单项后导航到对应页面
- 点击外部或选择后自动关闭

**样式：**
- 背景：`--bg-surface-1`
- 边框：`--line-default`
- 圆角：`12px`
- 菜单项高度：`36px`，hover 背景 `--bg-surface-2`
- 阴影：`0 4px 16px rgba(0,0,0,0.12)`（dark）/ `0 4px 16px rgba(0,0,0,0.08)`（light）

## 5. 页面逐页变更

### 5.1 聊天页 `/chat`
- ChatHeader 新增 HeaderDropdown 组件
- 消息气泡颜色更新：用户消息 `--brand-soft` 底，助手消息 `--bg-surface-1` 底
- 输入区发送按钮：`--brand-primary` 背景
- 状态指示灯颜色更新

### 5.2 设置总页 `/settings`
- 快捷导航按钮颜色更新
- SummaryCard 颜色更新
- StatusBadge 使用新语义色

### 5.3 设置详情页 `/settings/provider`、`/voice`、`/runtime`
- 所有组件颜色更新
- 无结构变化

### 5.4 交互偏好 `/settings/preferences`
- 从空壳页改为包含实际配置项：
  - 权限模式选择（自动允许 / 每次确认）
  - Enter 键行为（发送 / 换行）

### 5.5 数据与隐私 `/settings/privacy`
- 从空壳页改为包含实际配置项：
  - 执行历史保留天数
  - 清除执行历史按钮

### 5.6 分身设定 `/persona`
- 组件颜色更新
- 头像圆圈底色：`--brand-soft`，文字：`--brand-primary`
- ChipGroup 选中态更新

### 5.7 记忆管理 `/memory`
- 组件颜色更新
- 类型标签颜色映射更新

### 5.8 技能管理 `/skills`
- 组件颜色更新
- 技能详情弹窗更新

### 5.9 服务连接 `/services`
- 组件颜色更新
- 测试连接按钮状态更新

### 5.10 对话详情 `/detail`（重写）
- 移除左侧 240px HistorySidebar
- 全部 inline styles 替换为 Tailwind + CSS 变量
- 消息气泡、工具调用展示使用统一组件
- 保持功能完整但视觉统一

### 5.11 语音浮窗 `/voice-bar`
- 保留毛玻璃效果，但颜色统一使用 CSS 变量
- 脉冲动画颜色：`--brand-primary`
- 录音状态红色保留 `--danger`
- 关闭按钮使用统一图标按钮样式

### 5.12 引导页 `/onboarding`
- 步骤中的内联 `<input>` 替换为 `SingleLineInput` 组件
- 按钮颜色更新

## 6. 新增：外观设置

在设置总页新增"外观"分组卡片（位于"交互偏好"之后），详情页包含：

- 外观模式选择（ChipGroup）：
  - 跟随系统（默认）
  - 浅色
  - 深色
- 选择后立即生效，无需保存按钮（即时预览）

**存储：** 使用 localStorage 存储用户偏好，Electron 主进程通过 IPC 读取并应用。

**实现逻辑：**
1. 应用启动时读取 localStorage 中的 `theme-preference`
2. 如果为 `system` 或未设置，跟随 `prefers-color-scheme`
3. 如果为 `light` 或 `dark`，强制应用对应 class
4. 监听系统主题变化，在 `system` 模式下自动切换

## 7. 全局 CSS 变量替换计划

### 7.1 globals.css
- 新增 Light 模式 CSS 变量（作为 `:root` 默认）
- 现有 Dark 变量移到 `:root.dark`
- 语义色更新为新的色值

### 7.2 tailwind.config.ts
- 更新 `colors` 映射中的所有色值
- 新增 `light:` 变体（如果需要显式 light 样式，但大部分通过 CSS 变量自动处理）

### 7.3 组件文件
- 所有硬编码的 Tailwind 颜色 class（如 `bg-[#xxx]`）替换为语义 token class
- 所有组件中直接引用的色值替换为 CSS 变量引用

## 8. 文件变更清单

| 文件 | 变更类型 | 说明 |
|------|----------|------|
| `src/app/globals.css` | 重写 | 新增双模式 CSS 变量 |
| `tailwind.config.ts` | 更新 | 颜色 token 映射更新 |
| `src/components/chat/ChatHeader.tsx` | 更新 | 新增 HeaderDropdown |
| `src/components/ui/HeaderDropdown.tsx` | 新增 | 下拉菜单组件 |
| `src/components/chat/ChatStream.tsx` | 更新 | 消息气泡颜色 |
| `src/components/chat/ChatInput.tsx` | 更新 | 输入区颜色 |
| `src/components/Onboarding.tsx` | 更新 | 输入框组件化 + 颜色 |
| `src/components/VoiceInput.tsx` | 更新 | 颜色统一化 |
| `src/app/detail/page.tsx` | 重写 | 移除 inline styles，使用 Tailwind |
| `src/app/settings/page.tsx` | 更新 | 新增"外观"卡片 |
| `src/app/settings/appearance/page.tsx` | 新增 | 外观设置详情页 |
| `src/app/settings/preferences/page.tsx` | 重写 | 填充实际配置 |
| `src/app/settings/privacy/page.tsx` | 重写 | 填充实际配置 |
| `src/app/settings/provider/page.tsx` | 更新 | 颜色更新 |
| `src/app/settings/voice/page.tsx` | 更新 | 颜色更新 |
| `src/app/settings/runtime/page.tsx` | 更新 | 颜色更新 |
| `src/app/persona/page.tsx` | 更新 | 颜色更新 |
| `src/app/memory/page.tsx` | 更新 | 颜色更新 |
| `src/app/skills/page.tsx` | 更新 | 颜色更新 |
| `src/app/services/page.tsx` | 更新 | 颜色更新 |
| `src/app/chat/page.tsx` | 更新 | 颜色更新 |
| `src/components/ui/*.tsx`（全部） | 更新 | 颜色引用更新 |

## 9. 执行顺序

1. 更新 `globals.css` 和 `tailwind.config.ts`（全局 token）
2. 更新所有 `src/components/ui/` 组件（颜色引用）
3. 新增 `HeaderDropdown` 组件
4. 更新 `ChatHeader`（集成下拉菜单）
5. 逐页更新聊天页、设置页、分身设定、记忆、技能、服务连接
6. 重写 `/detail` 页面
7. 更新 `/voice-bar` 和 `/onboarding`
8. 填充 `/settings/preferences` 和 `/settings/privacy`
9. 新增 `/settings/appearance`
10. 全局检查一致性

## 10. 验收标准

1. 所有页面在 Dark 和 Light 模式下都正确显示
2. 无硬编码色值（除 CSS 变量定义外）
3. `/detail` 页面不再使用 inline styles
4. 聊天页 header 下拉菜单功能正常
5. 外观设置即时生效
6. 所有组件在双模式下视觉正确
7. 品牌色统一为暖紫藤，无蓝色残留
8. 圆角、间距、字号与现有一致
