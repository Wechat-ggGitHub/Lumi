'use client';

import { useState, useEffect, useRef } from 'react';
import { getIpcRenderer } from '@/lib/electron-ipc';
import { Button } from '@/components/ui/Button';
import { SingleLineInput } from '@/components/ui/SingleLineInput';
import { OnboardingShell } from '@/components/OnboardingShell';
import { CompletionScreen } from '@/components/CompletionScreen';
import { getAllProviders, getProvider, type ProviderPreset } from '@/lib/provider-config';

// TODO: 替换为实际教程链接
const VOLCENGINE_TUTORIAL_URL = 'https://TODO_ADD_TUTORIAL_URL';

type Step = 'welcome' | 'accessibility' | 'volcengine' | 'provider-key' | 'completion';

interface ProviderOption {
  key: string;
  name: string;
}

// 主要 provider（显示在列表顶部）
const PRIMARY_PROVIDERS: ProviderOption[] = [
  { key: 'anthropic', name: 'Anthropic' },
  { key: 'openai', name: 'ChatGPT' },
  { key: 'glm-cn', name: '智谱 Coding Plan' },
  { key: 'minimax-cn', name: 'MiniMax Token Plan' },
  { key: 'kimi', name: 'Moonshot' },
  { key: 'deepseek', name: 'DeepSeek' },
];

