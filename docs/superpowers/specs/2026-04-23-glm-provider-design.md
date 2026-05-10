# GLM Coding Plan Provider Integration

**Date**: 2026-04-23
**Status**: Draft

## Goal

Change Aiva's default API provider from Anthropic to GLM Coding Plan, while keeping Anthropic as a switchable alternative. Users should be able to select a provider, configure their API key, and choose models from the settings page.

## Background

Aiva currently hardcodes Anthropic as the sole API provider:
- API key stored as `anthropic-key.enc` via Electron safeStorage
- Onboarding validates keys against `api.anthropic.com`
- `claude-client.ts` injects `ANTHROPIC_API_KEY` into the SDK env
- No provider/model selection UI

GLM Coding Plan provides an Anthropic-compatible endpoint at `https://open.bigmodel.cn/api/anthropic`. The Claude Agent SDK works with it by setting `ANTHROPIC_AUTH_TOKEN` + `ANTHROPIC_BASE_URL` + model mapping env vars instead of `ANTHROPIC_API_KEY`.

Reference: CodePilot's `provider-catalog.ts` and `provider-resolver.ts` implement a proven multi-provider system using env injection.

## Provider Presets

Three presets, hardcoded in `src/lib/provider-config.ts`:

### GLM CN (default)

| Field | Value |
|-------|-------|
| key | `glm-cn` |
| name | GLM (CN) |
| baseUrl | `https://open.bigmodel.cn/api/anthropic` |
| authStyle | `auth_token` |
| timeout | 3000000ms |
| models | Opus: glm-5.1, Sonnet: glm-5-turbo, Haiku: glm-4.5-air |

### GLM Global

| Field | Value |
|-------|-------|
| key | `glm-global` |
| name | GLM (Global) |
| baseUrl | `https://api.z.ai/api/anthropic` |
| authStyle | `auth_token` |
| timeout | 3000000ms |
| models | Opus: glm-5.1, Sonnet: glm-5-turbo, Haiku: glm-4.5-air |

### Anthropic

| Field | Value |
|-------|-------|
| key | `anthropic` |
| name | Anthropic |
| baseUrl | none (SDK default) |
| authStyle | `api_key` |
| models | Opus: claude-opus-4-6, Sonnet: claude-sonnet-4-6, Haiku: claude-haiku-4-5 |

## Data Model

Provider selection persists in the existing `settings.json` alongside other app settings:

```json
{
  "provider": "glm-cn",
  "modelPreset": "opus"
}
```

- `provider`: one of `glm-cn` | `glm-global` | `anthropic`
- `modelPreset`: one of `opus` | `sonnet` | `haiku` (maps to different models per provider)

API key storage changes from `anthropic-key.enc` to `api-key.enc` (same safeStorage encryption, new filename). A one-time migration renames the file on app start.

## Implementation Plan

### 1. New file: `src/lib/provider-config.ts`

Static provider catalog and env builder.

```typescript
interface ProviderPreset {
  key: string;
  name: string;
  nameZh: string;
  baseUrl: string;
  authStyle: 'api_key' | 'auth_token';
  defaultModels: { role: string; modelId: string; displayName: string }[];
  envOverrides: Record<string, string>;
  keyPlaceholder: string;
  validateEndpoint: string;
}

const PROVIDERS: Record<string, ProviderPreset>;

function getProvider(key: string): ProviderPreset;
function getDefaultProvider(): ProviderPreset;
function buildSdkEnv(providerKey: string, apiKey: string, modelRole: string): Record<string, string>;
```

`buildSdkEnv()` output:
- Clears all `ANTHROPIC_*` vars from base env
- Sets `ANTHROPIC_AUTH_TOKEN` = apiKey (for GLM) or `ANTHROPIC_API_KEY` = apiKey (for Anthropic)
- Sets `ANTHROPIC_BASE_URL` (for GLM only)
- Sets `ANTHROPIC_MODEL` to the resolved model ID based on provider + modelPreset
- Sets `ANTHROPIC_DEFAULT_*_MODEL` env vars from the preset's defaultModels
- Merges `envOverrides` (timeout, etc.)

### 2. Modify: `src/lib/claude-client.ts`

Replace the hardcoded env injection:

```typescript
// Before:
env: { ANTHROPIC_API_KEY: apiKey }

// After:
env: buildSdkEnv(provider, apiKey, modelPreset)
```

The `executeClaude()` function signature gains `providerKey` and `modelPreset` parameters (passed from main.ts which reads settings.json).

### 3. Modify: `electron/main.ts`

**Settings IPC** — `settings:load` returns `provider` and `modelPreset` in addition to existing fields.

**API key validation IPC** — `onboarding:validate-api-key` reads current provider preset, sends validation request to the correct endpoint:
- GLM: POST to `https://open.bigmodel.cn/api/anthropic/v1/messages` with the user's key
- Anthropic: existing behavior (POST to `api.anthropic.com/v1/messages`)

**Key file migration** — On app start, if `anthropic-key.enc` exists but `api-key.enc` does not, rename the file.

**SDK invocation** — When calling `executeClaude()`, read `provider` and `modelPreset` from settings and pass them through.

### 4. Modify: `src/app/settings/page.tsx`

Add provider and model sections:

**Provider selector**: radio buttons or dropdown with 3 options (GLM CN, GLM Global, Anthropic). Changing provider triggers a re-check of whether a key is stored.

**Model selector**: dropdown with 3 options (Opus, Sonnet, Haiku), display names update based on selected provider. For GLM CN: "GLM-5.1", "GLM-5-Turbo", "GLM-4.5-Air". For Anthropic: "Claude Opus 4.6", "Claude Sonnet 4.6", "Claude Haiku 4.5".

**API Key section**: placeholder text updates based on provider (GLM: "从 open.bigmodel.cn 获取", Anthropic: "sk-ant-...").

### 5. Modify: Onboarding (`src/components/Onboarding.tsx`)

- `api-key` step: placeholder changes to `从 open.bigmodel.cn 获取您的 API Key`
- Validation request goes to GLM endpoint by default
- After validation, save `provider: "glm-cn"` to settings.json

### 6. Modify: `src/lib/keychain.ts`

- Rename `API_KEY_FILE` from `anthropic-key.enc` to `api-key.enc`
- Keep all other behavior (safeStorage encrypt/decrypt) unchanged

## Files Changed

| File | Change |
|------|--------|
| `src/lib/provider-config.ts` | **New** — provider catalog + env builder |
| `src/lib/claude-client.ts` | Use `buildSdkEnv()` instead of hardcoded env |
| `electron/main.ts` | Provider-aware IPC handlers, key migration, pass provider to SDK |
| `src/app/settings/page.tsx` | Add provider + model selector UI |
| `src/components/Onboarding.tsx` | GLM-branded API key step |
| `src/lib/keychain.ts` | Rename key file |

## Validation

API key validation for each provider:

**GLM CN/Global**:
```typescript
POST https://open.bigmodel.cn/api/anthropic/v1/messages
Headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }
Body: { model: 'glm-4.5-air', max_tokens: 1, messages: [{ role: 'user', content: 'hi' }] }
```

**Anthropic**: existing behavior unchanged.

## Error Handling

- Invalid key: show "API Key 验证失败，请检查是否正确" (provider-agnostic message)
- Network error: show "网络错误，请检查网络连接"
- No key stored + user tries to execute: show "请先配置 API Key" with link to settings

## Not In Scope

- Custom/self-managed providers (only 3 presets)
- Multiple keys per provider
- Provider health check / diagnostics
- Token usage display per provider
- OAuth login flow
