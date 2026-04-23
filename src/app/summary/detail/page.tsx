'use client';

import { useState, useEffect } from 'react';
import { getIpcRenderer } from '@/lib/electron-ipc';
import type { ExecutionRecord } from '@/types';

export default function SummaryDetailPage() {
  const [record, setRecord] = useState<ExecutionRecord | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const ipcRenderer = getIpcRenderer();
    if (!ipcRenderer) return;

    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');
    if (!id) {
      setError('缺少记录 ID');
      return;
    }

    const handler = (_: unknown, data: { record: ExecutionRecord | null }) => {
      if (data.record) {
        setRecord(data.record);
      } else {
        setError('未找到记录');
      }
    };

    ipcRenderer.on('summary:detail-data', handler);
    ipcRenderer.send('summary:fetch-detail', { id });

    return () => { ipcRenderer.removeListener('summary:detail-data', handler); };
  }, []);

  const statusLabel: Record<string, string> = {
    running: '执行中',
    completed: '已完成',
    failed: '出错',
    cancelled: '已中断',
  };

  const statusColor: Record<string, string> = {
    running: '#007AFF',
    completed: '#34C759',
    failed: '#FF453A',
    cancelled: '#FF9500',
  };

  if (error) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#999', fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif' }}>
        {error}
      </div>
    );
  }

  if (!record) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#999', fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif' }}>
        加载中...
      </div>
    );
  }

  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif', fontSize: 14, color: '#333', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid #eee', display: 'flex', alignItems: 'center' }}>
        <button
          onClick={() => window.close()}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: '#007AFF', padding: 0, fontFamily: 'inherit' }}
        >
          ← 关闭
        </button>
      </div>

      <div style={{ padding: '16px 16px 12px', borderBottom: '1px solid #f5f5f5' }}>
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8, lineHeight: 1.4 }}>
          {record.user_prompt}
        </div>
        <div style={{ display: 'flex', gap: 12, fontSize: 12, color: '#999' }}>
          <span style={{ color: statusColor[record.status] || '#999' }}>
            {statusLabel[record.status] || record.status}
          </span>
          <span>{new Date(record.created_at).toLocaleString('zh-CN')}</span>
          {record.duration_ms != null && <span>耗时 {Math.round(record.duration_ms / 1000)}s</span>}
          {record.cost_usd != null && <span>${record.cost_usd.toFixed(4)}</span>}
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: '#999', marginBottom: 6, fontWeight: 600 }}>输入</div>
          <div style={{ background: '#f5f5f5', borderRadius: 8, padding: 12, whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
            {record.user_prompt}
          </div>
        </div>

        {record.summary && (
          <div>
            <div style={{ fontSize: 12, color: '#999', marginBottom: 6, fontWeight: 600 }}>输出</div>
            <div style={{ background: '#f5f5f5', borderRadius: 8, padding: 12, whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
              {record.summary}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
