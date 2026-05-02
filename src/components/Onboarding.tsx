'use client';

import { useState } from 'react';
import { getIpcRenderer } from '@/lib/electron-ipc';
import { Button } from '@/components/ui/Button';
import { SingleLineInput } from '@/components/ui/SingleLineInput';

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
      <div className="text-center">
        <h2 className="text-page-title text-text-primary mb-3">语音识别配置</h2>
        <p className="text-body text-text-muted mb-6">Shrew 使用豆包语音大模型进行在线语音识别。请填写火山引擎的凭证。</p>
        <SingleLineInput
          type="text"
          value={volcAppId}
          onChange={e => setVolcAppId(e.target.value)}
          placeholder="App ID"
        />
        <SingleLineInput
          type="password"
          value={volcToken}
          onChange={e => setVolcToken(e.target.value)}
          placeholder="Access Token"
        />
        {error && <p className="text-body-sm text-danger mb-2">{error}</p>}
        <Button variant="primary" onClick={saveVolcengine} disabled={saving || !volcAppId.trim() || !volcToken.trim()}>
          {saving ? '验证中...' : '验证并保存'}
        </Button>
      </div>
    ),
    'api-key': (
      <div className="text-center">
        <h2 className="text-page-title text-text-primary mb-3">API Key</h2>
        <p className="text-body text-text-muted mb-6">需要 API Key 来调用 Claude。Key 将安全存储在 macOS 钥匙串中。</p>
        <SingleLineInput
          type="password"
          value={apiKey}
          onChange={e => setApiKey(e.target.value)}
          placeholder="从 open.bigmodel.cn 获取您的 API Key"
        />
        {error && <p className="text-body-sm text-danger mb-2">{error}</p>}
        <Button variant="primary" onClick={validateApiKey} disabled={!apiKey.trim()}>
          验证并保存
        </Button>
      </div>
    ),
    cwd: (
      <div className="text-center">
        <h2 className="text-page-title text-text-primary mb-3">工作目录</h2>
        <p className="text-body text-text-muted mb-6">Claude Code 将在此目录下执行命令。</p>
        <SingleLineInput
          type="text"
          value={defaultCwd}
          onChange={e => setDefaultCwd(e.target.value)}
        />
        <div className="flex gap-2 justify-center">
          <Button variant="secondary" onClick={() => {
            ipcRenderer?.invoke('settings:pick-directory').then((p: string | null) => {
              if (p) setDefaultCwd(p);
            });
          }}>
            浏览
          </Button>
          <Button variant="primary" onClick={finish}>完成设置</Button>
        </div>
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
    <div className="flex justify-center items-center min-h-screen bg-bg-app">
      <div className="max-w-md px-10 py-10">
        {steps[step]}
      </div>
    </div>
  );
}

function OnboardingStep({ title, description, buttonText, onAction, secondaryButton, onSecondary }: {
  title: string; description: string; buttonText: string;
  onAction: () => void; secondaryButton?: string; onSecondary?: () => void;
}) {
  return (
    <div className="text-center">
      <h2 className="text-page-title text-text-primary mb-3">{title}</h2>
      <p className="text-body text-text-muted leading-relaxed mb-6">{description}</p>
      <Button variant="primary" onClick={onAction}>{buttonText}</Button>
      {secondaryButton && onSecondary && (
        <button onClick={onSecondary} className="block mx-auto mt-2 bg-transparent border-none text-brand text-body-sm cursor-pointer hover:underline">
          {secondaryButton}
        </button>
      )}
    </div>
  );
}
