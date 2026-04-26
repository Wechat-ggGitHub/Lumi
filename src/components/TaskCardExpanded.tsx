'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ExecutionRecord, SdkSubState } from '@/types';
import { formatDuration } from '@/lib/format-utils';

const SUMMARY_MAX_HEIGHT = 280;

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
