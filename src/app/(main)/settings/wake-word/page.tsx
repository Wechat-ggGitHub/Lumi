'use client';

import { useState, useEffect } from 'react';
import { getIpcRenderer } from '@/lib/electron-ipc';
import { PageHeader } from '@/components/ui/PageHeader';

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

      <div className="flex-1 overflow-auto px-page-x pb-6 space-y-6">
        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-3 rounded-lg text-sm">
            {error}
          </div>
        )}

        {/* Toggle */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">语音唤醒与连续对话</p>
            <p className="text-xs text-text-muted mt-1">
              说出分身名称即可唤起对话，Agent 回复后可直接追问，无需按键
            </p>
          </div>
          <button
            onClick={() => toggle(!status.enabled)}
            disabled={loading}
            className={`relative w-11 h-6 rounded-full transition-colors ${
              status.enabled ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'
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
        <div className="space-y-2">
          <p className="text-sm font-medium">唤醒词</p>
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold">{status.keyword}</span>
            {status.active && (
              <span className="text-xs bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 px-2 py-0.5 rounded">
                监听中
              </span>
            )}
          </div>
          <p className="text-xs text-text-muted">
            唤醒词等于分身名称，可在「分身设定」中修改
          </p>
        </div>

        {/* Silence timeout */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">静音超时</p>
            <span className="text-sm text-text-muted">{silenceTimeout} 秒</span>
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
          <p className="text-xs text-text-muted">
            说完指令后多久自动停止录音
          </p>
        </div>

        {/* Info */}
        {status.enabled && (
          <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg space-y-2">
            <p className="text-sm font-medium text-blue-700 dark:text-blue-300">
              使用说明
            </p>
            <ul className="text-xs text-blue-600 dark:text-blue-400 space-y-1">
              <li>• 清晰说出「{status.keyword}」即可唤起</li>
              <li>• 唤醒后自动录音，说完等待 {silenceTimeout} 秒自动识别</li>
              <li>• Agent 回复后会自动进入 3 秒监听窗口，可直接追问</li>
              <li>• 仅在空闲时监听唤醒词，执行任务时暂停</li>
              <li>• 所有语音检测在本地完成，不上传音频</li>
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
