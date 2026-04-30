'use client';

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

function dotCss(color: DotColor): string {
  return color === 'blue' ? '#32ADFF' :
         color === 'green' ? '#34C759' :
         color === 'red' ? '#FF453A' :
         color === 'purple' ? '#AF52DE' : '#666';
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
      <div style={{
        padding: '10px 14px',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        flexShrink: 0,
      }}>
        <StatusBar appState={appState} sdkSubState={sdkSubState} currentToolName={currentToolName} />
      </div>

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

function StatusBar({ appState, sdkSubState, currentToolName }: {
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
        background: dotCss(color),
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

function HistoryItem({ record, selected, onSelect }: {
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
          background: dotCss(dotColor),
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
