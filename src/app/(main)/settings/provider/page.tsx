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
import { ChevronDown } from 'lucide-react';
import {
  getProvidersByCategory,
  getProvider,
  type ProviderPreset,
} from '@/lib/provider-config';

const CATEGORY_ORDER: { key: string; title: string }[] = [
  { key: 'official', title: '官方' },
  { key: 'china', title: '国内服务商' },
  { key: 'aggregator', title: '聚合平台' },
];

export default function ProviderSettingsPage() {
  const [apiKeyStatus, setApiKeyStatus] = useState<Record<string, boolean>>({});
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [initialProvider, setInitialProvider] = useState('anthropic');
  const [initialModel, setInitialModel] = useState('claude-sonnet-4-6');
  const [draftProvider, setDraftProvider] = useState('anthropic');
  const [draftModels, setDraftModels] = useState<Record<string, string>>({});
  const [keyInputs, setKeyInputs] = useState<Record<string, string>>({});

  useEffect(() => {
    getIpcRenderer()?.invoke('settings:load').then((settings: any) => {
      const p = settings.provider || 'anthropic';
      const m = settings.model || 'claude-sonnet-4-6';
      setDraftProvider(p);
      setDraftModels({ [p]: m });
      setInitialProvider(p);
      setInitialModel(m);
      setExpandedKey(p);
      if (settings.apiKeyStatus) setApiKeyStatus(settings.apiKeyStatus);
    });
  }, []);

  const activeModel =
    draftModels[draftProvider] ?? getProvider(draftProvider)?.defaultModel ?? '';

  const hasChanges =
    draftProvider !== initialProvider ||
    activeModel !== initialModel ||
    Object.values(keyInputs).some(v => v.trim().length > 0);

  const handleActivate = (key: string) => {
    setDraftProvider(key);
  };

  const handleToggleExpand = (key: string) => {
    setExpandedKey(prev => (prev === key ? null : key));
  };

  const handleOpenLink = (url: string) => {
    const ipc = getIpcRenderer();
    if (ipc) {
      try {
        ipc.send('open-external', url);
      } catch {
        window.open(url, '_blank');
      }
    }
  };

  const handleSave = async () => {
    setStatus('saving');
    try {
      const ipc = getIpcRenderer();
      await ipc?.invoke('settings:save', { provider: draftProvider, model: activeModel });

      const pendingKeys = Object.entries(keyInputs).filter(([, key]) => key.trim());
      await Promise.all(
        pendingKeys.map(([providerKey, key]) =>
          ipc?.invoke('settings:save-api-key', { key: key.trim(), providerKey })
        )
      );
      if (pendingKeys.length > 0) {
        setApiKeyStatus(prev => ({
          ...prev,
          ...Object.fromEntries(pendingKeys.map(([providerKey]) => [providerKey, true])),
        }));
      }

      setInitialProvider(draftProvider);
      setInitialModel(activeModel);
      setKeyInputs({});
      setStatus('saved');
      setTimeout(() => setStatus('idle'), 2000);
    } catch {
      setStatus('error');
      setTimeout(() => setStatus('idle'), 2000);
    }
  };

  const handleCancel = () => {
    setDraftProvider(initialProvider);
    setDraftModels({ [initialProvider]: initialModel });
    setExpandedKey(initialProvider);
    setKeyInputs({});
    setStatus('idle');
  };

  return (
    <div className="min-h-screen bg-bg-window flex flex-col">
      <PageHeader
        title="模型与凭证"
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
                    isActive={draftProvider === p.key}
                    isExpanded={expandedKey === p.key}
                    keyConfigured={apiKeyStatus[p.key] ?? false}
                    draftModel={draftModels[p.key] ?? p.defaultModel}
                    keyInput={keyInputs[p.key] ?? ''}
                    saving={status === 'saving'}
                    onActivate={() => handleActivate(p.key)}
                    onToggleExpand={() => handleToggleExpand(p.key)}
                    onOpenLink={() => p.websiteUrl && handleOpenLink(p.websiteUrl)}
                    onModelChange={(m) => setDraftModels(prev => ({ ...prev, [p.key]: m }))}
                    onKeyChange={(v) => setKeyInputs(prev => ({ ...prev, [p.key]: v }))}
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
  isActive,
  isExpanded,
  keyConfigured,
  draftModel,
  keyInput,
  saving,
  onActivate,
  onToggleExpand,
  onOpenLink,
  onModelChange,
  onKeyChange,
}: {
  provider: ProviderPreset;
  isActive: boolean;
  isExpanded: boolean;
  keyConfigured: boolean;
  draftModel: string;
  keyInput: string;
  saving: boolean;
  onActivate: () => void;
  onToggleExpand: () => void;
  onOpenLink: () => void;
  onModelChange: (m: string) => void;
  onKeyChange: (v: string) => void;
}) {
  const modelOptions = provider.models.map(m => ({ value: m.id, label: m.name }));

  return (
    <div className={`rounded-card border transition-colors duration-150 ${
      isActive ? 'border-brand' : 'border-line-default hover:border-line-strong'
    }`}>
      {/* 标题行：三个独立可点击区 */}
      <div className="p-card-p flex items-center gap-3">
        {/* Radio：切换生效 provider */}
        <button
          onClick={onActivate}
          className={`flex-shrink-0 w-[18px] h-[18px] rounded-full border-[1.5px] flex items-center justify-center transition-colors
            ${isActive ? 'border-brand' : 'border-[#b0b0b5]'}
            hover:border-brand/80 disabled:opacity-40`}
          disabled={saving}
        >
          {isActive && <div className="w-[11px] h-[11px] rounded-full bg-brand" />}
        </button>

        {/* Provider 名称 + Badge：点击展开/折叠 */}
        <button
          onClick={onToggleExpand}
          className="flex items-center gap-3 flex-1 text-left"
        >
          <span className="text-card-title text-text-primary">{provider.nameZh}</span>
          <StatusBadge
            status={keyConfigured ? 'success' : 'warning'}
            label={keyConfigured ? '已配置' : '未配置'}
          />
        </button>

        {/* ▾ chevron */}
        <button
          onClick={onToggleExpand}
          className="w-[28px] h-[28px] flex items-center justify-center rounded-lg text-text-muted hover:bg-[#f0f0f3] hover:text-text-primary transition-colors"
        >
          <ChevronDown size={14} className={`transition-transform duration-150 ${isExpanded ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {/* 展开面板 */}
      {isExpanded && (
        <div className="px-card-p pb-card-p pt-0 border-t border-line-default/50">
          <div className="mt-3">
            <Select
              label="模型"
              options={modelOptions}
              value={draftModel}
              onChange={onModelChange}
            />
          </div>
          <div className="mt-2">
            <SingleLineInput
              label="API Key"
              labelAction={
                provider.websiteUrl ? (
                  <button
                    type="button"
                    onClick={onOpenLink}
                    className="text-label-xs text-brand hover:text-brand/80 transition-colors"
                  >
                    如何获取
                  </button>
                ) : undefined
              }
              type="password"
              value={keyInput}
              onChange={(e) => onKeyChange(e.target.value)}
              placeholder={keyConfigured ? '●●●●●●●●●●●●●●●●●●●●' : provider.keyPlaceholder}
              placeholderClassName={keyConfigured ? 'text-text-primary tracking-wider' : undefined}
            />
          </div>
        </div>
      )}
    </div>
  );
}
