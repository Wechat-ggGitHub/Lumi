'use client';

import { useState, useEffect, useCallback } from 'react';
import { getIpcRenderer } from '@/lib/electron-ipc';
import type { McpServerConfig } from '@/types';
import { PageHeader } from '@/components/ui/PageHeader';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { SingleLineInput } from '@/components/ui/SingleLineInput';
import { Button } from '@/components/ui/Button';
import { ListCard } from '@/components/ui/ListCard';
import { EmptyState } from '@/components/ui/EmptyState';

export default function ServicesPage() {
  const [servers, setServers] = useState<McpServerConfig[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formCommand, setFormCommand] = useState('');
  const [formArgs, setFormArgs] = useState('');
  const ipcRenderer = typeof window !== 'undefined' ? getIpcRenderer() : null;

  useEffect(() => {
    ipcRenderer?.invoke('services:list').then((data: McpServerConfig[]) => { setServers(data); });
  }, [ipcRenderer]);

  const handleAdd = useCallback(() => {
    if (!formName.trim() || !formCommand.trim()) return;
    ipcRenderer?.invoke('services:add', {
      name: formName.trim(), command: formCommand.trim(),
      args: formArgs.trim() ? formArgs.trim().split(/\s+/) : [], enabled: true,
    }).then((updated: McpServerConfig[]) => {
      setServers(updated); setFormName(''); setFormCommand(''); setFormArgs(''); setShowForm(false);
    });
  }, [ipcRenderer, formName, formCommand, formArgs]);

  const handleRemove = useCallback((id: string) => {
    ipcRenderer?.invoke('services:remove', { id }).then((updated: McpServerConfig[]) => { setServers(updated); });
  }, [ipcRenderer]);

  const handleTest = useCallback(async (id: string) => {
    setTesting(id);
    try {
      const result = await ipcRenderer?.invoke('services:test', { id }) as { success: boolean; error?: string };
      if (result?.success) { alert('连接测试成功'); }
      else { alert(`连接测试失败: ${result?.error || '未知错误'}`); }
    } catch (err) { alert(`测试出错: ${err}`); }
    finally { setTesting(null); }
  }, [ipcRenderer]);

  return (
    <div className="min-h-screen bg-bg-window flex flex-col">
      <PageHeader title="服务连接" subtitle="Aiva 能访问的外部服务"
        onBack={() => window.history.back()}
        actions={<Button variant="primary" size="sm" onClick={() => setShowForm(!showForm)}>{showForm ? '取消' : '+ 新增连接'}</Button>} />
      <div className="flex-1 overflow-auto px-page-x pb-6">
        <div className="mb-section-gap bg-bg-surface-1 border border-line-default rounded-card p-card-p">
          <p className="text-body-sm text-text-secondary">服务连接让 Aiva 通过标准协议访问外部工具和数据源，例如 GitHub、数据库、搜索引擎等。</p>
        </div>
        {showForm && (
          <div className="mb-section-gap bg-bg-surface-1 border border-line-default rounded-card p-card-p">
            <SectionHeader title="新增连接" />
            <SingleLineInput label="名称" value={formName} onChange={e => setFormName(e.target.value)} placeholder="例如：GitHub MCP" />
            <SingleLineInput label="命令" value={formCommand} onChange={e => setFormCommand(e.target.value)} placeholder="例如：npx @modelcontextprotocol/server-github" />
            <SingleLineInput label="参数（空格分隔）" value={formArgs} onChange={e => setFormArgs(e.target.value)} placeholder="可选" />
            <Button variant="primary" size="sm" onClick={handleAdd} disabled={!formName.trim() || !formCommand.trim()}>添加</Button>
          </div>
        )}
        {servers.length > 0 && (
          <div className="mb-section-gap">
            <SectionHeader title="已连接服务" description={`${servers.length} 个`} />
            <div className="flex flex-col gap-2">
              {servers.map(server => (
                <ListCard key={server.id}>
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-card-title text-text-primary">{server.name}</span>
                        <StatusBadge status="success" label="已连接" />
                      </div>
                      <div className="text-label text-text-muted font-mono mt-0.5">{server.command}</div>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0 ml-3">
                      <Button variant="secondary" size="sm" onClick={() => handleTest(server.id)} disabled={testing === server.id}>
                        {testing === server.id ? '测试中...' : '测试连接'}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleRemove(server.id)} className="!text-danger">断开</Button>
                    </div>
                  </div>
                </ListCard>
              ))}
            </div>
          </div>
        )}
        {servers.length === 0 && !showForm && (
          <EmptyState title="还没有连接任何服务" description="服务连接让 Aiva 访问外部工具和数据源。添加第一个服务连接来开始使用。"
            action={<Button variant="primary" size="sm" onClick={() => setShowForm(true)}>添加第一个连接</Button>} />
        )}
      </div>
    </div>
  );
}
