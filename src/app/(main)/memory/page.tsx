'use client';

import { useState, useEffect, useCallback } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { getIpcRenderer } from '@/lib/electron-ipc';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Textarea } from '@/components/ui/Textarea';
import { ChipGroup } from '@/components/ui/ChipGroup';
import GlassCard from '@/components/ui/GlassCard';

interface CoreMemory {
  filename: string;
  content: string;
}

export default function MemoryPage() {
  const [tab, setTab] = useState('核心记忆');
  const [coreMemories, setCoreMemories] = useState<CoreMemory[]>([]);
  const [dailyDates, setDailyDates] = useState<string[]>([]);
  const [expandedDaily, setExpandedDaily] = useState<string | null>(null);
  const [dailyContent, setDailyContent] = useState<Record<string, string>>({});
  const [editingFile, setEditingFile] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const ipcRenderer = typeof window !== 'undefined' ? getIpcRenderer() : null;

  const loadCoreMemories = useCallback(() => {
    ipcRenderer?.invoke('memory:list-core').then((data: CoreMemory[]) => {
      setCoreMemories(data);
    });
  }, [ipcRenderer]);

  const loadDailyDates = useCallback(() => {
    ipcRenderer?.invoke('memory:list-daily').then((data: string[]) => {
      setDailyDates(data);
    });
  }, [ipcRenderer]);

  useEffect(() => {
    loadCoreMemories();
    loadDailyDates();
  }, [loadCoreMemories, loadDailyDates]);

  const handleExpandDaily = useCallback((date: string) => {
    if (expandedDaily === date) {
      setExpandedDaily(null);
      return;
    }
    setExpandedDaily(date);
    if (!dailyContent[date]) {
      ipcRenderer?.invoke('memory:read-daily', { date }).then((content: string | null) => {
        if (content) {
          setDailyContent(prev => ({ ...prev, [date]: content }));
        }
      });
    }
  }, [ipcRenderer, expandedDaily, dailyContent]);

  const handleStartEdit = useCallback((memory: CoreMemory) => {
    setEditingFile(memory.filename);
    setEditContent(memory.content);
  }, []);

  const handleSaveEdit = useCallback(() => {
    if (!editingFile || !editContent.trim()) return;
    ipcRenderer?.invoke('memory:update-core', { filename: editingFile, content: editContent.trim() }).then(() => {
      setEditingFile(null);
      setEditContent('');
      loadCoreMemories();
    });
  }, [ipcRenderer, editingFile, editContent, loadCoreMemories]);

  const handleDelete = useCallback((filename: string) => {
    if (!confirm('确定要删除这条记忆吗？此操作不可撤销。')) return;
    ipcRenderer?.invoke('memory:delete-core', { filename }).then(() => {
      loadCoreMemories();
    });
  }, [ipcRenderer, loadCoreMemories]);

  return (
    <div className="min-h-screen bg-bg-window flex flex-col">
      <PageHeader title="记忆管理"
        onBack={() => window.history.back()} />
      <div className="flex-1 overflow-auto px-page-x pb-6">
        {/* Tab switcher */}
        <div className="mb-section-gap">
          <ChipGroup
            options={['核心记忆', '每日记忆']}
            value={tab}
            onChange={setTab}
          />
        </div>

        {/* Core memories tab */}
        {tab === '核心记忆' && (
          <>
            {coreMemories.length === 0 && (
              <EmptyState title="暂无核心记忆" description="Claude 会在对话中自主记录重要信息到核心记忆" />
            )}
            {coreMemories.map(memory => (
              <GlassCard key={memory.filename} variant="content" className="mb-2">
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-label-xs text-text-muted mb-1">{memory.filename}</div>
                    {editingFile === memory.filename ? (
                      <div className="flex gap-2">
                        <Textarea value={editContent} onChange={e => setEditContent(e.target.value)} />
                        <div className="flex flex-col gap-1">
                          <Button variant="primary" size="sm" onClick={handleSaveEdit}>保存</Button>
                          <Button variant="ghost" size="sm" onClick={() => setEditingFile(null)}>取消</Button>
                        </div>
                      </div>
                    ) : (
                      <div className="text-body-sm leading-relaxed whitespace-pre-wrap">{memory.content}</div>
                    )}
                  </div>
                  {editingFile !== memory.filename && (
                    <div className="flex gap-1 flex-shrink-0">
                      <Button variant="ghost" size="sm" onClick={() => handleStartEdit(memory)}>编辑</Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(memory.filename)} className="!text-danger">删除</Button>
                    </div>
                  )}
                </div>
              </GlassCard>
            ))}
          </>
        )}

        {/* Daily memories tab */}
        {tab === '每日记忆' && (
          <>
            {dailyDates.length === 0 && (
              <EmptyState title="暂无每日记忆" description="每次对话完成后，有价值的交流会被自动记录到每日记忆中" />
            )}
            {dailyDates.map(date => (
              <GlassCard key={date} variant="content" className="mb-2 !p-0 overflow-hidden">
                <button
                  className="w-full text-left p-card-p flex items-center justify-between hover:bg-bg-surface-2/50 transition-colors"
                  onClick={() => handleExpandDaily(date)}>
                  <span className="text-card-title text-text-primary">{date}</span>
                  {expandedDaily === date ? <ChevronUp size={14} className="text-text-muted" /> : <ChevronDown size={14} className="text-text-muted" />}
                </button>
                {expandedDaily === date && dailyContent[date] && (
                  <div className="px-card-p pb-card-p border-t border-line-default">
                    <div className="text-body-sm leading-relaxed whitespace-pre-wrap mt-2">{dailyContent[date]}</div>
                  </div>
                )}
              </GlassCard>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
