# 摘要面板状态管理重设计

日期：2026-04-26

## 背景

`2026-04-24-summary-popup-redesign.md` 落地之后，面板按 `appState` 切换 4 种专属界面（recording/editing/executing/idle），并区分今天/历史。实际使用中暴露出多个状态管理问题：

1. **toggle 与 blur 自动关闭打架**：点击 tray 时 popup 已 blur 关闭，再点反而开了新窗口；toggle 代码形同虚设
2. **过程态界面冗余**：录音/转写/编辑时 voice-bar 已经在屏幕底部展示状态，摘要面板再展示一次是重复
3. **执行中历史消失**：appState=executing 时整个任务列表被替换成"执行中专属界面"，用户无法在看进度的同时翻历史
4. **状态变化不推送**：`updateSummaryPopup()` 仅在 `executePrompt` 几个固定时机调用，store 状态变化时已打开的面板不刷新
5. **dot 与面板状态不一致**：每次打开面板调 `clearCompletedState()` 让 tray dot 立刻变灰，但面板内卡片仍显示绿色"已完成"
6. **历史折叠按钮是死的**：底部 `▶ 历史 (N)` 切换 `historyExpanded` state，但 UI 完全没用到这个变量
7. **detail 看完返回不同步**：mark-viewed 后主面板未刷新，下次打开仍展开旧卡片
8. **弹窗尺寸固定 380×480**：空状态过空、长内容挤压

本次重设计的目标不是再次大改外观，而是把"状态管理 + 面板内容职责"重新理清，让面板回归一个简单的心智模型。

## 设计原则

1. **任务流即面板** — 摘要面板永远是一条按时间倒序的任务列表，过程态信息收纳到顶部状态条 + 当前卡片，不再有专属界面
2. **viewed 是面板的核心衰减信号** — 卡片形态由 `viewed` 状态决定（未读完整展开 / 未读折叠带标记 / 已读折叠），自然产生"未消化的会冒出来，看过的退到背景"的节奏
3. **dot 与卡片状态严格对应** — tray dot 颜色反映"是否还有未消化的内容"，与面板内的视觉信号一一同步，不再各自为政
4. **轻量预览，不做深度浏览** — 摘要面板做"瞄一眼最近的状态"，要看完整对话/翻深度历史去 detail 窗口或独立的历史窗口

## 一、整体心智模型

```
┌─────────────────────────────────┐
│ [dot] 状态文案    元信息（右侧） │  ← 状态条（高度 ~36px）
├─────────────────────────────────┤
│ 任务列表                         │
│   • 进行中任务（如果有）         │  ← 完整展开 + spinner
│   • 最新一条未读已完成任务       │  ← 完整展开
│   • 其他未读已完成（折叠+蓝点）  │
│   • 已读任务（折叠成一行）       │
│   • ...（已展示最多 10 条）      │
├─────────────────────────────────┤
│ 查看全部历史 →                   │  ← 仅当 totalCount > 10
└─────────────────────────────────┘
```

idle 且数据库为空时，列表区显示 EmptyState（「按右 Option 开始语音输入」）。

面板尺寸保持固定 380×480。

## 二、卡片三种形态

每张任务卡片基于 `id, user_prompt, summary, status, viewed, created_at, duration_ms, num_turns` 字段渲染（数据库已有，无 schema 变更）。形态由「viewed + 是否最新未读 + 是否进行中」三个条件决定。

### 形态 1：进行中卡片

```
┌─────────────────────────────────────┐
│ 帮我把首页导航栏改成深色主题        │  ← user_prompt（小字 13px）
│                                     │
│ ◌ 正在执行工具: Edit                │  ← spinner + 子状态文案
│ 已用时 23s · 第 3 轮                │  ← 已用时 + 轮数
└─────────────────────────────────────┘
背景色：rgba(50,173,255,0.04)
```

- 永远在列表最顶部
- 不可点击（detail 用不上，没有 sdk_session_id 之前进 detail 也没意义）
- **已用时由前端用 `setInterval(1000)` 基于 `created_at` 自算**，避免主进程每秒推 IPC
- 子状态文案直接复用现状的 `subStateLabel` 映射（thinking / executing_tool / compacting / rate_limited / authenticating）

