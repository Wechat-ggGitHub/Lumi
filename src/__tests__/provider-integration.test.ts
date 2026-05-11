/**
 * Provider 集成测试
 *
 * 用 mock API key 调用每个 provider 的真实 /v1/messages endpoint。
 * 如果返回 401/403/authentication error → 链路正常（key 是假的）
 * 如果返回 connection error / DNS failure → 链路有问题
 * 如果返回 200 → 链路正常（不太可能，mock key 不会被接受）
 */
import {
  getProvider,
  getAllProviders,
  getValidateEndpoint,
  resolveModel,
  buildSdkEnv,
  type ProviderPreset,
} from '../lib/provider-config';

// ─── 工具函数 ───

function buildAuthHeaders(provider: ProviderPreset, apiKey: string): Record<string, string> {
  return {
    'content-type': 'application/json',
    'anthropic-version': '2023-06-01',
    ...(provider.authStyle === 'auth_token'
      ? { authorization: `Bearer ${apiKey}` }
      : { 'x-api-key': apiKey }),
  };
}

const MOCK_KEY = 'sk-test-mock-key-for-validation-000000000000000000000001';

// ─── Provider 注册表结构测试 ───

describe('Provider 注册表结构', () => {
  test('每个 provider 的 key 与 Record key 一致', () => {
    for (const provider of getAllProviders()) {
      // getProvider 使用 Record 查找，key 必须能正确查回自身
      const found = getProvider(provider.key);
      expect(found.key).toBe(provider.key);
    }
  });

  test('每个 provider 有有效的 baseUrl（或为空字符串表示使用默认值）', () => {
    for (const provider of getAllProviders()) {
      if (provider.baseUrl) {
        expect(provider.baseUrl).toMatch(/^https?:\/\//);
      }
    }
  });

  test('每个 provider 的 models 不为空字符串', () => {
    for (const provider of getAllProviders()) {
      for (const [role, modelId] of Object.entries(provider.models)) {
        expect(modelId).toBeTruthy();
        expect(typeof modelId).toBe('string');
      }
    }
  });

  test('每个 provider 的 modelDisplayNames 全部非空', () => {
    for (const provider of getAllProviders()) {
      for (const [role, displayName] of Object.entries(provider.modelDisplayNames)) {
        expect(displayName).toBeTruthy();
      }
    }
  });

  test('每个 provider 的 category 合法', () => {
    const validCategories = ['official', 'china', 'aggregator', 'cloud'];
    for (const provider of getAllProviders()) {
      expect(validCategories).toContain(provider.category);
    }
  });

  test('没有重复的 provider key', () => {
    const keys = getAllProviders().map(p => p.key);
    const uniqueKeys = new Set(keys);
    expect(uniqueKeys.size).toBe(keys.length);
  });

  test('没有重复的 baseUrl（空字符串除外）', () => {
    const urls = getAllProviders()
      .map(p => p.baseUrl)
      .filter(u => u !== '');
    const uniqueUrls = new Set(urls);
    expect(uniqueUrls.size).toBe(urls.length);
  });
});

// ─── Endpoint URL 构造测试 ───

describe('getValidateEndpoint URL 构造', () => {
  test('Anthropic（空 baseUrl）使用默认地址', () => {
    const p = getProvider('anthropic');
    expect(getValidateEndpoint(p)).toBe('https://api.anthropic.com/v1/messages');
  });

  test('所有有 baseUrl 的 provider 生成的 endpoint 格式正确', () => {
    for (const provider of getAllProviders()) {
      if (provider.baseUrl) {
        const endpoint = getValidateEndpoint(provider);
        expect(endpoint).toMatch(/^https?:\/\/.+\/v1\/messages$/);
        expect(endpoint).toContain(provider.baseUrl);
      }
    }
  });

  test('endpoint 不含双斜杠（https:// 后除外）', () => {
    for (const provider of getAllProviders()) {
      const endpoint = getValidateEndpoint(provider);
      const pathPart = endpoint.replace('https://', '').replace('http://', '');
      expect(pathPart).not.toMatch(/\/\//);
    }
  });
});

// ─── resolveModel 测试 ───

describe('resolveModel 覆盖所有 provider', () => {
  test('每个 provider 的三个角色都能正确解析', () => {
    for (const provider of getAllProviders()) {
      for (const role of ['opus', 'sonnet', 'haiku'] as const) {
        const model = resolveModel(provider.key, role);
        expect(model).toBe(provider.models[role]);
        expect(model).toBeTruthy();
      }
    }
  });

  test('未知角色回退到 opus', () => {
    for (const provider of getAllProviders()) {
      const model = resolveModel(provider.key, 'unknown-role');
      expect(model).toBe(provider.models.opus);
    }
  });

  test('未知 provider key 回退到默认 provider 的 opus', () => {
    const model = resolveModel('nonexistent-provider', 'opus');
    expect(model).toBe(getProvider('glm-cn').models.opus);
  });
});

// ─── buildSdkEnv 覆盖所有 provider ───

describe('buildSdkEnv 覆盖所有 provider', () => {
  test('auth_token 类型 provider 设置 ANTHROPIC_AUTH_TOKEN', () => {
    const authTokenProviders = getAllProviders().filter(p => p.authStyle === 'auth_token');
    for (const provider of authTokenProviders) {
      const env = buildSdkEnv(provider.key, MOCK_KEY, 'opus');
      expect(env.ANTHROPIC_AUTH_TOKEN).toBe(MOCK_KEY);
      expect(env.ANTHROPIC_API_KEY).toBeUndefined();
    }
  });

  test('api_key 类型 provider 设置 ANTHROPIC_API_KEY', () => {
    const apiKeyProviders = getAllProviders().filter(p => p.authStyle === 'api_key');
    for (const provider of apiKeyProviders) {
      const env = buildSdkEnv(provider.key, MOCK_KEY, 'opus');
      expect(env.ANTHROPIC_API_KEY).toBe(MOCK_KEY);
      expect(env.ANTHROPIC_AUTH_TOKEN).toBeUndefined();
    }
  });

  test('有 baseUrl 的 provider 设置 ANTHROPIC_BASE_URL', () => {
    for (const provider of getAllProviders()) {
      const env = buildSdkEnv(provider.key, MOCK_KEY, 'opus');
      if (provider.baseUrl) {
        expect(env.ANTHROPIC_BASE_URL).toBe(provider.baseUrl);
      } else {
        expect(env.ANTHROPIC_BASE_URL).toBeUndefined();
      }
    }
  });

  test('envOverrides 被正确注入', () => {
    for (const provider of getAllProviders()) {
      const env = buildSdkEnv(provider.key, MOCK_KEY, 'opus');
      if (provider.envOverrides) {
        for (const [k, v] of Object.entries(provider.envOverrides)) {
          expect(env[k]).toBe(v);
        }
      }
    }
  });

  test('CLAUDE_CONFIG_DIR 始终设置', () => {
    for (const provider of getAllProviders()) {
      const env = buildSdkEnv(provider.key, MOCK_KEY, 'opus');
      expect(env.CLAUDE_CONFIG_DIR).toBe(`${process.env.HOME}/.aiva`);
    }
  });

  test('ANTHROPIC_MODEL 设置为对应角色的模型', () => {
    for (const provider of getAllProviders()) {
      for (const role of ['opus', 'sonnet', 'haiku'] as const) {
        const env = buildSdkEnv(provider.key, MOCK_KEY, role);
        expect(env.ANTHROPIC_MODEL).toBe(provider.models[role]);
      }
    }
  });

  test('ANTHROPIC_DEFAULT_*_MODEL 全部设置', () => {
    for (const provider of getAllProviders()) {
      const env = buildSdkEnv(provider.key, MOCK_KEY, 'opus');
      expect(env.ANTHROPIC_DEFAULT_OPUS_MODEL).toBe(provider.models.opus);
      expect(env.ANTHROPIC_DEFAULT_SONNET_MODEL).toBe(provider.models.sonnet);
      expect(env.ANTHROPIC_DEFAULT_HAIKU_MODEL).toBe(provider.models.haiku);
    }
  });
});

// ─── 真实 endpoint 连通性测试（mock key） ───

describe('真实 endpoint 连通性（使用 mock key）', () => {
  // 每个测试超时 15 秒
  jest.setTimeout(15_000);

  const providers = getAllProviders();

  for (const provider of providers) {
    test(`${provider.key} (${provider.nameZh}) - endpoint 可达`, async () => {
      const endpoint = getValidateEndpoint(provider);
      const headers = buildAuthHeaders(provider, MOCK_KEY);

      let response: Response;
      try {
        response = await fetch(endpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            model: provider.models.haiku,
            max_tokens: 1,
            messages: [{ role: 'user', content: 'hi' }],
          }),
          signal: AbortSignal.timeout(12_000),
        });
      } catch (err: any) {
        // 连接失败 = 链路有问题
        throw new Error(
          `${provider.key} endpoint 不可达: ${endpoint}\n` +
          `错误: ${err.message}\n` +
          `可能原因: DNS 解析失败 / 服务不可用 / URL 配置错误`
        );
      }

      // 如果到了这里，说明网络连接成功了
      // 状态码应该是认证错误（401/403/422 等），不应该是 5xx（服务端配置问题）
      if (response.ok) {
        // 极罕见：mock key 居然被接受了？
        console.warn(`${provider.key}: mock key 被接受，unexpected`);
      } else {
        // 非 5xx = 链路正常，只是 key 无效
        // 5xx = 可能是 endpoint 配置有问题
        if (response.status >= 500) {
          const body = await response.text().catch(() => '');
          throw new Error(
            `${provider.key} 返回 ${response.status}（服务端错误）\n` +
            `endpoint: ${endpoint}\n` +
            `body: ${body.slice(0, 500)}`
          );
        }
        // 4xx = 认证/请求错误，链路正常
        expect(response.status).toBeGreaterThanOrEqual(400);
        expect(response.status).toBeLessThan(500);
      }
    });
  }
});

