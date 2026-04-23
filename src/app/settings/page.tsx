'use client';

import { useState, useEffect } from 'react';
import { getIpcRenderer } from '@/lib/electron-ipc';

type ProviderKey = 'glm-cn' | 'glm-global' | 'anthropic';
type ModelPreset = 'opus' | 'sonnet' | 'haiku';

const PROVIDER_INFO: Record<ProviderKey, { name: string; nameZh: string; models: Record<ModelPreset, string>; keyPlaceholder: string }> = {
  'glm-cn': {
    name: 'GLM (CN)',
    nameZh: 'GLM (国内)',
    models: { opus: 'GLM-5.1', sonnet: 'GLM-5-Turbo', haiku: 'GLM-4.5-Air' },
    keyPlaceholder: '从 open.bigmodel.cn 获取您的 API Key',
  },
  'glm-global': {
    name: 'GLM (Global)',
    nameZh: 'GLM (国际)',
    models: { opus: 'GLM-5.1', sonnet: 'GLM-5-Turbo', haiku: 'GLM-4.5-Air' },
    keyPlaceholder: '从 open.bigmodel.cn 获取您的 API Key',
  },
  anthropic: {
    name: 'Anthropic',
    nameZh: 'Anthropic',
    models: { opus: 'Claude Opus 4.6', sonnet: 'Claude Sonnet 4.6', haiku: 'Claude Haiku 4.5' },
    keyPlaceholder: 'sk-ant-...',
  },
};

const MODEL_LABELS: Record<ModelPreset, string> = {
  opus: '高性能',
  sonnet: '均衡',
  haiku: '快速',
};

