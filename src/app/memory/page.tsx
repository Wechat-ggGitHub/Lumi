'use client';

import { useState, useEffect, useCallback } from 'react';
import { getIpcRenderer } from '@/lib/electron-ipc';
import type { MemoryItem } from '@/types';

const TYPE_OPTIONS = ['偏好', '习惯', '项目背景', '约束', '事实', '其他'];
const TYPE_COLORS: Record<string, string> = {
  '偏好': '#AF52DE',
  '习惯': '#007AFF',
  '项目背景': '#5856D6',
  '约束': '#FF9500',
  '事实': '#34C759',
  '其他': '#888',
};

export default function MemoryPage() {
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [newType, setNewType] = useState('偏好');
  const [newContent, setNewContent] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const ipcRenderer = typeof window !== 'undefined' ? getIpcRenderer() : null;

  useEffect(() => {
    ipcRenderer?.invoke('memory:list').then((data: MemoryItem[]) => {
      setMemories(data);
    });
  }, [ipcRenderer]);

  const refresh = useCallback(() => {
    ipcRenderer?.invoke('memory:list').then((data: MemoryItem[]) => {
      setMemories(data);
    });
  }, [ipcRenderer]);

  const handleAdd = useCallback(() => {
    if (!newContent.trim()) return;
    ipcRenderer?.invoke('memory:add', {
      type: newType,
      content: newContent.trim(),
      source: '手动新增',
    }).then(() => {
      setNewContent('');
      setShowAdd(false);
      refresh();
    });
  }, [ipcRenderer, newType, newContent, refresh]);

  const handleDelete = useCallback((id: string) => {
    ipcRenderer?.invoke('memory:delete', { id }).then(refresh);
  }, [ipcRenderer, refresh]);

  const handleToggleStatus = useCallback((id: string) => {
    ipcRenderer?.invoke('memory:toggle-status', { id }).then(refresh);
  }, [ipcRenderer, refresh]);

  const handleTogglePin = useCallback((id: string) => {
    ipcRenderer?.invoke('memory:toggle-pin', { id }).then(refresh);
  }, [ipcRenderer, refresh]);

  const handleStartEdit = useCallback((memory: MemoryItem) => {
    setEditingId(memory.id);
    setEditContent(memory.content);
  }, []);

  const handleSaveEdit = useCallback(() => {
    if (!editingId || !editContent.trim()) return;
    ipcRenderer?.invoke('memory:update', {
      id: editingId,
      content: editContent.trim(),
    }).then(() => {
      setEditingId(null);
      setEditContent('');
      refresh();
    });
  }, [ipcRenderer, editingId, editContent, refresh]);

  return (
    <div style={{
      fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
      fontSize: 14, color: '#e0e0e0',
      background: '#1a1a1e', minHeight: '100vh',
      padding: 24, maxWidth: 600, margin: '0 auto',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <h1 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>记忆管理</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => window.history.back()} style={{
            padding: '6px 16px', borderRadius: 8,
            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
            color: '#888', fontSize: 13, cursor: 'pointer',
          }}>
            返回
          </button>
          <button onClick={() => setShowAdd(!showAdd)} style={{
            padding: '6px 16px', borderRadius: 8,
            background: '#AF52DE', border: 'none',
            color: '#fff', fontSize: 13, cursor: 'pointer',
          }}>
            {showAdd ? '取消' : '+ 新增'}
          </button>
        </div>
      </div>

      {showAdd && (
        <div style={{
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 10, padding: 16, marginBottom: 16,
        }}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
            {TYPE_OPTIONS.map(t => (
              <button key={t} onClick={() => setNewType(t)} style={{
                padding: '4px 12px', borderRadius: 6, fontSize: 12,
                border: newType === t ? `1px solid ${TYPE_COLORS[t]}` : '1px solid rgba(255,255,255,0.08)',
                background: newType === t ? `${TYPE_COLORS[t]}20` : 'rgba(255,255,255,0.03)',
                color: newType === t ? TYPE_COLORS[t] : '#888',
                cursor: 'pointer',
              }}>
                {t}
              </button>
            ))}
          </div>
          <textarea
            value={newContent}
            onChange={e => setNewContent(e.target.value)}
            placeholder="输入记忆内容..."
            rows={2}
            style={{
              width: '100%', padding: '8px 12px', borderRadius: 8, fontSize: 13,
              background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
              color: '#e0e0e0', outline: 'none', resize: 'vertical', boxSizing: 'border-box',
              lineHeight: 1.5,
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
            <button onClick={handleAdd} disabled={!newContent.trim()} style={{
              padding: '6px 16px', borderRadius: 8,
              background: newContent.trim() ? '#AF52DE' : 'rgba(175,82,222,0.3)',
              border: 'none', color: '#fff', fontSize: 13, cursor: 'pointer',
            }}>
              添加
            </button>
          </div>
        </div>
      )}

      {memories.length === 0 && (
        <div style={{ color: '#666', textAlign: 'center', padding: 40 }}>
          暂无记忆条目<br />
          <span style={{ fontSize: 12 }}>任务完成后会自动提炼，也可以手动新增</span>
        </div>
      )}

      {memories.map(memory => (
        <div key={memory.id} style={{
          background: memory.status === '已失效' ? 'rgba(255,255,255,0.01)' : 'rgba(255,255,255,0.03)',
          border: `1px solid ${memory.pinned ? 'rgba(175,82,222,0.3)' : 'rgba(255,255,255,0.06)'}`,
          borderRadius: 10, padding: '12px 16px', marginBottom: 8,
          opacity: memory.status === '已失效' ? 0.5 : 1,
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <span style={{
              padding: '2px 8px', borderRadius: 4, fontSize: 10,
              background: `${TYPE_COLORS[memory.type] || '#888'}20`,
              color: TYPE_COLORS[memory.type] || '#888',
              flexShrink: 0, marginTop: 2,
            }}>
              {memory.type}
            </span>
            <div style={{ flex: 1 }}>
              {editingId === memory.id ? (
                <div style={{ display: 'flex', gap: 6 }}>
                  <textarea
                    value={editContent}
                    onChange={e => setEditContent(e.target.value)}
                    rows={2}
                    style={{
                      flex: 1, padding: '6px 8px', borderRadius: 6, fontSize: 12,
                      background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                      color: '#e0e0e0', outline: 'none', resize: 'vertical',
                    }}
                  />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <button onClick={handleSaveEdit} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 4, background: '#34C759', border: 'none', color: '#fff', cursor: 'pointer' }}>保存</button>
                    <button onClick={() => setEditingId(null)} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 4, background: 'rgba(255,255,255,0.1)', border: 'none', color: '#888', cursor: 'pointer' }}>取消</button>
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: 13, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{memory.content}</div>
              )}
              <div style={{ display: 'flex', gap: 8, marginTop: 6, fontSize: 10, color: '#555' }}>
                <span>{memory.source}</span>
                {memory.pinned === 1 && <span style={{ color: '#AF52DE' }}>已置顶</span>}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
              <button onClick={() => handleTogglePin(memory.id)} title={memory.pinned ? '取消置顶' : '置顶'} style={{
                width: 24, height: 24, borderRadius: 4,
                background: memory.pinned ? 'rgba(175,82,222,0.2)' : 'rgba(255,255,255,0.03)',
                border: 'none', color: memory.pinned ? '#AF52DE' : '#555',
                cursor: 'pointer', fontSize: 12,
              }}>
                {memory.pinned ? '★' : '☆'}
              </button>
              <button onClick={() => handleStartEdit(memory)} style={{
                width: 24, height: 24, borderRadius: 4,
                background: 'rgba(255,255,255,0.03)', border: 'none',
                color: '#555', cursor: 'pointer', fontSize: 11,
              }}>
                ✎
              </button>
              <button onClick={() => handleToggleStatus(memory.id)} style={{
                width: 24, height: 24, borderRadius: 4,
                background: 'rgba(255,255,255,0.03)', border: 'none',
                color: memory.status === '生效中' ? '#34C759' : '#555',
                cursor: 'pointer', fontSize: 10,
              }}>
                {memory.status === '生效中' ? '●' : '○'}
              </button>
              <button onClick={() => handleDelete(memory.id)} style={{
                width: 24, height: 24, borderRadius: 4,
                background: 'rgba(255,255,255,0.03)', border: 'none',
                color: '#FF453A', cursor: 'pointer', fontSize: 11,
              }}>
                ✕
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
