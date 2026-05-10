# Multi-Provider Extension Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend Aiva's AI provider support from 3 hardcoded providers to 20+ via a config-driven registry, with per-provider key storage, redesigned settings UI, and updated onboarding flow.

**Architecture:** Config-driven preset registry in `provider-config.ts` — each provider is a `ProviderPreset` object defining baseUrl, authStyle, models, and UI metadata. Claude Agent SDK receives env vars built from the active preset. API keys stored as per-provider encrypted files in `~/.aiva/secure/`.

**Tech Stack:** TypeScript, Electron (safeStorage for key encryption), Next.js 15 (React UI), existing UI component library (SummaryCard, StatusBadge, Select, etc.)

**Spec:** `docs/superpowers/specs/2026-05-10-multi-provider-design.md`

---

### Task 1: Rewrite Provider Registry

**Files:**
- Modify: `src/lib/provider-config.ts` (full rewrite)
- Modify: `src/__tests__/provider-config.test.ts` (full rewrite)

This is the foundation — all other tasks depend on the new interface and preset data.

- [ ] **Step 1: Rewrite `src/lib/provider-config.ts`**

Replace the entire file with the new preset interface and expanded provider list:

```typescript
export interface ProviderPreset {
  key: string;
  name: string;
  nameZh: string;
  category: 'official' | 'china' | 'aggregator' | 'cloud';
  baseUrl: string;
  authStyle: 'api_key' | 'auth_token';
  models: { opus: string; sonnet: string; haiku: string };
  modelDisplayNames: { opus: string; sonnet: string; haiku: string };
  envOverrides?: Record<string, string>;
  keyPlaceholder: string;
  websiteUrl?: string;
  timeout?: number;
}

export type ProviderCategory = ProviderPreset['category'];

const PROVIDERS: Record<string, ProviderPreset> = {
  anthropic: {
    key: 'anthropic',
    name: 'Anthropic',
    nameZh: 'Anthropic',
    category: 'official',
    baseUrl: '',
    authStyle: 'api_key',
    models: {
      opus: 'claude-opus-4-7',
      sonnet: 'claude-sonnet-4-6',
      haiku: 'claude-haiku-4-5-20251001',
    },
    modelDisplayNames: {
      opus: 'Claude Opus 4.7 — 高性能',
      sonnet: 'Claude Sonnet 4.6 — 均衡',
      haiku: 'Claude Haiku 4.5 — 快速',
    },
    keyPlaceholder: 'sk-ant-...',
    websiteUrl: 'https://console.anthropic.com/settings/keys',
  },
  'glm-cn': {
    key: 'glm-cn',
    name: 'GLM (CN)',
    nameZh: 'GLM (国内)',
    category: 'china',
    baseUrl: 'https://open.bigmodel.cn/api/anthropic',
    authStyle: 'auth_token',
    models: {
      opus: 'glm-5.1',
      sonnet: 'glm-5-turbo',
      haiku: 'glm-4.5-air',
    },
    modelDisplayNames: {
      opus: 'GLM-5.1 — 高性能',
      sonnet: 'GLM-5-Turbo — 均衡',
      haiku: 'GLM-4.5-Air — 快速',
    },
    envOverrides: { ANTHROPIC_TIMEOUT: '3000000' },
    keyPlaceholder: '从 open.bigmodel.cn 获取您的 API Key',
    websiteUrl: 'https://open.bigmodel.cn/usercenter/api-keys',
  },
  'glm-global': {
    key: 'glm-global',
    name: 'GLM (Global)',
    nameZh: 'GLM (国际)',
    category: 'china',
    baseUrl: 'https://api.z.ai/api/anthropic',
    authStyle: 'auth_token',
    models: {
      opus: 'glm-5.1',
      sonnet: 'glm-5-turbo',
      haiku: 'glm-4.5-air',
    },
    modelDisplayNames: {
      opus: 'GLM-5.1 — 高性能',
      sonnet: 'GLM-5-Turbo — 均衡',
      haiku: 'GLM-4.5-Air — 快速',
    },
    envOverrides: { ANTHROPIC_TIMEOUT: '3000000' },
    keyPlaceholder: '从 open.bigmodel.cn 获取您的 API Key',
    websiteUrl: 'https://open.bigmodel.cn/usercenter/api-keys',
  },
  deepseek: {
    key: 'deepseek',
    name: 'DeepSeek',
    nameZh: 'DeepSeek',
    category: 'china',
    baseUrl: 'https://api.deepseek.com/anthropic',
    authStyle: 'auth_token',
    models: {
      opus: 'deepseek-reasoner',
      sonnet: 'deepseek-chat',
      haiku: 'deepseek-chat',
    },
    modelDisplayNames: {
      opus: 'DeepSeek-Reasoner — 推理',
      sonnet: 'DeepSeek-Chat — 均衡',
      haiku: 'DeepSeek-Chat — 快速',
    },
    keyPlaceholder: '从 platform.deepseek.com 获取您的 API Key',
    websiteUrl: 'https://platform.deepseek.com/api_keys',
  },
  moonshot: {
    key: 'moonshot',
    name: 'Moonshot',
    nameZh: 'Moonshot (Kimi)',
    category: 'china',
    baseUrl: 'https://api.moonshot.cn/anthropic',
    authStyle: 'auth_token',
    models: {
      opus: 'moonshot-v1-auto',
      sonnet: 'moonshot-v1-auto',
      haiku: 'moonshot-v1-auto',
    },
    modelDisplayNames: {
      opus: 'Moonshot-V1-Auto — 自动',
      sonnet: 'Moonshot-V1-Auto — 均衡',
      haiku: 'Moonshot-V1-Auto — 快速',
    },
    keyPlaceholder: '从 platform.moonshot.cn 获取您的 API Key',
    websiteUrl: 'https://platform.moonshot.cn/console/api-keys',
  },
  'minimax-cn': {
    key: 'minimax-cn',
    name: 'MiniMax (CN)',
    nameZh: 'MiniMax (国内)',
    category: 'china',
    baseUrl: 'https://api.minimaxi.com/anthropic',
    authStyle: 'auth_token',
    models: {
      opus: 'MiniMax-Text-01',
      sonnet: 'MiniMax-Text-01',
      haiku: 'MiniMax-Text-01',
    },
    modelDisplayNames: {
      opus: 'MiniMax-Text-01 — 高性能',
      sonnet: 'MiniMax-Text-01 — 均衡',
      haiku: 'MiniMax-Text-01 — 快速',
    },
    keyPlaceholder: '从 platform.minimaxi.com 获取您的 API Key',
    websiteUrl: 'https://platform.minimaxi.com/',
  },
  'minimax-global': {
    key: 'minimax-global',
    name: 'MiniMax (Global)',
    nameZh: 'MiniMax (国际)',
    category: 'china',
    baseUrl: 'https://api.minimax.io/anthropic',
    authStyle: 'auth_token',
    models: {
      opus: 'MiniMax-Text-01',
      sonnet: 'MiniMax-Text-01',
      haiku: 'MiniMax-Text-01',
    },
    modelDisplayNames: {
      opus: 'MiniMax-Text-01 — 高性能',
      sonnet: 'MiniMax-Text-01 — 均衡',
      haiku: 'MiniMax-Text-01 — 快速',
    },
    keyPlaceholder: '从 api.minimax.io 获取您的 API Key',
    websiteUrl: 'https://www.minimax.io/',
  },
  kimi: {
    key: 'kimi',
    name: 'Kimi',
    nameZh: 'Kimi',
    category: 'china',
    baseUrl: 'https://api.kimi.com/coding',
    authStyle: 'auth_token',
    models: {
      opus: 'kimi-latest',
      sonnet: 'kimi-latest',
      haiku: 'kimi-latest',
    },
    modelDisplayNames: {
      opus: 'Kimi-Latest — 高性能',
      sonnet: 'Kimi-Latest — 均衡',
      haiku: 'Kimi-Latest — 快速',
    },
    keyPlaceholder: '从 platform.kimi.com 获取您的 API Key',
    websiteUrl: 'https://platform.kimi.com/',
  },
  bailian: {
    key: 'bailian',
    name: 'Bailian',
    nameZh: '通义千问 (百炼)',
    category: 'china',
    baseUrl: 'https://coding.dashscope.aliyuncs.com/apps/anthropic',
    authStyle: 'auth_token',
    models: {
      opus: 'qwen3-coder-plus',
      sonnet: 'qwen3-coder-plus',
      haiku: 'qwen3-coder-lite',
    },
    modelDisplayNames: {
      opus: 'Qwen3-Coder-Plus — 高性能',
      sonnet: 'Qwen3-Coder-Plus — 均衡',
      haiku: 'Qwen3-Coder-Lite — 快速',
    },
    keyPlaceholder: '从 bailian.console.aliyun.com 获取您的 API Key',
    websiteUrl: 'https://bailian.console.aliyun.com/',
  },
  volcengine: {
    key: 'volcengine',
    name: 'Volcengine',
    nameZh: '火山引擎 (豆包)',
    category: 'china',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/coding',
    authStyle: 'auth_token',
    models: {
      opus: 'doubao-1-5-pro-256k',
      sonnet: 'doubao-1-5-pro-256k',
      haiku: 'doubao-1-5-lite-32k',
    },
    modelDisplayNames: {
      opus: 'Doubao-1.5-Pro — 高性能',
      sonnet: 'Doubao-1.5-Pro — 均衡',
      haiku: 'Doubao-1.5-Lite — 快速',
    },
    keyPlaceholder: '输入火山引擎方舟 API Key',
    websiteUrl: 'https://console.volcengine.com/ark',
  },
  mimo: {
    key: 'mimo',
    name: 'MiMo',
    nameZh: '小米 MiMo',
    category: 'china',
    baseUrl: 'https://api.xiaomimimo.com/anthropic',
    authStyle: 'auth_token',
    models: {
      opus: 'MiMo-7B-RL',
      sonnet: 'MiMo-7B-RL',
      haiku: 'MiMo-7B-RL',
    },
    modelDisplayNames: {
      opus: 'MiMo-7B-RL — 高性能',
      sonnet: 'MiMo-7B-RL — 均衡',
      haiku: 'MiMo-7B-RL — 快速',
    },
    keyPlaceholder: '输入小米 MiMo API Key',
  },
  openrouter: {
    key: 'openrouter',
    name: 'OpenRouter',
    nameZh: 'OpenRouter',
    category: 'aggregator',
    baseUrl: 'https://openrouter.ai/api/anthropic',
    authStyle: 'api_key',
    models: {
      opus: 'anthropic/claude-opus-4-7',
      sonnet: 'anthropic/claude-sonnet-4-6',
      haiku: 'anthropic/claude-haiku-4-5-20251001',
    },
    modelDisplayNames: {
      opus: 'Claude Opus 4.7 — 高性能',
      sonnet: 'Claude Sonnet 4.6 — 均衡',
      haiku: 'Claude Haiku 4.5 — 快速',
    },
    keyPlaceholder: '从 openrouter.ai 获取您的 API Key',
    websiteUrl: 'https://openrouter.ai/settings/keys',
  },
  siliconflow: {
    key: 'siliconflow',
    name: 'SiliconFlow',
    nameZh: 'SiliconFlow',
    category: 'aggregator',
    baseUrl: 'https://api.siliconflow.cn',
    authStyle: 'api_key',
    models: {
      opus: 'Pro/deepseek-ai/DeepSeek-R1',
      sonnet: 'deepseek-ai/DeepSeek-V3',
      haiku: 'deepseek-ai/DeepSeek-V3',
    },
    modelDisplayNames: {
      opus: 'DeepSeek-R1 — 推理',
      sonnet: 'DeepSeek-V3 — 均衡',
      haiku: 'DeepSeek-V3 — 快速',
    },
    keyPlaceholder: '从 cloud.siliconflow.cn 获取您的 API Key',
    websiteUrl: 'https://cloud.siliconflow.cn/account/ak',
  },
};

export function getProvider(key: string): ProviderPreset {
  return PROVIDERS[key] ?? PROVIDERS['glm-cn'];
}

export function getDefaultProvider(): ProviderPreset {
  return PROVIDERS['glm-cn'];
}

export function getAllProviders(): ProviderPreset[] {
  return Object.values(PROVIDERS);
}

export function getProvidersByCategory(category: ProviderCategory): ProviderPreset[] {
  return getAllProviders().filter(p => p.category === category);
}

export function resolveModel(providerKey: string, role: string): string {
  const provider = getProvider(providerKey);
  const modelId = provider.models[role as keyof typeof provider.models];
  return modelId ?? provider.models.opus;
}

export function getValidateEndpoint(provider: ProviderPreset): string {
  const base = provider.baseUrl || 'https://api.anthropic.com';
  return `${base}/v1/messages`;
}

export function buildSdkEnv(providerKey: string, apiKey: string, modelRole: string): Record<string, string> {
  const provider = getProvider(providerKey);
  const modelId = resolveModel(providerKey, modelRole);

  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined && !k.startsWith('ANTHROPIC_')) {
      env[k] = v;
    }
  }

  env.CLAUDE_CONFIG_DIR = `${process.env.HOME}/.aiva`;

  if (provider.authStyle === 'auth_token') {
    env.ANTHROPIC_AUTH_TOKEN = apiKey;
  } else {
    env.ANTHROPIC_API_KEY = apiKey;
  }

  if (provider.baseUrl) {
    env.ANTHROPIC_BASE_URL = provider.baseUrl;
  }

  env.ANTHROPIC_MODEL = modelId;

  for (const [role, modelId] of Object.entries(provider.models)) {
    const key = `ANTHROPIC_DEFAULT_${role.toUpperCase()}_MODEL`;
    env[key] = modelId;
  }

  if (provider.envOverrides) {
    Object.assign(env, provider.envOverrides);
  }

  return env;
}
```

