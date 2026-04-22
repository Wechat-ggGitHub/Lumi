'use client';

import { useState, useEffect } from 'react';

export default function SettingsPage() {
  const [apiKey, setApiKey] = useState('');
  const [hasKey, setHasKey] = useState(false);
  const [defaultCwd, setDefaultCwd] = useState('~/Documents');
  const [vadTimeout, setVadTimeout] = useState(2);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  useEffect(() => {
    const { ipcRenderer } = require('electron');
    ipcRenderer.invoke('settings:load').then((settings: any) => {
      setDefaultCwd(settings.defaultCwd || '~/Documents');
      setVadTimeout(settings.vadTimeout || 2);
      setHasKey(settings.hasApiKey || false);
    });
  }, []);

  const handleSaveApiKey = async () => {
    if (!apiKey.trim()) return;
    setStatus('saving');
    try {
      const { ipcRenderer } = require('electron');
      await ipcRenderer.invoke('settings:save-api-key', { key: apiKey.trim() });
      setHasKey(true);
      setApiKey('');
      setStatus('saved');
      setTimeout(() => setStatus('idle'), 2000);
    } catch {
      setStatus('error');
    }
  };

  const handleSaveSettings = async () => {
    setStatus('saving');
    try {
      const { ipcRenderer } = require('electron');
      await ipcRenderer.invoke('settings:save', { defaultCwd, vadTimeout });
      setStatus('saved');
      setTimeout(() => setStatus('idle'), 2000);
    } catch {
      setStatus('error');
    }
  };

  return (
    <div style={{ maxWidth: 480, margin: '40px auto', padding: '0 20px', fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif' }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 32 }}>Shrew 设置</h1>

      {/* API Key */}
      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Anthropic API Key</h2>
        <p style={{ fontSize: 13, color: '#666', marginBottom: 8 }}>
          Key 将安全存储在 macOS 钥匙串中。
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="password"
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            placeholder={hasKey ? '已存储（输入新 Key 替换）' : 'sk-ant-...'}
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
        {status === 'error' && <p style={{ color: '#FF453A', fontSize: 13, marginTop: 4 }}>保存失败</p>}
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
              const { ipcRenderer } = require('electron');
              const path = await ipcRenderer.invoke('settings:pick-directory');
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
