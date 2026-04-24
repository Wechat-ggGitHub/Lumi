'use client';

import { useState, useEffect, useCallback } from 'react';
import { StatusDot } from './StatusDot';
import { getIpcRenderer } from '@/lib/electron-ipc';
import type { ExecutionRecord, AppState, SdkSubState, DotColor } from '@/types';

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
  return `${diffHours}小时前`;
}

function getTitle(exec: ExecutionRecord): string {
  return exec.title || exec.summary?.split('\n')[0] || exec.user_prompt;
}

export function SummaryPanel() {
  const [current, setCurrent] = useState<ExecutionRecord | null>(null);
  const [history, setHistory] = useState<ExecutionRecord[]>([]);
  const [historyCount, setHistoryCount] = useState(0);
  const [dotColor, setDotColor] = useState<DotColor>('gray');
  const [appState, setAppState] = useState<AppState>('idle');
  const [sdkSubState, setSdkSubState] = useState<SdkSubState>(null);
  const [currentToolName, setCurrentToolName] = useState<string | undefined>(undefined);
  const [historyExpanded, setHistoryExpanded] = useState(false);

  const ipcRenderer = typeof window !== 'undefined' ? getIpcRenderer() : null;

  useEffect(() => {
    if (!ipcRenderer) return;

    const handler = (_: unknown, data: {
      execution: ExecutionRecord | null;
      history: ExecutionRecord[];
      historyCount: number;
      dotColor: DotColor;
      appState: AppState;
      sdkSubState: SdkSubState;
      currentToolName?: string;
    }) => {
      setCurrent(data.execution);
      setHistory(data.history);
      setHistoryCount(data.historyCount);
      setDotColor(data.dotColor);
      setAppState(data.appState);
      setSdkSubState(data.sdkSubState);
      setCurrentToolName(data.currentToolName);
    };

    ipcRenderer.on('summary:update', handler);
    ipcRenderer.send('summary:ready');

    return () => { ipcRenderer.removeListener('summary:update', handler); };
  }, [ipcRenderer]);

  const openDetail = useCallback((id: string) => {
    ipcRenderer?.send('summary:mark-viewed', { id });
    ipcRenderer?.send('summary:open-detail', { id });
  }, [ipcRenderer]);

  const statusInfo = getStatusInfo(appState, sdkSubState, current, currentToolName);

  return (
    <div style={{
      width: 380, height: 480,
      fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
      fontSize: 13, color: '#e0e0e0',
      background: statusInfo.bgColor,
      display: 'flex', flexDirection: 'column',
      userSelect: 'none',
    }}>
      {/* 状态栏 */}
      <div style={{
        padding: '10px 16px',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <StatusDot color={statusInfo.dotColor} />
          <span style={{ fontWeight: 600, fontSize: 12 }}>{statusInfo.label}</span>
        </div>
        <span style={{ fontSize: 11, color: '#888' }}>
          {statusInfo.meta || '⌘ 开始语音'}
        </span>
      </div>

      {/* 内容区 */}
      {appState === 'recording' || appState === 'transcribing' ? (
        <RecordingState state={appState} />
      ) : appState === 'editing' ? (
        <EditingState current={current} />
      ) : appState === 'executing' ? (
        <ExecutingState current={current} sdkSubState={sdkSubState} currentToolName={currentToolName} />
      ) : (
        <TaskList
          current={current}
          history={history}
          appState={appState}
          sdkSubState={sdkSubState}
          openDetail={openDetail}
        />
      )}

      {/* 历史折叠 */}
      {historyCount > 0 && (
        <div style={{
          borderTop: '1px solid rgba(255,255,255,0.08)',
          flexShrink: 0,
        }}>
          <div
            onClick={() => setHistoryExpanded(!historyExpanded)}
            style={{
              padding: '8px 16px',
              fontSize: 12, color: '#888',
              cursor: 'pointer',
              display: 'flex', justifyContent: 'space-between',
            }}
          >
            <span>{historyExpanded ? '▼' : '▶'} 历史 ({historyCount})</span>
          </div>
        </div>
      )}
    </div>
  );
}

function getStatusInfo(
  appState: AppState,
  sdkSubState: SdkSubState,
  current: ExecutionRecord | null,
  currentToolName?: string,
): { label: string; dotColor: DotColor; meta: string; bgColor: string } {
  const defaultBg = '#1a1a1e';

  switch (appState) {
    case 'recording':
      return { label: '录音中', dotColor: 'purple', meta: '', bgColor: defaultBg };
    case 'transcribing':
      return { label: '转写中', dotColor: 'purple', meta: '', bgColor: defaultBg };
    case 'editing':
      return { label: '编辑中', dotColor: 'purple', meta: '', bgColor: defaultBg };
    case 'executing': {
      const elapsed = current?.duration_ms != null
        ? formatDuration(current.duration_ms)
        : '...';
      const turns = current?.num_turns != null ? ` · ${current.num_turns} 轮` : '';
      return { label: '执行中', dotColor: 'blue', meta: `已用时 ${elapsed}${turns}`, bgColor: defaultBg };
    }
    case 'idle': {
      if (sdkSubState === 'failed' || current?.status === 'failed') {
        const elapsed = current?.duration_ms != null ? `${formatDuration(current.duration_ms)}` : '';
        return { label: '执行失败', dotColor: 'red', meta: elapsed, bgColor: '#2a1a1e' };
      }
      if (sdkSubState === 'completed' || current?.status === 'completed') {
        const elapsed = current?.duration_ms != null ? formatDuration(current.duration_ms) : '';
        const turns = current?.num_turns != null ? ` · ${current.num_turns} 轮` : '';
        return { label: '已完成', dotColor: 'green', meta: `${elapsed}${turns}`, bgColor: defaultBg };
      }
      return { label: '待命', dotColor: 'gray', meta: '', bgColor: defaultBg };
    }
    default:
      return { label: '待命', dotColor: 'gray', meta: '', bgColor: defaultBg };
  }
}

function RecordingState({ state }: { state: 'recording' | 'transcribing' }) {
  return (
    <div style={{
      flex: 1,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      gap: 12,
    }}>
      <div style={{
        width: 48, height: 48,
        borderRadius: '50%',
        background: 'rgba(175,82,222,0.15)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{ fontSize: 24 }}>
          {state === 'recording' ? '🎙️' : '⏳'}
        </span>
      </div>
      <div style={{ fontSize: 14, fontWeight: 500 }}>
        {state === 'recording' ? '正在聆听...' : '正在转写语音...'}
      </div>
      {state === 'recording' && (
        <div style={{ fontSize: 11, color: '#666' }}>松开按键结束录音</div>
      )}
    </div>
  );
}

function EditingState({ current }: { current: ExecutionRecord | null }) {
  return (
    <div style={{
      flex: 1,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      gap: 12,
    }}>
      <div style={{ fontSize: 14, fontWeight: 500, textAlign: 'center', padding: '0 24px' }}>
        {current?.user_prompt || '编辑指令中...'}
      </div>
      <div style={{ fontSize: 11, color: '#666' }}>可在语音栏中编辑指令</div>
    </div>
  );
}

function ExecutingState({
  current,
  sdkSubState,
  currentToolName,
}: {
  current: ExecutionRecord | null;
  sdkSubState: SdkSubState;
  currentToolName?: string;
}) {
  const subStateLabel: Record<string, string> = {
    thinking: '正在思考...',
    executing_tool: `正在执行工具${currentToolName ? `: ${currentToolName}` : ''}...`,
    compacting: '正在压缩上下文...',
    rate_limited: '速率限制中...',
    authenticating: '正在认证...',
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '12px 16px', gap: 12 }}>
      <div style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.4 }}>
        {current?.user_prompt || '执行中...'}
      </div>

      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '10px 12px',
        background: 'rgba(50,173,255,0.08)',
        borderRadius: 8,
      }}>
        <div className="spinner" style={{
          width: 16, height: 16,
          border: '2px solid rgba(50,173,255,0.3)',
          borderTopColor: '#32ADFF',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite',
        }} />
        <span style={{ fontSize: 12, color: '#32ADFF' }}>
          {sdkSubState ? (subStateLabel[sdkSubState] || '执行中...') : '执行中...'}
        </span>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function TaskList({
  current,
  history,
  appState,
  sdkSubState,
  openDetail,
}: {
  current: ExecutionRecord | null;
  history: ExecutionRecord[];
  appState: AppState;
  sdkSubState: SdkSubState;
  openDetail: (id: string) => void;
}) {
  if (!current && history.length === 0) {
    return <EmptyState />;
  }

  return (
    <div style={{ flex: 1, overflow: 'auto' }}>
      {current && (
        <TaskCard
          exec={current}
          expanded={current.viewed === 0}
          appState={appState}
          sdkSubState={sdkSubState}
          openDetail={openDetail}
        />
      )}

      {history
        .filter(exec => exec.id !== current?.id)
        .map(exec => (
          <TaskCard
            key={exec.id}
            exec={exec}
            expanded={exec.viewed === 0}
            appState="idle"
            sdkSubState={null}
            openDetail={openDetail}
          />
        ))}
    </div>
  );
}