- [ ] **Step 2: Rewrite `src/__tests__/provider-config.test.ts`**

```typescript
import {
  getProvider,
  getDefaultProvider,
  getAllProviders,
  getProvidersByCategory,
  resolveModel,
  getValidateEndpoint,
  buildSdkEnv,
} from '../lib/provider-config';

// ─── getProvider ────────────────────────────────────────

test('getProvider returns GLM CN for known key', () => {
  const p = getProvider('glm-cn');
  expect(p.key).toBe('glm-cn');
  expect(p.nameZh).toBe('GLM (国内)');
  expect(p.authStyle).toBe('auth_token');
  expect(p.baseUrl).toBe('https://open.bigmodel.cn/api/anthropic');
});

test('getProvider returns Anthropic for anthropic key', () => {
  const p = getProvider('anthropic');
  expect(p.key).toBe('anthropic');
  expect(p.authStyle).toBe('api_key');
  expect(p.baseUrl).toBe('');
});

test('getProvider returns default (glm-cn) for unknown key', () => {
  const p = getProvider('nonexistent');
  expect(p.key).toBe('glm-cn');
});

// ─── getDefaultProvider ─────────────────────────────────

test('getDefaultProvider returns glm-cn', () => {
  expect(getDefaultProvider().key).toBe('glm-cn');
});

// ─── getAllProviders ────────────────────────────────────

test('getAllProviders returns all registered providers', () => {
  const all = getAllProviders();
  expect(all.length).toBeGreaterThanOrEqual(13);
  const keys = all.map(p => p.key);
  expect(keys).toContain('glm-cn');
  expect(keys).toContain('glm-global');
  expect(keys).toContain('anthropic');
  expect(keys).toContain('deepseek');
  expect(keys).toContain('openrouter');
});

// ─── getProvidersByCategory ─────────────────────────────

test('getProvidersByCategory filters by category', () => {
  const china = getProvidersByCategory('china');
  expect(china.length).toBeGreaterThanOrEqual(8);
  expect(china.every(p => p.category === 'china')).toBe(true);

  const aggregators = getProvidersByCategory('aggregator');
  expect(aggregators.length).toBeGreaterThanOrEqual(2);
  expect(aggregators.every(p => p.category === 'aggregator')).toBe(true);
});

// ─── resolveModel ───────────────────────────────────────

test('resolveModel returns correct GLM model for opus', () => {
  expect(resolveModel('glm-cn', 'opus')).toBe('glm-5.1');
});

test('resolveModel returns correct GLM model for sonnet', () => {
  expect(resolveModel('glm-cn', 'sonnet')).toBe('glm-5-turbo');
});

test('resolveModel returns correct GLM model for haiku', () => {
  expect(resolveModel('glm-cn', 'haiku')).toBe('glm-4.5-air');
});

test('resolveModel returns correct Anthropic model for opus', () => {
  expect(resolveModel('anthropic', 'opus')).toBe('claude-opus-4-7');
});

test('resolveModel falls back to opus model for unknown role', () => {
  expect(resolveModel('glm-cn', 'nonexistent')).toBe('glm-5.1');
});

// ─── getValidateEndpoint ────────────────────────────────

test('getValidateEndpoint computes from baseUrl', () => {
  const p = getProvider('glm-cn');
  expect(getValidateEndpoint(p)).toBe('https://open.bigmodel.cn/api/anthropic/v1/messages');
});

test('getValidateEndpoint uses anthropic default for empty baseUrl', () => {
  const p = getProvider('anthropic');
  expect(getValidateEndpoint(p)).toBe('https://api.anthropic.com/v1/messages');
});

// ─── buildSdkEnv ────────────────────────────────────────

test('buildSdkEnv sets ANTHROPIC_AUTH_TOKEN for GLM CN', () => {
  const env = buildSdkEnv('glm-cn', 'test-key-123', 'opus');
  expect(env.ANTHROPIC_AUTH_TOKEN).toBe('test-key-123');
  expect(env.ANTHROPIC_API_KEY).toBeUndefined();
});

test('buildSdkEnv sets ANTHROPIC_BASE_URL for GLM CN', () => {
  const env = buildSdkEnv('glm-cn', 'key', 'opus');
  expect(env.ANTHROPIC_BASE_URL).toBe('https://open.bigmodel.cn/api/anthropic');
});

test('buildSdkEnv sets ANTHROPIC_API_KEY for Anthropic', () => {
  const env = buildSdkEnv('anthropic', 'sk-ant-test', 'sonnet');
  expect(env.ANTHROPIC_API_KEY).toBe('sk-ant-test');
  expect(env.ANTHROPIC_AUTH_TOKEN).toBeUndefined();
});

test('buildSdkEnv does not set ANTHROPIC_BASE_URL for Anthropic', () => {
  const env = buildSdkEnv('anthropic', 'key', 'opus');
  expect(env.ANTHROPIC_BASE_URL).toBeUndefined();
});

test('buildSdkEnv sets ANTHROPIC_MODEL to resolved model', () => {
  const env = buildSdkEnv('glm-cn', 'key', 'sonnet');
  expect(env.ANTHROPIC_MODEL).toBe('glm-5-turbo');
});

test('buildSdkEnv sets default model overrides per role', () => {
  const env = buildSdkEnv('glm-cn', 'key', 'opus');
  expect(env.ANTHROPIC_DEFAULT_OPUS_MODEL).toBe('glm-5.1');
  expect(env.ANTHROPIC_DEFAULT_SONNET_MODEL).toBe('glm-5-turbo');
  expect(env.ANTHROPIC_DEFAULT_HAIKU_MODEL).toBe('glm-4.5-air');
});

test('buildSdkEnv strips existing ANTHROPIC_* vars from process.env', () => {
  const original = process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_API_KEY = 'old-key';
  const env = buildSdkEnv('glm-cn', 'new-key', 'opus');
  expect(env.ANTHROPIC_AUTH_TOKEN).toBe('new-key');
  if (original !== undefined) {
    process.env.ANTHROPIC_API_KEY = original;
  } else {
    delete process.env.ANTHROPIC_API_KEY;
  }
});

test('buildSdkEnv includes timeout override for GLM', () => {
  const env = buildSdkEnv('glm-cn', 'key', 'opus');
  expect(env.ANTHROPIC_TIMEOUT).toBe('3000000');
});

test('buildSdkEnv does not include timeout for Anthropic', () => {
  const env = buildSdkEnv('anthropic', 'key', 'opus');
  expect(env.ANTHROPIC_TIMEOUT).toBeUndefined();
});

test('buildSdkEnv sets CLAUDE_CONFIG_DIR to ~/.aiva', () => {
  const env = buildSdkEnv('glm-cn', 'key', 'opus');
  expect(env.CLAUDE_CONFIG_DIR).toBe(`${process.env.HOME}/.aiva`);
});

// ─── provider preset consistency ─────────────────────────

test('every provider has all 3 model roles', () => {
  for (const provider of getAllProviders()) {
    expect(provider.models).toHaveProperty('opus');
    expect(provider.models).toHaveProperty('sonnet');
    expect(provider.models).toHaveProperty('haiku');
  }
});

test('every provider has all 3 model display names', () => {
  for (const provider of getAllProviders()) {
    expect(provider.modelDisplayNames).toHaveProperty('opus');
    expect(provider.modelDisplayNames).toHaveProperty('sonnet');
    expect(provider.modelDisplayNames).toHaveProperty('haiku');
  }
});

test('every provider has required fields', () => {
  for (const provider of getAllProviders()) {
    expect(provider.key).toBeTruthy();
    expect(provider.name).toBeTruthy();
    expect(provider.nameZh).toBeTruthy();
    expect(provider.category).toBeTruthy();
    expect(provider.authStyle).toMatch(/^(api_key|auth_token)$/);
    expect(provider.keyPlaceholder).toBeTruthy();
  }
});
```

