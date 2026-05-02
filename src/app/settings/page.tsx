'use client';

import { useEffect, useState } from 'react';
import { getIpcRenderer } from '@/lib/electron-ipc';
import { PageHeader } from '@/components/ui/PageHeader';
import { SummaryCard } from '@/components/ui/SummaryCard';
import { Button } from '@/components/ui/Button';

type ProviderKey = 'glm-cn' | 'glm-global' | 'anthropic';

interface SettingsSummary {
  provider: ProviderKey;
  modelPreset: string;
  hasApiKey: boolean;
  hasVolcCreds: boolean;
  defaultCwd: string;
  vadTimeout: number;
}

export default function SettingsPage() {
  const [summary, setSummary] = useState<SettingsSummary>({
    provider: 'glm-cn',
    modelPreset: 'opus',
    hasApiKey: false,
    hasVolcCreds: false,
    defaultCwd: '~/Documents',
    vadTimeout: 2,
  });

  useEffect(() => {
    const ipcRenderer = getIpcRenderer();
    ipcRenderer?.invoke('settings:load').then((settings: any) => {
      setSummary(prev => ({
        ...prev,
        provider: settings.provider || 'glm-cn',
        modelPreset: settings.modelPreset || 'opus',
        hasApiKey: settings.hasApiKey || false,
        defaultCwd: settings.defaultCwd || '~/Documents',
        vadTimeout: settings.vadTimeout || 2,
      }));
    });
    ipcRenderer?.invoke('settings:load-volcengine-credentials').then((creds: any) => {
      if (creds) {
        setSummary(prev => ({ ...prev, hasVolcCreds: creds.hasCredentials || false }));
      }
    });
  }, []);

  const navigate = (path: string) => {
    getIpcRenderer()?.send('navigate:route', { path });
  };

  const providerNames: Record<ProviderKey, string> = {
    'glm-cn': 'GLM (国内)',
    'glm-global': 'GLM (国际)',
    anthropic: 'Anthropic',
  };

  const modelLabels: Record<ProviderKey, Record<string, string>> = {
    'glm-cn': { opus: 'GLM-5.1', sonnet: 'GLM-5-Turbo', haiku: 'GLM-4.5-Air' },
    'glm-global': { opus: 'GLM-5.1', sonnet: 'GLM-5-Turbo', haiku: 'GLM-4.5-Air' },
    anthropic: { opus: 'Claude Opus 4.6', sonnet: 'Claude Sonnet 4.6', haiku: 'Claude Haiku 4.5' },
  };

  const modelLabel = modelLabels[summary.provider]?.[summary.modelPreset] ?? summary.modelPreset;

  const settingsGroups = [
    {
      title: '模型与凭证',
      summary: summary.hasApiKey
        ? `${providerNames[summary.provider]} / ${modelLabel}`
        : '尚未配置 API Key',
      status: summary.hasApiKey ? 'configured' as const : 'unconfigured' as const,
      path: '/settings/provider',
    },
    {
      title: '语音',
      summary: summary.hasVolcCreds ? '豆包语音识别已配置' : '语音识别服务未配置',
      status: summary.hasVolcCreds ? 'configured' as const : 'unconfigured' as const,
      path: '/settings/voice',
    },
    {
      title: '运行环境',
      summary: summary.defaultCwd,
      status: 'configured' as const,
      path: '/settings/runtime',
    },
    {
      title: '外观',
      summary: '选择浅色或深色模式',
      status: 'default' as const,
      path: '/settings/appearance',
    },
  ];

  return (
    <div className="min-h-screen bg-bg-window flex flex-col">
      <PageHeader
        title="设置"
        subtitle="系统配置与偏好"
        onBack={() => navigate('/chat')}
      />

      <div className="flex-1 overflow-auto px-page-x pb-6">
        <div className="flex gap-2 mb-section-gap">
          {[
            { path: '/persona', label: '分身设定' },
            { path: '/memory', label: '记忆管理' },
            { path: '/skills', label: '技能管理' },
            { path: '/services', label: '服务连接' },
          ].map(item => (
            <Button key={item.path} variant="secondary" size="sm" onClick={() => navigate(item.path)}>
              {item.label}
            </Button>
          ))}
        </div>

        <div className="flex flex-col gap-3">
          {settingsGroups.map(group => (
            <SummaryCard
              key={group.path}
              title={group.title}
              summary={group.summary}
              status={group.status}
              onClick={() => navigate(group.path)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
