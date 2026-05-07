'use client';

import { useState, useEffect } from 'react';
import { getIpcRenderer } from '@/lib/electron-ipc';
import { PageHeader } from '@/components/ui/PageHeader';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { SingleLineInput } from '@/components/ui/SingleLineInput';
import { Button } from '@/components/ui/Button';
import { BottomActionBar } from '@/components/ui/BottomActionBar';
import { StatusBadge } from '@/components/ui/StatusBadge';

export default function VoiceSettingsPage() {
  const [appId, setAppId] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [hasCredentials, setHasCredentials] = useState(false);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [error, setError] = useState('');

  useEffect(() => {
    const ipcRenderer = getIpcRenderer();
    ipcRenderer?.invoke('settings:load-volcengine-credentials').then((creds: any) => {
      if (creds) {
        setAppId(creds.appId || '');
        setHasCredentials(creds.hasCredentials || false);
      }
    });
  }, []);

  const handleSave = async () => {
    const hasPartialCreds = !!(appId.trim() || accessToken.trim());
    const hasBothCreds = !!(appId.trim() && accessToken.trim());

    if (hasPartialCreds && !hasBothCreds) {
      setError('App ID 和 Access Token 需同时填写');
      setStatus('error');
      setTimeout(() => { setStatus('idle'); setError(''); }, 3000);
      return;
    }

    let credsFailed = false;
    if (hasBothCreds) {
      setStatus('saving');
      setError('');
      try {
        await getIpcRenderer()?.invoke('settings:save-volcengine-credentials', {
          appId: appId.trim(),
          accessToken: accessToken.trim(),
        });
        setHasCredentials(true);
        setAccessToken('');
      } catch (e: any) {
        setError(e?.message || '未知错误');
        setStatus('error');
        credsFailed = true;
      }
    }
    if (!credsFailed) {
      setStatus('saved');
    }
    setTimeout(() => { setStatus('idle'); setError(''); }, 2000);
  };

  return (
    <div className="min-h-screen bg-bg-window flex flex-col">
      <PageHeader title="语音" subtitle="语音识别服务配置"
        onBack={() => getIpcRenderer()?.send('navigate:route', { path: '/settings' })} />
      <div className="flex-1 overflow-auto px-page-x pb-6">
        <div className="mb-section-gap">
          <SectionHeader title="识别服务" description="豆包语音大模型（火山引擎在线识别）" />
          <div className="flex items-center gap-2 mb-3">
            <span className="text-body-sm text-text-muted">连接状态:</span>
            <StatusBadge status={hasCredentials ? 'success' : 'warning'} label={hasCredentials ? '已配置' : '未配置'} />
          </div>
          <SingleLineInput label="App ID" value={appId} onChange={e => setAppId(e.target.value)} placeholder={hasCredentials ? '已存储（输入新 ID 替换）' : '输入 App ID'} />
          <SingleLineInput label="Access Token" type="password" value={accessToken} onChange={e => setAccessToken(e.target.value)} placeholder={hasCredentials ? '输入新 Token 替换' : '输入 Access Token'} />
          {status === 'error' && <p className="text-body-sm text-danger mt-1">凭证验证失败：{error}</p>}
          {status === 'saved' && <p className="text-body-sm text-success mt-1">已保存</p>}
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