- [ ] **Step 3: Run tests to verify**

Run: `npx jest src/__tests__/provider-config.test.ts --verbose`
Expected: All tests PASS (should be ~25 tests)

- [ ] **Step 4: Commit**

```bash
git add src/lib/provider-config.ts src/__tests__/provider-config.test.ts
git commit -m "feat: expand provider registry to 13 providers with new preset interface"
```

---

### Task 2: Update Keychain for Per-Provider Key Storage

**Files:**
- Modify: `src/lib/keychain.ts`

- [ ] **Step 1: Rewrite `src/lib/keychain.ts`**

Replace the entire file (preserve Volcengine section):

```typescript
// 注意：此文件在 Electron main process 中使用
// safeStorage 在 renderer 中不可用

import { safeStorage } from 'electron';
import fs from 'fs';
import path from 'path';
import { app } from 'electron';

const KEYCHAIN_DIR = path.join(app.getPath('home'), '.aiva', 'secure');
const LEGACY_KEY_FILE = path.join(KEYCHAIN_DIR, 'anthropic-key.enc');
const OLD_KEY_FILE = path.join(KEYCHAIN_DIR, 'api-key.enc');

function keyPath(providerKey: string): string {
  if (!/^[a-z0-9-]+$/.test(providerKey)) throw new Error(`Invalid provider key: ${providerKey}`);
  return path.join(KEYCHAIN_DIR, `api-key-${providerKey}.enc`);
}

// One-time migration: rename legacy key file chain
// anthropic-key.enc → api-key.enc → api-key-{currentProvider}.enc
export function migrateKeyFiles(currentProviderKey: string): void {
  // Step 1: legacy anthropic-key.enc → api-key.enc
  if (fs.existsSync(LEGACY_KEY_FILE) && !fs.existsSync(OLD_KEY_FILE)) {
    fs.renameSync(LEGACY_KEY_FILE, OLD_KEY_FILE);
  }
  // Step 2: api-key.enc → api-key-{currentProvider}.enc
  const newPath = keyPath(currentProviderKey);
  if (fs.existsSync(OLD_KEY_FILE) && !fs.existsSync(newPath)) {
    fs.renameSync(OLD_KEY_FILE, newPath);
  }
}

export function saveApiKey(key: string, providerKey: string): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Encryption not available on this system');
  }
  if (!fs.existsSync(KEYCHAIN_DIR)) fs.mkdirSync(KEYCHAIN_DIR, { recursive: true });
  const encrypted = safeStorage.encryptString(key);
  fs.writeFileSync(keyPath(providerKey), encrypted);
}

export function loadApiKey(providerKey: string): string | null {
  const filePath = keyPath(providerKey);
  if (!fs.existsSync(filePath)) return null;
  if (!safeStorage.isEncryptionAvailable()) return null;
  const encrypted = fs.readFileSync(filePath);
  return safeStorage.decryptString(encrypted);
}

export function deleteApiKey(providerKey: string): void {
  const filePath = keyPath(providerKey);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
}

export function hasApiKey(providerKey: string): boolean {
  return fs.existsSync(keyPath(providerKey));
}

const VOLCENGINE_CRED_FILE = path.join(KEYCHAIN_DIR, 'volcengine.json');

interface VolcengineCredentials {
  appId: string;
  accessToken: string;
}

export function saveVolcengineCredentials(appId: string, accessToken: string): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Encryption not available on this system');
  }
  if (!fs.existsSync(KEYCHAIN_DIR)) fs.mkdirSync(KEYCHAIN_DIR, { recursive: true });
  const json = JSON.stringify({ appId, accessToken });
  const encrypted = safeStorage.encryptString(json);
  fs.writeFileSync(VOLCENGINE_CRED_FILE, encrypted);
}

export function loadVolcengineCredentials(): VolcengineCredentials | null {
  if (!fs.existsSync(VOLCENGINE_CRED_FILE)) return null;
  if (!safeStorage.isEncryptionAvailable()) return null;
  const encrypted = fs.readFileSync(VOLCENGINE_CRED_FILE);
  const json = safeStorage.decryptString(encrypted);
  return JSON.parse(json);
}

export function hasVolcengineCredentials(): boolean {
  return fs.existsSync(VOLCENGINE_CRED_FILE);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/keychain.ts
git commit -m "feat: per-provider API key storage with migration chain"
```