function TaskCard({
  exec,
  expanded,
  appState,
  sdkSubState,
  openDetail,
}: {
  exec: ExecutionRecord;
  expanded: boolean;
  appState: AppState;
  sdkSubState: SdkSubState;
  openDetail: (id: string) => void;
}) {
  const title = getTitle(exec);
  const isFailed = exec.status === 'failed' || (appState === 'idle' && sdkSubState === 'failed');

  if (!expanded) {
    return (
      <div
        onClick={() => openDetail(exec.id)}
        style={{
          padding: '10px 16px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          cursor: 'pointer',
          borderBottom: '1px solid rgba(255,255,255,0.04)',
          transition: 'background 0.15s ease',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }}
        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
      >
        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
          <span style={{ color: isFailed ? '#FF453A' : '#e0e0e0', fontSize: 13, fontWeight: 500 }}>
            {title}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8, color: '#666', flexShrink: 0, fontSize: 11, marginLeft: 12 }}>
          {exec.duration_ms != null && <span>{formatDuration(exec.duration_ms)}</span>}
          <span>{timeAgo(exec.created_at)}</span>
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={() => openDetail(exec.id)}
      style={{
        padding: '12px 16px',
        cursor: 'pointer',
        borderBottom: '1px solid rgba(255,255,255,0.04)',
        transition: 'background 0.15s ease',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
    >
      <div style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.4, marginBottom: 4 }}>
        {title}
      </div>
      <div style={{ fontSize: 11, color: '#666', fontStyle: 'italic', marginBottom: 8 }}>
        「{exec.user_prompt}」
      </div>
      {isFailed ? (
        <div style={{
          padding: '6px 10px',
          background: 'rgba(255,69,58,0.1)',
          border: '1px solid rgba(255,69,58,0.2)',
          borderRadius: 6,
          color: '#FF6B6B',
          fontSize: 12,
        }}>
          执行失败
        </div>
      ) : exec.summary ? (
        <div style={{ fontSize: 12, lineHeight: 1.6, color: '#ccc', whiteSpace: 'pre-wrap', maxHeight: 120, overflow: 'hidden' }}>
          {exec.summary}
        </div>
      ) : null}
      <div style={{ display: 'flex', gap: 8, color: '#666', fontSize: 11, marginTop: 8 }}>
        {exec.duration_ms != null && <span>{formatDuration(exec.duration_ms)}</span>}
        <span>{timeAgo(exec.created_at)}</span>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div style={{
      flex: 1,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      gap: 8,
    }}>
      <div style={{ fontSize: 13, color: '#888' }}>按右 ⌘ 开始语音输入</div>
    </div>
  );
}
