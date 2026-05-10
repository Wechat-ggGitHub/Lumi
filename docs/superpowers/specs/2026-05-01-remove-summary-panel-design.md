# 移除摘要面板，合并为详情窗口

## 背景

当前用户点击托盘图标后，会弹出一个 380x480 的小摘要面板（SummaryPanel），展示任务列表。用户需要再点击某个任务卡片，才会打开独立的详情窗口。

这种两步操作增加了交互层级。目标是删除摘要面板，让托盘点击直接打开一个包含左侧历史列表 + 右侧对话详情的窗口。

## 方案

**方案 A：复用 detail 页面改造**（已选定）

在现有 `/summary/detail` 页面基础上增加左侧历史列表，删除 SummaryPanel，窗口改为常规桌面窗口。

## 设计

### 1. 窗口层改造

**删除：**
- `electron/summary-popup.ts`（SummaryPopupWindow 类）
- `src/components/SummaryPanel.tsx`
- `src/app/summary/page.tsx`（/summary 路由）

**新增：`electron/detail-window.ts`（DetailWindow 类）**

替代 SummaryPopupWindow，管理详情窗口生命周期：

- **窗口尺寸**：840x600（左侧 240px + 右侧 600px）
- **窗口属性**：常规桌面窗口（有标题栏、可调整大小、不置顶、不透明）
- **窗口标题**："Aiva"
- **定位**：屏幕右侧居中（首次打开）
- **生命周期**：创建一次、show/hide 复用（不销毁）
- **关闭按钮**：点击 X → 隐藏窗口（hide），不销毁
- **加载路由**：`/detail`

**托盘点击行为：**
- 点击托盘 → toggle 显示/隐藏详情窗口
- 窗口隐藏时：show + 推送最新数据
- 窗口显示时：hide

**防抖**：保留 200ms toggle 防抖，避免 blur 与 click 竞态。

### 2. 页面布局

将 `src/app/summary/detail/page.tsx` 迁移改造为 `src/app/detail/page.tsx`。

```
┌──────────────────────────────────────────┐
│ Aiva                             ─ □ ✕  │
├────────────┬─────────────────────────────┤
│ 历史列表    │  对话详情                     │
│ (240px)    │                             │
│            │  用户消息 / Claude 回复        │
│ ▸ 任务 1   │  工具调用（可展开）            │
│   2分钟前   │                             │
│            │─────────────────────────────│
│ ▸ 任务 2   │ [输入框] [发送]               │
│   5分钟前   │                             │
└────────────┴─────────────────────────────┘
```

### 3. 左侧面板（HistorySidebar 组件）

**新增组件：`src/components/HistorySidebar.tsx`**

- 宽度 240px，固定
- 显示最近执行记录列表
- 每条显示：prompt 前 30 字截断、时间戳、状态 dot（蓝=执行中、绿=完成、红=失败）
- 点击选中某条 → 右侧加载该对话详情
- 当前选中项高亮
- 正在执行的对话显示 spinner 动画

**数据来源**：通过 IPC `detail:history-list` 接收历史列表数据（id, prompt, status, created_at）

### 4. 右侧详情区（复用现有 detail 逻辑）

**保留**：
- 对话气泡渲染（用户消息紫色右对齐、Claude 回复深灰左对齐）
- 工具调用展示（可展开）
- 流式推送监听（`detail:stream-chunk`、`detail:tool-call`、`detail:execution-complete`）
- 后续消息输入框（completed 状态 + 有 sdk_session_id 时显示）

**改动**：
- 不再从 URL query `?id=xxx` 获取 id
- 改为通过组件状态管理选中对话 id
- 首次加载默认选中最近一条记录
- 无记录时显示空状态引导（"按右 Command 开始对话"）

### 5. IPC 简化

合并后统一为 `detail:*` 命名空间：

| IPC 频道 | 方向 | 功能 |
|----------|------|------|
| `detail:ready` | renderer → main | 窗口就绪，请求初始数据 |
| `detail:history-list` | main → renderer | 推送历史列表（含 id/prompt/status/created_at） |
| `detail:select` | renderer → main | 选中某条记录，请求完整对话数据 |
| `detail:conversation-data` | main → renderer | 返回完整对话数据 |
| `detail:mark-viewed` | renderer → main | 标记某条记录为已读 |
| `detail:stream-chunk` | main → renderer | 流式推送对话消息（携带 executionId） |
| `detail:tool-call` | main → renderer | 推送工具调用（携带 executionId） |
| `detail:execution-complete` | main → renderer | 执行完成通知（携带 executionId） |
| `detail:send-message` | renderer → main | 发送后续消息 |

**删除的 IPC**：`summary:update`、`summary:ready`、`summary:open-detail`、`summary:fetch-detail`、`summary:detail-data`

### 6. 数据同步策略

- **窗口 show 时**：主动推送最新历史列表 + 当前选中对话数据
- **store.onChange 时**：如果窗口可见，推送历史列表更新
- **执行中实时推送**：stream-chunk / tool-call / execution-complete 携带 executionId，前端根据当前选中的 id 过滤
- **已读标记时机**：选中某条对话时标记该条为已读（而非关闭时批量标记）

### 7. 需要修改的文件

| 文件 | 操作 |
|------|------|
| `electron/summary-popup.ts` | 删除 |
| `electron/detail-window.ts` | 新增 |
| `electron/main.ts` | 替换 SummaryPopupWindow 为 DetailWindow，更新 IPC 注册，更新托盘绑定 |
| `electron/tray.ts` | 无需改动（回调接口不变） |
| `src/components/SummaryPanel.tsx` | 删除 |
| `src/components/HistorySidebar.tsx` | 新增 |
| `src/app/summary/page.tsx` | 删除 |
| `src/app/summary/detail/page.tsx` | 迁移改造为 `src/app/detail/page.tsx` |
| `src/types/index.ts` | 更新 IPC 消息类型定义 |

### 8. 不涉及的改动

- voice-bar 窗口逻辑不变
- 录音/转写流程不变
- Claude Agent SDK 执行逻辑不变
- SQLite 数据层不变（查询可复用）
- 不自动弹出详情窗口（仅托盘点击触发）
