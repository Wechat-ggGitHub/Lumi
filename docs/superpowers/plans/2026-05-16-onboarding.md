# Onboarding 重新设计实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 重构 Aiva onboarding 流程，从 7 屏精简为 4 屏 + 1.5s 完成过渡，删除 CWD 和独立 Done 页。

**Architecture:**
- 保持 Onboarding.tsx 作为单一入口组件
- 新增 OnboardingShell 组件封装进度点 + 返回按钮
- 新增 CompletionScreen 组件处理 1.5s 过渡
- Provider 列表改为垂直布局，支持"更多"就地展开

**Tech Stack:** React, TypeScript, Electron IPC, Tailwind CSS

---

## 文件结构

```
src/components/
├── Onboarding.tsx              # 主入口，重写
├── OnboardingShell.tsx         # 新增：进度点 + 返回按钮外壳
└── CompletionScreen.tsx        # 新增：1.5s 完成过渡屏

src/lib/
└── provider-config.ts          # 修改：添加 openai，改默认为 anthropic

src/types/
└── index.ts                    # 可能需要更新 IpcMessages
```

---

## Task 1: 添加 OpenAI Provider 到 provider-config.ts

**Files:**
- Modify: `src/lib/provider-config.ts`

- [ ] **Step 1: 在 PROVIDERS 对象中添加 openai 配置**

在 `bailian` 和 `volcengine` 之间插入：

```typescript
openai: {
  key: 'openai',
  name: 'ChatGPT',
  nameZh: 'ChatGPT',
  category: 'official',
  baseUrl: 'https://api.openai.com/v1',
  authStyle: 'api_key',
  models: {
    opus: 'gpt-4o',
    sonnet: 'gpt-4o-mini',
    haiku: 'gpt-4o-mini',
  },
  modelDisplayNames: {
    opus: 'GPT-4o — 高性能',
    sonnet: 'GPT-4o-mini — 均衡',
    haiku: 'GPT-4o-mini — 快速',
  },
  keyPlaceholder: 'sk-...',
  websiteUrl: 'https://platform.openai.com/api-keys',
},
```

- [ ] **Step 2: 修改 getDefaultProvider 返回 anthropic**

```typescript
export function getDefaultProvider(): ProviderPreset {
  return PROVIDERS['anthropic'];
}
```

- [ ] **Step 3: 运行 TypeScript 检查**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/lib/provider-config.ts
git commit -m "feat: add OpenAI provider and set Anthropic as default"
```

---

## Task 2: 创建 OnboardingShell 组件

**Files:**
- Create: `src/components/OnboardingShell.tsx`

- [ ] **Step 1: 创建 OnboardingShell 组件**

```typescript
'use client';

import { ReactNode } from 'react';

interface OnboardingShellProps {
  currentStep: number;
  totalSteps: number;
  showBack: boolean;
  onBack: () => void;
  children: ReactNode;
}

