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
import {
  getProvidersByCategory,
  getProvider,
  type ProviderPreset,
  type ModelInfo,
} from '@/lib/provider-config';

const CATEGORY_ORDER: { key: string; title: string }[] = [
  { key: 'official', title: '官方' },
  { key: 'china', title: '国内服务商' },
  { key: 'aggregator', title: '聚合平台' },
];

export default function ProviderSettingsPage() {
  const [provider, setProvider] = useState('anthropic');
  const [model, setModel] = useState('claude-sonnet-4-6');
  const [apiKeyStatus, setApiKeyStatus] = useState<Record<string, boolean>>({});
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [keyInput, setKeyInput] = useState('');
  const [draftModel, setDraftModel] = useState('claude-sonnet-4-6');
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  const [initialProvider, setInitialProvider] = useState('anthropic');
  const [initialModel, setInitialModel] = useState('claude-sonnet-4-6');

  useEffect(() => {
    getIpcRenderer()?.invoke('settings:load').then((settings: any) => {
      const p = settings.provider || 'anthropic';
      const m = settings.model || 'claude-sonnet-4-6';
      setProvider(p);
      setModel(m);
      setDraftModel(m);
      setInitialProvider(p);
      setInitialModel(m);
      setExpandedKey(p);
      if (settings.apiKeyStatus) setApiKeyStatus(settings.apiKeyStatus);
    });
  }, []);

  const hasChanges =
    provider !== initialProvider ||
    draftModel !== initialModel ||
    keyInput.trim().length > 0;

  const currentProviderConfig = getProvider(provider);
  const modelOptions = currentProviderConfig?.models.map(m => ({ value: m.id, label: m.name })) || [];

  const handleSelectProvider = (key: string) => {
    if (key === expandedKey) return;
    setKeyInput('');
    setExpandedKey(key);
    setProvider(key);
  };

  const handleSave = async () => {
    setStatus('saving');
    try {
      const ipc = getIpcRenderer();
      await ipc?.invoke('settings:save', { provider, model: draftModel });
      if (keyInput.trim() && expandedKey) {
        await ipc?.invoke('settings:save-api-key', { key: keyInput.trim(), providerKey: expandedKey });
        setApiKeyStatus(prev => ({ ...prev, [expandedKey]: true }));
        setKeyInput('');
      }
      setModel(draftModel);
      setInitialProvider(provider);
      setInitialModel(draftModel);
      setStatus('saved');
      setTimeout(() => setStatus('idle'), 2000);
    } catch {
      setStatus('error');
      setTimeout(() => setStatus('idle'), 2000);
    }
  };

  const handleCancel = () => {
    setProvider(initialProvider);
    setDraftModel(initialModel);
    setExpandedKey(initialProvider);
    setKeyInput('');
    setStatus('idle');
  };

  const openExternal = (url: string) => {
    const ipc = getIpcRenderer();
    if (ipc) {
      try {
        ipc.send('open-external', url);
      } catch {
        window.open(url, '_blank');
      }
    }
  };

  return (
    <div className="min-h-screen bg-bg-window flex flex-col">
      <PageHeader
        title="模型与凭证"
        subtitle="配置 API 服务商和密钥"
        onBack={() => getIpcRenderer()?.send('navigate:route', { path: '/settings' })}
      />
      <div className="flex-1 overflow-auto px-page-x pb-24">
        {status === 'saved' && (
          <div className="mb-block-gap p-3 rounded-card bg-success/10 text-success text-body-sm">
            已保存
          </div>
        )}
        {status === 'error' && (
          <div className="mb-block-gap p-3 rounded-card bg-danger/10 text-danger text-body-sm">
            保存失败，请检查输入
          </div>
        )}
        {CATEGORY_ORDER.map(cat => {
          const providers = getProvidersByCategory(cat.key as any);
          if (providers.length === 0) return null;
          return (
            <div key={cat.key} className="mb-section-gap">
              <SectionHeader title={cat.title} />
              <div className="flex flex-col gap-2">
                {providers.map(p => (
                  <ProviderCard
                    key={p.key}
                    provider={p}
                    isSelected={provider === p.key}
                    isExpanded={expandedKey === p.key}
                    keyConfigured={apiKeyStatus[p.key] ?? false}
                    draftModel={expandedKey === p.key ? draftModel : (provider === p.key ? model : p.defaultModel)}
                    keyInput={expandedKey === p.key ? keyInput : ''}
                    onSelect={() => handleSelectProvider(p.key)}
                    onModelChange={m => setDraftModel(m)}
                    onKeyChange={v => setKeyInput(v)}
                    onOpenLink={openExternal}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
      {hasChanges && (
        <BottomActionBar>
          <Button variant="secondary" onClick={handleCancel}>
            取消
          </Button>
          <Button variant="primary" onClick={handleSave} disabled={status === 'saving'}>
            {status === 'saving' ? '保存中...' : '保存更改'}
          </Button>
        </BottomActionBar>
      )}
    </div>
  );
}

function ProviderCard({
  provider,
  isSelected,
  isExpanded,
  keyConfigured,
  draftModel,
  keyInput,
  onSelect,
  onModelChange,
  onKeyChange,
  onOpenLink,
}: {
  provider: ProviderPreset;
  isSelected: boolean;
  isExpanded: boolean;
  keyConfigured: boolean;
  draftModel: string;
  keyInput: string;
  onSelect: () => void;
  onModelChange: (m: string) => void;
  onKeyChange: (v: string) => void;
  onOpenLink: (url: string) => void;
}) {
  const modelOptions = provider.models.map(m => ({ value: m.id, label: m.name }));
  const selectedModel = provider.models.find(m => m.id === draftModel);

  return (
    <div
      className={`rounded-card border transition-colors duration-150 ${
        isSelected ? 'border-brand' : 'border-line-default hover:border-line-strong'
      }`}
    >
      <button
        className="w-full p-card-p flex items-center justify-between text-left cursor-pointer"
        onClick={onSelect}
      >
        <div className="flex items-center gap-3">
          <span className="text-card-title text-text-primary">{provider.nameZh}</span>
          <StatusBadge
            status={keyConfigured ? 'success' : 'warning'}
            label={keyConfigured ? '已配置' : '未配置'}
          />
        </div>
        <span className={`text-text-muted transition-transform duration-150 ${isExpanded ? 'rotate-180' : ''}`}>
          ▾
        </span>
      </button>
      {isExpanded && (
        <div className="px-card-p pb-card-p pt-0 border-t border-line-default/50">
          <div className="mt-3">
            <Select
              label="模型"
              options={modelOptions}
              value={draftModel}
              onChange={onModelChange}
            />
            {selectedModel?.description && (
              <p className="text-body-sm text-text-muted mt-1">{selectedModel.description}</p>
            )}
          </div>
          <div className="mt-2">
            <SingleLineInput
              label="API Key"
              type="password"
              value={keyInput}
              onChange={e => onKeyChange(e.target.value)}
              placeholder={provider.keyPlaceholder}
              helperText="Key 将加密存储在本地"
            />
          </div>
          {provider.websiteUrl && (
            <button
              className="text-body-sm text-brand hover:underline mt-1 cursor-pointer"
              onClick={() => onOpenLink(provider.websiteUrl!)}
            >
              获取 API Key →
            </button>
          )}
        </div>
      )}
    </div>
  );
}
