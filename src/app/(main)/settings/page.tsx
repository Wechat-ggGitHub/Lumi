'use client';

import { useEffect, useState } from 'react';
import { Cpu, Mic, Sun, Terminal, AudioWaveform, ChevronRight } from 'lucide-react';
import { getIpcRenderer } from '@/lib/electron-ipc';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { getProvider } from '@/lib/provider-config';
import { VOICE_PROVIDERS } from '@/lib/voice-provider-config';

interface SettingsSummary {
  provider: string;
  model: string;
  hasApiKey: boolean;
  hasVolcCreds: boolean;
  hasAliyunCreds: boolean;
  asrProvider: string;
  ttsProvider: string;
  defaultCwd: string;
  vadTimeout: number;
}

export default function SettingsPage() {
  const [summary, setSummary] = useState<SettingsSummary>({
    provider: 'anthropic',
    model: 'claude-sonnet-4-6',
    hasApiKey: false,
    hasVolcCreds: false,
    hasAliyunCreds: false,
    asrProvider: 'volcengine',
    ttsProvider: 'volcengine',
    defaultCwd: '~/Documents',
    vadTimeout: 2,
  });

  useEffect(() => {
    const ipcRenderer = getIpcRenderer();
    ipcRenderer?.invoke('settings:load').then((settings: any) => {
      setSummary(prev => ({
        ...prev,
        provider: settings.provider || 'anthropic',
        model: settings.model || 'claude-sonnet-4-6',
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
    ipcRenderer?.invoke('settings:load-aliyun-credentials').then((creds: any) => {
      if (creds) {
        setSummary(prev => ({ ...prev, hasAliyunCreds: creds.hasCredentials || false }));
      }
    });
    ipcRenderer?.invoke('settings:load-voice-provider', { type: 'asr' }).then((p: string) => {
      setSummary(prev => ({ ...prev, asrProvider: p || 'volcengine' }));
    });
    ipcRenderer?.invoke('settings:load-voice-provider', { type: 'tts' }).then((p: string) => {
      setSummary(prev => ({ ...prev, ttsProvider: p || 'volcengine' }));
    });
  }, []);

  const navigate = (path: string) => {
    getIpcRenderer()?.send('navigate:route', { path });
  };

  const currentProvider = getProvider(summary.provider || 'anthropic');
  const providerName = currentProvider.nameZh;
  const currentModel = currentProvider.models.find(m => m.id === summary.model);
  const modelLabel = currentModel?.name || summary.model;

  const voiceConfigured = (() => {
    const asrOk = summary.asrProvider === 'volcengine' ? summary.hasVolcCreds : summary.hasAliyunCreds;
    const ttsOk = summary.ttsProvider === 'volcengine' ? summary.hasVolcCreds : summary.hasAliyunCreds;
    return asrOk && ttsOk;
  })();

  const voiceDescription = (() => {
    const asrOk = summary.asrProvider === 'volcengine' ? summary.hasVolcCreds : summary.hasAliyunCreds;
    const ttsOk = summary.ttsProvider === 'volcengine' ? summary.hasVolcCreds : summary.hasAliyunCreds;
    if (asrOk && ttsOk) {
      return `ASR: ${VOICE_PROVIDERS[summary.asrProvider]?.name || '火山引擎'} · TTS: ${VOICE_PROVIDERS[summary.ttsProvider]?.name || '火山引擎'}`;
    }
    const missing: string[] = [];
    if (!asrOk) missing.push('ASR');
    if (!ttsOk) missing.push('TTS');
    return `${missing.join('/')} 服务未配置`;
  })();

  return (
    <div className="min-h-screen bg-bg-window flex flex-col">
      <PageHeader
        title="设置"
        onBack={() => navigate('/chat')}
      />

      <div className="flex-1 overflow-auto px-page-x pb-6">
        <div className="flex flex-col gap-6">
          <div>
            <SectionHeader title="服务连接" />
            <div className="flex flex-col gap-px bg-line-default rounded-card overflow-hidden">
              <SettingsRow
                icon={Cpu}
                title="AI 模型服务"
                description={summary.hasApiKey ? `${providerName} / ${modelLabel}` : '尚未配置 API Key'}
                badge={<StatusBadge status={summary.hasApiKey ? 'success' : 'warning'} label={summary.hasApiKey ? '已配置' : '未配置'} />}
                onClick={() => navigate('/settings/provider')}
              />
              <SettingsRow
                icon={Mic}
                title="语音服务"
                description={voiceDescription}
                badge={<StatusBadge status={voiceConfigured ? 'success' : 'warning'} label={voiceConfigured ? '已配置' : '未配置'} />}
                onClick={() => navigate('/settings/voice')}
              />
            </div>
          </div>

          <div>
            <SectionHeader title="通用设置" />
            <div className="flex flex-col gap-px bg-line-default rounded-card overflow-hidden">
              <SettingsRow
                icon={AudioWaveform}
                title="唤醒词"
                description="说出名称唤起，回复后可直接追问"
                onClick={() => navigate('/settings/wake-word')}
              />
              <SettingsRow
                icon={Terminal}
                title="运行环境"
                description={summary.defaultCwd}
                onClick={() => navigate('/settings/runtime')}
              />
              <SettingsRow
                icon={Sun}
                title="外观"
                description="选择浅色或深色模式"
                onClick={() => navigate('/settings/appearance')}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SettingsRow({ icon: Icon, title, description, badge, onClick }: {
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  title: string;
  description?: string;
  badge?: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-0 py-3 bg-bg-window hover:bg-bg-surface-1/60 active:bg-bg-surface-1 active:scale-[0.99] transition-colors text-left group"
    >
      <div className="w-8 h-8 rounded-icon-box flex items-center justify-center bg-bg-surface-1 group-hover:bg-bg-surface-2 transition-colors">
        <Icon size={16} strokeWidth={1.8} className="text-text-muted" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-body text-text-primary">{title}</div>
        {description && <div className="text-body-sm text-text-muted mt-0.5 truncate">{description}</div>}
      </div>
      {badge}
      <ChevronRight size={14} className="text-text-muted flex-shrink-0" strokeWidth={2} />
    </button>
  );
}
