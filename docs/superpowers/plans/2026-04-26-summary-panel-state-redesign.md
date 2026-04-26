# 摘要面板状态管理重设计 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把摘要面板的状态管理从「按 appState 切换 4 种专属界面」重构为「单一任务流时间线 + 顶部状态条」，修复 toggle/blur 冲突、IPC 不推送、dot 与面板状态不一致、历史折叠死按钮等问题，并新增独立历史窗口。

**Architecture:** 数据契约层（`summary:update` payload）改为 `recent / totalCount / hasMore + 状态字段`。`SummaryPopupWindow` 改为「blur 是唯一关闭路径 + click 用 `lastClosedAt` 防抖」+ `onClose` 回调。主进程在 `store.onChange` 中调用 `updateSummaryPopup`，让面板实时跟随状态。viewed 在面板关闭时批量标记。新增 `HistoryWindow` 类和 `/history` 页面，主面板「查看全部历史 →」按钮跳转。

**Tech Stack:** Electron BrowserWindow / ipcMain、Next.js 15 App Router、React 19 + Hooks、better-sqlite3、Jest（仅 db 层）

---

## File Structure

| 文件 | 动作 | 职责 |
|------|------|------|
| `src/lib/db.ts` | 修改 | 新增 `markAllUnviewedAsViewed()`，跳过 running 任务 |
| `src/__tests__/db.test.ts` | 修改 | 增加 `markAllUnviewedAsViewed` 单元测试 |
| `src/types/index.ts` | 修改 | 改 `summary:update` payload 契约；新增 `history:fetch-all` / `history:open-window` 类型 |
| `electron/summary-popup.ts` | 修改 | 加 `lastClosedAt` 防抖、`onClose` 回调、blur 触发回调 |
| `electron/main.ts` | 修改 | `store.onChange` 接入 `updateSummaryPopup`、新 payload、删 `tray.onPopupRequested` 里的 `clearCompletedState`、增 `summaryPopup.onClose`、新 IPC handlers、初始化 HistoryWindow |
| `electron/history-window.ts` | 新增 | 单实例 BrowserWindow 包装，路由 `/history` |
| `src/components/TaskRowCollapsed.tsx` | 新增 | 折叠卡片组件（已读 / 未读非最新两种）|
| `src/components/TaskCardExpanded.tsx` | 新增 | 展开卡片组件（执行中 / 已完成未读两种），含截断检测和已用时计时 |
| `src/components/SummaryPanel.tsx` | 重写 | 单一 TaskList 模型 + 顶部状态条 + 「查看全部历史」按钮 |
| `src/app/history/page.tsx` | 新增 | 历史窗口页面，渲染所有任务的 TaskRowCollapsed 列表 |
| `src/components/HistoryList.tsx` | 新增 | 历史窗口的列表组件（拉数据 + 渲染） |

---

### Task 1: 新增 `markAllUnviewedAsViewed` db 函数（TDD）

**Files:**
- Modify: `src/lib/db.ts`
- Test: `src/__tests__/db.test.ts`

- [ ] **Step 1: 写失败测试**

把以下测试追加到 `src/__tests__/db.test.ts` 末尾：

```typescript
import { markAllUnviewedAsViewed } from '../lib/db';

test('markAllUnviewedAsViewed updates only completed/failed/cancelled and returns true when any rows updated', () => {
  const idRunning = insertExecution(db, { cwd: '/x', user_prompt: 'A' });
  // running 保持 viewed=0

  const idDone = insertExecution(db, { cwd: '/x', user_prompt: 'B' });
  updateExecution(db, idDone, { status: 'completed', summary: 's' });
  // viewed 默认 0

  const idFail = insertExecution(db, { cwd: '/x', user_prompt: 'C' });
  updateExecution(db, idFail, { status: 'failed' });

  const idAlreadyViewed = insertExecution(db, { cwd: '/x', user_prompt: 'D' });
  updateExecution(db, idAlreadyViewed, { status: 'completed', viewed: 1 });

  const result = markAllUnviewedAsViewed(db);
  expect(result).toBe(true);

  expect(getExecutionById(db, idRunning)!.viewed).toBe(0);     // running 不动
  expect(getExecutionById(db, idDone)!.viewed).toBe(1);        // 已被标
  expect(getExecutionById(db, idFail)!.viewed).toBe(1);        // 已被标
  expect(getExecutionById(db, idAlreadyViewed)!.viewed).toBe(1); // 原本就是 1
});

test('markAllUnviewedAsViewed returns false when nothing to mark', () => {
  const idRunning = insertExecution(db, { cwd: '/x', user_prompt: 'X' });
  // 数据库里只有 running 任务，没有未读已完成

  const result = markAllUnviewedAsViewed(db);
  expect(result).toBe(false);
});
```

- [ ] **Step 2: 运行测试，确认失败**

```bash
npx jest src/__tests__/db.test.ts -t "markAllUnviewedAsViewed"
```

预期：FAIL，提示 `markAllUnviewedAsViewed is not exported` 或类似导入错误。

- [ ] **Step 3: 实现函数**

在 `src/lib/db.ts` 末尾追加：

```typescript
export function markAllUnviewedAsViewed(db: Database.Database): boolean {
  const result = db.prepare(
    `UPDATE execution_history
     SET viewed = 1
     WHERE viewed = 0
       AND status IN ('completed', 'failed', 'cancelled')`
  ).run();
  return result.changes > 0;
}
```

- [ ] **Step 4: 运行测试，确认通过**

```bash
npx jest src/__tests__/db.test.ts -t "markAllUnviewedAsViewed"
```