// ─── 认证头构造测试 ───

describe('认证头构造（与 memory evaluator 逻辑一致）', () => {
  test('auth_token 类型使用 Bearer 头', () => {
    const authTokenProviders = getAllProviders().filter(p => p.authStyle === 'auth_token');
    for (const provider of authTokenProviders) {
      const headers = buildAuthHeaders(provider, MOCK_KEY);
      expect(headers['authorization']).toBe(`Bearer ${MOCK_KEY}`);
      expect(headers['x-api-key']).toBeUndefined();
    }
  });

  test('api_key 类型使用 x-api-key 头', () => {
    const apiKeyProviders = getAllProviders().filter(p => p.authStyle === 'api_key');
    for (const provider of apiKeyProviders) {
      const headers = buildAuthHeaders(provider, MOCK_KEY);
      expect(headers['x-api-key']).toBe(MOCK_KEY);
      expect(headers['authorization']).toBeUndefined();
    }
  });

  test('所有 provider 都带 anthropic-version 头', () => {
    for (const provider of getAllProviders()) {
      const headers = buildAuthHeaders(provider, MOCK_KEY);
      expect(headers['anthropic-version']).toBe('2023-06-01');
      expect(headers['content-type']).toBe('application/json');
    }
  });
});

// ─── 直接 API 调用模拟（memory evaluator 使用的模式） ───

