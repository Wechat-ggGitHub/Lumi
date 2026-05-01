# 移除摘要面板，合并为详情窗口 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 删除摘要弹窗（SummaryPanel），托盘点击直接打开包含左侧历史列表 + 右侧对话详情的常规桌面窗口。

**Architecture:** 用 DetailWindow 类替代 SummaryPopupWindow，管理一个常规桌面窗口（有标题栏、可调整大小）。页面从 `/summary/detail` 迁移到 `/detail`，新增左侧 HistorySidebar 组件，右侧复用现有对话渲染逻辑。IPC 合并为统一的 `detail:*` 命名空间。

**Tech Stack:** Electron BrowserWindow, React 19, Next.js App Router, better-sqlite3, IPC

---

## 文件结构

| 操作 | 文件 | 职责 |
|------|------|------|
| 新建 | `electron/detail-window.ts` | 详情窗口生命周期管理（创建/显示/隐藏/toggle） |
| 新建 | `src/components/HistorySidebar.tsx` | 左侧历史对话列表组件 |
| 迁移+改造 | `src/app/summary/detail/page.tsx` → `src/app/detail/page.tsx` | 合并左右分栏的主页面 |
| 修改 | `electron/main.ts` | 替换 SummaryPopupWindow，重写 IPC 注册 |
| 修改 | `src/types/index.ts` | 更新 IPC 消息类型 |
| 删除 | `electron/summary-popup.ts` | 旧摘要弹窗窗口类 |
| 删除 | `src/components/SummaryPanel.tsx` | 旧摘要面板组件 |
| 删除 | `src/app/summary/page.tsx` | 旧 /summary 路由 |

---

### Task 1: 新建 DetailWindow 窗口管理类

**Files:**
- Create: `electron/detail-window.ts`

- [ ] **Step 1: 创建 `electron/detail-window.ts`**

