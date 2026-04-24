'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
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
  const diffMs = now - then;
  const diffSeconds = Math.floor(diffMs / 1000);
  if (diffSeconds < 60) return '刚刚';
  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes}分钟前`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}小时前`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return '昨天';
  return `${diffDays}天前`;
}

interface OverflowDetectorProps {
  children: React.ReactNode;
  onOverflow: (overflowing: boolean) => void;
}

function OverflowDetector({ children, onOverflow }: OverflowDetectorProps) {
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const overflowing = el.scrollHeight > el.clientHeight;
    onOverflow(overflowing);
  }, [children, onOverflow]);

  return <div ref={contentRef} style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>{children}</div>;
}

export function SummaryPanel() {
  const [current, setCurrent] = useState<ExecutionRecord | null>(null);
  const [history, setHistory] = useState<ExecutionRecord[]>([]);
  const [dotColor, setDotColor] = useState<DotColor>('gray');
  const [appState, setAppState] = useState<AppState>('idle');
  const [sdkSubState, setSdkSubState] = useState<SdkSubState>(null);
  const [currentToolName, setCurrentToolName] = useState<string | undefined>(undefined);
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [contentOverflowing, setContentOverflowing] = useState(false);

  const ipcRenderer = typeof window !== 'undefined' ? getIpcRenderer() : null;

  useEffect(() => {
    if (!ipcRenderer) return;

    const handler = (_: unknown, data: {
      execution: ExecutionRecord | null;
      history: ExecutionRecord[];
      dotColor: DotColor;
      appState: AppState;
      sdkSubState: SdkSubState;
      currentToolName?: string;
    }) => {
      setCurrent(data.execution);
      setHistory(data.history);
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
        <span style={{ fontSize: 11, color: '#888' }}>{statusInfo.meta}</span>
      </div>

      {/* 内容区 */}
      {appState === 'recording' || appState === 'transcribing' ? (
        <RecordingState state={appState} />
      ) : appState === 'editing' ? (
        <EditingState current={current} />
      ) : appState === 'executing' ? (
        <ExecutingState current={current} sdkSubState={sdkSubState} currentToolName={currentToolName} />
      ) : current ? (
        <CompletedState
          current={current}
          appState={appState}
          sdkSubState={sdkSubState}
          openDetail={openDetail}
          onOverflowChange={setContentOverflowing}
        />
      ) : (
        <EmptyState />
      )}

      {/* 查看完整结果（仅溢出时） */}
      {contentOverflowing && current && appState === 'idle' && (
        <div
          onClick={() => openDetail(current.id)}
          style={{
            padding: '6px 16px',
            color: '#AF52DE',
            fontSize: 12,
            cursor: 'pointer',
            textAlign: 'center',
            flexShrink: 0,
          }}
        >
          查看完整结果 →
        </div>
      )}

      {/* 历史记录 */}
      {history.length > 0 && (
        <div style={{
          borderTop: '1px solid rgba(255,255,255,0.08)',
          flexShrink: 0,
          maxHeight: historyExpanded ? 160 : 'auto',
          overflow: 'hidden',
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
            <span>{historyExpanded ? '▼' : '▶'} 历史记录</span>
            <span>({history.length})</span>
          </div>
          {historyExpanded && (
            <div style={{ overflowY: 'auto', maxHeight: 120 }}>
              {history.map(exec => (
                <div
                  key={exec.id}
                  onClick={() => openDetail(exec.id)}
                  style={{
                    padding: '6px 16px',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    cursor: 'pointer',
                    transition: 'background 0.15s ease',
                    fontSize: 12,
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 220 }}>
                    <span style={{ color: exec.status === 'failed' ? '#FF453A' : '#ccc' }}>
                      {exec.title || exec.summary?.split('\n')[0] || exec.user_prompt}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 8, color: '#666', flexShrink: 0, fontSize: 11 }}>
                    {exec.duration_ms != null && <span>{formatDuration(exec.duration_ms)}</span>}
                    <span>{timeAgo(exec.created_at)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
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
        const cost = current?.cost_usd != null ? ` · $${current.cost_usd.toFixed(4)}` : '';
        return { label: '已完成', dotColor: 'green', meta: `${elapsed}${turns}${cost}`, bgColor: defaultBg };
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

function CompletedState({
  current,
  sdkSubState,
  openDetail,
  onOverflowChange,
}: {
  current: ExecutionRecord;
  appState: AppState;
  sdkSubState: SdkSubState;
  openDetail: (id: string) => void;
  onOverflowChange: (overflowing: boolean) => void;
}) {
  const isFailed = current.status === 'failed' || sdkSubState === 'failed';
  const title = current.title || current.summary?.split('\n')[0] || current.user_prompt;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ padding: '12px 16px 0', flexShrink: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.4, marginBottom: 4 }}>
          {title}
        </div>
        {current.summary && (
          <div style={{ fontSize: 11, color: '#666', fontStyle: 'italic' }}>
            「{current.user_prompt}」
          </div>
        )}
      </div>

      <OverflowDetector onOverflow={onOverflowChange}>
        <div
          onClick={() => openDetail(current.id)}
          style={{
            padding: '12px 16px',
            cursor: 'pointer',
            lineHeight: 1.6,
            fontSize: 13,
            transition: 'background 0.15s ease',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
        >
          {isFailed ? (
            <div style={{
              padding: '8px 12px',
              background: 'rgba(255,69,58,0.1)',
              border: '1px solid rgba(255,69,58,0.2)',
              borderRadius: 6,
              color: '#FF6B6B',
              fontSize: 12,
            }}>
              执行过程中出现错误
            </div>
          ) : current.summary ? (
            <div style={{ whiteSpace: 'pre-wrap' }}>
              {current.summary}
            </div>
          ) : (
            <div style={{ color: '#666' }}>无输出</div>
          )}
        </div>
      </OverflowDetector>

      <div style={{
        height: 24,
        background: 'linear-gradient(transparent, #1a1a1e)',
        flexShrink: 0,
        marginTop: -24,
        pointerEvents: 'none',
        position: 'relative',
      }} />
    </div>
  );
}

function EmptyState() {
  return (
    <div style={{
      flex: 1,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      gap: 12,
    }}>
      <div style={{
        width: 56, height: 56,
        borderRadius: '50%',
        background: 'rgba(255,255,255,0.05)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 24,
        color: '#666',
      }}>
        ⌘
      </div>
      <div style={{ fontSize: 14, fontWeight: 500 }}>按右 Command 开始语音输入</div>
      <div style={{ fontSize: 11, color: '#555' }}>说出你的指令，Shrew 会帮你执行</div>
    </div>
  );
}
