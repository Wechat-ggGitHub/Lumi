export interface ModelInfo {
  id: string;
  name: string;
  description?: string;
}

export interface ProviderPreset {
  key: string;
  name: string;
  nameZh: string;
  category: 'official' | 'china' | 'aggregator' | 'cloud';
  baseUrl: string;
  authStyle: 'api_key' | 'auth_token';
  models: ModelInfo[];
  defaultModel: string;
  envOverrides?: Record<string, string>;
  keyPlaceholder: string;
  websiteUrl?: string;
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
    models: [
      { id: 'claude-opus-4-7', name: 'Claude Opus 4.7', description: '最强性能' },
      { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', description: '均衡' },
      { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5', description: '快速' },
    ],
    defaultModel: 'claude-sonnet-4-6',
    keyPlaceholder: 'sk-ant-...',
    websiteUrl: 'https://console.anthropic.com/settings/keys',
  },
  'glm-cn': {
    key: 'glm-cn',
    name: 'GLM Coding Plan (CN)',
    nameZh: '智谱 Coding Plan (国内)',
    category: 'china',
    baseUrl: 'https://open.bigmodel.cn/api/anthropic',
    authStyle: 'auth_token',
    models: [
      { id: 'glm-5.1', name: 'GLM-5.1', description: '旗舰模型' },
      { id: 'glm-5.1-highspeed', name: 'GLM-5.1-HighSpeed', description: '高速' },
      { id: 'glm-5-turbo', name: 'GLM-5-Turbo', description: 'Agent 优化' },
      { id: 'glm-4.7-flashx', name: 'GLM-4.7-FlashX', description: '快速' },
    ],
    defaultModel: 'glm-5-turbo',
    envOverrides: { ANTHROPIC_TIMEOUT: '3000000' },
    keyPlaceholder: '从 open.bigmodel.cn 获取您的 API Key',
    websiteUrl: 'https://open.bigmodel.cn/coding-plan/personal/overview',
  },
  'glm-global': {
    key: 'glm-global',
    name: 'GLM Coding Plan (Global)',
    nameZh: '智谱 Coding Plan (国际)',
    category: 'china',
    baseUrl: 'https://api.z.ai/api/anthropic',
    authStyle: 'auth_token',
    models: [
      { id: 'glm-5.1', name: 'GLM-5.1', description: '旗舰模型' },
      { id: 'glm-5.1-highspeed', name: 'GLM-5.1-HighSpeed', description: '高速' },
      { id: 'glm-5-turbo', name: 'GLM-5-Turbo', description: 'Agent 优化' },
      { id: 'glm-4.7-flashx', name: 'GLM-4.7-FlashX', description: '快速' },
    ],
    defaultModel: 'glm-5-turbo',
    envOverrides: { ANTHROPIC_TIMEOUT: '3000000' },
    keyPlaceholder: '从 z.ai 获取您的 API Key',
    websiteUrl: 'https://z.ai/manage-apikey/apikey-list',
  },
  deepseek: {
    key: 'deepseek',
    name: 'DeepSeek',
    nameZh: 'DeepSeek',
    category: 'china',
    baseUrl: 'https://api.deepseek.com/anthropic',
    authStyle: 'auth_token',
    models: [
      { id: 'deepseek-v4-pro', name: 'DeepSeek-V4-Pro', description: '高性能' },
      { id: 'deepseek-v4-flash', name: 'DeepSeek-V4-Flash', description: '快速' },
    ],
    defaultModel: 'deepseek-v4-flash',
    keyPlaceholder: '从 platform.deepseek.com 获取您的 API Key',
    websiteUrl: 'https://platform.deepseek.com/api_keys',
  },
  'minimax-cn': {
    key: 'minimax-cn',
    name: 'MiniMax Token Plan (CN)',
    nameZh: 'MiniMax Token Plan (国内)',
    category: 'china',
    baseUrl: 'https://api.minimaxi.com/anthropic',
    authStyle: 'auth_token',
    models: [
      { id: 'MiniMax-M2.7', name: 'MiniMax-M2.7', description: '最新' },
      { id: 'MiniMax-M2.7-highspeed', name: 'MiniMax-M2.7-HighSpeed', description: '高速' },
      { id: 'MiniMax-M2.5', name: 'MiniMax-M2.5', description: '高效' },
    ],
    defaultModel: 'MiniMax-M2.7',
    keyPlaceholder: '从 platform.minimaxi.com 获取您的 API Key',
    websiteUrl: 'https://platform.minimaxi.com/user-center/basic-information/interface-key',
  },
  'minimax-global': {
    key: 'minimax-global',
    name: 'MiniMax Token Plan (Global)',
    nameZh: 'MiniMax Token Plan (国际)',
    category: 'china',
    baseUrl: 'https://api.minimax.io/anthropic',
    authStyle: 'auth_token',
    models: [
      { id: 'MiniMax-M2.7', name: 'MiniMax-M2.7', description: '最新' },
      { id: 'MiniMax-M2.7-highspeed', name: 'MiniMax-M2.7-HighSpeed', description: '高速' },
      { id: 'MiniMax-M2.5', name: 'MiniMax-M2.5', description: '高效' },
    ],
    defaultModel: 'MiniMax-M2.7',
    keyPlaceholder: '从 platform.minimax.io 获取您的 API Key',
    websiteUrl: 'https://platform.minimax.io/user-center/basic-information/interface-key',
  },
  kimi: {
    key: 'kimi',
    name: 'Moonshot',
    nameZh: 'Moonshot',
    category: 'china',
    baseUrl: 'https://api.kimi.com/coding',
    authStyle: 'auth_token',
    models: [
      { id: 'kimi-k2.6', name: 'Kimi-K2.6', description: '最新旗舰' },
      { id: 'kimi-k2.5', name: 'Kimi-K2.5', description: '高性能' },
    ],
    defaultModel: 'kimi-k2.5',
    keyPlaceholder: '从 kimi.com/code 获取您的 API Key',
    websiteUrl: 'https://www.kimi.com/code',
  },
  bailian: {
    key: 'bailian',
    name: 'Qwen Coder',
    nameZh: '通义千问 Coder',
    category: 'china',
    baseUrl: 'https://coding.dashscope.aliyuncs.com/apps/anthropic',
    authStyle: 'auth_token',
    models: [
      { id: 'qwen3-coder-plus', name: 'Qwen3-Coder-Plus', description: '代码旗舰' },
      { id: 'qwen3-coder-flash', name: 'Qwen3-Coder-Flash', description: '代码快速' },
    ],
    defaultModel: 'qwen3-coder-plus',
    keyPlaceholder: '从 bailian.console.aliyun.com 获取您的 API Key',
    websiteUrl: 'https://bailian.console.aliyun.com/?tab=model#/api-key',
  },
  openai: {
    key: 'openai',
    name: 'ChatGPT',
    nameZh: 'ChatGPT',
    category: 'official',
    baseUrl: 'https://api.openai.com/v1',
    authStyle: 'api_key',
    models: [
      { id: 'gpt-4o', name: 'GPT-4o', description: '旗舰' },
      { id: 'gpt-4o-mini', name: 'GPT-4o-mini', description: '快速' },
    ],
    defaultModel: 'gpt-4o',
    keyPlaceholder: 'sk-...',
    websiteUrl: 'https://platform.openai.com/api-keys',
  },
  volcengine: {
    key: 'volcengine',
    name: 'Volcengine Coding Plan',
    nameZh: '火山方舟 Coding Plan',
    category: 'china',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/coding',
    authStyle: 'auth_token',
    models: [
      { id: 'doubao-1.5-pro-256k', name: 'Doubao-1.5-Pro', description: '旗舰' },
      { id: 'doubao-1.5-lite-32k', name: 'Doubao-1.5-Lite', description: '快速' },
    ],
    defaultModel: 'doubao-1.5-pro-256k',
    keyPlaceholder: '输入火山引擎方舟 API Key',
    websiteUrl: 'https://console.volcengine.com/ark/region:ark+cn-beijing/apikey',
  },
  mimo: {
    key: 'mimo',
    name: 'MiMo Token Plan',
    nameZh: '小米 MiMo Token Plan',
    category: 'china',
    baseUrl: 'https://api.xiaomimimo.com/anthropic',
    authStyle: 'auth_token',
    models: [
      { id: 'MiMo-V2.5-Pro', name: 'MiMo-V2.5-Pro', description: '旗舰' },
      { id: 'MiMo-V2.5', name: 'MiMo-V2.5', description: '标准' },
      { id: 'MiMo-V2-Flash', name: 'MiMo-V2-Flash', description: '快速' },
    ],
    defaultModel: 'MiMo-V2.5',
    keyPlaceholder: '从 platform.xiaomimimo.com 获取您的 API Key',
    websiteUrl: 'https://platform.xiaomimimo.com/',
  },
  step: {
    key: 'step',
    name: 'StepFun',
    nameZh: 'StepFun',
    category: 'china',
    baseUrl: 'https://api.stepfun.com/step_plan',
    authStyle: 'auth_token',
    models: [
      { id: 'step-3.7-flash', name: 'Step 3.7 Flash', description: '最新' },
    ],
    defaultModel: 'step-3.7-flash',
    keyPlaceholder: '从 platform.stepfun.com 获取您的 API Key',
    websiteUrl: 'https://platform.stepfun.com',
  },
  openrouter: {
    key: 'openrouter',
    name: 'OpenRouter',
    nameZh: 'OpenRouter',
    category: 'aggregator',
    baseUrl: 'https://openrouter.ai/api/anthropic',
    authStyle: 'api_key',
    models: [
      { id: 'anthropic/claude-opus-4-7', name: 'Claude Opus 4.7', description: '最强' },
      { id: 'anthropic/claude-sonnet-4-6', name: 'Claude Sonnet 4.6', description: '均衡' },
      { id: 'anthropic/claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5', description: '快速' },
    ],
    defaultModel: 'anthropic/claude-sonnet-4-6',
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
    models: [
      { id: 'Pro/deepseek-ai/DeepSeek-R1', name: 'DeepSeek-R1 Pro', description: '推理' },
      { id: 'deepseek-ai/DeepSeek-V3.2', name: 'DeepSeek-V3.2', description: '旗舰' },
      { id: 'deepseek-ai/DeepSeek-V3', name: 'DeepSeek-V3', description: '标准' },
    ],
    defaultModel: 'deepseek-ai/DeepSeek-V3.2',
    keyPlaceholder: '从 cloud.siliconflow.cn 获取您的 API Key',
    websiteUrl: 'https://cloud.siliconflow.cn/account/ak',
  },
};

export function getProvider(key: string): ProviderPreset {
  return PROVIDERS[key] ?? PROVIDERS['glm-cn'];
}

export function getDefaultProvider(): ProviderPreset {
  return PROVIDERS['anthropic'];
}

export function getAllProviders(): ProviderPreset[] {
  return Object.values(PROVIDERS);
}

export function getProvidersByCategory(category: ProviderCategory): ProviderPreset[] {
  return getAllProviders().filter(p => p.category === category);
}

export function resolveModel(providerKey: string, modelId?: string): string {
  const provider = getProvider(providerKey);
  if (modelId && provider.models.some(m => m.id === modelId)) {
    return modelId;
  }
  return provider.defaultModel;
}

export function getValidateEndpoint(provider: ProviderPreset): string {
  const base = provider.baseUrl || 'https://api.anthropic.com';
  return `${base}/v1/messages`;
}

export function buildAuthHeaders(provider: ProviderPreset, apiKey: string): Record<string, string> {
  return {
    'content-type': 'application/json',
    'anthropic-version': '2023-06-01',
    ...(provider.authStyle === 'auth_token'
      ? { authorization: `Bearer ${apiKey}` }
      : { 'x-api-key': apiKey }),
  };
}

export function buildSdkEnv(providerKey: string, apiKey: string, modelId?: string): Record<string, string> {
  const provider = getProvider(providerKey);
  const resolvedModelId = resolveModel(providerKey, modelId);

  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined && !k.startsWith('ANTHROPIC_')) {
      env[k] = v;
    }
  }

  env.CLAUDE_CONFIG_DIR = `${process.env.HOME}/.lumi`;

  if (provider.authStyle === 'auth_token') {
    env.ANTHROPIC_AUTH_TOKEN = apiKey;
  } else {
    env.ANTHROPIC_API_KEY = apiKey;
  }

  if (provider.baseUrl) {
    env.ANTHROPIC_BASE_URL = provider.baseUrl;
  }

  env.ANTHROPIC_MODEL = resolvedModelId;

  if (provider.envOverrides) {
    Object.assign(env, provider.envOverrides);
  }

  return env;
}