```ts
import { BrowserWindow, screen } from 'electron';
import { log } from '../src/lib/logger';

const TOGGLE_DEBOUNCE_MS = 200;
const WINDOW_WIDTH = 840;
const WINDOW_HEIGHT = 600;

export class DetailWindow {
  private win: BrowserWindow | null = null;
  private serverPort: number;
  private lastHiddenAt = 0;

  constructor(serverPort: number) {
    this.serverPort = serverPort;
  }

  isOpen(): boolean {
    return !!(this.win && !this.win.isDestroyed());
  }

  isVisible(): boolean {
    return this.isOpen() && this.win!.isVisible();
  }

  /** toggle：可见则隐藏，不可见则显示（带 200ms 防抖） */
  toggle(): void {
    if (this.isVisible()) {
      this.hide();
      return;
    }

    // 防抖：刚隐藏过则跳过
    if (Date.now() - this.lastHiddenAt < TOGGLE_DEBOUNCE_MS) {
      log.info('详情窗口: 200ms 内刚隐藏，跳过本次打开');
      return;
    }

    this.show();
  }

  show(): void {
    if (!this.isOpen()) {
      this.createWindow();
    }
    this.win!.show();
    this.win!.focus();

    // show 时推送最新数据
    this.send('detail:show');
  }

  hide(): void {
    if (!this.isVisible()) return;
    this.lastHiddenAt = Date.now();
    this.win!.hide();
    log.info('详情窗口: 已隐藏');
  }

  send(channel: string, data?: unknown): void {
    if (this.isOpen()) {
      this.win!.webContents.send(channel, data);
    }
  }

  private createWindow(): void {
    if (this.isOpen()) {
      this.win!.close();
      this.win = null;
    }

    // 定位在屏幕右侧居中
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;
    const x = screenWidth - WINDOW_WIDTH - 40;
    const y = Math.round((screenHeight - WINDOW_HEIGHT) / 2);

    this.win = new BrowserWindow({
      width: WINDOW_WIDTH,
      height: WINDOW_HEIGHT,
      x,
      y,
      title: 'Shrew',
      minWidth: 600,
      minHeight: 400,
      show: false,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
      },
    });

    this.win.loadURL(`http://127.0.0.1:${this.serverPort}/detail`);
    log.info('详情窗口: 已创建');

    // macOS 点关闭按钮 → 隐藏而非销毁
    this.win.on('close', (e) => {
      if (this.win) {
        e.preventDefault();
        this.hide();
      }
    });
  }

  destroy(): void {
    if (this.isOpen()) {
      this.win!.removeAllListeners();
      this.win!.close();
      this.win = null;
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add electron/detail-window.ts
git commit -m "feat: add DetailWindow class replacing SummaryPopupWindow"
```

---

### Task 2: 更新 IPC 类型定义

**Files:**
- Modify: `src/types/index.ts:74-133`

- [ ] **Step 1: 替换 `IpcMessages` 中的 summary 和 detail 相关类型**

将 `src/types/index.ts` 中 `IpcMessages` 接口的 `summary:*` 和 `detail:*` 部分替换为：

```ts
// IPC 消息类型
export interface IpcMessages {
  // voice-bar -> main
  'voice:send': { text: string };
  'voice:cancel': void;
  'voice:ready': void;

  // main -> voice-bar
  'voice:start-recording': void;
  'voice:stop-recording': void;
  'voice:transcript': { text: string; isAppending: boolean };
  'voice:transcribing': void;
  'voice:error': { message: string };

  // voice-bar <-> main (audio capture)
  'voice:start-capture': void;
  'voice:stop-capture': void;
  'voice:capture-started': boolean;
  'voice:audio-data': { samples: Float32Array; sampleRate: number };

  // detail window: main -> renderer
  'detail:show': void;
  'detail:history-list': {
    records: ExecutionRecord[];
    appState: AppState;
    sdkSubState: SdkSubState;
    currentToolName?: string;
  };
  'detail:conversation-data': { record: ExecutionRecord | null };
  'detail:stream-chunk': { id: string; content: string; done: boolean };
  'detail:tool-call': { id: string; toolCall: ToolCallRecord };
  'detail:execution-complete': { record: ExecutionRecord };

  // detail window: renderer -> main
  'detail:ready': void;
  'detail:select': { id: string };
  'detail:mark-viewed': { id: string };
  'detail:send-message': { id: string; text: string };

  // main -> renderer (状态更新)
  'state:app-state': { state: AppState };
  'state:sdk-substate': { substate: SdkSubState; toolName?: string };

  // main -> renderer (Tray 点击)
  'tray:click': void;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/types/index.ts
git commit -m "refactor: update IPC types for unified detail window"
```

---

### Task 3: 新建 HistorySidebar 组件

**Files:**
- Create: `src/components/HistorySidebar.tsx`

- [ ] **Step 1: 创建 `src/components/HistorySidebar.tsx`**

```tsx
'use client';

import { getIpcRenderer } from '@/lib/electron-ipc';
import type { ExecutionRecord, DotColor } from '@/types';

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffSeconds = Math.floor((now - then) / 1000);
  if (diffSeconds < 60) return '刚刚';
  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes}分钟前`;
  const diffHours = Math.floor(diffMinutes / 60);
  return `${diffHours}小时前`;
}

function statusDotColor(status: ExecutionRecord['status']): DotColor {
  switch (status) {
    case 'running': return 'blue';
    case 'completed': return 'green';
    case 'failed': return 'red';
    case 'cancelled': return 'gray';
    default: return 'gray';
  }
}

export function HistorySidebar({
  records,
  selectedId,
  appState,
  sdkSubState,
  currentToolName,
  onSelect,
}: {
  records: ExecutionRecord[];
  selectedId: string | null;
  appState: string;
  sdkSubState: string | null;
  currentToolName?: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div style={{
      width: 240,
      borderRight: '1px solid rgba(255,255,255,0.08)',
      display: 'flex',
      flexDirection: 'column',
      flexShrink: 0,
      background: 'rgba(0,0,0,0.15)',
      overflow: 'hidden',
    }}>
      {/* 状态栏 */}
      <div style={{
        padding: '10px 14px',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        flexShrink: 0,
      }}>
        <StatusBar appState={appState} sdkSubState={sdkSubState} currentToolName={currentToolName} />
      </div>

      {/* 历史列表 */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {records.length === 0 ? (
          <div style={{ padding: '20px 14px', color: '#666', fontSize: 12, textAlign: 'center' }}>
            按 ⌘ 开始对话
          </div>
        ) : (
          records.map(record => (
            <HistoryItem
              key={record.id}
              record={record}
              selected={record.id === selectedId}
              onSelect={onSelect}
            />
          ))
        )}
      </div>
    </div>
  );
}

function StatusBar({
  appState,
  sdkSubState,
  currentToolName,
}: {
  appState: string;
  sdkSubState: string | null;
  currentToolName?: string;
}) {
  let label = '待命';
  let color: DotColor = 'gray';

  if (appState === 'recording') { label = '录音中'; color = 'purple'; }
  else if (appState === 'transcribing') { label = '转写中'; color = 'purple'; }
  else if (appState === 'editing') { label = '编辑中'; color = 'purple'; }
  else if (appState === 'executing') { label = '执行中'; color = 'blue'; }
  else if (appState === 'idle' && sdkSubState === 'completed') { label = '已完成'; color = 'green'; }
  else if (appState === 'idle' && sdkSubState === 'failed') { label = '失败'; color = 'red'; }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{
        width: 6, height: 6, borderRadius: '50%',
        background: color === 'blue' ? '#32ADFF' :
                    color === 'green' ? '#34C759' :
                    color === 'red' ? '#FF453A' :
                    color === 'purple' ? '#AF52DE' : '#666',
        flexShrink: 0,
      }} />
      <span style={{ fontSize: 12, fontWeight: 600, color: '#ccc' }}>{label}</span>
      {appState === 'executing' && sdkSubState && (
        <span style={{ fontSize: 10, color: '#888', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {sdkSubState === 'thinking' ? '思考中' :
           sdkSubState === 'executing_tool' ? (currentToolName || '工具') :
           sdkSubState === 'compacting' ? '压缩中' : ''}
        </span>
      )}
    </div>
  );
}

function HistoryItem({
  record,
  selected,
  onSelect,
}: {
  record: ExecutionRecord;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const title = record.title || record.user_prompt.slice(0, 30);
  const dotColor = statusDotColor(record.status);

  return (
    <div
      onClick={() => onSelect(record.id)}
      style={{
        padding: '10px 14px',
        cursor: 'pointer',
        background: selected ? 'rgba(175,82,222,0.12)' : 'transparent',
        borderBottom: '1px solid rgba(255,255,255,0.04)',
        transition: 'background 0.15s ease',
      }}
      onMouseEnter={e => {
        if (!selected) e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
      }}
      onMouseLeave={e => {
        if (!selected) e.currentTarget.style.background = 'transparent';
      }}
    >
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        marginBottom: 4,
      }}>
        <div style={{
          width: 5, height: 5, borderRadius: '50%',
          background: dotColor === 'blue' ? '#32ADFF' :
                      dotColor === 'green' ? '#34C759' :
                      dotColor === 'red' ? '#FF453A' : '#666',
          flexShrink: 0,
        }} />
        <div style={{
          fontSize: 12, fontWeight: 500, color: '#ddd',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          flex: 1,
        }}>
          {title}
        </div>
      </div>
      <div style={{ fontSize: 10, color: '#666', paddingLeft: 11 }}>
        {timeAgo(record.created_at)}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/HistorySidebar.tsx
git commit -m "feat: add HistorySidebar component for conversation list"
```

---

### Task 4: 迁移并改造详情页面

**Files:**
- Create: `src/app/detail/page.tsx` (从 `src/app/summary/detail/page.tsx` 迁移改造)

- [ ] **Step 1: 创建 `src/app/detail/page.tsx`**

将现有的 `src/app/summary/detail/page.tsx` 改造为左右分栏布局。左侧嵌入 HistorySidebar，右侧复用现有对话渲染逻辑（MessageBubble、ToolCallItem 等）。

```tsx
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { HistorySidebar } from '@/components/HistorySidebar';
import { getIpcRenderer } from '@/lib/electron-ipc';
import type { ExecutionRecord, ConversationMessage, ToolCallRecord, AppState, SdkSubState } from '@/types';

function formatDuration(ms: number): string {
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m${remainingSeconds}s`;
}

function ToolCallItem({ toolCall }: { toolCall: ToolCallRecord }) {
  const [expanded, setExpanded] = useState(false);
  const icon = toolCall.status === 'completed' ? '✓' : '✗';
  const typeLabel: Record<string, string> = {
    read_file: '读取文件',
    edit_file: '编辑文件',
    write_file: '写入文件',
    run_command: '运行命令',
    other: '工具调用',
  };

  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(255,255,255,0.06)',
      borderRadius: 6,
      margin: '4px 0',
    }}>
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          padding: '6px 10px',
          display: 'flex', alignItems: 'center', gap: 8,
          cursor: 'pointer',
          fontSize: 12,
        }}
      >
        <span style={{ color: toolCall.status === 'completed' ? '#34C759' : '#FF453A' }}>{icon}</span>
        <span style={{ color: '#aaa' }}>{typeLabel[toolCall.type] || toolCall.type}</span>
        <span style={{ color: '#888', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
          {toolCall.target}
        </span>
        <span style={{ color: '#555' }}>{expanded ? '▼' : '▶'}</span>
      </div>
      {expanded && toolCall.detail && (
        <div style={{
          padding: '8px 10px',
          borderTop: '1px solid rgba(255,255,255,0.04)',
          background: 'rgba(0,0,0,0.2)',
          borderRadius: '0 0 6px 6px',
        }}>
          <pre style={{
            fontSize: 11, lineHeight: 1.5,
            whiteSpace: 'pre-wrap', wordBreak: 'break-all',
            margin: 0,
            color: '#ccc',
          }}>
            {toolCall.detail}
          </pre>
        </div>
      )}
    </div>
  );
}