---

### Task 3: Update Types

**Files:**
- Modify: `src/types/index.ts:61-73`

- [ ] **Step 1: Change `ProviderKey` type**

In `src/types/index.ts`, change line 61:

From:
```typescript
export type ProviderKey = 'glm-cn' | 'glm-global' | 'anthropic';
```

To:
```typescript
export type ProviderKey = string;
```

The `AppSettings` interface on line 73 already uses `provider?: ProviderKey` — no change needed there.

- [ ] **Step 2: Commit**

```bash
git add src/types/index.ts
git commit -m "refactor: widen ProviderKey type to string for dynamic providers"
```

---

### Task 4: Update Electron Main Process

**Files:**
- Modify: `electron/main.ts`

This is the largest single-file change. Covers: import updates, key migration, IPC handler rewrites, startup check, auth header fix, `loadApiKey` call sites.

- [ ] **Step 1: Update imports**

In `electron/main.ts`, change line 18 from:

```typescript
import { getProvider, getDefaultProvider, resolveModel } from '../src/lib/provider-config';
```

To:

```typescript
import { getProvider, getDefaultProvider, resolveModel, getValidateEndpoint, getAllProviders } from '../src/lib/provider-config';
import { migrateKeyFiles } from '../src/lib/keychain';
```

(Keep existing `loadApiKey`, `saveApiKey`, `hasApiKey` imports from keychain — they still exist with new signatures.)