预期：2 个 test PASS。

- [ ] **Step 5: 跑全套 db 测试确保没有回归**

```bash
npx jest src/__tests__/db.test.ts
```

预期：全部 PASS。

- [ ] **Step 6: 提交**

```bash
git add src/lib/db.ts src/__tests__/db.test.ts
git commit -m "feat(db): add markAllUnviewedAsViewed for batch view marking"
```

---

### Task 2: 更新 IPC 类型契约

**Files:**
- Modify: `src/types/index.ts:95-103,128`

- [ ] **Step 1: 改 `summary:update` payload 类型**

把 `src/types/index.ts` 第 95-103 行：

```typescript
  // main -> summary-popup
  'summary:update': {
    execution: ExecutionRecord | null;
    history: ExecutionRecord[];
    historyCount: number;
    dotColor: DotColor;
    appState: AppState;
    sdkSubState: SdkSubState;
    currentToolName?: string;
  };
```

替换为：

```typescript
  // main -> summary-popup
  'summary:update': {
    recent: ExecutionRecord[];      // 最近 10 条（按 created_at DESC，含进行中）
    totalCount: number;             // 数据库总记录数
    hasMore: boolean;               // = totalCount > recent.length
    dotColor: DotColor;
    appState: AppState;
    sdkSubState: SdkSubState;
    currentToolName?: string;
  };
```

- [ ] **Step 2: 增加历史窗口相关 IPC 类型**

在 `src/types/index.ts` 第 128 行（`'tray:click': void;` 之后、IpcMessages 接口的右花括号之前）追加：

```typescript

  // history window IPC
  'history:open-window': void;
  'history:fetch-all': void;
  'history:all-data': { records: ExecutionRecord[] };
```

- [ ] **Step 3: 类型检查**

```bash
npx tsc --noEmit -p tsconfig.json
```

预期：会报多处错误（消费旧 payload 的代码），是预期的。**记下错误位置但先不修**——后续 task 4 / 8 会一并修。

- [ ] **Step 4: 提交**

```bash
git add src/types/index.ts
git commit -m "refactor(types): switch summary:update payload to recent/totalCount/hasMore + add history IPC types"
```

---

### Task 3: SummaryPopupWindow 增加 `lastClosedAt` 防抖 + `onClose` 回调

**Files:**
- Modify: `electron/summary-popup.ts`

- [ ] **Step 1: 重写 `electron/summary-popup.ts`**

完整替换文件内容为：

```typescript
import { BrowserWindow, Tray } from 'electron';
import { log } from '../src/lib/logger';

const TOGGLE_DEBOUNCE_MS = 200;

export class SummaryPopupWindow {
  private win: BrowserWindow | null = null;
  private serverPort: number;
  private lastClosedAt = 0;

  /** 主进程注册的关闭回调，在 blur 触发关闭后调用，用于 mark-viewed / 清 dot */
  onClose?: () => void;

  constructor(serverPort: number) {
    this.serverPort = serverPort;
  }

  /** 是否当前已打开（供主进程在推送前判断） */
  isOpen(): boolean {
    return !!(this.win && !this.win.isDestroyed());
  }

  show(tray: Tray): void {
    // 200ms 内被关过 → 视为 toggle 关闭，不开新窗口
    if (Date.now() - this.lastClosedAt < TOGGLE_DEBOUNCE_MS) {
      log.info('摘要弹窗: 200ms 内刚关闭，跳过本次打开（toggle 关闭）');
      return;
    }

    // 防御：极端情况下窗口仍存在（理论不会发生，因为 blur 会立刻关）
    if (this.isOpen()) {
      log.warn('摘要弹窗: show() 被调用但窗口已存在，先关闭旧窗口');
      this.win?.close();
      this.win = null;
    }

    const trayBounds = tray.getBounds();
    const popupWidth = 380;
    const popupHeight = 480;

    const x = Math.round(trayBounds.x + trayBounds.width / 2 - popupWidth / 2);
    const y = Math.round(trayBounds.y + trayBounds.height + 4);

    this.win = new BrowserWindow({
      width: popupWidth,
      height: popupHeight,
      x,
      y,
      frame: false,
      resizable: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      show: false,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
      },
    });

    this.win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    this.win.loadURL(`http://127.0.0.1:${this.serverPort}/summary`);
    log.info('摘要弹窗: 打开, 位置:', { x, y });

    this.win.once('ready-to-show', () => this.win?.show());

    this.win.on('blur', () => {
      log.info('摘要弹窗: 失焦关闭');
      this.lastClosedAt = Date.now();
      try {
        this.onClose?.();
      } catch (err) {
        log.error('摘要弹窗 onClose 回调异常:', err);
      }
      this.win?.close();
      this.win = null;
    });
  }

  send(channel: string, data?: unknown): void {
    if (this.isOpen()) {
      this.win!.webContents.send(channel, data);
    }
  }

  close(): void {
    if (this.isOpen()) {
      this.lastClosedAt = Date.now();
      this.win!.close();
      this.win = null;
      log.info('摘要弹窗: 已关闭');
    }
  }
}
```

关键变化：
- 删除原有 toggle 关闭逻辑（`if (this.win && !this.win.isDestroyed()) { this.win.close(); ... return; }`）
- 新增 `lastClosedAt` 字段 + 200ms 检查
- 新增 `onClose` 回调字段
- blur handler 在 close 前先 `lastClosedAt = Date.now()` 再调 `onClose?.()`
- 新增 `isOpen()` 方法供主进程使用
- `send()` 用 `isOpen()` 替换原来的判空

- [ ] **Step 2: 验证 electron 编译**

```bash
npm run build:electron
```

预期：编译成功。如有 TS 报错，修复后重试。

- [ ] **Step 3: 提交**

```bash
git add electron/summary-popup.ts
git commit -m "refactor(summary-popup): replace toggle with lastClosedAt debounce + onClose hook"
```

---

### Task 4: 主进程 `updateSummaryPopup` 改用新 payload + 接入 `getRecentExecutions`

**Files:**
- Modify: `electron/main.ts:11,155-168`

- [ ] **Step 1: 调整 db 导入**

把 `electron/main.ts` 第 11 行：

```typescript
import { initDb, insertExecution, updateExecution, getRecentExecutions, getActiveExecution, getExecutionById, appendMessages, markViewed, getTodayExecutions, getHistoryCount } from '../src/lib/db';
```

替换为：

```typescript
import { initDb, insertExecution, updateExecution, getRecentExecutions, getExecutionById, appendMessages, markViewed, markAllUnviewedAsViewed } from '../src/lib/db';
```

（去掉 `getActiveExecution`, `getTodayExecutions`, `getHistoryCount`；加上 `markAllUnviewedAsViewed`。）

- [ ] **Step 2: 重写 `updateSummaryPopup`**

把 `electron/main.ts` 第 155-168 行：

```typescript
function updateSummaryPopup(): void {
  const active = getActiveExecution(db);
  const todayExecutions = getTodayExecutions(db, 10);
  const historyCount = getHistoryCount(db);
  summaryPopup.send('summary:update', {
    execution: active,
    history: todayExecutions,
    historyCount,
    dotColor: store.dotColor,
    appState: store.appState,
    sdkSubState: store.sdkSubState,
    currentToolName: store.currentToolName ?? undefined,
  });
}
```

替换为：

```typescript
const RECENT_LIMIT = 10;

