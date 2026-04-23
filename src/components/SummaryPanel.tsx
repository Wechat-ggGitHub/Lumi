'use client';

import { useState, useEffect } from 'react';
import { StatusDot } from './StatusDot';
import { getIpcRenderer } from '@/lib/electron-ipc';

interface Execution {
  id: string;
  user_prompt: string;
  summary: string | null;
  status: string;
  duration_ms: number | null;
  num_turns: number | null;
  created_at: string;
}

type DotColor = 'gray' | 'blue' | 'green' | 'red' | 'yellow';

export function SummaryPanel() {
  const [current, setCurrent] = useState<Execution | null>(null);
  const [history, setHistory] = useState<Execution[]>([]);
  const [dotColor, setDotColor] = useState<DotColor>('gray');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const ipcRenderer = getIpcRenderer();
    if (!ipcRenderer) return;

    const handler = (_: unknown, data: { execution: Execution | null; history: Execution[]; dotColor: DotColor }) => {
      setCurrent(data.execution);
      setHistory(data.history);
      setDotColor(data.dotColor);
    };

    ipcRenderer.on('summary:update', handler);
    ipcRenderer.send('summary:ready');

    return () => { ipcRenderer.removeListener('summary:update', handler); };
  }, []);

  const statusLabel: Record<string, string> = {
    running: '执行中',
    completed: '已完成',
    failed: '出错',
    cancelled: '已中断',
  };

  return (
    <div style={{ width: 360, fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif', fontSize: 13, color: '#333' }}>
      {/* 当前状态 */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid #eee', display: 'flex', alignItems: 'center', gap: 8 }}>
        <StatusDot color={dotColor} />
        <span style={{ fontWeight: 600 }}>{current ? statusLabel[current.status] || '待命' : '待命'}</span>
      </div>

      {/* 当前执行详情 */}
      {current && (
        <div
          onClick={() => {
            if (current.status !== 'running') {
              getIpcRenderer()?.send('summary:open-detail', { id: current.id });
            }
          }}
          style={{
            padding: '12px 16px',
            borderBottom: '1px solid #eee',
            cursor: current.status !== 'running' ? 'pointer' : 'default',
            transition: 'background 0.15s ease',
            borderRadius: 4,
          }}
          onMouseEnter={e => { if (current.status !== 'running') e.currentTarget.style.background = '#f5f5f5'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
        >
          <div style={{ color: '#666', marginBottom: 6 }}>「{current.user_prompt}」</div>
          {current.summary && (
            <div style={{ lineHeight: 1.5 }}>{current.summary}</div>
          )}
          {current.duration_ms != null && (
            <div style={{ color: '#999', marginTop: 8, fontSize: 12 }}>
              耗时 {Math.round(current.duration_ms / 1000)}s
              {current.num_turns != null && ` · 使用了 ${current.num_turns} 个工具`}
            </div>
          )}
        </div>
      )}

      {/* 历史记录 */}
      {history.length > 0 && (
        <div style={{ padding: '8px 16px' }}>
          <div style={{ color: '#999', fontSize: 12, marginBottom: 6 }}>最近</div>
          {history.slice(0, 5).map(exec => (
            <div
              key={exec.id}
              onClick={() => getIpcRenderer()?.send('summary:open-detail', { id: exec.id })}
              style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '6px 0', fontSize: 12, borderBottom: '1px solid #f5f5f5',
                cursor: 'pointer', borderRadius: 4, transition: 'background 0.15s ease',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = '#f5f5f5'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 240 }}>
                {exec.user_prompt}
              </span>
              <span style={{ color: '#999', flexShrink: 0 }}>
                {exec.status === 'completed' ? `${Math.round((exec.duration_ms || 0) / 1000)}s` :
                 exec.status === 'failed' ? '失败' : '...'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
