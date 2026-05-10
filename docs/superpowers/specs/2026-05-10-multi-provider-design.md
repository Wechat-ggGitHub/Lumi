# Multi-Provider Extension Design

## 概述

将 Aiva 的 AI 服务商支持从 3 个（GLM-CN、GLM-Global、Anthropic）扩展为 20+ 个，覆盖国内主流、聚合平台、海外官方等全类型 Provider。

核心策略：配置驱动 + Anthropic 兼容层。所有 Provider 通过 `baseUrl` + 环境变量代理到 Anthropic 兼容接口注入 Claude Agent SDK，与现有方式完全一致，只是预设列表从 3 个扩展为 N 个。

## 设计决策

| 决策 | 选择 | 理由 |
|---|---|---|
| 架构方案 | 配置驱动，不引入代理层 | Claude Agent SDK 只需 env vars；绝大多数 Provider 提供 Anthropic 兼容端点 |
| API Key 存储 | Per-Provider 独立加密文件 | 切换 Provider 时自动加载对应 key，无需手动替换 |
| Provider 添加方式 | 预设配置对象 | 新增 Provider 只需在 provider-config.ts 加一条记录 |
| Onboarding | 新增 Provider 选择步骤 | 新用户可按自己已有 key 选择服务商 |
| UI 交互 | 分组卡片列表 + 展开面板 | 替代下拉菜单，适应 20+ Provider 的浏览和配置 |

参考项目：CC Switch（预设系统 + 环境变量注入）、CodePilot（Protocol 路由 + 模型角色映射）。

---

## 1. Provider Registry（provider-config.ts 就地改造）

### 新接口

```typescript
interface ProviderPreset {
  key: string
  name: string
  nameZh: string
  category: 'official' | 'china' | 'aggregator' | 'cloud'
  baseUrl: string
  authStyle: 'api_key' | 'auth_token'
  models: {
    opus: string
    sonnet: string
    haiku: string
  }
  modelDisplayNames: {
    opus: string
    sonnet: string
    haiku: string
  }
  envOverrides?: Record<string, string>
  keyPlaceholder: string
  websiteUrl?: string
  timeout?: number
}
```

### 关键变化

- **去掉 `validateEndpoint`** — 运行时从 `baseUrl` 计算：`${baseUrl || 'https://api.anthropic.com'}/v1/messages`
- **去掉 `defaultModels` 数组** — 改为 `models` / `modelDisplayNames` 两个扁平对象，更直观
- **新增 `category`** — 用于 UI 分组展示
- **新增 `websiteUrl`** — 帮助用户跳转到获取 API Key 的页面
- **`models` 允许复用** — 如 DeepSeek 的 sonnet 和 haiku 都可以是 `deepseek-chat`
- **`ProviderKey` 类型从字面量联合改为 `string`** — 运行时通过 registry 查找验证

### 预设列表（首期）

**官方（official）：**
- Anthropic

**国内（china）：**
- GLM (国内)、GLM (国际)、DeepSeek、Moonshot、MiniMax (国内)、MiniMax (国际)、Kimi、通义千问 (Bailian)、火山引擎 (Volcengine)、小米 MiMo

**聚合平台（aggregator）：**
- OpenRouter、SiliconFlow

### 辅助函数

保留现有接口，内部适配新数据结构：
- `getProvider(key: string)` — 按 key 查找，fallback 到 glm-cn
- `getDefaultProvider()` — 返回 glm-cn
- `getAllProviders()` — 返回全部预设
- `getProvidersByCategory(category)` — 按分类筛选
- `resolveModel(providerKey, role)` — 映射到具体 model ID
- `getValidateEndpoint(provider)` — 从 baseUrl 计算验证端点
- `buildSdkEnv(providerKey, apiKey, modelRole)` — 构建 SDK 环境变量

---

## 2. Per-Provider API Key 存储（keychain.ts 改造）

### 存储结构

```
~/.aiva/secure/
  api-key-glm-cn.enc
  api-key-deepseek.enc
  api-key-anthropic.enc
  ...
```

### 函数签名变更

所有函数加 `providerKey` 参数，无向后兼容重载：

```typescript
migratePerProviderKeys(): void        // 启动时一次性迁移
saveApiKey(key: string, providerKey: string): void
loadApiKey(providerKey: string): string | null
deleteApiKey(providerKey: string): void
hasApiKey(providerKey: string): boolean
```

### 迁移逻辑

1. 启动时 `migratePerProviderKeys()` 检测旧文件 `api-key.enc`
2. 读取当前 settings 的 `provider` 值（fallback 到 `glm-cn`）
3. 仅当目标文件不存在时，将 `api-key.enc` 重命名为 `api-key-{provider}.enc`（防止部分迁移后覆盖）
4. 在现有 `migrateKeyFile()`（处理 `anthropic-key.enc`）之后执行，确保链式迁移

### 文件路径安全

```typescript
const keyPath = (providerKey: string) => {
  if (!/^[a-z0-9-]+$/.test(providerKey)) throw new Error('Invalid provider key');
  return path.join(KEYCHAIN_DIR, `api-key-${providerKey}.enc`);
};
```

---

## 3. IPC Handler 改动（electron/main.ts）

### settings:load

返回值变更：
```typescript
return {
  ...settings,
  hasApiKey: hasApiKey(settings.provider || 'glm-cn'),  // 当前 provider 的 key 状态
  apiKeyStatus: Object.fromEntries(
    getAllProviders().map(p => [p.key, hasApiKey(p.key)])
  ),  // 所有 provider 的 key 状态映射
};
```

