'use client';

import { useState } from 'react';
import { getIpcRenderer } from '@/lib/electron-ipc';

type Step = 'welcome' | 'accessibility' | 'volcengine' | 'api-key' | 'cwd' | 'done';

export function Onboarding({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState<Step>('welcome');
  const [apiKey, setApiKey] = useState('');
  const [volcAppId, setVolcAppId] = useState('');
  const [volcToken, setVolcToken] = useState('');
  const [defaultCwd, setDefaultCwd] = useState('~/Documents');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const ipcRenderer = getIpcRenderer();

  const checkAccessibility = async () => {
    const granted = await ipcRenderer?.invoke('onboarding:check-accessibility');
    if (granted) setStep('volcengine');
  };

  const saveVolcengine = async () => {
    if (!volcAppId.trim() || !volcToken.trim()) {
      setError('请填写 App ID 和 Access Token');
      return;
    }
    setError('');
    setSaving(true);
    try {
      await ipcRenderer?.invoke('settings:save-volcengine-credentials', {
        appId: volcAppId.trim(),
        accessToken: volcToken.trim(),
      });
      setStep('api-key');
    } catch (e: any) {
      setError(e.message || '凭证验证失败');
    } finally {
      setSaving(false);
    }
  };

  const validateApiKey = async () => {
    setError('');
    try {
      await ipcRenderer?.invoke('onboarding:validate-api-key', { key: apiKey.trim(), providerKey: 'glm-cn' });
      setStep('cwd');
    } catch {
      setError('API Key 验证失败，请检查后重试');
    }
  };

  const finish = async () => {
    await ipcRenderer?.invoke('onboarding:finish', { defaultCwd });
    setStep('done');
    onComplete();
  };

  const steps: Record<Step, React.ReactNode> = {
    welcome: (
      <OnboardingStep
        title="欢迎使用 Shrew"
        description="Shrew 让你用语音驱动 Claude Code。按下右 Command，说一句话，Claude 帮你干活。"
        buttonText="开始设置"
        onAction={() => setStep('accessibility')}
      />
    ),
    accessibility: (
      <OnboardingStep
        title="辅助功能权限"
        description="为了响应右 Command 键唤起语音，Shrew 需要辅助功能权限。这与 Raycast、Alfred 等应用所需的权限相同。Shrew 只会监听右 Command 键，不会记录任何其他按键。"
        buttonText="打开系统设置"
        onAction={() => {
          ipcRenderer?.send('onboarding:open-accessibility');
          const interval = setInterval(async () => {
            const granted = await ipcRenderer?.invoke('onboarding:check-accessibility');
            if (granted) {
              clearInterval(interval);
              setStep('volcengine');
            }
          }, 1000);
        }}
        secondaryButton="已授权，下一步"
        onSecondary={() => checkAccessibility()}
      />
    ),
    volcengine: (
      <div style={stepStyle}>
        <h2 style={titleStyle}>语音识别配置</h2>
        <p style={descStyle}>
          Shrew 使用豆包语音大模型进行在线语音识别。请填写火山引擎的凭证。
        </p>
        <input
          type="text"
          value={volcAppId}
          onChange={e => setVolcAppId(e.target.value)}
          placeholder="App ID"
          style={{ ...inputStyle, marginBottom: 8 }}
        />
        <input
          type="password"
          value={volcToken}
          onChange={e => setVolcToken(e.target.value)}
          placeholder="Access Token"
          style={{ ...inputStyle, marginBottom: 12 }}
        />
        {error && <p style={{ color: '#FF453A', fontSize: 13, marginBottom: 8 }}>{error}</p>}
        <button onClick={saveVolcengine} disabled={saving || !volcAppId.trim() || !volcToken.trim()} style={{
          ...buttonStyle,
          opacity: (!saving && volcAppId.trim() && volcToken.trim()) ? 1 : 0.5,
          cursor: (!saving && volcAppId.trim() && volcToken.trim()) ? 'pointer' : 'default',
        }}>
          {saving ? '验证中...' : '验证并保存'}
        </button>
      </div>
    ),
    'api-key': (
      <div style={stepStyle}>
        <h2 style={titleStyle}>API Key</h2>
        <p style={descStyle}>需要 GLM API Key 来调用 Claude。Key 将安全存储在 macOS 钥匙串中。</p>
        <input
          type="password"
          value={apiKey}
          onChange={e => setApiKey(e.target.value)}
          placeholder="从 open.bigmodel.cn 获取您的 API Key"
          style={{ ...inputStyle, marginBottom: 12 }}
        />
        {error && <p style={{ color: '#FF453A', fontSize: 13, marginBottom: 8 }}>{error}</p>}
        <button onClick={validateApiKey} disabled={!apiKey.trim()} style={{
          ...buttonStyle,
          opacity: apiKey.trim() ? 1 : 0.5,
          cursor: apiKey.trim() ? 'pointer' : 'default',
        }}>
          验证并保存
        </button>
      </div>
    ),
    cwd: (
      <div style={stepStyle}>
        <h2 style={titleStyle}>工作目录</h2>
        <p style={descStyle}>Claude Code 将在此目录下执行命令。</p>
        <input
          type="text"
          value={defaultCwd}
          onChange={e => setDefaultCwd(e.target.value)}
          style={{ ...inputStyle, marginBottom: 12 }}
        />
        <button onClick={() => {
          ipcRenderer?.invoke('settings:pick-directory').then((p: string | null) => {
            if (p) setDefaultCwd(p);
          });
        }} style={{ ...buttonStyle, background: '#fff', color: '#007AFF', border: '1px solid #007AFF', marginBottom: 12 }}>
          浏览
        </button>
        <button onClick={finish} style={buttonStyle}>完成设置</button>
      </div>
    ),
    done: (
      <OnboardingStep
        title="设置完成！"
        description="按下右 Command 开始使用 Shrew。"
        buttonText="开始使用"
        onAction={onComplete}
      />
    ),
  };

  return (
    <div style={{
      display: 'flex', justifyContent: 'center', alignItems: 'center',
      minHeight: '100vh', background: '#fafafa',
    }}>
      {steps[step]}
    </div>
  );
}

function OnboardingStep({ title, description, buttonText, onAction, secondaryButton, onSecondary }: {
  title: string; description: string; buttonText: string;
  onAction: () => void; secondaryButton?: string; onSecondary?: () => void;
}) {
  return (
    <div style={stepStyle}>
      <h2 style={titleStyle}>{title}</h2>
      <p style={descStyle}>{description}</p>
      <button onClick={onAction} style={buttonStyle}>{buttonText}</button>
      {secondaryButton && onSecondary && (
        <button onClick={onSecondary} style={{ ...linkStyle, marginTop: 8 }}>{secondaryButton}</button>
      )}
    </div>
  );
}

const stepStyle: React.CSSProperties = { maxWidth: 420, padding: 40, textAlign: 'center' as const };
const titleStyle: React.CSSProperties = { fontSize: 22, fontWeight: 700, marginBottom: 12 };
const descStyle: React.CSSProperties = { fontSize: 14, color: '#666', lineHeight: 1.6, marginBottom: 24 };
const buttonStyle: React.CSSProperties = {
  padding: '10px 24px', borderRadius: 8, border: 'none',
  background: '#007AFF', color: '#fff', fontSize: 15, cursor: 'pointer',
};
const linkStyle: React.CSSProperties = {
  background: 'none', border: 'none', color: '#007AFF',
  fontSize: 13, cursor: 'pointer', textDecoration: 'underline',
};
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', borderRadius: 8,
  border: '1px solid #ddd', fontSize: 14, boxSizing: 'border-box',
};
