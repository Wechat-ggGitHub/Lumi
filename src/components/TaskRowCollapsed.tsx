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