function MessageBubble({ message }: { message: ConversationMessage }) {
  if (message.role === 'user') {
    return (
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <div style={{
          background: 'rgba(175,82,222,0.2)',
          border: '1px solid rgba(175,82,222,0.3)',
          borderRadius: '12px 12px 4px 12px',
          padding: '8px 12px',
          maxWidth: '75%',
          fontSize: 13,
          lineHeight: 1.5,
          whiteSpace: 'pre-wrap',
        }}>
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 11, color: '#AF52DE', marginBottom: 4, fontWeight: 500 }}>Claude</div>
      {message.content && (
        <div style={{
          background: 'rgba(255,255,255,0.05)',
          borderRadius: '4px 12px 12px 12px',
          padding: '8px 12px',
          fontSize: 13,
          lineHeight: 1.5,
          whiteSpace: 'pre-wrap',
        }}>
          {message.content}
        </div>
      )}
      {message.toolCalls?.map((tc, i) => (
        <ToolCallItem key={i} toolCall={tc} />
      ))}
    </div>
  );
}

export default function DetailPage() {
  const [records, setRecords] = useState<ExecutionRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [record, setRecord] = useState<ExecutionRecord | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [appState, setAppState] = useState<AppState>('idle');
  const [sdkSubState, setSdkSubState] = useState<SdkSubState>(null);
  const [currentToolName, setCurrentToolName] = useState<string | undefined>();
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const ipcRenderer = typeof window !== 'undefined' ? getIpcRenderer() : null;

  // IPC 监听
  useEffect(() => {
    if (!ipcRenderer) return;

    // 1) 历史列表推送
    const historyHandler = (_: unknown, data: {
      records: ExecutionRecord[];
      appState: AppState;
      sdkSubState: SdkSubState;
      currentToolName?: string;
    }) => {
      setRecords(data.records);
      setAppState(data.appState);
      setSdkSubState(data.sdkSubState);
      setCurrentToolName(data.currentToolName);

      // 如果没有选中任何对话，默认选中第一条
      setSelectedId(prev => {
        if (prev) return prev;
        const first = data.records[0];
        if (first) {
          ipcRenderer.send('detail:select', { id: first.id });
          return first.id;
        }
        return null;
      });
    };
    ipcRenderer.on('detail:history-list', historyHandler);

    // 2) 对话详情数据
    const conversationHandler = (_: unknown, data: { record: ExecutionRecord | null }) => {
      if (data.record) {
        setRecord(data.record);
        if (data.record.messages) {
          try {
            setMessages(JSON.parse(data.record.messages));
          } catch {
            setMessages([]);
          }
        } else {
          setMessages([
            { role: 'user', content: data.record.user_prompt },
            ...(data.record.summary ? [{ role: 'assistant' as const, content: data.record.summary }] : []),
          ]);
        }
      }
    };
    ipcRenderer.on('detail:conversation-data', conversationHandler);

    // 3) 流式消息
    const streamHandler = (_: unknown, data: { id: string; content: string; done: boolean }) => {
      if (data.id !== selectedId) return;
      if (data.done) { setIsSending(false); return; }
      setMessages(prev => [...prev, { role: 'assistant', content: data.content }]);
    };
    ipcRenderer.on('detail:stream-chunk', streamHandler);

    // 4) 工具调用
    const toolCallHandler = (_: unknown, data: { id: string; toolCall: ToolCallRecord }) => {
      if (data.id !== selectedId) return;
      setMessages(prev => {
        const last = prev[prev.length - 1];
        if (last?.role === 'assistant' && last.toolCalls && last.toolCalls.length > 0) {
          const updated = [...prev];
          const updatedLast = { ...updated[updated.length - 1] };
          updatedLast.toolCalls = [...updatedLast.toolCalls!, data.toolCall];
          updated[updated.length - 1] = updatedLast;
          return updated;
        }
        return [...prev, { role: 'assistant' as const, content: '', toolCalls: [data.toolCall] }];
      });
    };
    ipcRenderer.on('detail:tool-call', toolCallHandler);

    // 5) 执行完成
    const completeHandler = (_: unknown, data: { record: ExecutionRecord }) => {
      if (data.record.id === selectedId) {
        setRecord(data.record);
      }
      setIsSending(false);
      // 更新列表中的记录
      setRecords(prev => prev.map(r => r.id === data.record.id ? data.record : r));
    };
    ipcRenderer.on('detail:execution-complete', completeHandler);

    // 6) show 时刷新（由 DetailWindow.show() 触发 detail:show）
    const showHandler = () => {
      ipcRenderer.send('detail:ready');
    };
    ipcRenderer.on('detail:show', showHandler);

    // 初始加载
    ipcRenderer.send('detail:ready');

    return () => {
      ipcRenderer.removeListener('detail:history-list', historyHandler);
      ipcRenderer.removeListener('detail:conversation-data', conversationHandler);
      ipcRenderer.removeListener('detail:stream-chunk', streamHandler);
      ipcRenderer.removeListener('detail:tool-call', toolCallHandler);
      ipcRenderer.removeListener('detail:execution-complete', completeHandler);
      ipcRenderer.removeListener('detail:show', showHandler);
    };
  }, [ipcRenderer, selectedId]);

  // 自动滚动到底部
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSelect = useCallback((id: string) => {
    setSelectedId(id);
    ipcRenderer?.send('detail:select', { id });
    ipcRenderer?.send('detail:mark-viewed', { id });
  }, [ipcRenderer]);

  const handleSend = () => {
    if (!inputText.trim() || !record || !ipcRenderer) return;
    setIsSending(true);
    ipcRenderer.send('detail:send-message', { id: record.id, text: inputText.trim() });
    setMessages(prev => [...prev, { role: 'user', content: inputText.trim() }]);
    setInputText('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div style={{
      fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
      fontSize: 14, color: '#e0e0e0',
      background: '#1a1a1e',
      height: '100vh', display: 'flex',
    }}>
      {/* 左侧历史列表 */}
      <HistorySidebar
        records={records}
        selectedId={selectedId}
        appState={appState}
        sdkSubState={sdkSubState}
        currentToolName={currentToolName}
        onSelect={handleSelect}
      />

      {/* 右侧详情区 */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {!record ? (
          <div style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#666', fontSize: 13,
          }}>
            {records.length === 0 ? '按 ⌘ 开始对话' : '选择一个对话'}
          </div>
        ) : (
          <>
            {/* 标题栏 */}
            <div style={{
              padding: '10px 16px',
              borderBottom: '1px solid rgba(255,255,255,0.08)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              flexShrink: 0,
            }}>
              <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                {record.title || record.summary?.split('\n')[0] || record.user_prompt}
              </div>
              <div style={{ display: 'flex', gap: 12, fontSize: 11, color: '#666', flexShrink: 0, marginLeft: 16 }}>
                {record.duration_ms != null && <span>{formatDuration(record.duration_ms)}</span>}
                {record.cost_usd != null && <span>${record.cost_usd.toFixed(4)}</span>}
              </div>
            </div>

            {/* 对话区 */}
            <div ref={scrollRef} style={{ flex: 1, overflow: 'auto', padding: 16 }}>
              {messages.map((msg, i) => (
                <MessageBubble key={i} message={msg} />
              ))}
              {isSending && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
                  <div style={{
                    width: 12, height: 12,
                    border: '2px solid rgba(175,82,222,0.3)',
                    borderTopColor: '#AF52DE',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite',
                  }} />
                  <span style={{ fontSize: 12, color: '#888' }}>Claude 正在回复...</span>
                </div>
              )}
            </div>

            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

            {/* 输入区 */}
            {record.status === 'completed' && record.sdk_session_id && (
              <div style={{
                padding: '10px 16px',
                borderTop: '1px solid rgba(255,255,255,0.08)',
                display: 'flex', gap: 8, alignItems: 'center',
                flexShrink: 0,
              }}>
                <input
                  type="text"
                  value={inputText}
                  onChange={e => setInputText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="输入后续指令..."
                  disabled={isSending}
                  style={{
                    flex: 1,
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 8,
                    padding: '8px 12px',
                    fontSize: 13,
                    color: '#e0e0e0',
                    outline: 'none',
                    fontFamily: 'inherit',
                  }}
                />
                <button
                  onClick={handleSend}
                  disabled={isSending || !inputText.trim()}
                  style={{
                    width: 32, height: 32,
                    borderRadius: '50%',
                    background: isSending ? 'rgba(175,82,222,0.3)' : '#AF52DE',
                    border: 'none',
                    cursor: isSending ? 'default' : 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 14,
                    color: '#fff',
                    flexShrink: 0,
                  }}
                >
                  ➤
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/detail/page.tsx
git commit -m "feat: add /detail page with sidebar + conversation layout"
```

---

### Task 5: 重写 main.ts 中的窗口和 IPC 逻辑

**Files:**
- Modify: `electron/main.ts`

这是最大的改动。需要：
1. 将 `SummaryPopupWindow` import 替换为 `DetailWindow`
2. 将 `summaryPopup` 变量替换为 `detailWindow`
3. 重写托盘点击绑定
4. 重写 IPC 注册（删除旧 summary IPC，替换为 detail IPC）
5. 重写 `updateSummaryPopup` 为 `updateDetailWindow`

- [ ] **Step 1: 替换 import 和全局变量**

将第 7 行：
```ts
import { SummaryPopupWindow } from './summary-popup';
```
替换为：
```ts
import { DetailWindow } from './detail-window';
```

将第 30 行：
```ts
let summaryPopup: SummaryPopupWindow;
```
替换为：
```ts
let detailWindow: DetailWindow;
```

- [ ] **Step 2: 重写 `updateSummaryPopup` 函数为 `updateDetailWindow`**

将 `updateSummaryPopup` 函数（L157-172）替换为：

```ts
function updateDetailWindow(): void {
  if (!detailWindow?.isVisible()) return;

  const recent = getRecentExecutions(db, RECENT_LIMIT);
  detailWindow.send('detail:history-list', {
    records: recent,
    appState: store.appState,
    sdkSubState: store.sdkSubState,
    currentToolName: store.currentToolName ?? undefined,
  });
}
```

- [ ] **Step 3: 重写 IPC 注册**

将 `registerIpcHandlers` 函数中 `// summary` 注释到 `detail:send-message` 处理器结束的部分（约 L409-539）替换为：

```ts
  // detail window IPC
  ipcMain.on('detail:ready', () => {
    updateDetailWindow();
    // 如果有执行中的任务，推送最新数据
    const activeExec = getActiveExecution(db);
    if (activeExec) {
      detailWindow.send('detail:conversation-data', { record: activeExec });
    }
  });

  ipcMain.on('detail:select', (event, { id }: { id: string }) => {
    const rec = getExecutionById(db, id);
    detailWindow.send('detail:conversation-data', { record: rec });
  });

  ipcMain.on('detail:mark-viewed', (_, { id }: { id: string }) => {
    markViewed(db, id);
  });

  // detail: send follow-up message
  ipcMain.on('detail:send-message', async (event, { id, text }: { id: string; text: string }) => {
    const rec = getExecutionById(db, id);
    if (!rec?.sdk_session_id) {
      log.error('detail:send-message: 无 sdk_session_id');
      event.sender.send('detail:execution-complete', { record: { ...rec, status: 'failed' } });
      return;
    }

    const apiKey = loadApiKey();
    if (!apiKey) {
      log.error('detail:send-message: API Key 未配置');
      return;
    }

    const settings = loadSettings();
    const cwd = rec.cwd;
    const providerKey = settings.provider || 'glm-cn';
    const modelPreset = settings.modelPreset || 'opus';

    let claudeExecutablePath: string | undefined;
    if (!isDev) {
      const unpackedRoot = app.getAppPath().replace(/\.asar$/, '.asar.unpacked');
      const candidates = [
        'node_modules/@anthropic-ai/claude-agent-sdk/node_modules/@anthropic-ai/claude-agent-sdk-darwin-arm64/claude',
        'node_modules/@anthropic-ai/claude-agent-sdk-darwin-arm64/claude',
      ];
      for (const rel of candidates) {
        const full = path.join(unpackedRoot, rel);
        if (fs.existsSync(full)) {
          claudeExecutablePath = full;
          break;
        }
      }
    }

    log.info('detail:send-message: 恢复会话', rec.sdk_session_id);

    const continueAbortController = new AbortController();
    const conversationMessages: ConversationMessage[] = [];
    conversationMessages.push({ role: 'user', content: text });

    try {
      const result = await executeClaude(
        text,
        cwd,
        apiKey,
        providerKey,
        modelPreset,
        {
          onSubState: (substate, toolName) => {
            log.debug('detail SDK 子状态:', substate, toolName || '');
          },
          onError: (error) => {
            log.error('detail Claude 执行错误:', error);
            event.sender.send('detail:execution-complete', { record: getExecutionById(db, id) });
          },
          onMessage: (msg) => {
            conversationMessages.push(msg);
            event.sender.send('detail:stream-chunk', {
              id,
              content: msg.content,
              done: false,
            });
          },
          onToolCall: (toolCall) => {
            event.sender.send('detail:tool-call', { id, toolCall });
          },
        },
        continueAbortController.signal,
        claudeExecutablePath,
        rec.sdk_session_id
      );

      const existingMessages = JSON.parse(rec.messages || '[]') as ConversationMessage[];
      const allMessages = [...existingMessages, ...conversationMessages];
      appendMessages(db, id, allMessages);

      const updatedRecord = getExecutionById(db, id);
      if (updatedRecord) {
        const newDuration = (updatedRecord.duration_ms || 0) + (result.durationMs || 0);
        const newCost = (updatedRecord.cost_usd || 0) + (result.costUsd || 0);
        const newTurns = (updatedRecord.num_turns || 0) + (result.numTurns || 0);
        updateExecution(db, id, {
          duration_ms: newDuration,
          cost_usd: newCost,
          num_turns: newTurns,
          summary: result.summary || updatedRecord.summary,
        });

        const finalRecord = getExecutionById(db, id);
        event.sender.send('detail:execution-complete', { record: finalRecord });
      }
    } catch (err) {
      log.error('detail:send-message 执行异常:', err);
      event.sender.send('detail:execution-complete', { record: getExecutionById(db, id) });
    }
  });
```

- [ ] **Step 4: 重写窗口创建和托盘绑定**

在 `app.whenReady().then` 中，将 `// 创建窗口管理器` 部分（约 L700-711）：

```ts
  // 创建窗口管理器
  voiceBar = new VoiceBarWindow(serverPort);
  summaryPopup = new SummaryPopupWindow(serverPort);
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

替换为：

```ts
  // 创建窗口管理器
  voiceBar = new VoiceBarWindow(serverPort);
  detailWindow = new DetailWindow(serverPort);
```

将托盘点击绑定（L688-689）：

```ts
  tray.onPopupRequested = () => {
    summaryPopup.show(tray as any);
  };
```

替换为：

```ts
  tray.onPopupRequested = () => {
    detailWindow.toggle();
  };
```

将 `store.onChange` 中的 `updateSummaryPopup()` 调用（L682-684）：

```ts
  store.onChange(() => {
    updateTrayDot();
    updateSummaryPopup();
  });
```

替换为：

```ts
  store.onChange(() => {
    updateTrayDot();
    updateDetailWindow();
  });
```

在 `executePrompt` 函数中，将 `updateSummaryPopup()` 调用（L307, L325, L377）全部替换为 `updateDetailWindow()`。

在 `before-quit` handler 中，添加 `detailWindow?.destroy()`：

```ts
app.on('before-quit', () => {
  shortcutManager?.stop();
  voiceBar?.destroy();
  detailWindow?.destroy();
  db?.close();
  if (nextServer) {
    nextServer.kill();
    nextServer = null;
  }
});
```

删除 `detailWindow` 的全局声明（L37），因为现在由 DetailWindow 类管理。或者保留但不再用于旧的 `summary:open-detail` IPC。

- [ ] **Step 5: 删除旧的 `detailWindow` 全局变量和相关代码**

删除第 37 行：
```ts
let detailWindow: BrowserWindow | null = null;
```
（现在由 `DetailWindow` 类内部管理 BrowserWindow 实例）

删除 `executePrompt` 中所有 `updateSummaryPopup()` 调用并替换为 `updateDetailWindow()`。

- [ ] **Step 6: Commit**

```bash
git add electron/main.ts
git commit -m "refactor: replace SummaryPopupWindow with DetailWindow in main process"
```

---

### Task 6: 删除旧文件

**Files:**
- Delete: `electron/summary-popup.ts`
- Delete: `src/components/SummaryPanel.tsx`
- Delete: `src/app/summary/page.tsx`
- Delete: `src/app/summary/detail/page.tsx`

- [ ] **Step 1: 删除文件**

```bash
rm electron/summary-popup.ts
rm src/components/SummaryPanel.tsx
rm src/app/summary/page.tsx
rm -r src/app/summary
```

- [ ] **Step 2: 检查是否有遗留引用**

```bash
grep -r "summary-popup" electron/ src/ --include="*.ts" --include="*.tsx" || echo "无遗留引用"
grep -r "SummaryPanel" src/ --include="*.ts" --include="*.tsx" || echo "无遗留引用"
grep -r "SummaryPopupWindow" electron/ --include="*.ts" || echo "无遗留引用"
grep -r "summary:update" electron/ src/ --include="*.ts" --include="*.tsx" || echo "无遗留引用"
grep -r "summary:ready" electron/ src/ --include="*.ts" --include="*.tsx" || echo "无遗留引用"
grep -r "summary:open-detail" electron/ src/ --include="*.ts" --include="*.tsx" || echo "无遗留引用"
grep -r "summary:fetch-detail" electron/ src/ --include="*.ts" --include="*.tsx" || echo "无遗留引用"
grep -r "summary:detail-data" electron/ src/ --include="*.ts" --include="*.tsx" || echo "无遗留引用"
```

所有搜索应返回 "无遗留引用"。

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore: remove SummaryPanel, summary-popup, and /summary route"
```

---

### Task 7: 构建验证

- [ ] **Step 1: 运行构建**

```bash
npm run build
```

Expected: 构建成功，无类型错误。

- [ ] **Step 2: 运行 Electron 构建**

```bash
npm run build:electron
```

Expected: esbuild 编译成功。

- [ ] **Step 3: 开发模式验证**

```bash
npm run electron:dev
```

手动验证：
1. 应用启动后，点击托盘图标 → 详情窗口应弹出（840x600，屏幕右侧）
2. 再次点击托盘图标 → 窗口应隐藏
3. 再次点击 → 窗口应恢复
4. 左侧历史列表应为空（如果无历史）或显示最近记录
5. 按 ⌘ 录音执行任务，完成后点击托盘 → 左侧显示历史，右侧显示对话详情
6. 点击左侧不同记录 → 右侧切换对话内容
7. 点击关闭按钮（X）→ 窗口隐藏而非退出

- [ ] **Step 4: 最终 Commit（如有修复）**

```bash
git add -A
git commit -m "fix: address build and runtime issues from summary panel removal"
```