### 形态 2：未读完整展开

```
┌─────────────────────────────────────┐
│ 帮我把首页导航栏改成深色主题        │  ← user_prompt
│                                     │
│ 已经把 src/app/layout.tsx 里的       │  ← summary（最大高度 280px）
│ 主题切到 dark mode，并把导航 ...    │     超出区域底部渐隐
│ ...                                 │
│ ─────────────────────────────       │
│ 进入详情查看 →           23s · 5轮  │  ← 仅当 summary 被截断时显示
└─────────────────────────────────────┘
```

- 整张卡可点击 → 打开 detail 窗口
- 「进入详情查看 →」按钮**仅在 summary 实际被截断时显示**：summary 容器挂载后通过 `ref.current.scrollHeight > ref.current.clientHeight` 判断（同步、零依赖；如需响应窗口尺寸变化可后续升级到 ResizeObserver）
- 失败状态：summary 区换成红底「执行失败」提示框（沿用现状视觉）
- **列表中最多 1 张卡处于此形态**——即按 `created_at DESC` 排序后的第一张「未读 + status ∈ {completed, failed, cancelled}」任务（不含 `status = 'running'` 的进行中任务，那条是形态 1）

### 形态 3：折叠卡片

```
未读折叠（带视觉标记）：
●  帮我把首页导航栏改成深色主题       23s · 12分钟前
↑ 蓝点 + 标题加粗 + 左侧 2px 蓝色竖条

已读折叠（无标记）：
   修复登录页的样式问题                15s · 1小时前
↑ 标题正常字重，无任何附加标记
```

- 整张卡可点击 → 打开 detail 窗口
- 高度约 36px
- 失败状态：标题用红色（`#FF453A`）

### EmptyState

idle 且 `totalCount === 0` → 列表区显示「按右 ⌘ 开始语音输入」。

## 三、顶部状态条

| store 状态 | dot 颜色 | 主文案 | 右侧元信息 |
|---|---|---|---|
| `idle`（无最新未读） | gray | 待命 | 按右 Option 开始语音 |
| `idle`（最新未读 completed） | green | 已完成 | 23s · 5 轮 |
| `idle`（最新未读 failed） | red | 执行失败 | 23s |
| `recording` | purple | 录音中 | 再按右 Option 结束 |
| `transcribing` | purple | 转写中 | — |
| `editing` | purple | 编辑中 | 在语音栏中编辑 |
| `sending` | blue | 准备执行… | — |
| `executing` | blue | 执行中 | 已用时 23s · 第 3 轮 |

> 实际快捷键（`electron/shortcuts.ts:26`）监听的是 Right Option（`UiohookKey.AltRight`）单击模式（按一下触发，根据当前 store 状态决定动作）。现状 `SummaryPanel.tsx:99,409` 的「⌘ 开始语音」和旧 `RecordingState` 的「松开按键结束录音」与实际行为不符，本次重写时文案统一更正为右 Option + 单击表达。`AppSettings.shortcut` 字段名仍叫 `right_cmd`（`electron/main.ts:137`）属历史命名遗留，不影响行为，本次不动。

**背景色统一为 `#1a1a1e`，不再随状态切换**。失败/完成的视觉信号交给卡片本身（红底提示框 / 绿点 dot），状态条只做文字 + dot 提示。

## 四、IPC 推送时机

### 4.1 store 状态变化触发面板更新

```ts
// electron/main.ts
store.onChange(() => {
  updateTrayDot();
  updateSummaryPopup();   // ← 新增
});
```

`updateSummaryPopup()` 内部先判断 `summaryPopup.win` 是否存在，不存在直接 return（避免无意义的数据库查询）。

### 4.2 数据契约（新 payload）

```ts
{
  recent: ExecutionRecord[],         // 最近 10 条（按 created_at DESC，含进行中）
  totalCount: number,                // 数据库总记录数
  hasMore: boolean,                  // = totalCount > recent.length
  appState: AppState,
  sdkSubState: SdkSubState,
  currentToolName?: string,
  dotColor: DotColor,
}
```

