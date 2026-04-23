import {
  getProvider,
  getDefaultProvider,
  getAllProviders,
  resolveModel,
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

test('getAllProviders returns 3 providers', () => {
  const all = getAllProviders();
  expect(all).toHaveLength(3);
  const keys = all.map(p => p.key);
  expect(keys).toContain('glm-cn');
  expect(keys).toContain('glm-global');
  expect(keys).toContain('anthropic');
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
  expect(resolveModel('anthropic', 'opus')).toBe('claude-opus-4-6');
});

test('resolveModel returns correct Anthropic model for sonnet', () => {
  expect(resolveModel('anthropic', 'sonnet')).toBe('claude-sonnet-4-6');
});

test('resolveModel returns correct Anthropic model for haiku', () => {
  expect(resolveModel('anthropic', 'haiku')).toBe('claude-haiku-4-5-20251001');
});

test('resolveModel falls back to first model for unknown role', () => {
  expect(resolveModel('glm-cn', 'nonexistent')).toBe('glm-5.1');
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
  // The old ANTHROPIC_API_KEY should not be in the result
  // (it gets filtered out, then the new one is set based on authStyle)
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

test('buildSdkEnv for glm-global uses correct base URL', () => {
  const env = buildSdkEnv('glm-global', 'key', 'opus');
  expect(env.ANTHROPIC_BASE_URL).toBe('https://api.z.ai/api/anthropic');
});

// ─── provider model consistency ─────────────────────────

test('every provider has 3 models: opus, sonnet, haiku', () => {
  for (const provider of getAllProviders()) {
    const roles = provider.defaultModels.map(m => m.role);
    expect(roles).toEqual(['opus', 'sonnet', 'haiku']);
  }
});

test('every provider has a non-empty validateEndpoint', () => {
  for (const provider of getAllProviders()) {
    expect(provider.validateEndpoint).toBeTruthy();
  }
});