export function OnboardingShell({ currentStep, totalSteps, showBack, onBack, children }: OnboardingShellProps) {
  return (
    <div className="flex justify-center items-center min-h-screen bg-bg-app pt-8">
      <div className="max-w-md px-10 py-10 w-full">
        {/* 顶部栏：返回按钮 + 进度点 */}
        {showBack && (
          <div className="flex items-center justify-between mb-8">
            <button
              onClick={onBack}
              className="text-text-muted hover:text-text-primary text-sm transition-colors"
            >
              ← 返回
            </button>
            <div className="flex gap-1.5">
              {Array.from({ length: totalSteps }).map((_, i) => (
                <div
                  key={i}
                  className={`w-1.5 h-1.5 rounded-full transition-colors ${
                    i < currentStep
                      ? 'bg-brand/50'
                      : i === currentStep
                        ? 'bg-brand'
                        : 'bg-text-muted/20'
                  }`}
                />
              ))}
            </div>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 运行 TypeScript 检查**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/components/OnboardingShell.tsx
git commit -m "feat: add OnboardingShell component with progress dots and back button"
```

---

## Task 3: 创建 CompletionScreen 组件

**Files:**
- Create: `src/components/CompletionScreen.tsx`

- [ ] **Step 1: 创建 CompletionScreen 组件**

```typescript
'use client';

import { useEffect, useState } from 'react';

interface CompletionScreenProps {
  onComplete: () => void;
}

export function CompletionScreen({ onComplete }: CompletionScreenProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
      onComplete();
    }, 1500);

    return () => clearTimeout(timer);
  }, [onComplete]);

  if (!visible) return null;

  return (
    <div className="flex justify-center items-center min-h-screen bg-bg-app">
      <div className="text-center">
        <h2 className="text-3xl font-semibold text-text-primary mb-3">配置完成！</h2>
        <p className="text-body text-text-muted">按右 Option 开始使用 Aiva</p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 运行 TypeScript 检查**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/components/CompletionScreen.tsx
git commit -m "feat: add CompletionScreen with 1.5s auto-transition"
```

---

## Task 4: 重写 Onboarding.tsx - 基础结构

**Files:**
- Modify: `src/components/Onboarding.tsx`

- [ ] **Step 1: 更新 Step 类型和状态**

替换整个文件的开头部分：

```typescript
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
}
```

- [ ] **Step 2: 运行 TypeScript 检查**

Run: `npx tsc --noEmit`
Expected: No errors (可能有一些未使用变量警告，下一步会解决)

- [ ] **Step 3: Commit**

```bash
git add src/components/Onboarding.tsx
git commit -m "refactor(onboarding): update Step type and add primary providers list"
```

---

## Task 5: 实现 Welcome 步骤

**Files:**
- Modify: `src/components/Onboarding.tsx`

- [ ] **Step 1: 添加 Welcome 步骤的渲染**

在 Onboarding 函数中，在 return 语句前添加：

```typescript
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
          <h2 className="text-page-title text-text-primary mb-3">你好，我是 Aiva</h2>
          <p className="text-body text-text-muted leading-relaxed mb-6">
            可以和你语音交流的个人助手
          </p>
          <Button variant="primary" onClick={() => setStep('accessibility')}>
            好
          </Button>
        </div>
      )}
    </OnboardingShell>
  );
}
```

- [ ] **Step 2: 运行 TypeScript 检查**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/components/Onboarding.tsx
git commit -m "feat(onboarding): implement Welcome step"
```

---

## Task 6: 实现辅助功能步骤（带自动检测跳过）

**Files:**
- Modify: `src/components/Onboarding.tsx`

- [ ] **Step 1: 添加辅助功能相关的状态和效果**

在组件顶部 useState 之后添加：

```typescript
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
```

- [ ] **Step 2: 添加辅助功能步骤的渲染和交互**

在 OnboardingShell 的 children 中添加（在 welcome 步骤之后）：

```typescript
      {step === 'accessibility' && (
        <div className="text-center">
          <div className="mb-6">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-b from-white/10 to-white/5 border border-white/15 text-2xl mb-6">
              ⌥
            </div>
          </div>
          <h2 className="text-page-title text-text-primary mb-3">开启快捷键监听</h2>
          <p className="text-body text-text-muted leading-relaxed mb-6">
            Aiva 需要用右 Option 键来唤起语音输入。
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
```

- [ ] **Step 3: 添加 useRef 导入**

在文件顶部导入中添加：

```typescript
import { useState, useEffect, useRef } from 'react';
```

- [ ] **Step 4: 运行 TypeScript 检查**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add src/components/Onboarding.tsx
git commit -m "feat(onboarding): implement accessibility step with auto-detect and skip"
```

---

## Task 7: 实现火山引擎凭证步骤

**Files:**
- Modify: `src/components/Onboarding.tsx`

- [ ] **Step 1: 添加保存火山引擎凭证的函数**

在辅助功能步骤之后添加：

```typescript
      {step === 'volcengine' && (
        <div className="text-center">
          <h2 className="text-page-title text-text-primary mb-3">语音识别与合成配置</h2>
          <p className="text-body text-text-muted leading-relaxed mb-6">
            Aiva 使用火山引擎进行语音识别和语音合成。请填写凭证。
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
              // TODO: 打开教程链接
              console.log('打开火山引擎教程');
            }}
            className="block mx-auto mt-3 bg-transparent border-none text-brand text-body-sm cursor-pointer hover:underline"
          >
            如何获取凭证？
          </button>
        </div>
      )}
```

- [ ] **Step 2: 运行 TypeScript 检查**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/components/Onboarding.tsx
git commit -m "feat(onboarding): implement volcengine credentials step"
```

---

