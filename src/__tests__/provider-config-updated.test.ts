/**
 * provider-config 更新后的补充测试
 * 覆盖已有测试未涉及的场景：所有 13 个 provider 的完整性、边界情况
 */

import {
  getProvider,
  getDefaultProvider,
  getAllProviders,
  getProvidersByCategory,
  resolveModel,
  getValidateEndpoint,
  buildAuthHeaders,
  buildSdkEnv,
  type ProviderPreset,
} from '../lib/provider-config';

// ── 所有 Provider 注册完整性 ──

describe('Provider 注册表完整性', () => {
  const EXPECTED_PROVIDERS = [
    'anthropic', 'glm-cn', 'glm-global', 'deepseek', 'moonshot',
    'minimax-cn', 'minimax-global', 'kimi', 'bailian', 'volcengine',
    'mimo', 'openrouter', 'siliconflow',
  ];

  test(`注册表包含所有 ${EXPECTED_PROVIDERS.length} 个 provider`, () => {
    const all = getAllProviders();
    const keys = all.map(p => p.key);
    for (const expected of EXPECTED_PROVIDERS) {
      expect(keys).toContain(expected);
    }
  });

  test('没有重复的 key', () => {
    const all = getAllProviders();
    const keys = all.map(p => p.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  test('每个 provider 的 category 都合法', () => {
    const validCategories = ['official', 'china', 'aggregator', 'cloud'];
    for (const p of getAllProviders()) {
      expect(validCategories).toContain(p.category);
    }
  });

  test('official 分类只有 anthropic', () => {
    const official = getProvidersByCategory('official');
    expect(official).toHaveLength(1);
    expect(official[0].key).toBe('anthropic');
  });

  test('china 分类包含预期数量的 provider', () => {
    const china = getProvidersByCategory('china');
    // glm-cn, glm-global, deepseek, moonshot, minimax-cn, minimax-global,
    // kimi, bailian, volcengine, mimo
    expect(china.length).toBeGreaterThanOrEqual(10);
  });

  test('aggregator 分类包含 openrouter 和 siliconflow', () => {
    const agg = getProvidersByCategory('aggregator');
    const keys = agg.map(p => p.key);
    expect(keys).toContain('openrouter');
    expect(keys).toContain('siliconflow');
  });
});

// ── 逐 Provider 模型验证 ──

describe('逐 Provider 模型配置', () => {
  test('GLM-CN 三个模型 ID 正确', () => {
    expect(resolveModel('glm-cn', 'opus')).toBe('glm-5.1');
    expect(resolveModel('glm-cn', 'sonnet')).toBe('glm-5-turbo');
    expect(resolveModel('glm-cn', 'haiku')).toBe('glm-4.7-flashx');
  });

  test('GLM-Global 三个模型 ID 正确', () => {
    expect(resolveModel('glm-global', 'opus')).toBe('glm-5.1');
    expect(resolveModel('glm-global', 'sonnet')).toBe('glm-5-turbo');
    expect(resolveModel('glm-global', 'haiku')).toBe('glm-4.7-flashx');
  });

  test('DeepSeek opus 和 sonnet 不同', () => {
    const opus = resolveModel('deepseek', 'opus');
    const sonnet = resolveModel('deepseek', 'sonnet');
    expect(opus).toBe('deepseek-v4-pro');
    expect(sonnet).toBe('deepseek-v4-flash');
  });

  test('DeepSeek sonnet 和 haiku 相同（共享 flash 模型）', () => {
    expect(resolveModel('deepseek', 'sonnet')).toBe(resolveModel('deepseek', 'haiku'));
  });

  test('Anthropic 使用标准 Claude 模型 ID', () => {
    expect(resolveModel('anthropic', 'opus')).toBe('claude-opus-4-7');
    expect(resolveModel('anthropic', 'sonnet')).toBe('claude-sonnet-4-6');
    expect(resolveModel('anthropic', 'haiku')).toBe('claude-haiku-4-5-20251001');
  });

  test('Kimi sonnet 和 haiku 相同', () => {
    expect(resolveModel('kimi', 'sonnet')).toBe(resolveModel('kimi', 'haiku'));
    expect(resolveModel('kimi', 'sonnet')).toBe('kimi-k2.5');
  });

  test('Volcengine opus 和 sonnet 相同（共享 doubao-1.5-pro）', () => {
    expect(resolveModel('volcengine', 'opus')).toBe(resolveModel('volcengine', 'sonnet'));
  });

  test('Bailian sonnet 和 haiku 相同（共享 qwen3-coder-flash）', () => {
    expect(resolveModel('bailian', 'sonnet')).toBe(resolveModel('bailian', 'haiku'));
  });
});

// ── baseUrl 和 endpoint 验证 ──

describe('Provider URL 配置', () => {
  test('所有非 Anthropic provider 的 baseUrl 以 https:// 开头', () => {
    for (const p of getAllProviders()) {
      if (p.key === 'anthropic') continue;
      expect(p.baseUrl).toMatch(/^https:\/\//);
    }
  });

  test('Anthropic baseUrl 为空（使用默认）', () => {
    expect(getProvider('anthropic').baseUrl).toBe('');
  });

  test('所有 provider 的 getValidateEndpoint 返回合法 URL', () => {
    for (const p of getAllProviders()) {
      const endpoint = getValidateEndpoint(p);
      expect(endpoint).toMatch(/^https:\/\//);
      expect(endpoint).toContain('/v1/messages');
    }
  });

  test('SiliconFlow 的 endpoint 不以 /anthropic 结尾', () => {
    const p = getProvider('siliconflow');
    expect(p.baseUrl).toBe('https://api.siliconflow.cn');
    // 不带 /anthropic 后缀
  });

  test('每对国内/国际版本使用不同的 baseUrl', () => {
    const glmCn = getProvider('glm-cn');
    const glmGlobal = getProvider('glm-global');
    expect(glmCn.baseUrl).not.toBe(glmGlobal.baseUrl);

    const minimaxCn = getProvider('minimax-cn');
    const minimaxGlobal = getProvider('minimax-global');
    expect(minimaxCn.baseUrl).not.toBe(minimaxGlobal.baseUrl);
  });
});

// ── buildAuthHeaders 全面覆盖 ──

describe('buildAuthHeaders 所有 provider', () => {
  test('auth_token 风格使用 Bearer token', () => {
    const authTokenProviders = ['glm-cn', 'glm-global', 'deepseek', 'moonshot',
      'minimax-cn', 'minimax-global', 'kimi', 'bailian', 'volcengine', 'mimo'];
    for (const key of authTokenProviders) {
      const p = getProvider(key);
      const headers = buildAuthHeaders(p, 'test-key');
      expect(headers['authorization']).toBe('Bearer test-key');
      expect(headers['x-api-key']).toBeUndefined();
    }
  });

  test('api_key 风格使用 x-api-key header', () => {
    const apiKeyProviders = ['anthropic', 'openrouter', 'siliconflow'];
    for (const key of apiKeyProviders) {
      const p = getProvider(key);
      const headers = buildAuthHeaders(p, 'test-key');
      expect(headers['x-api-key']).toBe('test-key');
      expect(headers['authorization']).toBeUndefined();
    }
  });

  test('所有 header 都包含 anthropic-version', () => {
    for (const p of getAllProviders()) {
      const headers = buildAuthHeaders(p, 'key');
      expect(headers['anthropic-version']).toBe('2023-06-01');
      expect(headers['content-type']).toBe('application/json');
    }
  });
});

// ── buildSdkEnv 边界情况 ──

describe('buildSdkEnv 边界情况', () => {
  test('SiliconFlow 使用 ANTHROPIC_API_KEY (api_key style)', () => {
    const env = buildSdkEnv('siliconflow', 'sk-test', 'opus');
    expect(env.ANTHROPIC_API_KEY).toBe('sk-test');
    expect(env.ANTHROPIC_AUTH_TOKEN).toBeUndefined();
  });

  test('Kimi 使用 ANTHROPIC_AUTH_TOKEN (auth_token style)', () => {
    const env = buildSdkEnv('kimi', 'key', 'opus');
    expect(env.ANTHROPIC_AUTH_TOKEN).toBe('key');
    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
  });

  test('Bailian 设置 ANTHROPIC_BASE_URL', () => {
    const env = buildSdkEnv('bailian', 'key', 'opus');
    expect(env.ANTHROPIC_BASE_URL).toContain('dashscope.aliyuncs.com');
  });

  test('Volcengine 设置 ANTHROPIC_BASE_URL 指向方舟', () => {
    const env = buildSdkEnv('volcengine', 'key', 'opus');
    expect(env.ANTHROPIC_BASE_URL).toContain('ark.cn-beijing.volces.com');
  });

  test('MiMo 没有 websiteUrl', () => {
    expect(getProvider('mimo').websiteUrl).toBeUndefined();
  });

  test('GLM 的 timeout override 两个版本都有', () => {
    const envCn = buildSdkEnv('glm-cn', 'key', 'opus');
    const envGlobal = buildSdkEnv('glm-global', 'key', 'opus');
    expect(envCn.ANTHROPIC_TIMEOUT).toBe('3000000');
    expect(envGlobal.ANTHROPIC_TIMEOUT).toBe('3000000');
  });

  test('不含 timeout override 的 provider', () => {
    const providersWithoutTimeout = ['anthropic', 'deepseek', 'moonshot', 'openrouter', 'siliconflow'];
    for (const key of providersWithoutTimeout) {
      const env = buildSdkEnv(key, 'key', 'opus');
      expect(env.ANTHROPIC_TIMEOUT).toBeUndefined();
    }
  });

  test('CLAUDE_CONFIG_DIR 在所有 provider 中都设置', () => {
    for (const p of getAllProviders()) {
      const env = buildSdkEnv(p.key, 'key', 'opus');
      expect(env.CLAUDE_CONFIG_DIR).toBe(`${process.env.HOME}/.aiva`);
    }
  });
});

// ── resolveModel 边界情况 ──

describe('resolveModel 边界情况', () => {
  test('未知 provider 回退到 glm-cn 的模型', () => {
    expect(resolveModel('nonexistent', 'opus')).toBe('glm-5.1');
    expect(resolveModel('nonexistent', 'sonnet')).toBe('glm-5-turbo');
  });

  test('未知 role 回退到 opus', () => {
    expect(resolveModel('glm-cn', 'unknown')).toBe('glm-5.1');
    expect(resolveModel('anthropic', 'invalid')).toBe('claude-opus-4-7');
  });

  test('空字符串 role 回退到 opus', () => {
    expect(resolveModel('deepseek', '')).toBe('deepseek-v4-pro');
  });
});

// ── websiteUrl 和 keyPlaceholder 完整性 ──

describe('Provider 外部链接和提示文本', () => {
  test('除了 mimo，所有 provider 都有 websiteUrl', () => {
    for (const p of getAllProviders()) {
      if (p.key === 'mimo') {
        expect(p.websiteUrl).toBeUndefined();
      } else {
        expect(p.websiteUrl).toMatch(/^https:\/\//);
      }
    }
  });

  test('所有 provider 都有 keyPlaceholder', () => {
    for (const p of getAllProviders()) {
      expect(p.keyPlaceholder).toBeTruthy();
      expect(p.keyPlaceholder.length).toBeGreaterThan(5);
    }
  });

  test('Anthropic placeholder 包含 sk-ant', () => {
    expect(getProvider('anthropic').keyPlaceholder).toContain('sk-ant');
  });

  test('Aliyun (bailian) 的 websiteUrl 指向百炼控制台', () => {
    expect(getProvider('bailian').websiteUrl).toContain('bailian.console.aliyun.com');
  });
});

// ── modelDisplayNames 格式统一性 ──

describe('modelDisplayNames 格式', () => {
  test('每个 display name 都包含「—」分隔符和中文描述', () => {
    for (const p of getAllProviders()) {
      for (const role of ['opus', 'sonnet', 'haiku'] as const) {
        const name = p.modelDisplayNames[role];
        expect(name).toContain('—');
      }
    }
  });

  test('opus 都包含性能描述词', () => {
    const validSuffixes = ['高性能', '推理'];
    for (const p of getAllProviders()) {
      const name = p.modelDisplayNames.opus;
      const hasValid = validSuffixes.some(s => name.includes(s));
      expect(hasValid).toBe(true);
    }
  });

  test('sonnet 都以「均衡」结尾', () => {
    for (const p of getAllProviders()) {
      expect(p.modelDisplayNames.sonnet).toContain('均衡');
    }
  });

  test('haiku 都以「快速」结尾', () => {
    for (const p of getAllProviders()) {
      expect(p.modelDisplayNames.haiku).toContain('快速');
    }
  });
});