- [ ] **Step 2: Add migration call after app ready**

Find where `migrateKeyFile()` is called (search for `migrateKeyFile` in the file). Replace it with:

```typescript
const settings = loadSettings();
migrateKeyFiles(settings.provider || 'glm-cn');
```

This replaces the old `migrateKeyFile()` call with the new chain migration.

- [ ] **Step 3: Update `settings:load` IPC handler**

Find the `settings:load` handler (around line 1079). Change from:

```typescript
ipcMain.handle('settings:load', () => {
  const settings = loadSettings();
  return { ...settings, hasApiKey: hasApiKey() };
});
```

To:

```typescript
ipcMain.handle('settings:load', () => {
  const settings = loadSettings();
  return {
    ...settings,
    hasApiKey: hasApiKey(settings.provider || 'glm-cn'),
    apiKeyStatus: Object.fromEntries(
      getAllProviders().map(p => [p.key, hasApiKey(p.key)])
    ),
  };
});
```

- [ ] **Step 4: Update `settings:save-api-key` IPC handler**

Find the handler (around line 1084). Replace the entire handler:

```typescript
ipcMain.handle('settings:save-api-key', async (_, { key, providerKey }: { key: string; providerKey: string }) => {
  const provider = getProvider(providerKey);
  const headers: Record<string, string> = {
    'anthropic-version': '2023-06-01',
    'content-type': 'application/json',
  };
  if (provider.authStyle === 'auth_token') {
    headers['authorization'] = `Bearer ${key}`;
  } else {
    headers['x-api-key'] = key;
  }
  const response = await fetch(getValidateEndpoint(provider), {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: provider.models.haiku,
      max_tokens: 1,
      messages: [{ role: 'user', content: 'hi' }],
    }),
  });
  if (!response.ok) throw new Error('Invalid API key');
  saveApiKey(key, providerKey);
});
```