## Task 8: 实现 Provider + Key 步骤（垂直列表 + 更多展开）

**Files:**
- Modify: `src/components/Onboarding.tsx`

- [ ] **Step 1: 添加获取"更多"provider 的计算逻辑**

在组件顶部添加：

```typescript
  // 获取"更多" provider 列表（排除主要 provider）
  const getMoreProviders = (): ProviderOption[] => {
    const primaryKeys = new Set(PRIMARY_PROVIDERS.map(p => p.key));
    return getAllProviders()
      .filter(p => !primaryKeys.has(p.key))
      .map(p => ({ key: p.key, name: p.name }));
  };
```

- [ ] **Step 2: 添加验证 API Key 的函数**

在组件中添加（在 handleBack 之后）：

```typescript
  const handleValidateApiKey = async () => {
    setError('');
    setSaving(true);
    try {
      await ipcRenderer?.invoke('onboarding:validate-api-key', {
        key: apiKey.trim(),
        providerKey: selectedProvider,
      });
      setStep('completion');
    } catch {
      setError('API Key 不正确');
    } finally {
      setSaving(false);
    }
  };
```

- [ ] **Step 3: 添加 Provider + Key 步骤的渲染**

在火山引擎步骤之后添加：

```typescript
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
              className="w-full flex items-center justify-between p-3 rounded-lg border border-dashed border-border-default bg-bg-surface-0/50"
            >
              <span className="text-body-sm text-text-muted">更多服务商</span>
              <span className="text-body-sm text-text-muted/50">
                +{getMoreProviders().length}
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

          {/* API Key 输入 */}
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
```

- [ ] **Step 4: 运行 TypeScript 检查**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add src/components/Onboarding.tsx
git commit -m "feat(onboarding): implement provider selection with vertical list and expandable more section"
```

---

## Task 9: 清理和验证

**Files:**
- Test: `src/components/Onboarding.tsx`

- [ ] **Step 1: 运行开发服务器验证流程**

Run: `npm run electron:dev`

手动验证：
1. Welcome 屏显示正确文案
2. 点击"好"进入辅助功能页
3. 辅助功能页显示 ⌥ 图标和新文案
4. 已授权时自动跳过辅助功能页
5. 火山引擎页显示新文案和教程链接
6. 输入为空时按钮禁用
7. Provider 页显示垂直列表，Anthropic 默认选中
8. "更多服务商"展开显示其他 provider
9. 完成后显示 1.5s 过渡屏

- [ ] **Step 2: 运行 TypeScript 检查**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: 删除不再使用的代码**

确认以下已从 Onboarding.tsx 中删除：
- CWD 相关状态和步骤
- 独立 Done 步骤（现在用 CompletionScreen）
- 旧的 2×3 grid provider 选择

- [ ] **Step 4: 最终 Commit**

```bash
git add src/components/Onboarding.tsx
git commit -m "refactor(onboarding): complete redesign - 4 steps + 1.5s completion"
```

---

## Task 10: 添加教程链接占位符

**Files:**
- Modify: `src/components/Onboarding.tsx`

- [ ] **Step 1: 定义教程链接常量**

在文件顶部添加：

```typescript
// TODO: 替换为实际教程链接
const VOLCENGINE_TUTORIAL_URL = 'https://TODO_ADD_TUTORIAL_URL';
```

- [ ] **Step 2: 实现打开教程链接**

替换火山引擎步骤中的教程按钮 onClick：

```typescript
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
```

- [ ] **Step 3: 运行 TypeScript 检查**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/components/Onboarding.tsx
git commit -m "feat(onboarding): add volcengine tutorial link (placeholder)"
```

---

## 完成检查清单

- [ ] 所有 4 屏按设计文档实现
- [ ] Welcome 屏：新文案，无进度点
- [ ] 辅助功能屏：⌥ 图标，新文案，自动检测跳过
- [ ] 火山引擎屏：新文案（明确 ASR+TTS），教程链接，输入为空时禁用按钮
- [ ] Provider 屏：垂直列表，Anthropic 默认，更多服务商可展开
- [ ] 完成：1.5s 过渡屏显示两行文案
- [ ] 删除：CWD 页、独立 Done 页
- [ ] OpenAI provider 已添加
- [ ] 默认 provider 改为 Anthropic
- [ ] TypeScript 无错误
- [ ] 开发环境手动测试通过