export default function SettingsPage() {
  const [apiKey, setApiKey] = useState('');
  const [hasKey, setHasKey] = useState(false);
  const [defaultCwd, setDefaultCwd] = useState('~/Documents');
  const [vadTimeout, setVadTimeout] = useState(2);
  const [provider, setProvider] = useState<ProviderKey>('glm-cn');
  const [modelPreset, setModelPreset] = useState<ModelPreset>('opus');
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  useEffect(() => {
    const ipcRenderer = getIpcRenderer();
    ipcRenderer?.invoke('settings:load').then((settings: any) => {
      setDefaultCwd(settings.defaultCwd || '~/Documents');
      setVadTimeout(settings.vadTimeout || 2);
      setHasKey(settings.hasApiKey || false);
      setProvider(settings.provider || 'glm-cn');
      setModelPreset(settings.modelPreset || 'opus');
    });
  }, []);

  const handleSaveApiKey = async () => {
    if (!apiKey.trim()) return;
    setStatus('saving');
    try {
      await getIpcRenderer()?.invoke('settings:save-api-key', { key: apiKey.trim() });
      setHasKey(true);
      setApiKey('');
      setStatus('saved');
      setTimeout(() => setStatus('idle'), 2000);
    } catch {
      setStatus('error');
      setTimeout(() => setStatus('idle'), 2000);
    }
  };

  const handleSaveSettings = async () => {
    setStatus('saving');
    try {
      await getIpcRenderer()?.invoke('settings:save', { defaultCwd, vadTimeout, provider, modelPreset });
      setStatus('saved');
      setTimeout(() => setStatus('idle'), 2000);
    } catch {
      setStatus('error');
      setTimeout(() => setStatus('idle'), 2000);
    }
  };

  const currentProvider = PROVIDER_INFO[provider];

  return (
    <div style={{ maxWidth: 480, margin: '40px auto', padding: '0 20px', fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif' }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 32 }}>Shrew 设置</h1>

      {/* Provider */}
      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>API 服务商</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {(Object.entries(PROVIDER_INFO) as [ProviderKey, typeof PROVIDER_INFO[ProviderKey]][]).map(([key, info]) => (
            <label key={key} style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px',
              borderRadius: 8, border: `1px solid ${provider === key ? '#007AFF' : '#ddd'}`,
              background: provider === key ? '#f0f7ff' : '#fff', cursor: 'pointer',
            }}>
              <input
                type="radio" name="provider" value={key}
                checked={provider === key}
                onChange={() => setProvider(key)}
              />
              <span style={{ fontSize: 14, fontWeight: 500 }}>{info.nameZh}</span>
            </label>
          ))}
        </div>
      </section>

      {/* Model */}
      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>模型</h2>
        <select
          value={modelPreset}
          onChange={e => setModelPreset(e.target.value as ModelPreset)}
          style={{
            width: '100%', padding: '10px 12px', borderRadius: 8,
            border: '1px solid #ddd', fontSize: 14, background: '#fff',
          }}
        >
          {(Object.entries(MODEL_LABELS) as [ModelPreset, string][]).map(([role, label]) => (
            <option key={role} value={role}>
              {currentProvider.models[role]} — {label}
            </option>
          ))}
        </select>
      </section>

      {/* API Key */}
      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>API Key</h2>
        <p style={{ fontSize: 13, color: '#666', marginBottom: 8 }}>
          Key 将安全存储在 macOS 钥匙串中。
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="password"
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            placeholder={hasKey ? '已存储（输入新 Key 替换）' : currentProvider.keyPlaceholder}
            style={{
              flex: 1, padding: '8px 12px', borderRadius: 8,
              border: '1px solid #ddd', fontSize: 14,
            }}
          />
          <button
            onClick={handleSaveApiKey}
            disabled={!apiKey.trim() || status === 'saving'}
            style={{
              padding: '8px 16px', borderRadius: 8, border: 'none',
              background: apiKey.trim() ? '#007AFF' : '#ccc',
              color: '#fff', cursor: apiKey.trim() ? 'pointer' : 'default',
            }}
          >
            {status === 'saving' ? '验证中...' : '保存'}
          </button>
        </div>
        {status === 'saved' && <p style={{ color: '#34C759', fontSize: 13, marginTop: 4 }}>已保存</p>}
        {status === 'error' && <p style={{ color: '#FF453A', fontSize: 13, marginTop: 4 }}>API Key 验证失败，请检查是否正确</p>}
      </section>

      {/* 工作目录 */}
      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>默认工作目录</h2>
        <p style={{ fontSize: 13, color: '#666', marginBottom: 8 }}>
          Claude Code 将在此目录下执行命令。
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="text"
            value={defaultCwd}
            onChange={e => setDefaultCwd(e.target.value)}
            style={{
              flex: 1, padding: '8px 12px', borderRadius: 8,
              border: '1px solid #ddd', fontSize: 14,
            }}
          />
          <button
            onClick={async () => {
              const path = await getIpcRenderer()?.invoke('settings:pick-directory');
              if (path) setDefaultCwd(path);
            }}
            style={{
              padding: '8px 16px', borderRadius: 8,
              border: '1px solid #ddd', background: '#fff', cursor: 'pointer',
            }}
          >
            浏览
          </button>
        </div>
      </section>

      {/* VAD 超时 */}
      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>语音静音超时</h2>
        <p style={{ fontSize: 13, color: '#666', marginBottom: 8 }}>
          停止说话后多少秒自动结束录音。
        </p>
        <input
          type="range"
          min={1} max={5} step={0.5}
          value={vadTimeout}
          onChange={e => setVadTimeout(Number(e.target.value))}
          style={{ width: '100%' }}
        />
        <span style={{ fontSize: 13 }}>{vadTimeout} 秒</span>
      </section>

      <button
        onClick={handleSaveSettings}
        style={{
          padding: '10px 24px', borderRadius: 8,
          border: 'none', background: '#007AFF',
          color: '#fff', fontSize: 15, cursor: 'pointer',
        }}
      >
        保存设置
      </button>

      {/* 关于 */}
      <section style={{ marginTop: 48, paddingTop: 24, borderTop: '1px solid #eee' }}>
        <p style={{ fontSize: 12, color: '#999' }}>
          Shrew v0.1.0 · Claude Code 语音壳子
        </p>
      </section>
    </div>
  );
}
