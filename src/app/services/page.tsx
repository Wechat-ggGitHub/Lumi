'use client';

import { useState, useEffect, useCallback } from 'react';
import { getIpcRenderer } from '@/lib/electron-ipc';
import type { McpServerConfig } from '@/types';

export default function ServicesPage() {
  const [servers, setServers] = useState<McpServerConfig[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formCommand, setFormCommand] = useState('');
  const [formArgs, setFormArgs] = useState('');
  const ipcRenderer = typeof window !== 'undefined' ? getIpcRenderer() : null;

  useEffect(() => {
    ipcRenderer?.invoke('services:list').then((data: McpServerConfig[]) => {
      setServers(data);
    });
  }, [ipcRenderer]);

  const handleAdd = useCallback(() => {
    if (!formName.trim() || !formCommand.trim()) return;
    ipcRenderer?.invoke('services:add', {
      name: formName.trim(),
      command: formCommand.trim(),
      args: formArgs.trim() ? formArgs.trim().split(/\s+/) : [],
      enabled: true,
    }).then((updated: McpServerConfig[]) => {
      setServers(updated);
      setFormName('');
      setFormCommand('');
      setFormArgs('');
      setShowForm(false);
    });
  }, [ipcRenderer, formName, formCommand, formArgs]);

  const handleRemove = useCallback((id: string) => {
    ipcRenderer?.invoke('services:remove', { id }).then((updated: McpServerConfig[]) => {
      setServers(updated);
    });
  }, [ipcRenderer]);

  const handleTest = useCallback(async (id: string) => {
    setTesting(id);
    try {
      const result = await ipcRenderer?.invoke('services:test', { id }) as { success: boolean; error?: string };
      if (result?.success) {
        alert('连接测试成功');
      } else {
        alert(`连接测试失败: ${result?.error || '未知错误'}`);
      }
    } catch (err) {
      alert(`测试出错: ${err}`);
    } finally {
      setTesting(null);
    }
  }, [ipcRenderer]);

  return (
    <div style={{
      fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
      fontSize: 14, color: '#e0e0e0',
      background: '#1a1a1e', minHeight: '100vh',
      padding: 24, maxWidth: 600, margin: '0 auto',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <h1 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>服务连接</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => window.history.back()} style={{
            padding: '6px 16px', borderRadius: 8,
            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
            color: '#888', fontSize: 13, cursor: 'pointer',
          }}>
            返回
          </button>
          <button onClick={() => setShowForm(!showForm)} style={{
            padding: '6px 16px', borderRadius: 8,
            background: '#AF52DE', border: 'none',
            color: '#fff', fontSize: 13, cursor: 'pointer',
          }}>
            {showForm ? '取消' : '+ 新增'}
          </button>
        </div>
      </div>

      {showForm && (
        <div style={{
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 10, padding: 16, marginBottom: 16,
        }}>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 11, color: '#888', marginBottom: 4 }}>名称</label>
            <input value={formName} onChange={e => setFormName(e.target.value)} placeholder="例如：GitHub MCP"
              style={{ width: '100%', padding: '8px 12px', borderRadius: 8, fontSize: 13,
                background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
                color: '#e0e0e0', outline: 'none', boxSizing: 'border-box' }} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 11, color: '#888', marginBottom: 4 }}>命令</label>
            <input value={formCommand} onChange={e => setFormCommand(e.target.value)} placeholder="例如：npx @modelcontextprotocol/server-github"
              style={{ width: '100%', padding: '8px 12px', borderRadius: 8, fontSize: 13,
                background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
                color: '#e0e0e0', outline: 'none', boxSizing: 'border-box' }} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 11, color: '#888', marginBottom: 4 }}>参数（空格分隔）</label>
            <input value={formArgs} onChange={e => setFormArgs(e.target.value)} placeholder="可选"
              style={{ width: '100%', padding: '8px 12px', borderRadius: 8, fontSize: 13,
                background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
                color: '#e0e0e0', outline: 'none', boxSizing: 'border-box' }} />
          </div>
          <button onClick={handleAdd} disabled={!formName.trim() || !formCommand.trim()} style={{
            padding: '6px 16px', borderRadius: 8,
            background: formName.trim() && formCommand.trim() ? '#AF52DE' : 'rgba(175,82,222,0.3)',
            border: 'none', color: '#fff', fontSize: 13, cursor: 'pointer',
          }}>
            添加
          </button>
        </div>
      )}

      {servers.length === 0 && !showForm && (
        <div style={{ color: '#666', textAlign: 'center', padding: 40 }}>
          暂无 MCP 服务连接
        </div>
      )}

      {servers.map(server => (
        <div key={server.id} style={{
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 10, padding: '14px 16px', marginBottom: 10,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 2 }}>{server.name}</div>
              <div style={{ fontSize: 12, color: '#666', fontFamily: 'monospace' }}>{server.command}</div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => handleTest(server.id)} disabled={testing === server.id} style={{
                padding: '4px 10px', borderRadius: 6, fontSize: 11,
                background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
                color: '#888', cursor: testing === server.id ? 'default' : 'pointer',
              }}>
                {testing === server.id ? '测试中...' : '测试'}
              </button>
              <button onClick={() => handleRemove(server.id)} style={{
                padding: '4px 10px', borderRadius: 6, fontSize: 11,
                background: 'rgba(255,69,58,0.1)', border: '1px solid rgba(255,69,58,0.2)',
                color: '#FF453A', cursor: 'pointer',
              }}>
                删除
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
