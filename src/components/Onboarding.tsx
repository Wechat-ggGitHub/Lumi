'use client';

import { useState } from 'react';

type Step = 'welcome' | 'accessibility' | 'model-download' | 'api-key' | 'cwd' | 'done';

export function Onboarding({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState<Step>('welcome');
  const [apiKey, setApiKey] = useState('');
  const [defaultCwd, setDefaultCwd] = useState('~/Documents');
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [error, setError] = useState('');

  const ipcRenderer = typeof window !== 'undefined' ? require('electron').ipcRenderer : null;

  const checkAccessibility = async () => {
    const granted = await ipcRenderer?.invoke('onboarding:check-accessibility');
    if (granted) setStep('model-download');
  };

  const startDownload = async () => {
    setError('');
    try {
      await ipcRenderer?.invoke('onboarding:download-model', {
        onProgress: (p: number) => setDownloadProgress(p),
      });
      setStep('api-key');
    } catch (e: any) {
      setError(e.message);
    }
  };

  const skipDownload = () => setStep('api-key');

  const validateApiKey = async () => {
    setError('');
    try {
      await ipcRenderer?.invoke('onboarding:validate-api-key', { key: apiKey.trim() });
      setStep('cwd');
    } catch (e: any) {
      setError('API Key 验证失败，请检查后重试');
    }
  };

  const finish = async () => {
    await ipcRenderer?.invoke('onboarding:finish', { defaultCwd });
    setStep('done');
    onComplete();
  };

  const steps: Record<Step, JSX.Element> = {
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
          // 轮询检查权限
          const interval = setInterval(async () => {
            const granted = await ipcRenderer?.invoke('onboarding:check-accessibility');
            if (granted) {
              clearInterval(interval);
              setStep('model-download');
            }
          }, 1000);
        }}
        secondaryButton="已授权，下一步"
        onSecondary={() => checkAccessibility()}
      />
    ),
    'model-download': (
      <div style={stepStyle}>
        <h2 style={titleStyle}>语音模型</h2>
        <p style={descStyle}>Shrew 使用本地语音识别，需要下载约 230MB 的模型文件。</p>
        {downloadProgress > 0 && downloadProgress < 100 ? (
          <div style={{ marginBottom: 16 }}>
            <div style={{ background: '#eee', borderRadius: 4, height: 6, overflow: 'hidden' }}>
              <div style={{ background: '#007AFF', height: '100%', width: `${downloadProgress}%`, transition: 'width 0.3s' }} />
            </div>
            <p style={{ fontSize: 12, color: '#666', marginTop: 4 }}>{downloadProgress}%</p>
          </div>
        ) : null}
        {error && <p style={{ color: '#FF453A', fontSize: 13, marginBottom: 8 }}>{error}</p>}
        <button onClick={startDownload} style={buttonStyle}>下载模型</button>
        <button onClick={skipDownload} style={{ ...linkStyle, marginTop: 8 }}>跳过，稍后下载</button>
      </div>
    ),
    'api-key': (
      <div style={stepStyle}>
        <h2 style={titleStyle}>API Key</h2>
        <p style={descStyle}>需要 Anthropic API Key 来调用 Claude。Key 将安全存储在 macOS 钥匙串中。</p>
        <input
          type="password"
          value={apiKey}
          onChange={e => setApiKey(e.target.value)}
          placeholder="sk-ant-..."
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