砍掉旧 payload 的 `execution`（active）字段——进行中任务就是 `recent[0]`，不需单独传。砍掉 `history` / `historyCount`，统一成 `recent` / `totalCount` / `hasMore`。

### 4.3 已用时不通过 IPC 推送

executing 中的 `duration_ms` 由前端 `setInterval(1000)` 基于 `created_at` 自算并展示。主进程只在 store 状态/子状态变化时推 IPC。

## 五、开关机制（toggle/blur 防抖）

```ts
// electron/summary-popup.ts
class SummaryPopupWindow {
  private lastClosedAt = 0;
  
  show(tray: Tray): void {
    // 200ms 内被关过 → 视为 toggle 关闭，不开新窗口
    if (Date.now() - this.lastClosedAt < 200) return;
    
    // ... 创建 BrowserWindow（同现状）...
    
    this.win.on('blur', () => {
      this.lastClosedAt = Date.now();
      this.onClose?.();         // ← 触发关闭副作用（mark-viewed）
      this.win?.close();
      this.win = null;
    });
  }
  
  onClose?: () => void;          // 主进程注册的关闭回调
}
```

逻辑：
- 第一次点 tray：popup 没开，blur 也没触发 → 创建新窗口
- 第二次点 tray：tray 接到 click 之前 popup 已经 blur 关闭并记录时间戳 → click 判断到 200ms 内被关过 → 跳过，不重开
- 在面板外点别处：blur 关闭，无后续动作

200ms 是经验值（macOS 双击间隔上限）。删除现状 `summary-popup.ts:13-18` 的 toggle 代码。

## 六、viewed 标记机制

### 6.1 触发时机（两条路径叠加）

1. **关闭面板时**：在 `SummaryPopupWindow.onClose` 回调中，主进程批量将所有未读已完成任务标记为 viewed
2. **点击卡片进 detail 时**：立即标记该卡为 viewed（保留现状逻辑）

### 6.2 关面板时的批量 mark + dot 清除

```ts
// electron/main.ts
summaryPopup.onClose = () => {
  const hadUnread = markAllUnviewedAsViewed(db);
  if (hadUnread && store.appState === 'idle' &&
      (store.sdkSubState === 'completed' || store.sdkSubState === 'failed')) {
    store.clearCompletedState();
  }
  updateTrayDot();
};
```

`markAllUnviewedAsViewed(db)` 只更新 `viewed = 0 AND status IN ('completed', 'failed', 'cancelled')` 的记录——进行中（`status = 'running'`）任务不算"看过了"，跑完后用户应当再被提醒。返回值为是否有任何记录被实际更新。

设计取舍：关面板时一次性 mark 所有未读已完成任务（不只是"展开的那张"），理由：
- 用户已经"看到了"它们的存在（即便没点开），蓝点的提醒作用已经达成
- 否则蓝点未读会无限累积，失去提醒意义
- 想真正读内容仍可点进 detail

### 6.3 clearCompletedState 时机调整

- **删除** `tray.onPopupRequested` 里现有的 `store.clearCompletedState()` 调用
- **新增** `summaryPopup.onClose` 回调里的条件 clear（见 6.2）

效果：
- 任务跑完 → tray dot 变绿/红
- 用户点 tray 打开面板 → 看到展开的未读卡 → 关闭面板
- 这条卡及所有未读已完成任务被 mark viewed + tray dot 同时回灰
- dot 颜色和"是否还有未消化的内容"严格对应

## 七、独立历史窗口

新增 `electron/history-window.ts`（参考 detail 窗口的单实例模式）：

