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

  for (const [role, mid] of Object.entries(provider.models)) {
    const key = `ANTHROPIC_DEFAULT_${role.toUpperCase()}_MODEL`;
    env[key] = mid;
  }

  if (provider.envOverrides) {
    Object.assign(env, provider.envOverrides);
  }

  return env;
}
