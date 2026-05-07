'use client';

import { useState, useEffect } from 'react';
import { getIpcRenderer } from '@/lib/electron-ipc';
import { PageHeader } from '@/components/ui/PageHeader';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { SingleLineInput } from '@/components/ui/SingleLineInput';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { BottomActionBar } from '@/components/ui/BottomActionBar';
import { StatusBadge } from '@/components/ui/StatusBadge';

type ProviderKey = 'glm-cn' | 'glm-global' | 'anthropic';
type ModelPreset = 'opus' | 'sonnet' | 'haiku';

const PROVIDER_OPTIONS = [
  { value: 'glm-cn', label: 'GLM (国内)' },
  { value: 'glm-global', label: 'GLM (国际)' },
  { value: 'anthropic', label: 'Anthropic' },
];

const MODEL_OPTIONS_MAP: Record<ProviderKey, { value: string; label: string }[]> = {
  'glm-cn': [
    { value: 'opus', label: 'GLM-5.1 — 高性能' },
    { value: 'sonnet', label: 'GLM-5-Turbo — 均衡' },
    { value: 'haiku', label: 'GLM-4.5-Air — 快速' },
  ],
  'glm-global': [
    { value: 'opus', label: 'GLM-5.1 — 高性能' },
    { value: 'sonnet', label: 'GLM-5-Turbo — 均衡' },
    { value: 'haiku', label: 'GLM-4.5-Air — 快速' },
  ],
  anthropic: [
    { value: 'opus', label: 'Claude Opus 4.6 — 高性能' },
    { value: 'sonnet', label: 'Claude Sonnet 4.6 — 均衡' },
    { value: 'haiku', label: 'Claude Haiku 4.5 — 快速' },
  ],
};

export default function ProviderSettingsPage() {
  const [provider, setProvider] = useState<ProviderKey>('glm-cn');
  const [modelPreset, setModelPreset] = useState<ModelPreset>('opus');
  const [apiKey, setApiKey] = useState('');
  const [hasKey, setHasKey] = useState(false);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  useEffect(() => {
    getIpcRenderer()?.invoke('settings:load').then((settings: any) => {
      setProvider(settings.provider || 'glm-cn');
      setModelPreset(settings.modelPreset || 'opus');
      setHasKey(settings.hasApiKey || false);
    });
  }, []);

  const handleSave = async () => {
    setStatus('saving');
    try {
      await getIpcRenderer()?.invoke('settings:save', { provider, modelPreset });
      if (apiKey.trim()) {
        await getIpcRenderer()?.invoke('settings:save-api-key', { key: apiKey.trim() });
        setHasKey(true);
        setApiKey('');
      }
      setStatus('saved');
      setTimeout(() => setStatus('idle'), 2000);
    } catch {
      setStatus('error');
      setTimeout(() => setStatus('idle'), 2000);
    }
  };

  return (
    <div className="min-h-screen bg-bg-window flex flex-col">
      <PageHeader
        title="模型与凭证"
        subtitle="配置 API 服务商和密钥"
        onBack={() => getIpcRenderer()?.send('navigate:route', { path: '/settings' })}
      />
      <div className="flex-1 overflow-auto px-page-x pb-6">
        <div className="mb-section-gap">
          <SectionHeader title="服务商" />
          <Select options={PROVIDER_OPTIONS} value={provider} onChange={v => setProvider(v as ProviderKey)} />
        </div>
        <div className="mb-section-gap">
          <SectionHeader title="模型" />
          <Select options={MODEL_OPTIONS_MAP[provider]} value={modelPreset} onChange={v => setModelPreset(v as ModelPreset)} />
        </div>
        <div className="mb-section-gap">
          <SectionHeader title="API Key" description="Key 将安全存储在 macOS 钥匙串中" />
          <div className="flex items-center gap-2 mb-2">
            <span className="text-body-sm text-text-muted">当前状态:</span>
            <StatusBadge status={hasKey ? 'success' : 'warning'} label={hasKey ? '已保存' : '未配置'} />
          </div>
          <SingleLineInput type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder={hasKey ? '输入新 Key 替换' : '输入 API Key'} />
          {status === 'saved' && <p className="text-body-sm text-success mt-1">已保存</p>}
          {status === 'error' && <p className="text-body-sm text-danger mt-1">API Key 验证失败，请检查是否正确</p>}
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