```ts
class HistoryWindow {
  private win: BrowserWindow | null = null;
  
  show(): void {
    if (this.win && !this.win.isDestroyed()) {
      this.win.focus();
      return;
    }
    
    this.win = new BrowserWindow({
      width: 500,
      height: 700,
      title: '执行历史',
      resizable: true,                  // 用户可拖拽调整大小
      webPreferences: { ... },
    });
    
    this.win.loadURL(`http://127.0.0.1:${port}/history`);
    this.win.on('closed', () => { this.win = null; });
  }
}
```

新增 Next.js 页面 `src/app/history/page.tsx`：
- 通过 IPC `history:fetch-all` 拉数据，主进程调用 `getRecentExecutions(db, 100)`
- 列表项视觉复用主面板"已读折叠"的样式（建议抽到 `src/components/TaskRowCollapsed.tsx` 共用）
- 点击列表项 → 发送 `summary:open-detail` IPC（复用现有 handler）
- 不分组，按时间倒序扁平排列

主面板「查看全部历史 →」按钮：
- 仅当 `hasMore === true` 时显示
- 点击 → IPC `history:open-window`

## 八、待删 / 重构 / 新增

### 8.1 待删代码

| 位置 | 处理 |
|---|---|
| `SummaryPanel.tsx` 的 `RecordingState` / `EditingState` / `ExecutingState` 三个组件 | 删除（功能并入主列表 + 状态条） |
| `SummaryPanel.tsx` 底部 `historyExpanded` 死代码 | 删除 |
| `SummaryPanel.tsx` `getStatusInfo` 里的 `bgColor` 字段及调用 | 删除（背景色统一） |
| `summary-popup.ts:13-18` toggle 关闭逻辑 | 删除，改为 lastClosedAt 防抖 |
| `main.ts` `tray.onPopupRequested` 里的 `store.clearCompletedState()` 调用 | 移到 `summaryPopup.onClose` 回调 |

### 8.2 重构

| 位置 | 改动 |
|---|---|
| `main.ts` `updateSummaryPopup` payload 字段 | 按第 4.2 节新契约调整 |
| `main.ts` `store.onChange` 回调 | 增加调用 `updateSummaryPopup()` |
| `main.ts` 数据查询 | 用 `getRecentExecutions(db, 10)` 替换 `getTodayExecutions(db, 10)` |
| `electron/summary-popup.ts` | 增加 `lastClosedAt` 字段、`onClose` 回调、blur 触发回调 |
| `SummaryPanel.tsx` | 重写：单一 TaskList 模型 + 三种卡片形态 + 状态条 + 「查看全部历史」按钮 |

### 8.3 新增

| 文件 | 内容 |
|---|---|
| `electron/history-window.ts` | HistoryWindow 类（单实例 BrowserWindow 管理） |
| `src/app/history/page.tsx` | 历史列表页 |
| `src/components/TaskRowCollapsed.tsx` | 折叠卡片组件（主面板 + 历史窗口共享） |
| `src/components/TaskCardExpanded.tsx` | 展开卡片组件（含截断检测、形态 1 + 形态 2） |
| `electron/main.ts` IPC handler `history:fetch-all` | 调 `getRecentExecutions(db, 100)`，回传列表 |
| `electron/main.ts` IPC handler `history:open-window` | 调 `historyWindow.show()` |
| `src/lib/db.ts` 新函数 `markAllUnviewedAsViewed(db): boolean` | 批量更新 `viewed=0 AND status IN ('completed','failed','cancelled')` 的记录，返回是否有记录被实际更新 |

## 九、实现顺序

1. **后端基础**：数据查询（`getRecentExecutions` 取代 `getTodayExecutions`）、`markAllUnviewedAsViewed`、payload 契约调整
2. **IPC 推送贯通**：`store.onChange` 接入 `updateSummaryPopup`、防御性 win 检查
3. **开关机制修复**：`SummaryPopupWindow` 的 `lastClosedAt` 防抖 + `onClose` 回调
4. **viewed 时机调整**：删除 `tray.onPopupRequested` 里的 `clearCompletedState`，移到 `onClose`
5. **面板组件重写**：`SummaryPanel.tsx` 砍掉三个专属 State 组件，改为单一 TaskList + 状态条
6. **卡片组件抽取**：`TaskCardExpanded` + `TaskRowCollapsed`，含截断检测
7. **历史窗口**：`history-window.ts` + `history/page.tsx` + 两个新 IPC handler
8. **联调验证**：覆盖每种 appState × viewed 组合的展示

## 十、不在本次范围内

- detail 窗口本身不变
- voice-bar 不变
- store 状态机的转换规则不变（新机制只是消费 store 状态，不改 store）
- 历史窗口的搜索、筛选、分组（YAGNI）
- 弹窗高度自适应（保持固定 380×480）
- 截断阈值（280px）的自适应（保持固定）
