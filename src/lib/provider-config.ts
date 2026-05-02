export interface ProviderModel {
  role: 'opus' | 'sonnet' | 'haiku';
  modelId: string;
  displayName: string;
}

export interface ProviderPreset {
  key: string;
  name: string;
  nameZh: string;
  baseUrl: string;
  authStyle: 'api_key' | 'auth_token';
  defaultModels: ProviderModel[];
  envOverrides: Record<string, string>;
  keyPlaceholder: string;
  validateEndpoint: string;
}

const PROVIDERS: Record<string, ProviderPreset> = {
  'glm-cn': {
    key: 'glm-cn',
    name: 'GLM (CN)',
    nameZh: 'GLM (国内)',
    baseUrl: 'https://open.bigmodel.cn/api/anthropic',
    authStyle: 'auth_token',
    defaultModels: [
      { role: 'opus', modelId: 'glm-5.1', displayName: 'GLM-5.1' },
      { role: 'sonnet', modelId: 'glm-5-turbo', displayName: 'GLM-5-Turbo' },
      { role: 'haiku', modelId: 'glm-4.5-air', displayName: 'GLM-4.5-Air' },
    ],
    envOverrides: {
      ANTHROPIC_TIMEOUT: '3000000',
    },
    keyPlaceholder: '从 open.bigmodel.cn 获取您的 API Key',
    validateEndpoint: 'https://open.bigmodel.cn/api/anthropic/v1/messages',
  },
  'glm-global': {
    key: 'glm-global',
    name: 'GLM (Global)',
    nameZh: 'GLM (国际)',
    baseUrl: 'https://api.z.ai/api/anthropic',
    authStyle: 'auth_token',
    defaultModels: [
      { role: 'opus', modelId: 'glm-5.1', displayName: 'GLM-5.1' },
      { role: 'sonnet', modelId: 'glm-5-turbo', displayName: 'GLM-5-Turbo' },
      { role: 'haiku', modelId: 'glm-4.5-air', displayName: 'GLM-4.5-Air' },
    ],
    envOverrides: {
      ANTHROPIC_TIMEOUT: '3000000',
    },
    keyPlaceholder: '从 open.bigmodel.cn 获取您的 API Key',
    validateEndpoint: 'https://api.z.ai/api/anthropic/v1/messages',
  },
  anthropic: {
    key: 'anthropic',
    name: 'Anthropic',
    nameZh: 'Anthropic',
    baseUrl: '',
    authStyle: 'api_key',
    defaultModels: [
      { role: 'opus', modelId: 'claude-opus-4-6', displayName: 'Claude Opus 4.6' },
      { role: 'sonnet', modelId: 'claude-sonnet-4-6', displayName: 'Claude Sonnet 4.6' },
      { role: 'haiku', modelId: 'claude-haiku-4-5-20251001', displayName: 'Claude Haiku 4.5' },
    ],
    envOverrides: {},
    keyPlaceholder: 'sk-ant-...',
    validateEndpoint: 'https://api.anthropic.com/v1/messages',
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

export function resolveModel(providerKey: string, modelRole: string): string {
  const provider = getProvider(providerKey);
  const model = provider.defaultModels.find(m => m.role === modelRole);
  return model?.modelId ?? provider.defaultModels[0].modelId;
}

export function buildSdkEnv(providerKey: string, apiKey: string, modelRole: string): Record<string, string> {
  const provider = getProvider(providerKey);
  const modelId = resolveModel(providerKey, modelRole);

  // Start with a clean env — strip all ANTHROPIC_* vars
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined && !k.startsWith('ANTHROPIC_')) {
      env[k] = v;
    }
  }

  // Point Claude Agent SDK to Shrew's own config directory
  env.CLAUDE_CONFIG_DIR = `${process.env.HOME}/.shrew`;

  // Set auth based on provider style
  if (provider.authStyle === 'auth_token') {
    env.ANTHROPIC_AUTH_TOKEN = apiKey;
  } else {
    env.ANTHROPIC_API_KEY = apiKey;
  }

  // Set base URL for non-Anthropic providers
  if (provider.baseUrl) {
    env.ANTHROPIC_BASE_URL = provider.baseUrl;
  }

  // Set the resolved model
  env.ANTHROPIC_MODEL = modelId;

  // Set default model overrides per role
  for (const model of provider.defaultModels) {
    const key = `ANTHROPIC_DEFAULT_${model.role.toUpperCase()}_MODEL`;
    env[key] = model.modelId;
  }

  // Merge extra env overrides (timeout, etc.)
  Object.assign(env, provider.envOverrides);

  return env;
}
