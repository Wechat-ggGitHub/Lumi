'use client';

import { useState, useEffect } from 'react';
import { getIpcRenderer } from '@/lib/electron-ipc';
import { PageHeader } from '@/components/ui/PageHeader';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { SingleLineInput } from '@/components/ui/SingleLineInput';
import { Button } from '@/components/ui/Button';
import { BottomActionBar } from '@/components/ui/BottomActionBar';

export default function RuntimeSettingsPage() {
  const [defaultCwd, setDefaultCwd] = useState('~/Documents');
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  useEffect(() => {
    getIpcRenderer()?.invoke('settings:load').then((settings: any) => {
      setDefaultCwd(settings.defaultCwd || '~/Documents');
    });
  }, []);

  const handleBrowse = async () => {
    const path = await getIpcRenderer()?.invoke('settings:pick-directory');
    if (path) setDefaultCwd(path);
  };

  const handleSave = async () => {
    setStatus('saving');
    try {
      await getIpcRenderer()?.invoke('settings:save', { defaultCwd });
      setStatus('saved');
      setTimeout(() => setStatus('idle'), 2000);
    } catch {
      setStatus('error');
      setTimeout(() => setStatus('idle'), 2000);
    }
  };

  return (
    <div className="min-h-screen bg-bg-window flex flex-col">
      <PageHeader title="运行环境" subtitle="Claude Code 将在工作目录下执行命令"
        onBack={() => getIpcRenderer()?.send('navigate:route', { path: '/settings' })} />
      <div className="flex-1 overflow-auto px-page-x pb-6">
        <SectionHeader title="默认工作目录" />
        <div className="flex gap-2">
          <div className="flex-1">
            <SingleLineInput value={defaultCwd} onChange={e => setDefaultCwd(e.target.value)} />
          </div>
          <Button variant="secondary" onClick={handleBrowse}>浏览</Button>
        </div>
      </div>
      <BottomActionBar>
        <Button variant="primary" onClick={handleSave} disabled={status === 'saving'}>
          {status === 'saving' ? '保存中...' : '保存更改'}
        </Button>
      </BottomActionBar>
    </div>
  );
}
