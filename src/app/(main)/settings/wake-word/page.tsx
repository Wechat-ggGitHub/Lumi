'use client';

import { useState, useEffect } from 'react';
import { getIpcRenderer } from '@/lib/electron-ipc';
import { PageHeader } from '@/components/ui/PageHeader';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';

interface WakeWordStatus {
  enabled: boolean;
  active: boolean;
  keyword: string;
}

export default function WakeWordSettingsPage() {
  const ipcRenderer = getIpcRenderer();
  const [status, setStatus] = useState<WakeWordStatus>({
    enabled: false,
    active: false,
    keyword: 'Lumi',
  });
  const [silenceTimeout, setSilenceTimeout] = useState(3);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadStatus();
    loadSettings();
  }, []);

  async function loadStatus() {
    const s = await ipcRenderer?.invoke('wake-word:status');
    if (s) setStatus(s);
  }

  async function loadSettings() {
    const settings = await ipcRenderer?.invoke('settings:load');
    if (settings) setSilenceTimeout(settings.wakeWordSilenceTimeout ?? 3);
  }

  async function toggle(enabled: boolean) {
    setLoading(true);
    setError(null);
    const result = await ipcRenderer?.invoke('wake-word:toggle', { enabled });
    if (result?.success) {
      await loadStatus();
    } else {
      setError(result?.error || '启动失败');
    }
    setLoading(false);
  }

  async function saveTimeout(value: number) {
    setSilenceTimeout(value);
    await ipcRenderer?.invoke('settings:save', {
      wakeWordSilenceTimeout: value,
    });
  }

  return (
    <div className="min-h-screen bg-bg-window flex flex-col">
      <PageHeader title="语音唤醒与连续对话"
        onBack={() => ipcRenderer?.send('navigate:route', { path: '/settings' })} />

      <div className="flex-1 overflow-auto px-page-x pb-6">
        <div className="flex flex-col gap-section-gap">
          {error && (
            <div className="bg-danger/10 text-danger p-3 rounded-card text-body-sm">
              {error}
            </div>
          )}

          {/* Toggle */}
          <div className="flex items-center justify-between">
            <div>
              <SectionHeader title="语音唤醒与连续对话" description="说出分身名称即可唤起对话，Agent 回复后可直接追问，无需按键" />
            </div>
            <button
              onClick={() => toggle(!status.enabled)}
              disabled={loading}
              className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${
                status.enabled ? 'bg-brand' : 'bg-bg-surface-2'
              } ${loading ? 'opacity-50' : ''}`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
                  status.enabled ? 'translate-x-5' : ''
                }`}
              />
            </button>
          </div>

          {/* Keyword preview */}
          <div>
            <SectionHeader title="唤醒词" />
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold text-text-primary">{status.keyword}</span>
              {status.active && (
                <StatusBadge status="success" label="监听中" />
              )}
            </div>
            <p className="text-body-sm text-text-muted mt-2">
              唤醒词等于分身名称，可在「分身设定」中修改
            </p>
          </div>

          {/* Silence timeout */}
          <div>
            <div className="flex items-center justify-between">
              <SectionHeader title="静音超时" />
              <span className="text-body-sm text-text-muted">{silenceTimeout} 秒</span>
            </div>
            <input
              type="range"
              min="1"
              max="5"
              step="0.5"
              value={silenceTimeout}
              onChange={(e) => saveTimeout(parseFloat(e.target.value))}
              className="w-full"
            />
            <p className="text-body-sm text-text-muted mt-2">
              说完指令后多久自动停止录音
            </p>
          </div>

          {/* Info */}
          {status.enabled && (
            <div className="bg-brand-soft p-4 rounded-card space-y-2">
              <p className="text-body font-medium text-brand">
                使用说明
              </p>
              <ul className="text-body-sm text-text-secondary space-y-1">
                <li>· 清晰说出「{status.keyword}」即可唤起</li>
                <li>· 唤醒后自动录音，说完等待 {silenceTimeout} 秒自动识别</li>
                <li>· Agent 回复后会自动进入 3 秒监听窗口，可直接追问</li>
                <li>· 仅在空闲时监听唤醒词，执行任务时暂停</li>
                <li>· 所有语音检测在本地完成，不上传音频</li>
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