function updateSummaryPopup(): void {
  // 防御：面板未打开时不查数据库
  if (!summaryPopup?.isOpen()) return;

  const recent = getRecentExecutions(db, RECENT_LIMIT);
  const totalCount = getTotalExecutionCount(db);
  summaryPopup.send('summary:update', {
    recent,
    totalCount,
    hasMore: totalCount > recent.length,
    dotColor: store.dotColor,
    appState: store.appState,
    sdkSubState: store.sdkSubState,
    currentToolName: store.currentToolName ?? undefined,
  });
}

function getTotalExecutionCount(db: Database.Database): number {
  const row = db.prepare(`SELECT COUNT(*) as count FROM execution_history`).get() as { count: number };
  return row.count;
}
```

- [ ] **Step 3: 编译验证**

```bash
npm run build:electron
```

预期：编译通过。如有错误（例如 `getActiveExecution` 在别处仍被引用），按报错位置修复后重跑。

- [ ] **Step 4: 提交**

```bash
git add electron/main.ts
git commit -m "refactor(main): switch updateSummaryPopup to recent-based payload with totalCount"
```

---

### Task 5: 把 `clearCompletedState` 移到 `summaryPopup.onClose`，并接入 `store.onChange`

**Files:**
- Modify: `electron/main.ts:672-680`

- [ ] **Step 1: 修改 store.onChange 注册**

把 `electron/main.ts` 第 672 行：

```typescript
  store.onChange(() => updateTrayDot());
```

替换为：

```typescript
  store.onChange(() => {
    updateTrayDot();
    updateSummaryPopup();
  });
```

- [ ] **Step 2: 修改 `tray.onPopupRequested`**

把 `electron/main.ts` 第 676-680 行：

```typescript
  tray.onPopupRequested = () => {
    store.clearCompletedState();
    updateTrayDot();
    summaryPopup.show(tray as any);
  };
```

替换为：

```typescript
  tray.onPopupRequested = () => {
    summaryPopup.show(tray as any);
  };
```

（删掉 `clearCompletedState` 和 `updateTrayDot`，因为现在 dot 清除是在面板关闭时按未读情况判断，不在打开时无条件清。）

- [ ] **Step 3: 注册 `summaryPopup.onClose` 回调**

在 `electron/main.ts` 中创建 `summaryPopup` 实例之后（第 692 行 `summaryPopup = new SummaryPopupWindow(serverPort);` 这行之后）追加：

```typescript
  summaryPopup.onClose = () => {
    const hadUnread = markAllUnviewedAsViewed(db);
    if (hadUnread &&
        store.appState === 'idle' &&
        (store.sdkSubState === 'completed' || store.sdkSubState === 'failed')) {
      store.clearCompletedState();
    }
    updateTrayDot();
  };
```

- [ ] **Step 4: 编译验证**

```bash
npm run build:electron
```

预期：编译通过。

- [ ] **Step 5: 提交**

```bash
git add electron/main.ts
git commit -m "refactor(main): move clearCompletedState to popup close + wire store.onChange to updateSummaryPopup"
```

---

### Task 6: 创建 `TaskRowCollapsed` 组件

**Files:**
- Create: `src/components/TaskRowCollapsed.tsx`

- [ ] **Step 1: 创建组件**

写入 `src/components/TaskRowCollapsed.tsx`：

```typescript
'use client';

import type { ExecutionRecord } from '@/types';

function formatDuration(ms: number): string {
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m${remainingSeconds}s`;
}

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffSeconds = Math.floor((now - then) / 1000);
  if (diffSeconds < 60) return '刚刚';
  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes}分钟前`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}小时前`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}天前`;
}