describe('直接 API 调用模式（memory evaluator 路径）', () => {
  jest.setTimeout(15_000);

  // 抽样测试几个关键 provider
  const testProviders = ['glm-cn', 'anthropic', 'deepseek', 'openrouter'];

  for (const providerKey of testProviders) {
    test(`${providerKey} - 直接 API 调用可达`, async () => {
      const provider = getProvider(providerKey);
      const modelId = resolveModel(providerKey, 'haiku');
      const baseUrl = provider.baseUrl || 'https://api.anthropic.com';
      const headers = buildAuthHeaders(provider, MOCK_KEY);

      const response = await fetch(`${baseUrl}/v1/messages`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: modelId,
          max_tokens: 512,
          messages: [{ role: 'user', content: 'test' }],
        }),
        signal: AbortSignal.timeout(12_000),
      });

      // 4xx = 正常（key 无效）
      // 5xx = 有问题
      if (response.status >= 500) {
        const body = await response.text().catch(() => '');
        throw new Error(
          `${providerKey} 直接 API 调用返回 ${response.status}\nbody: ${body.slice(0, 500)}`
        );
      }
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.status).toBeLessThan(500);
    });
  }
});

// ─── 边界场景测试 ───

describe('边界场景', () => {
  test('buildSdkEnv 不污染 process.env', () => {
    const before = { ...process.env };
    buildSdkEnv('glm-cn', MOCK_KEY, 'opus');
    expect(process.env.ANTHROPIC_AUTH_TOKEN).toBe(before.ANTHROPIC_AUTH_TOKEN);
  });

  test('buildSdkEnv 返回的 env 不含 undefined 值', () => {
    const env = buildSdkEnv('glm-cn', MOCK_KEY, 'opus');
    for (const [k, v] of Object.entries(env)) {
      expect(v).not.toBeUndefined();
    }
  });

  test('buildSdkEnv 过滤掉 process.env 中已有的 ANTHROPIC_* 变量', () => {
    const origKey = process.env.ANTHROPIC_API_KEY;
    const origToken = process.env.ANTHROPIC_AUTH_TOKEN;
    process.env.ANTHROPIC_API_KEY = 'should-be-removed';
    process.env.ANTHROPIC_AUTH_TOKEN = 'should-be-removed';

    const env = buildSdkEnv('glm-cn', MOCK_KEY, 'opus');

    // 返回的 env 应使用新值
    expect(env.ANTHROPIC_AUTH_TOKEN).toBe(MOCK_KEY);
    // 不应包含旧 process.env 的 ANTHROPIC_* 值
    // env 里不会有 ANTHROPIC_API_KEY（因为 glm-cn 用 auth_token）
    expect(env.ANTHROPIC_API_KEY).toBeUndefined();

    // 恢复
    if (origKey !== undefined) process.env.ANTHROPIC_API_KEY = origKey;
    else delete process.env.ANTHROPIC_API_KEY;
    if (origToken !== undefined) process.env.ANTHROPIC_AUTH_TOKEN = origToken;
    else delete process.env.ANTHROPIC_AUTH_TOKEN;
  });

  test('getValidateEndpoint 与直接 API 调用路径一致', () => {
    for (const provider of getAllProviders()) {
      const endpoint = getValidateEndpoint(provider);
      const baseUrl = provider.baseUrl || 'https://api.anthropic.com';
      // memory evaluator 使用的模式：`${baseUrl}/v1/messages`
      expect(endpoint).toBe(`${baseUrl}/v1/messages`);
    }
  });
});
