import {
  getProvider,
  getDefaultProvider,
  getAllProviders,
  getProvidersByCategory,
  resolveModel,
  getValidateEndpoint,
  buildSdkEnv,
} from '../lib/provider-config';

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

test('getDefaultProvider returns glm-cn', () => {
  expect(getDefaultProvider().key).toBe('glm-cn');
});

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

test('getProvidersByCategory filters by category', () => {
  const china = getProvidersByCategory('china');
  expect(china.length).toBeGreaterThanOrEqual(8);
  expect(china.every(p => p.category === 'china')).toBe(true);

  const aggregators = getProvidersByCategory('aggregator');
  expect(aggregators.length).toBeGreaterThanOrEqual(2);
  expect(aggregators.every(p => p.category === 'aggregator')).toBe(true);
});

test('resolveModel returns correct GLM model for opus', () => {
  expect(resolveModel('glm-cn', 'opus')).toBe('glm-5.1');
});

test('resolveModel returns correct GLM model for sonnet', () => {
  expect(resolveModel('glm-cn', 'sonnet')).toBe('glm-5-turbo');
});

test('resolveModel returns correct GLM model for haiku', () => {
  expect(resolveModel('glm-cn', 'haiku')).toBe('glm-4.7-flashx');
});

test('resolveModel returns correct Anthropic model for opus', () => {
  expect(resolveModel('anthropic', 'opus')).toBe('claude-opus-4-7');
});

test('resolveModel falls back to opus model for unknown role', () => {
  expect(resolveModel('glm-cn', 'nonexistent')).toBe('glm-5.1');
});

test('getValidateEndpoint computes from baseUrl', () => {
  const p = getProvider('glm-cn');
  expect(getValidateEndpoint(p)).toBe('https://open.bigmodel.cn/api/anthropic/v1/messages');
});

test('getValidateEndpoint uses anthropic default for empty baseUrl', () => {
  const p = getProvider('anthropic');
  expect(getValidateEndpoint(p)).toBe('https://api.anthropic.com/v1/messages');
});

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
  expect(env.ANTHROPIC_DEFAULT_HAIKU_MODEL).toBe('glm-4.7-flashx');
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