- [ ] **Step 5: Update `onboarding:validate-api-key` IPC handler**

Find the handler (around line 1125). Replace the entire handler:

```typescript
ipcMain.handle('onboarding:validate-api-key', async (_, { key, providerKey }: { key: string; providerKey: string }) => {
  const provider = getProvider(providerKey);
  log.info(`API Key 验证开始, provider: ${provider.key}, endpoint: ${getValidateEndpoint(provider)}`);
  const headers: Record<string, string> = {
    'anthropic-version': '2023-06-01',
    'content-type': 'application/json',
  };
  if (provider.authStyle === 'auth_token') {
    headers['authorization'] = `Bearer ${key}`;
  } else {
    headers['x-api-key'] = key;
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  let response: Response;
  try {
    response = await fetch(getValidateEndpoint(provider), {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: provider.models.haiku,
        max_tokens: 1,
        messages: [{ role: 'user', content: 'hi' }],
      }),
      signal: controller.signal,
    });
  } catch (e: any) {
    if (e.name === 'AbortError') {
      log.error('API Key 验证超时 (15s)');
      throw new Error('验证请求超时，请检查网络连接');
    }
    log.error('API Key 验证网络错误:', e.message);
    throw new Error('网络请求失败，请检查网络连接');
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    log.error(`API Key 验证失败, status: ${response.status}, body: ${body}`);
    throw new Error('Invalid API key');
  }
  saveApiKey(key, providerKey);
  const settings = loadSettings();
  saveSettings({ ...settings, provider: provider.key });
  log.info('API Key 验证成功并已保存');
});
```

- [ ] **Step 6: Update `executePrompt` key loading**

Find `const apiKey = loadApiKey();` (around line 621). Change to:

```typescript
const apiKey = loadApiKey(settings.provider || 'glm-cn');
```

- [ ] **Step 7: Update post-execution key loading**

Find `const ak = loadApiKey();` (around line 847). Change to:

```typescript
const ak = loadApiKey(settings.provider || 'glm-cn');
```

Note: `settings` is already in scope from `executePrompt` — verify the variable name matches.

- [ ] **Step 8: Update startup onboarding check**

Find `const needsOnboarding = !hasApiKey();` (around line 1656). Change to:

```typescript
const startupSettings = loadSettings();
const needsOnboarding = !hasApiKey(startupSettings.provider || 'glm-cn');
```

Use a different variable name (`startupSettings`) if `settings` is already used in the enclosing scope.

- [ ] **Step 9: Build and verify compilation**

Run: `npm run build:electron`
Expected: Build succeeds with no TypeScript errors.

- [ ] **Step 10: Commit**

```bash
git add electron/main.ts
git commit -m "feat: update electron main for per-provider keys and auth header fix"
```

---

### Task 5: Update Claude Client Types

**Files:**
- Modify: `src/lib/claude-client.ts:2`

- [ ] **Step 1: Verify import**

The file imports `buildSdkEnv` from `./provider-config`. The function signature hasn't changed (`providerKey: string` was already `string`). No code change needed — just verify it compiles.

If there are any explicit `ProviderKey` type references in this file, remove them. The parameter `providerKey: string` is already generic.

- [ ] **Step 2: Verify compilation**

Run: `npm run build`
Expected: No errors related to claude-client.ts.

- [ ] **Step 3: Commit (only if changes were needed)**

Only commit if actual code changes were made. Otherwise skip this step.

---

### Task 6: Rewrite Provider Settings Page

**Files:**
- Modify: `src/app/(main)/settings/provider/page.tsx` (full rewrite)

- [ ] **Step 1: Rewrite the provider settings page**

Replace the entire file:

```tsx
'use client';

import { useState, useEffect } from 'react';
import { getIpcRenderer } from '@/lib/electron-ipc';
import { PageHeader } from '@/components/ui/PageHeader';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { SingleLineInput } from '@/components/ui/SingleLineInput';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { BottomActionBar } from '@/components/ui/BottomActionBar';
import { StatusBadge } from '@/components/ui/StatusBadge';

// Import provider data from registry (works in renderer via @/ alias)
import {
  getProvider,
  getAllProviders,
  getProvidersByCategory,
  type ProviderPreset,
  type ProviderCategory,
} from '@/lib/provider-config';

const CATEGORY_LABELS: Record<ProviderCategory, string> = {
  official: '官方',
  china: '国内',
  aggregator: '聚合平台',
  cloud: '云平台',
};

const CATEGORY_ORDER: ProviderCategory[] = ['official', 'china', 'aggregator', 'cloud'];

interface SettingsData {
  provider: string;
  modelPreset: string;
  apiKeyStatus: Record<string, boolean>;
}

export default function ProviderSettingsPage() {
  const [selectedProvider, setSelectedProvider] = useState('glm-cn');
  const [selectedModel, setSelectedModel] = useState('opus');
  const [apiKeyStatus, setApiKeyStatus] = useState<Record<string, boolean>>({});
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [initialProvider, setInitialProvider] = useState('glm-cn');
  const [initialModel, setInitialModel] = useState('opus');

  useEffect(() => {
    getIpcRenderer()?.invoke('settings:load').then((settings: SettingsData) => {
      const provider = settings.provider || 'glm-cn';
      setSelectedProvider(provider);
      setSelectedModel(settings.modelPreset || 'opus');
      setInitialProvider(provider);
      setInitialModel(settings.modelPreset || 'opus');
      setApiKeyStatus(settings.apiKeyStatus || {});
    });
  }, []);

  const hasChanges =
    selectedProvider !== initialProvider ||
    selectedModel !== initialModel ||
    apiKeyInput.trim() !== '';

  const handleProviderClick = (providerKey: string) => {
    if (providerKey === selectedProvider) return;
    setSelectedProvider(providerKey);
    setApiKeyInput('');
    const provider = getProvider(providerKey);
    if (!provider.models[selectedModel as keyof typeof provider.models]) {
      setSelectedModel('sonnet');
    }
  };

  const handleSave = async () => {
    setStatus('saving');
    try {
      await getIpcRenderer()?.invoke('settings:save', {
        provider: selectedProvider,
        modelPreset: selectedModel,
      });
      if (apiKeyInput.trim()) {
        await getIpcRenderer()?.invoke('settings:save-api-key', {
          key: apiKeyInput.trim(),
          providerKey: selectedProvider,
        });
        setApiKeyStatus(prev => ({ ...prev, [selectedProvider]: true }));
        setApiKeyInput('');
      }
      setInitialProvider(selectedProvider);
      setInitialModel(selectedModel);
      setStatus('saved');
      setTimeout(() => setStatus('idle'), 2000);
    } catch {
      setStatus('error');
      setTimeout(() => setStatus('idle'), 2000);
    }
  };

  const handleCancel = () => {
    setSelectedProvider(initialProvider);
    setSelectedModel(initialModel);
    setApiKeyInput('');
  };

  const currentProvider = getProvider(selectedProvider);
  const modelOptions = Object.entries(currentProvider.modelDisplayNames).map(
    ([role, label]) => ({ value: role, label })
  );

  return (
    <div className="min-h-screen bg-bg-window flex flex-col">
      <PageHeader
        title="模型与凭证"
        subtitle="选择服务商并配置 API 密钥"
        onBack={() => getIpcRenderer()?.send('navigate:route', { path: '/settings' })}
      />
      <div className="flex-1 overflow-auto px-page-x pb-6">
        {CATEGORY_ORDER.map(category => {
          const providers = getProvidersByCategory(category);
          if (providers.length === 0) return null;
          return (
            <div key={category} className="mb-section-gap">
              <SectionHeader title={CATEGORY_LABELS[category]} />
              <div className="flex flex-col gap-2">
                {providers.map(provider => {
                  const isSelected = provider.key === selectedProvider;
                  const hasKey = apiKeyStatus[provider.key] || false;
                  return (
                    <div
                      key={provider.key}
                      onClick={() => handleProviderClick(provider.key)}
                      className={`rounded-card p-card-p cursor-pointer transition-colors duration-150 ${
                        isSelected
                          ? 'bg-bg-surface-1 border-2 border-brand'
                          : 'bg-bg-surface-1 border border-line-default hover:border-line-strong'
                      }`}
                    >
                      {/* Collapsed header */}
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-card-title text-text-primary">
                              {provider.nameZh}
                            </span>
                            <StatusBadge
                              status={hasKey ? 'success' : 'warning'}
                              label={hasKey ? '已配置' : '未配置'}
                            />
                          </div>
                          {!isSelected && (
                            <div className="text-body-sm text-text-muted mt-0.5">
                              {Object.values(provider.modelDisplayNames).slice(0, 2).join(' / ')}
                            </div>
                          )}
                        </div>
                        {isSelected && (
                          <span className="text-brand text-lg">✓</span>
                        )}
                      </div>

                      {/* Expanded config panel */}
                      {isSelected && (
                        <div className="mt-3 pt-3 border-t border-line-default" onClick={e => e.stopPropagation()}>
                          <div className="mb-block-gap">
                            <div className="text-label text-text-muted mb-1">模型</div>
                            <Select
                              options={modelOptions}
                              value={selectedModel}
                              onChange={v => setSelectedModel(v)}
                            />
                          </div>
                          <div>
                            <div className="text-label text-text-muted mb-1">API Key</div>
                            <SingleLineInput
                              type="password"
                              value={apiKeyInput}
                              onChange={e => setApiKeyInput(e.target.value)}
                              placeholder={
                                hasKey
                                  ? '输入新 Key 替换'
                                  : provider.keyPlaceholder
                              }
                            />
                            {provider.websiteUrl && (
                              <a
                                className="text-label-xs text-brand mt-1 inline-block hover:underline"
                                href="#"
                                onClick={e => {
                                  e.preventDefault();
                                  getIpcRenderer()?.send('open-external', provider.websiteUrl);
                                }}
                              >
                                获取 API Key →
                              </a>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
        {status === 'saved' && (
          <p className="text-body-sm text-success mb-2">已保存</p>
        )}
        {status === 'error' && (
          <p className="text-body-sm text-danger mb-2">API Key 验证失败，请检查是否正确</p>
        )}
      </div>
      {hasChanges && (
        <BottomActionBar>
          <Button variant="secondary" onClick={handleCancel}>取消</Button>
          <Button variant="primary" onClick={handleSave} disabled={status === 'saving'}>
            {status === 'saving' ? '保存中...' : '保存更改'}
          </Button>
        </BottomActionBar>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify compilation**

Run: `npm run build`
Expected: No TypeScript errors in the provider page.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(main\)/settings/provider/page.tsx
git commit -m "feat: rewrite provider settings page with categorized card layout"
```

---

### Task 7: Update Settings Summary Page

**Files:**
- Modify: `src/app/(main)/settings/page.tsx`

- [ ] **Step 1: Replace hardcoded provider/model lookups**

Remove the local `ProviderKey` type (line 9), the `providerNames` record (lines 53-57), and the `modelLabels` record (lines 59-63). Add import:

```typescript
import { getProvider } from '@/lib/provider-config';
```

Replace lines 53-65 (the two hardcoded records + `modelLabel` computation) with:

```typescript
  const currentProvider = getProvider(summary.provider || 'glm-cn');
  const providerName = currentProvider.nameZh;
  const modelLabel = currentProvider.modelDisplayNames[summary.modelPreset as keyof typeof currentProvider.modelDisplayNames] ?? summary.modelPreset;
```

Also remove the `SettingsSummary` interface's `provider` type from `ProviderKey` to just `string`, or remove the interface entirely and use `any` (matching current pattern).

- [ ] **Step 2: Verify compilation**

Run: `npm run build`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(main\)/settings/page.tsx
git commit -m "refactor: use provider registry for dynamic model/provider labels"
```

---

### Task 8: Update Onboarding Flow

**Files:**
- Modify: `src/components/Onboarding.tsx`

- [ ] **Step 1: Add `select-provider` step type and state**

Change the `Step` type (line 8) from:

```typescript
type Step = 'welcome' | 'accessibility' | 'volcengine' | 'api-key' | 'cwd' | 'done';
```

To:

```typescript
type Step = 'welcome' | 'accessibility' | 'volcengine' | 'select-provider' | 'api-key' | 'cwd' | 'done';
```

Add state after line 16:

```typescript
const [selectedProvider, setSelectedProvider] = useState('glm-cn');
```

- [ ] **Step 2: Add provider selection step to steps record**

Insert a new step between `volcengine` and `api-key` in the `steps` record. Change the `volcengine` step's `setStep('api-key')` to `setStep('select-provider')`:

```tsx
volcengine: (
  // ... existing volcengine step, but change:
  setStep('select-provider')  // was: setStep('api-key')
),
```

Add the new `select-provider` step:

```tsx
'select-provider': (
  <div className="text-center">
    <h2 className="text-page-title text-text-primary mb-3">选择 AI 服务商</h2>
    <p className="text-body text-text-muted mb-6">选择你已有 API Key 的服务商，后续可在设置中随时切换</p>
    <div className="flex flex-col gap-2 mb-4">
      {([
        { key: 'glm-cn', label: 'GLM (智谱)', recommended: true },
        { key: 'deepseek', label: 'DeepSeek' },
        { key: 'anthropic', label: 'Anthropic' },
        { key: 'moonshot', label: 'Moonshot (Kimi)' },
        { key: 'minimax-cn', label: 'MiniMax' },
        { key: 'openrouter', label: 'OpenRouter' },
      ]).map(p => (
        <div
          key={p.key}
          onClick={() => setSelectedProvider(p.key)}
          className={`p-3 rounded-input cursor-pointer transition-colors duration-150 ${
            selectedProvider === p.key
              ? 'bg-bg-surface-2 border-2 border-brand'
              : 'bg-bg-surface-1 border border-line-default hover:border-line-strong'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-card-title text-text-primary">{p.label}</span>
            <div className="flex items-center gap-2">
              {p.recommended && (
                <span className="text-label-xs text-brand">推荐</span>
              )}
              {selectedProvider === p.key && (
                <span className="text-brand">✓</span>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
    <p className="text-body-sm text-text-muted mb-4">更多服务商可在设置中配置</p>
    <Button variant="primary" onClick={() => setStep('api-key')}>下一步</Button>
  </div>
),
```

- [ ] **Step 3: Update API Key step to use dynamic provider**

Replace the `api-key` step to use `selectedProvider` instead of hardcoded `'glm-cn'`:

```tsx
'api-key': (
  <div className="text-center">
    <h2 className="text-page-title text-text-primary mb-3">API Key</h2>
    <p className="text-body text-text-muted mb-6">需要 API Key 来调用 AI 模型。Key 将安全存储在 macOS 钥匙串中。</p>
    <SingleLineInput
      type="password"
      value={apiKey}
      onChange={e => setApiKey(e.target.value)}
      placeholder={(() => {
        const { getProvider } = require('@/lib/provider-config');
        return getProvider(selectedProvider).keyPlaceholder;
      })()}
    />
    {error && <p className="text-body-sm text-danger mb-2">{error}</p>}
    <Button variant="primary" onClick={validateApiKey} disabled={saving || !apiKey.trim()}>
      {saving ? '验证中...' : '验证并保存'}
    </Button>
  </div>
),
```

And update `validateApiKey` function (around line 46) — change `providerKey: 'glm-cn'` to `providerKey: selectedProvider`:

```typescript
await ipcRenderer?.invoke('onboarding:validate-api-key', {
  key: apiKey.trim(),
  providerKey: selectedProvider,
});
```

Add import at the top of the file:

```typescript
import { getProvider } from '@/lib/provider-config';
```

Then simplify the placeholder to:

```tsx
placeholder={getProvider(selectedProvider).keyPlaceholder}
```

- [ ] **Step 4: Verify compilation**

Run: `npm run build`
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/Onboarding.tsx
git commit -m "feat: add provider selection step to onboarding flow"
```

---

### Task 9: Integration Verification

This task verifies all changes work together end-to-end.

- [ ] **Step 1: Run full build**

Run: `npm run build && npm run build:electron`
Expected: Both builds succeed.

- [ ] **Step 2: Run tests**

Run: `npx jest --verbose`
Expected: All tests pass.

- [ ] **Step 3: Start dev environment and smoke test**

Run: `npm run electron:dev`

Verify:
1. App starts without errors in console
2. Settings summary page shows current provider name/model correctly
3. Settings → Provider page shows categorized card list
4. Clicking different provider cards expands/collapses correctly
5. Switching provider + entering key + saving works
6. Onboarding flow (if triggered by deleting key file) shows provider selection step
7. After configuring a provider, prompt execution uses the correct provider

- [ ] **Step 4: Fix any issues found during smoke test**

Address any runtime errors, missing imports, or UI glitches discovered.

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "fix: integration fixes from smoke test"
```

(Only if changes were needed.)
