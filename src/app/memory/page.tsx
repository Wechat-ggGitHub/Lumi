'use client';

import { useState, useEffect, useCallback } from 'react';
import { getIpcRenderer } from '@/lib/electron-ipc';
import type { MemoryItem } from '@/types';
import { PageHeader } from '@/components/ui/PageHeader';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Textarea } from '@/components/ui/Textarea';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ChipGroup } from '@/components/ui/ChipGroup';

const TYPE_OPTIONS = ['偏好', '习惯', '项目背景', '约束', '事实', '其他'];
const TYPE_COLORS: Record<string, string> = {
  '偏好': 'bg-brand-soft text-brand',
  '习惯': 'bg-info/15 text-info',
  '项目背景': 'bg-info/15 text-info',
  '约束': 'bg-warning/15 text-warning',
  '事实': 'bg-success/15 text-success',
  '其他': 'bg-bg-surface-3 text-text-muted',
};

export default function MemoryPage() {
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [newType, setNewType] = useState('偏好');
  const [newContent, setNewContent] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [filter, setFilter] = useState('全部');
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
    ipcRenderer?.invoke('memory:add', { type: newType, content: newContent.trim(), source: '手动新增' }).then(() => {
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
    ipcRenderer?.invoke('memory:update', { id: editingId, content: editContent.trim() }).then(() => {
      setEditingId(null);
      setEditContent('');
      refresh();
    });
  }, [ipcRenderer, editingId, editContent, refresh]);

  const activeMemories = memories.filter(m => m.status !== '已失效');
  const overviewBullets = activeMemories.slice(0, 4).map(m => m.content.slice(0, 40) + (m.content.length > 40 ? '...' : ''));
  const filteredMemories = filter === '全部' ? memories : memories.filter(m => m.type === filter);

  return (
    <div className="min-h-screen bg-bg-window flex flex-col">
      <PageHeader title="记忆管理" subtitle="Shrew 记住了什么"
        onBack={() => window.history.back()}
        actions={<Button variant="primary" size="sm" onClick={() => setShowAdd(!showAdd)}>{showAdd ? '取消' : '+ 新增记忆'}</Button>} />
      <div className="flex-1 overflow-auto px-page-x pb-6">
        {memories.length > 0 && (
          <div className="mb-section-gap bg-bg-surface-1 border border-line-default rounded-card p-card-p">
            <h3 className="text-card-title text-text-primary mb-2">Shrew 当前记住了 {activeMemories.length} 条信息</h3>
            {overviewBullets.length > 0 && (
              <ul className="text-body-sm text-text-muted space-y-1">
                {overviewBullets.map((bullet, i) => <li key={i}>• {bullet}</li>)}
              </ul>
            )}
          </div>
        )}
        {showAdd && (
          <div className="mb-section-gap bg-bg-surface-1 border border-line-default rounded-card-sm p-card-p">
            <div className="mb-block-gap">
              <label className="block text-label text-text-muted mb-1">类型</label>
              <ChipGroup options={TYPE_OPTIONS} value={newType} onChange={setNewType} />
            </div>
            <Textarea value={newContent} onChange={e => setNewContent(e.target.value)} placeholder="输入记忆内容..." />
            <div className="flex justify-end mt-2">
              <Button variant="primary" size="sm" onClick={handleAdd} disabled={!newContent.trim()}>添加</Button>
            </div>
          </div>
        )}
        {memories.length > 0 && (
          <div className="flex items-center gap-2 mb-block-gap">
            <ChipGroup options={['全部', ...TYPE_OPTIONS]} value={filter} onChange={setFilter} />
          </div>
        )}
        {memories.length === 0 && (
          <EmptyState title="暂无记忆" description="任务完成后会自动提炼，也可以手动新增记忆条目"
            action={<Button variant="primary" size="sm" onClick={() => setShowAdd(true)}>新增记忆</Button>} />
        )}
        {filteredMemories.map(memory => (
          <div key={memory.id} className={`bg-bg-surface-1 border rounded-card-sm p-card-p mb-2 ${memory.pinned ? 'border-brand/30' : 'border-line-default'} ${memory.status === '已失效' ? 'opacity-50' : ''}`}>
            <div className="flex items-start gap-2">
              <span className={`px-2 py-0.5 rounded text-label-xs flex-shrink-0 mt-0.5 ${TYPE_COLORS[memory.type] || TYPE_COLORS['其他']}`}>{memory.type}</span>
              <div className="flex-1 min-w-0">
                {editingId === memory.id ? (
                  <div className="flex gap-2">
                    <textarea value={editContent} onChange={e => setEditContent(e.target.value)} rows={2}
                      className="flex-1 bg-bg-surface-2 border border-line-default rounded-input px-2 py-1 text-body-sm text-text-primary outline-none resize-none focus:border-brand" />
                    <div className="flex flex-col gap-1">
                      <Button variant="primary" size="sm" onClick={handleSaveEdit}>保存</Button>
                      <Button variant="ghost" size="sm" onClick={() => setEditingId(null)}>取消</Button>
                    </div>
                  </div>
                ) : (
                  <div className="text-body-sm leading-relaxed whitespace-pre-wrap">{memory.content}</div>
                )}
                <div className="flex items-center gap-2 mt-1.5 text-label-xs text-text-muted">
                  <span>{memory.source}</span>
                  <span>{new Date(memory.created_at).toLocaleDateString()}</span>
                  {memory.pinned === 1 && <span className="text-brand">已置顶</span>}
                  <StatusBadge status={memory.status === '生效中' ? 'success' : 'default'} label={memory.status} />
                </div>
              </div>
              <div className="flex gap-1 flex-shrink-0">
                <Button variant="ghost" size="sm" onClick={() => handleTogglePin(memory.id)}>{memory.pinned ? '★' : '☆'}</Button>
                <Button variant="ghost" size="sm" onClick={() => handleStartEdit(memory)}>编辑</Button>
                <Button variant="ghost" size="sm" onClick={() => handleToggleStatus(memory.id)}>{memory.status === '生效中' ? '失效' : '启用'}</Button>
                <Button variant="ghost" size="sm" onClick={() => handleDelete(memory.id)} className="!text-danger">删除</Button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