function getTitle(exec: ExecutionRecord): string {
  // 折叠态显示用户原始 prompt（截断）
  return exec.user_prompt;
}

export function TaskRowCollapsed({
  exec,
  unread,
  onClick,
}: {
  exec: ExecutionRecord;
  unread: boolean;     // true = 未读非最新（带蓝点+加粗+左竖条），false = 已读
  onClick: (id: string) => void;
}) {
  const isFailed = exec.status === 'failed';
  const titleColor = isFailed ? '#FF453A' : '#e0e0e0';
  const fontWeight = unread ? 600 : 500;

  return (
    <div
      onClick={() => onClick(exec.id)}
      style={{
        padding: '10px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        cursor: 'pointer',
        borderBottom: '1px solid rgba(255,255,255,0.04)',
        borderLeft: unread ? '2px solid #32ADFF' : '2px solid transparent',
        transition: 'background 0.15s ease',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
    >
      {unread && (
        <span style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: '#32ADFF',
          flexShrink: 0,
        }} />
      )}
      <div style={{
        flex: 1,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}>
        <span style={{ color: titleColor, fontSize: 13, fontWeight }}>
          {getTitle(exec)}
        </span>
      </div>
      <div style={{
        display: 'flex',
        gap: 8,
        color: '#666',
        flexShrink: 0,
        fontSize: 11,
      }}>
        {exec.duration_ms != null && <span>{formatDuration(exec.duration_ms)}</span>}
        <span>{timeAgo(exec.created_at)}</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 编译验证**

```bash
npx tsc --noEmit -p tsconfig.json src/components/TaskRowCollapsed.tsx
```

预期：无报错。

- [ ] **Step 3: 提交**

```bash
git add src/components/TaskRowCollapsed.tsx
git commit -m "feat(components): add TaskRowCollapsed for folded card display"
```

---

### Task 7: 创建 `TaskCardExpanded` 组件（含执行中 + 已完成两种模式）

**Files:**
- Create: `src/components/TaskCardExpanded.tsx`

- [ ] **Step 1: 创建组件**

写入 `src/components/TaskCardExpanded.tsx`：

```typescript
'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ExecutionRecord, SdkSubState } from '@/types';

const SUMMARY_MAX_HEIGHT = 280;

function formatDuration(ms: number): string {
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m${remainingSeconds}s`;
}

const SUB_STATE_LABEL: Record<string, string> = {
  thinking: '正在思考...',
  executing_tool: '正在执行工具',
  compacting: '正在压缩上下文...',
  rate_limited: '速率限制中...',
  authenticating: '正在认证...',
};

export function TaskCardExpanded({
  exec,
  mode,
  sdkSubState,
  currentToolName,
  onClick,
}: {
  exec: ExecutionRecord;
  mode: 'executing' | 'completed';
  sdkSubState?: SdkSubState;
  currentToolName?: string;
  onClick?: (id: string) => void;
}) {
  if (mode === 'executing') {
    return <ExecutingCard exec={exec} sdkSubState={sdkSubState} currentToolName={currentToolName} />;
  }
  return <CompletedCard exec={exec} onClick={onClick} />;
}

function ExecutingCard({
  exec,
  sdkSubState,
  currentToolName,
}: {
  exec: ExecutionRecord;
  sdkSubState?: SdkSubState;
  currentToolName?: string;
}) {
  const [elapsedMs, setElapsedMs] = useState(() => {
    return Date.now() - new Date(exec.created_at).getTime();
  });

  useEffect(() => {
    const start = new Date(exec.created_at).getTime();
    const id = setInterval(() => setElapsedMs(Date.now() - start), 1000);
    return () => clearInterval(id);
  }, [exec.created_at]);

  const subStateText = sdkSubState
    ? (sdkSubState === 'executing_tool' && currentToolName
        ? `正在执行工具: ${currentToolName}`
        : (SUB_STATE_LABEL[sdkSubState] || '执行中...'))
    : '执行中...';

  return (
    <div style={{
      padding: '12px 16px',
      borderBottom: '1px solid rgba(255,255,255,0.04)',
      background: 'rgba(50,173,255,0.04)',
    }}>
      <div style={{
        fontSize: 13,
        fontWeight: 500,
        lineHeight: 1.4,
        color: '#e0e0e0',
        marginBottom: 10,
      }}>
        {exec.user_prompt}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <Spinner />
        <span style={{ fontSize: 12, color: '#32ADFF' }}>{subStateText}</span>
      </div>

      <div style={{ fontSize: 11, color: '#888' }}>
        已用时 {formatDuration(elapsedMs)}
        {exec.num_turns != null && ` · 第 ${exec.num_turns} 轮`}
      </div>
    </div>
  );
}

function CompletedCard({
  exec,
  onClick,
}: {
  exec: ExecutionRecord;
  onClick?: (id: string) => void;
}) {
  const summaryRef = useRef<HTMLDivElement>(null);
  const [truncated, setTruncated] = useState(false);
  const isFailed = exec.status === 'failed';

  useLayoutEffect(() => {
    const el = summaryRef.current;
    if (!el) return;
    setTruncated(el.scrollHeight > el.clientHeight);
  }, [exec.summary]);

  return (
    <div
      onClick={() => onClick?.(exec.id)}
      style={{
        padding: '12px 16px',
        cursor: 'pointer',
        borderBottom: '1px solid rgba(255,255,255,0.04)',
        transition: 'background 0.15s ease',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
    >
      <div style={{
        fontSize: 12,
        color: '#888',
        lineHeight: 1.4,
        marginBottom: 8,
      }}>
        {exec.user_prompt}
      </div>

      {isFailed ? (
        <div style={{
          padding: '8px 12px',
          background: 'rgba(255,69,58,0.1)',
          border: '1px solid rgba(255,69,58,0.2)',
          borderRadius: 6,
          color: '#FF6B6B',
          fontSize: 12,
        }}>
          执行失败
        </div>
      ) : (
        <>
          <div
            ref={summaryRef}
            style={{
              position: 'relative',
              fontSize: 13,
              lineHeight: 1.6,
              color: '#e0e0e0',
              whiteSpace: 'pre-wrap',
              maxHeight: SUMMARY_MAX_HEIGHT,
              overflow: 'hidden',
            }}
          >
            {exec.summary || ''}
            {truncated && (
              <div style={{
                position: 'absolute',
                left: 0,
                right: 0,
                bottom: 0,
                height: 40,
                background: 'linear-gradient(transparent, #1a1a1e)',
                pointerEvents: 'none',
              }} />
            )}
          </div>
          {truncated && (
            <div style={{
              marginTop: 8,
              fontSize: 12,
              color: '#32ADFF',
              display: 'flex',
              justifyContent: 'space-between',
            }}>
              <span>进入详情查看 →</span>
              <span style={{ color: '#666' }}>
                {exec.duration_ms != null && formatDuration(exec.duration_ms)}
                {exec.num_turns != null && ` · ${exec.num_turns}轮`}
              </span>
            </div>
          )}
          {!truncated && (exec.duration_ms != null || exec.num_turns != null) && (
            <div style={{ marginTop: 8, fontSize: 11, color: '#666' }}>
              {exec.duration_ms != null && formatDuration(exec.duration_ms)}
              {exec.num_turns != null && ` · ${exec.num_turns}轮`}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Spinner() {
  return (
    <>
      <div style={{
        width: 14,
        height: 14,
        border: '2px solid rgba(50,173,255,0.3)',
        borderTopColor: '#32ADFF',
        borderRadius: '50%',
        animation: 'spin 1s linear infinite',
      }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </>
  );
}
```

- [ ] **Step 2: 编译验证**

```bash
npx tsc --noEmit -p tsconfig.json src/components/TaskCardExpanded.tsx
```

预期：无报错。

- [ ] **Step 3: 提交**

```bash
git add src/components/TaskCardExpanded.tsx
git commit -m "feat(components): add TaskCardExpanded with executing/completed modes and truncation detection"
```

---

### Task 8: 重写 `SummaryPanel.tsx`（统一任务流模型）

**Files:**
- Modify: `src/components/SummaryPanel.tsx`（完全替换）

- [ ] **Step 1: 替换 `src/components/SummaryPanel.tsx` 全文**

```typescript
'use client';

import { useState, useEffect, useCallback } from 'react';
import { StatusDot } from './StatusDot';
import { TaskCardExpanded } from './TaskCardExpanded';
import { TaskRowCollapsed } from './TaskRowCollapsed';
import { getIpcRenderer } from '@/lib/electron-ipc';
import type { ExecutionRecord, AppState, SdkSubState, DotColor } from '@/types';

const PANEL_WIDTH = 380;
const PANEL_HEIGHT = 480;

function formatDuration(ms: number): string {
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m${remainingSeconds}s`;
}

interface StatusInfo {
  label: string;
  dotColor: DotColor;
  meta: string;
}

function getStatusInfo(
  appState: AppState,
  sdkSubState: SdkSubState,
  latestUnread: ExecutionRecord | null,
): StatusInfo {
  switch (appState) {
    case 'recording':
      return { label: '录音中', dotColor: 'purple', meta: '再按右 Option 结束' };
    case 'transcribing':
      return { label: '转写中', dotColor: 'purple', meta: '' };
    case 'editing':
      return { label: '编辑中', dotColor: 'purple', meta: '在语音栏中编辑' };
    case 'sending':
      return { label: '准备执行…', dotColor: 'blue', meta: '' };
    case 'executing':
      return { label: '执行中', dotColor: 'blue', meta: '' };
    case 'idle':
      if (latestUnread?.status === 'completed') {
        const elapsed = latestUnread.duration_ms != null ? formatDuration(latestUnread.duration_ms) : '';
        const turns = latestUnread.num_turns != null ? ` · ${latestUnread.num_turns} 轮` : '';
        return { label: '已完成', dotColor: 'green', meta: `${elapsed}${turns}` };
      }
      if (latestUnread?.status === 'failed') {
        const elapsed = latestUnread.duration_ms != null ? formatDuration(latestUnread.duration_ms) : '';
        return { label: '执行失败', dotColor: 'red', meta: elapsed };
      }
      return { label: '待命', dotColor: 'gray', meta: '按右 Option 开始语音' };
    default:
      return { label: '待命', dotColor: 'gray', meta: '按右 Option 开始语音' };
  }
}

interface PanelData {
  recent: ExecutionRecord[];
  totalCount: number;
  hasMore: boolean;
  dotColor: DotColor;
  appState: AppState;
  sdkSubState: SdkSubState;
  currentToolName?: string;
}

export function SummaryPanel() {
  const [data, setData] = useState<PanelData>({
    recent: [],
    totalCount: 0,
    hasMore: false,
    dotColor: 'gray',
    appState: 'idle',
    sdkSubState: null,
    currentToolName: undefined,
  });

  const ipcRenderer = typeof window !== 'undefined' ? getIpcRenderer() : null;

  useEffect(() => {
    if (!ipcRenderer) return;

    const handler = (_: unknown, payload: PanelData) => setData(payload);
    ipcRenderer.on('summary:update', handler);
    ipcRenderer.send('summary:ready');

    return () => { ipcRenderer.removeListener('summary:update', handler); };
  }, [ipcRenderer]);

  const openDetail = useCallback((id: string) => {
    ipcRenderer?.send('summary:mark-viewed', { id });
    ipcRenderer?.send('summary:open-detail', { id });
  }, [ipcRenderer]);

  const openHistory = useCallback(() => {
    ipcRenderer?.send('history:open-window');
  }, [ipcRenderer]);

  const { recent, totalCount, hasMore, appState, sdkSubState, currentToolName } = data;

  // 计算各类卡片
  const running = recent.find(r => r.status === 'running') ?? null;
  const settled = recent.filter(r => r.status !== 'running');
  const latestUnread = settled.find(r => r.viewed === 0) ?? null;
  const otherUnread = settled.filter(r => r.viewed === 0 && r.id !== latestUnread?.id);
  const viewed = settled.filter(r => r.viewed === 1);

  const statusInfo = getStatusInfo(appState, sdkSubState, latestUnread);
  const isEmpty = recent.length === 0;

  return (
    <div style={{
      width: PANEL_WIDTH,
      height: PANEL_HEIGHT,
      fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
      fontSize: 13,
      color: '#e0e0e0',
      background: '#1a1a1e',
      display: 'flex',
      flexDirection: 'column',
      userSelect: 'none',
    }}>
      {/* 状态条 */}
      <div style={{
        padding: '10px 16px',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <StatusDot color={statusInfo.dotColor} />
          <span style={{ fontWeight: 600, fontSize: 12 }}>{statusInfo.label}</span>
        </div>
        {statusInfo.meta && (
          <span style={{ fontSize: 11, color: '#888' }}>{statusInfo.meta}</span>
        )}
      </div>

      {/* 任务列表 */}
      {isEmpty ? (
        <EmptyState />
      ) : (
        <div style={{ flex: 1, overflow: 'auto' }}>
          {running && (
            <TaskCardExpanded
              exec={running}
              mode="executing"
              sdkSubState={sdkSubState}
              currentToolName={currentToolName}
            />
          )}
          {latestUnread && (
            <TaskCardExpanded
              exec={latestUnread}
              mode="completed"
              onClick={openDetail}
            />
          )}
          {otherUnread.map(exec => (
            <TaskRowCollapsed
              key={exec.id}
              exec={exec}
              unread={true}
              onClick={openDetail}
            />
          ))}
          {viewed.map(exec => (
            <TaskRowCollapsed
              key={exec.id}
              exec={exec}
              unread={false}
              onClick={openDetail}
            />
          ))}
        </div>
      )}

      {/* 「查看全部历史」按钮 */}
      {hasMore && (
        <div
          onClick={openHistory}
          style={{
            padding: '10px 16px',
            fontSize: 12,
            color: '#888',
            cursor: 'pointer',
            borderTop: '1px solid rgba(255,255,255,0.08)',
            textAlign: 'center',
            flexShrink: 0,
            transition: 'color 0.15s ease',
          }}
          onMouseEnter={e => { e.currentTarget.style.color = '#e0e0e0'; }}
          onMouseLeave={e => { e.currentTarget.style.color = '#888'; }}
        >
          查看全部历史 →
        </div>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div style={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    }}>
      <div style={{ fontSize: 13, color: '#888' }}>按右 Option 开始语音输入</div>
    </div>
  );
}
```

- [ ] **Step 2: 注意 StatusDot 不支持 purple？验证 StatusDot 已支持 purple**

`src/components/StatusDot.tsx` 第 5-12 行已经包含 purple，无需修改。

- [ ] **Step 3: 编译验证**

```bash
npm run build
```

预期：Next.js 构建成功。如果在 `src/app/summary/page.tsx` 等处有引用旧 `getStatusInfo` 等导出的代码，按报错位置修复。

- [ ] **Step 4: 提交**

```bash
git add src/components/SummaryPanel.tsx
git commit -m "refactor(SummaryPanel): unify into single TaskList model with status bar + 3 card forms"
```

---

### Task 9: 创建 `HistoryWindow` 类

**Files:**
- Create: `electron/history-window.ts`

- [ ] **Step 1: 创建文件**

写入 `electron/history-window.ts`：

```typescript
import { BrowserWindow } from 'electron';
import { log } from '../src/lib/logger';

export class HistoryWindow {
  private win: BrowserWindow | null = null;
  private serverPort: number;

  constructor(serverPort: number) {
    this.serverPort = serverPort;
  }

  show(): void {
    if (this.win && !this.win.isDestroyed()) {
      this.win.focus();
      log.info('历史窗口: 复用已有实例');
      return;
    }

    this.win = new BrowserWindow({
      width: 500,
      height: 700,
      title: '执行历史',
      resizable: true,
      minWidth: 400,
      minHeight: 400,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
      },
    });

    this.win.loadURL(`http://127.0.0.1:${this.serverPort}/history`);
    log.info('历史窗口: 打开');

    this.win.on('closed', () => {
      this.win = null;
    });
  }

  send(channel: string, data?: unknown): void {
    if (this.win && !this.win.isDestroyed()) {
      this.win.webContents.send(channel, data);
    }
  }

  close(): void {
    if (this.win && !this.win.isDestroyed()) {
      this.win.close();
      this.win = null;
    }
  }
}
```

- [ ] **Step 2: 编译验证**

```bash
npm run build:electron
```

预期：编译成功。

- [ ] **Step 3: 提交**

```bash
git add electron/history-window.ts
git commit -m "feat(history-window): add singleton BrowserWindow wrapper for /history"
```

---

### Task 10: 创建历史窗口列表组件 + 页面

**Files:**
- Create: `src/components/HistoryList.tsx`
- Create: `src/app/history/page.tsx`

- [ ] **Step 1: 创建 `HistoryList` 组件**

写入 `src/components/HistoryList.tsx`：

```typescript
'use client';

import { useEffect, useState, useCallback } from 'react';
import { TaskRowCollapsed } from './TaskRowCollapsed';
import { getIpcRenderer } from '@/lib/electron-ipc';
import type { ExecutionRecord } from '@/types';

export function HistoryList() {
  const [records, setRecords] = useState<ExecutionRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const ipcRenderer = typeof window !== 'undefined' ? getIpcRenderer() : null;

  useEffect(() => {
    if (!ipcRenderer) return;

    const handler = (_: unknown, data: { records: ExecutionRecord[] }) => {
      setRecords(data.records);
      setLoading(false);
    };

    ipcRenderer.on('history:all-data', handler);
    ipcRenderer.send('history:fetch-all');

    return () => { ipcRenderer.removeListener('history:all-data', handler); };
  }, [ipcRenderer]);

  const openDetail = useCallback((id: string) => {
    ipcRenderer?.send('summary:mark-viewed', { id });
    ipcRenderer?.send('summary:open-detail', { id });
  }, [ipcRenderer]);

  if (loading) {
    return (
      <div style={{
        padding: '40px 16px',
        textAlign: 'center',
        color: '#888',
        fontSize: 13,
      }}>
        加载中...
      </div>
    );
  }

  if (records.length === 0) {
    return (
      <div style={{
        padding: '40px 16px',
        textAlign: 'center',
        color: '#888',
        fontSize: 13,
      }}>
        暂无执行历史
      </div>
    );
  }

  return (
    <div style={{ overflow: 'auto', height: '100%' }}>
      {records.map(exec => (
        <TaskRowCollapsed
          key={exec.id}
          exec={exec}
          unread={exec.viewed === 0 && exec.status !== 'running'}
          onClick={openDetail}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 2: 创建 `/history` 页面**

写入 `src/app/history/page.tsx`：

```typescript
import { HistoryList } from '@/components/HistoryList';

export default function HistoryPage() {
  return (
    <>
      <style>{`
        html, body {
          background: #1a1a1e !important;
          margin: 0;
          color: #e0e0e0;
          font-family: -apple-system, BlinkMacSystemFont, sans-serif;
          font-size: 13px;
          overflow: hidden;
        }
        body { height: 100vh; }
      `}</style>
      <div style={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
      }}>
        <HistoryList />
      </div>
    </>
  );
}
```

- [ ] **Step 3: 编译验证**

```bash
npm run build
```

预期：Next.js 构建成功，包含新的 `/history` 路由。

- [ ] **Step 4: 提交**

```bash
git add src/components/HistoryList.tsx src/app/history/page.tsx
git commit -m "feat(history): add HistoryList component and /history page"
```

---

### Task 11: 在主进程中接入 HistoryWindow + 注册新 IPC handlers

**Files:**
- Modify: `electron/main.ts`

- [ ] **Step 1: 引入 HistoryWindow + 新增模块级变量**

在 `electron/main.ts` 第 8 行（`import { SummaryPopupWindow } from './summary-popup';` 之后）追加：

```typescript
import { HistoryWindow } from './history-window';
```

在 `electron/main.ts` 第 30 行（`let summaryPopup: SummaryPopupWindow;` 之后）追加：

```typescript
let historyWindow: HistoryWindow;
```

- [ ] **Step 2: 实例化 HistoryWindow**

在 `electron/main.ts` 第 692 行（`summaryPopup = new SummaryPopupWindow(serverPort);` 那行之后）追加：

```typescript
  historyWindow = new HistoryWindow(serverPort);
```

- [ ] **Step 3: 注册 IPC handlers**

在 `registerIpcHandlers()` 函数内（约 `electron/main.ts:430` `ipcMain.on('summary:mark-viewed', ...)` 这段之后）追加：

```typescript
  // history
  ipcMain.on('history:open-window', () => {
    historyWindow.show();
  });

  ipcMain.on('history:fetch-all', (event) => {
    const records = getRecentExecutions(db, 100);
    event.sender.send('history:all-data', { records });
  });
```

- [ ] **Step 4: 编译验证**

```bash
npm run build:electron
```

预期：编译通过。

- [ ] **Step 5: 提交**

```bash
git add electron/main.ts
git commit -m "feat(main): wire HistoryWindow + history:open-window/fetch-all IPC handlers"
```

---

### Task 12: 联调验证（手动）

**Files:**
- 无（仅验证 + 可能的微调）

- [ ] **Step 1: 完整构建**

```bash
npm run build && npm run build:electron
```

预期：两端都构建成功，无错误。

- [ ] **Step 2: 运行应用**

```bash
npm run electron:dev
```

- [ ] **Step 3: 验证场景 1 — 空状态**

清空数据库（如有现有数据）后第一次启动：
- 点击 tray
- **预期**：面板顶部状态条显示 dot=gray + "待命" + "按右 Option 开始语音"，列表区显示 EmptyState 文案

- [ ] **Step 4: 验证场景 2 — toggle 防抖**

- 点击 tray 打开面板，再次点击 tray
- **预期**：面板关闭后不再重新打开（toggle 行为生效）
- 隔约 500ms 再点 tray
- **预期**：面板正常打开

- [ ] **Step 5: 验证场景 3 — 录音 / 转写 / 编辑过程态**

- 按右 Option 开始录音；保持面板打开
- **预期**：状态条切换为 purple + "录音中" + "再按右 Option 结束"，列表区不变（仍是历史列表）
- 再按右 Option 停止 → 转写中
- **预期**：状态条变 "转写中"
- 转写完成进入 editing
- **预期**：状态条变 "编辑中"

- [ ] **Step 6: 验证场景 4 — 执行中**

- 在语音栏发送一条简单指令（例如 "帮我列一下当前目录"）
- **预期**：列表第一张卡变成进行中卡片（蓝底，spinner，"正在思考..."），状态条 dot=blue + "执行中"
- 已用时数字每秒递增

- [ ] **Step 7: 验证场景 5 — 完成 + 未读展开**

- 任务跑完
- **预期**：tray dot 变绿；进行中卡片消失；列表第一张卡变成未读完整展开（无蓝边、user_prompt 灰色小字、summary 大字、底部 duration·turns）
- 状态条变 green + "已完成"

- [ ] **Step 8: 验证场景 6 — summary 截断 + "进入详情查看"**

- 跑一条会产生长输出的指令（例如 "解释一下 src/lib/store.ts 的设计"）
- **预期**：summary 区域被截断到 280px，底部显示渐变遮罩 + "进入详情查看 →" 链接
- 点击卡片任意位置 → 打开 detail 窗口

- [ ] **Step 9: 验证场景 7 — 关面板 + viewed 衰减**

- 跑两个任务（中间不开面板），让两条都未读
- 打开面板
- **预期**：第一张（最新）= 未读完整展开；第二张 = 未读折叠（蓝点 + 加粗 + 左竖条）
- 关闭面板（点别处）
- 再次打开面板
- **预期**：两张都变成已读折叠（无标记），tray dot 回灰

- [ ] **Step 10: 验证场景 8 — 历史窗口**

- 跑超过 10 条任务（让 totalCount > 10）
- 打开面板
- **预期**：底部显示 "查看全部历史 →" 按钮
- 点击 → 打开历史窗口
- **预期**：500×700 标题为 "执行历史"、列表显示所有任务（折叠样式）、可拖拽调整大小
- 点击列表中任意一条 → 打开 detail 窗口

- [ ] **Step 11: 验证场景 9 — 失败任务**

- 触发一条会失败的任务（例如断网状态下发起执行）
- **预期**：tray dot 变红、状态条变 red + "执行失败"、卡片 summary 区显示红底"执行失败"框
- 关面板再开
- **预期**：失败任务变成红色标题的折叠卡

- [ ] **Step 12: 如有发现问题 → 修复 → 单独 commit**

例如发现颜色不对、间距异常、IPC 时序 bug 等，以独立 commit 形式修复。提交信息按场景描述：

```bash
git add <files>
git commit -m "fix(summary): <具体问题>"
```

- [ ] **Step 13: 最终确认**

跑一遍 Jest 全套测试：

```bash
npx jest
```

预期：全部 PASS（特别是 db.test.ts 的新增 markAllUnviewedAsViewed 用例）。

---

## 自审清单（写完后我已完成）

- [x] **Spec 覆盖**：每个 spec 节都有对应任务
  - 第一节心智模型 → Task 8（SummaryPanel 重写）
  - 第二节卡片三种形态 → Task 6 + Task 7
  - 第三节状态条 → Task 8
  - 第四节 IPC 推送时机 → Task 4 + Task 5
  - 第五节开关机制 → Task 3
  - 第六节 viewed 标记 → Task 1 + Task 5
  - 第七节历史窗口 → Task 9 + Task 10 + Task 11
  - 第八节待删/重构/新增 → 散布在各 task
  - 第九节实现顺序 → Task 顺序与 spec 一致

- [x] **Placeholder 扫描**：每步代码完整、命令完整、预期行为明确，无 TBD/TODO

- [x] **类型一致性**：
  - `markAllUnviewedAsViewed(db)` 在 Task 1 定义、Task 5 调用，签名一致（返回 boolean）
  - `summary:update` payload 在 Task 2 定义、Task 4 实现、Task 8 消费，字段一致（recent / totalCount / hasMore / dotColor / appState / sdkSubState / currentToolName）
  - `SummaryPopupWindow.isOpen()` 在 Task 3 定义、Task 4 调用
  - `SummaryPopupWindow.onClose` 在 Task 3 定义、Task 5 注册
  - `HistoryWindow.show()` 在 Task 9 定义、Task 11 调用
  - `history:fetch-all` / `history:all-data` / `history:open-window` 在 Task 2 类型定义、Task 10 消费、Task 11 实现，字段一致

- [x] **commit 频率**：每个 task 至少 1 个 commit；前端组件抽取 / Electron 调整各自独立 commit

---

## 不在本计划范围内（与 spec 第十节一致）

- detail 窗口本身不变
- voice-bar 不变
- store 状态机的转换规则不变
- 历史窗口的搜索 / 筛选 / 分组（YAGNI）
- 弹窗高度自适应（保持固定 380×480）
- 截断阈值 280px 的自适应
- `electron/main.ts` 默认 settings 里 `shortcut: 'right_cmd'` 的命名遗留（不影响行为）
- 旧 `getTodayExecutions` / `getHistoryCount` 函数本身（可保留供其他地方使用，不显式删除）