export function Onboarding({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState<Step>('welcome');
  const [apiKey, setApiKey] = useState('');
  const [volcAppId, setVolcAppId] = useState('');
  const [volcToken, setVolcToken] = useState('');
  const [selectedProvider, setSelectedProvider] = useState('anthropic');
  const [selectedModel, setSelectedModel] = useState('claude-sonnet-4-6');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [showMoreProviders, setShowMoreProviders] = useState(false);

  const ipcRenderer = getIpcRenderer();

  // 获取当前步骤的索引（用于进度点）
  const getStepIndex = (): number => {
    switch (step) {
      case 'welcome': return -1; // Welcome 不显示进度点
      case 'accessibility': return 0;
      case 'volcengine': return 1;
      case 'provider-key': return 2;
      case 'completion': return 3;
      default: return -1;
    }
  };

  // 处理返回
  const handleBack = () => {
    switch (step) {
      case 'accessibility': setStep('welcome'); break;
      case 'volcengine': setStep('accessibility'); break;
      case 'provider-key': setStep('volcengine'); break;
      default: break;
    }
  };

  // 辅助功能轮询引用
  const accessibilityPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 进入辅助功能页时自动检测是否已授权
  useEffect(() => {
    if (step === 'accessibility') {
      const checkAndSkip = async () => {
        const granted = await ipcRenderer?.invoke('onboarding:check-accessibility');
        if (granted) {
          setStep('volcengine');
        }
      };
      checkAndSkip();
    }
    return () => {
      if (accessibilityPollRef.current) {
        clearInterval(accessibilityPollRef.current);
        accessibilityPollRef.current = null;
      }
    };
  }, [step]);

  // 获取"更多" provider 列表（排除主要 provider）
  const getMoreProviders = (): ProviderOption[] => {
    const primaryKeys = new Set(PRIMARY_PROVIDERS.map(p => p.key));
    return getAllProviders()
      .filter(p => !primaryKeys.has(p.key))
      .map(p => ({ key: p.key, name: p.name }));
  };

  // 验证 API Key
  const handleValidateApiKey = async () => {
    setError('');
    setSaving(true);
    try {
      await ipcRenderer?.invoke('onboarding:validate-api-key', {
        key: apiKey.trim(),
        providerKey: selectedProvider,
        modelId: selectedModel,
      });
      setStep('completion');
    } catch (e: any) {
      setError(e.message || 'API Key 验证失败，请检查后重试');
    } finally {
      setSaving(false);
    }
  };

  if (step === 'completion') {
    return <CompletionScreen onComplete={onComplete} />;
  }

  return (
    <OnboardingShell
      currentStep={getStepIndex()}
      totalSteps={3}
      showBack={step !== 'welcome'}
      onBack={handleBack}
    >
      {step === 'welcome' && (
        <div className="text-center py-16">
          <h2 className="text-page-title text-text-primary mb-3">你好，我是 Lumi</h2>
          <p className="text-body text-text-muted leading-relaxed mb-6">
            可以和你语音交流的个人助手
          </p>
          <Button variant="primary" onClick={() => setStep('accessibility')}>
            好
          </Button>
        </div>
      )}

      {step === 'accessibility' && (
        <div className="text-center">
          <h2 className="text-page-title text-text-primary mb-3">开启快捷键监听</h2>
          <p className="text-body text-text-muted leading-relaxed mb-6">
            Lumi 需要监听键盘事件来响应语音唤起。请在系统设置中授予权限。
          </p>
          <Button
            variant="primary"
            onClick={() => {
              ipcRenderer?.send('onboarding:open-accessibility');
              // 开始轮询检测授权状态
              if (accessibilityPollRef.current) {
                clearInterval(accessibilityPollRef.current);
              }
              accessibilityPollRef.current = setInterval(async () => {
                const granted = await ipcRenderer?.invoke('onboarding:check-accessibility');
                if (granted) {
                  if (accessibilityPollRef.current) {
                    clearInterval(accessibilityPollRef.current);
                    accessibilityPollRef.current = null;
                  }
                  setStep('volcengine');
                }
              }, 1000);
            }}
          >
            打开系统设置
          </Button>
          <button
            onClick={async () => {
              const granted = await ipcRenderer?.invoke('onboarding:check-accessibility');
              if (granted) {
                setStep('volcengine');
              }
            }}
            className="block mx-auto mt-3 bg-transparent border-none text-brand text-body-sm cursor-pointer hover:underline"
          >
            已授权
          </button>
        </div>
      )}

      {step === 'volcengine' && (
        <div className="text-center">
          <h2 className="text-page-title text-text-primary mb-3">语音识别与合成配置</h2>
          <p className="text-body text-text-muted leading-relaxed mb-6">
            Lumi 使用火山引擎进行语音识别和语音合成。请填写凭证。
          </p>
          <div className="space-y-3 mb-6">
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
          </div>
          {error && <p className="text-body-sm text-danger mb-4">{error}</p>}
          <Button
            variant="primary"
            onClick={async () => {
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
                setStep('provider-key');
              } catch (e: any) {
                setError(e.message || '凭证验证失败，请检查后重试');
              } finally {
                setSaving(false);
              }
            }}
            disabled={saving || !volcAppId.trim() || !volcToken.trim()}
          >
            {saving ? '保存中...' : '保存并继续'}
          </Button>
          <button
            onClick={() => {
              if (typeof window !== 'undefined') {
                window.open(VOLCENGINE_TUTORIAL_URL, '_blank');
              }
            }}
            className="block mx-auto mt-3 bg-transparent border-none text-brand text-body-sm cursor-pointer hover:underline"
          >
            如何获取凭证？
          </button>
        </div>
      )}

      {step === 'provider-key' && (
        <div className="text-center">
          <h2 className="text-page-title text-text-primary mb-3">选择 AI 服务商</h2>
          <p className="text-body text-text-muted leading-relaxed mb-6">
            选择你偏好的模型服务商。
          </p>

          {/* Provider 列表 */}
          <div className="text-left space-y-2 mb-6">
            {PRIMARY_PROVIDERS.map(provider => (
              <button
                key={provider.key}
                onClick={() => setSelectedProvider(provider.key)}
                className={`w-full flex items-center justify-between p-3 rounded-lg border transition-all ${
                  selectedProvider === provider.key
                    ? 'border-brand/50 bg-brand/8'
                    : 'border-border-default bg-bg-surface-1'
                }`}
              >
                <span className={`text-body font-medium ${
                  selectedProvider === provider.key ? 'text-brand' : 'text-text-primary'
                }`}>
                  {provider.name}
                </span>
                {selectedProvider === provider.key && (
                  <span className="text-brand text-sm">✓</span>
                )}
              </button>
            ))}

            {/* 更多服务商 */}
            <button
              onClick={() => setShowMoreProviders(!showMoreProviders)}
              className="w-full flex items-center justify-center gap-1.5 p-2.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-surface-1 transition-colors"
            >
              <span className="text-body-sm">{showMoreProviders ? '收起' : `更多服务商 (${getMoreProviders().length})`}</span>
              <span className={`text-xs transition-transform duration-200 ${showMoreProviders ? 'rotate-180' : ''}`}>
                ▾
              </span>
            </button>

            {/* 展开的更多 provider */}
            {showMoreProviders && getMoreProviders().map(provider => (
              <button
                key={provider.key}
                onClick={() => setSelectedProvider(provider.key)}
                className={`w-full flex items-center justify-between p-3 rounded-lg border transition-all ${
                  selectedProvider === provider.key
                    ? 'border-brand/50 bg-brand/8'
                    : 'border-border-default bg-bg-surface-1'
                }`}
              >
                <span className={`text-body font-medium ${
                  selectedProvider === provider.key ? 'text-brand' : 'text-text-primary'
                }`}>
                  {provider.name}
                </span>
                {selectedProvider === provider.key && (
                  <span className="text-brand text-sm">✓</span>
                )}
              </button>
            ))}
          </div>

          {/* 模型选择 */}
          {selectedProvider && (
            <div className="text-left mb-6">
              <p className="text-body-sm text-text-muted mb-2">选择模型</p>
              <div className="space-y-2">
                {getProvider(selectedProvider).models.map((model) => {
                  const isSelected = selectedModel === model.id;
                  return (
                    <button
                      key={model.id}
                      onClick={() => setSelectedModel(model.id)}
                      className={`w-full p-3 rounded-lg border text-left transition-all ${
                        isSelected
                          ? 'border-brand/50 bg-brand/8'
                          : 'border-border-default bg-bg-surface-1'
                      }`}
                    >
                      <div className={`text-body font-medium ${
                        isSelected ? 'text-brand' : 'text-text-primary'
                      }`}>
                        {model.name}
                      </div>
                      <div className={`text-xs mt-0.5 ${
                        isSelected ? 'text-brand/70' : 'text-text-muted'
                      }`}>
                        {model.description}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* API Key 输入 */}
          <div className="text-left mb-2">
            <p className="text-body-sm text-text-muted">
              请输入 {getProvider(selectedProvider).nameZh} 的 API Key
            </p>
          </div>
          <SingleLineInput
            type="password"
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            placeholder="API Key"
            className="mb-6"
          />

          {error && <p className="text-body-sm text-danger mb-4">{error}</p>}

          <Button
            variant="primary"
            onClick={handleValidateApiKey}
            disabled={saving || !apiKey.trim()}
          >
            {saving ? '保存中...' : '保存并完成'}
          </Button>
        </div>
      )}
    </OnboardingShell>
  );
}
