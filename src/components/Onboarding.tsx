'use client';

import { useState, useEffect } from 'react';
import { getIpcRenderer } from '@/lib/electron-ipc';
import { Button } from '@/components/ui/Button';
import { SingleLineInput } from '@/components/ui/SingleLineInput';
import { OnboardingShell } from '@/components/OnboardingShell';
import { CompletionScreen } from '@/components/CompletionScreen';
import { getProvider, getAllProviders } from '@/lib/provider-config';

type Step = 'welcome' | 'accessibility' | 'volcengine' | 'provider-key' | 'completion';

interface ProviderOption {
  key: string;
  name: string;
}

// 主要 provider（显示在列表顶部）
const PRIMARY_PROVIDERS: ProviderOption[] = [
  { key: 'anthropic', name: 'Anthropic' },
  { key: 'openai', name: 'ChatGPT' },
  { key: 'glm-cn', name: 'GLM (智谱)' },
  { key: 'minimax-cn', name: 'MiniMax' },
  { key: 'moonshot', name: 'Moonshot (Kimi)' },
  { key: 'deepseek', name: 'DeepSeek' },
];

export function Onboarding({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState<Step>('welcome');
  const [apiKey, setApiKey] = useState('');
  const [volcAppId, setVolcAppId] = useState('');
  const [volcToken, setVolcToken] = useState('');
  const [selectedProvider, setSelectedProvider] = useState('anthropic');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [showMoreProviders, setShowMoreProviders] = useState(false);

  const ipcRenderer = getIpcRenderer();

  // 后续步骤会在这里添加...

  const steps: Record<Step, React.ReactNode> = {
    welcome: (
      <OnboardingStep
        title="欢迎使用 Aiva"
        description="Aiva 让你用语音驱动 Claude Code。按下右 Option，说一句话，Claude 帮你干活。"
        buttonText="开始设置"
        onAction={() => setStep('accessibility')}
      />
    ),
    accessibility: (
      <OnboardingStep
        title="辅助功能权限"
        description="为了响应右 Option 键唤起语音，Aiva 需要辅助功能权限。这与 Raycast、Alfred 等应用所需的权限相同。Aiva 只会监听右 Option 键，不会记录任何其他按键。"
        buttonText="打开系统设置"
        onAction={() => {
          ipcRenderer?.send('onboarding:open-accessibility');
          if (pollRef.current) clearInterval(pollRef.current);
          pollRef.current = setInterval(async () => {
            const granted = await ipcRenderer?.invoke('onboarding:check-accessibility');
            if (granted) {
              if (pollRef.current) clearInterval(pollRef.current);
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
        <p className="text-body text-text-muted mb-6">Aiva 使用豆包语音大模型进行在线语音识别。请填写火山引擎的凭证。</p>
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
    'select-provider': (
      <div className="text-center">
        <h2 className="text-page-title text-text-primary mb-3">选择 AI 服务商</h2>
        <p className="text-body text-text-muted mb-6">选择你偏好的模型服务商。</p>
        <div className="grid grid-cols-2 gap-3 mb-6">
          {[
            { key: 'glm-cn', name: 'GLM (智谱)', recommended: true },
            { key: 'deepseek', name: 'DeepSeek', recommended: false },
            { key: 'anthropic', name: 'Anthropic', recommended: false },
            { key: 'moonshot', name: 'Moonshot (Kimi)', recommended: false },
            { key: 'minimax-cn', name: 'MiniMax', recommended: false },
            { key: 'openrouter', name: 'OpenRouter', recommended: false },
          ].map(p => (
            <button
              key={p.key}
              onClick={() => setSelectedProvider(p.key)}
              className={`rounded-input p-3 text-left transition-all ${
                selectedProvider === p.key
                  ? 'border-2 border-brand bg-bg-surface-2'
                  : 'border border-line-default bg-bg-surface-1'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className={`text-body font-medium ${selectedProvider === p.key ? 'text-brand' : 'text-text-primary'}`}>
                  {p.name}
                </span>
                {selectedProvider === p.key && (
                  <span className="text-brand text-sm">✓</span>
                )}
                {p.recommended && selectedProvider !== p.key && (
                  <span className="text-xs text-brand bg-brand/10 px-1.5 py-0.5 rounded">推荐</span>
                )}
              </div>
            </button>
          ))}
        </div>
        <p className="text-body-sm text-text-muted mb-4">更多服务商可在设置中配置</p>
        <Button variant="primary" onClick={() => setStep('api-key')}>
          下一步
        </Button>
      </div>
    ),
    'api-key': (
      <div className="text-center">
        <h2 className="text-page-title text-text-primary mb-3">API Key</h2>
        <p className="text-body text-text-muted mb-6">需要 API Key 来调用模型。Key 将加密存储在本地。</p>
        <SingleLineInput
          type="password"
          value={apiKey}
          onChange={e => setApiKey(e.target.value)}
          placeholder={getProvider(selectedProvider).keyPlaceholder}
        />
        {error && <p className="text-body-sm text-danger mb-2">{error}</p>}
        <Button variant="primary" onClick={validateApiKey} disabled={saving || !apiKey.trim()}>
          {saving ? '验证中...' : '验证并保存'}
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
        description="按下右 Option 开始使用 Aiva。"
        buttonText="开始使用"
        onAction={onComplete}
      />
    ),
  };

  return (
    <div className="flex justify-center items-center min-h-screen bg-bg-app pt-8">
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