UI 可通过 `hasApiKey` 判断当前状态，通过 `apiKeyStatus` 显示列表中的绿/黄徽章。

### settings:save-api-key

签名变更：`(_, { key, providerKey }) => {}`

关键修正：
- 使用传入的 `providerKey`（而非 `loadSettings().provider`）来解析验证端点
- 验证 header 按 `authStyle` 切换：
  ```typescript
  if (provider.authStyle === 'auth_token') {
    headers['authorization'] = `Bearer ${key}`;
  } else {
    headers['x-api-key'] = key;
  }
  ```
- 保存时传入 providerKey：`saveApiKey(key, providerKey)`

### onboarding:validate-api-key

已有 `providerKey` 参数（可选），改为必传。renderer 端传入用户选择的 provider。验证 header 同样按 `authStyle` 切换。

### 启动判断

```typescript
const settings = loadSettings();
const needsOnboarding = !hasApiKey(settings.provider || 'glm-cn');
```

---

## 4. Settings UI 改造

### Provider 设置页（settings/provider/page.tsx 重写）

**布局：分组卡片列表 + 展开配置面板**

从 registry 读取 provider 列表，按 `category` 分组渲染：

- 每组用 `SectionHeader` 显示分类标题（官方 / 国内 / 聚合平台）
- 每个 provider 是一个卡片，显示：名称 + key 状态徽章 + 模型摘要
- 点击卡片展开内嵌配置面板：
  - 模型选择（Select 下拉，选项从 provider 的 modelDisplayNames 动态生成）
  - API Key 输入（SingleLineInput，placeholder 从 provider 的 keyPlaceholder 读取）
  - 获取 key 链接（从 provider 的 websiteUrl）
- 当前选中的 provider 用紫色边框 + ✓ 标记
- 底部 `BottomActionBar`：「取消」+「保存更改」

**数据流：**
- `useEffect` 调用 `settings:load` 获取当前 provider + apiKeyStatus
- 点击卡片 → 本地 state 切换选中 provider + 展开面板
- 保存 → `settings:save` 保存 provider/model + `settings:save-api-key` 保存 key
- 切换卡片时丢弃展开面板中未保存的内容（不弹确认，输入框内容丢失成本低）

### 设置总览页（settings/page.tsx）

去掉硬编码的 `providerNames` 和 `modelLabels`，改为从 registry 动态查找：

```typescript
const provider = getProvider(summary.provider || 'glm-cn');
const providerName = provider.nameZh;
const modelLabel = provider.modelDisplayNames[summary.modelPreset] ?? summary.modelPreset;
```

---

## 5. Onboarding 改造（Onboarding.tsx）

### 新增步骤

在「火山引擎语音」和「API Key」之间插入 `select-provider` 步骤：

流程变为：welcome → accessibility → volcengine → **select-provider** → api-key → cwd → done

### select-provider 步骤

- 展示 5-6 个常用 provider（GLM、DeepSeek、Anthropic、Moonshot、MiniMax、OpenRouter）
- 紧凑卡片列表，GLM 默认选中并标注「推荐」
- 底部提示「更多服务商可在设置中配置」
- 选中后点击「下一步」进入 API Key 步骤

### API Key 步骤改动

- `providerKey` 不再硬编码为 `'glm-cn'`，改为使用上一步选择的值
- placeholder 动态显示：`provider.keyPlaceholder`
- 验证调用传入正确的 providerKey

---

## 6. 文件改动清单

### 改造

| 文件 | 改动 |
|---|---|
| `src/lib/provider-config.ts` | 扩展预设列表 + 新接口 |
| `src/lib/keychain.ts` | 所有函数加 providerKey，新增 migratePerProviderKeys() |
| `electron/main.ts` | IPC handlers + 启动迁移 + 验证 header 修复 |
| `src/types/index.ts` | ProviderKey → string |
| `src/lib/claude-client.ts` | 类型适配 |
| `src/app/(main)/settings/provider/page.tsx` | 重写为分组卡片 UI |
| `src/app/(main)/settings/page.tsx` | 动态 provider 名称 + 清理局部类型 |
| `src/components/Onboarding.tsx` | 加 select-provider 步骤 |
| `src/__tests__/provider-config.test.ts` | 匹配新预设 |

### 不变

| 文件 | 原因 |
|---|---|
| `electron/tray.ts` | 状态指示与 provider 无关 |
| `electron/recorder.ts` | ASR 与 provider 无关 |
| `electron/tts.ts` | TTS 与 provider 无关 |
| `src/lib/store.ts` | 状态机不涉及 provider 逻辑 |
| `src/lib/persona-file.ts` | 与 provider 无关 |
| `src/lib/aiva-context.ts` | 与 provider 无关 |

### 依赖关系

```
provider-config.ts (改造)
  ↑ 被引用
  ├── keychain.ts (改动：加 providerKey)
  ├── electron/main.ts (改动：IPC + 迁移 + header 修复)
  ├── claude-client.ts (改动：类型)
  ├── daily-memory-writer.ts (不变：只访问 baseUrl/authStyle，字段未变)
  ├── core-memory-evaluator.ts (不变：同上)
  ├── settings/provider/page.tsx (重写)
  ├── settings/page.tsx (改动)
  └── Onboarding.tsx (改动：加步骤)
```

---

## 7. 不在范围内

- 本地代理/格式转换（OpenAI/Gemini 原生接入）— 后续可扩展
- 自定义 Provider（用户手动输入 baseUrl + key）— 后续可扩展
- Provider 故障转移/熔断 — 不需要
- Provider 连通性测试/诊断 UI — 后续可扩展
- Ollama/LiteLLM 等本地模型接入 — 后续可扩展
