# Voice Provider 多服务商架构设计

**日期：** 2026-05-11
**状态：** 已批准

## 概述

将 Aiva 的 TTS/ASR 语音服务从硬编码火山引擎改为多服务商架构，支持独立选择 ASR 和 TTS 服务商。新增阿里云百炼（Paraformer ASR + CosyVoice TTS）支持，并添加密钥获取教程页面。

## 设计决策

- **ASR 和 TTS 独立选择**：用户可以混搭不同服务商（如火山引擎 ASR + 阿里云 TTS）
- **VoiceProvider 抽象层**：与现有 LLM provider 架构风格一致
- **Onboarding 保持不变**：默认火山引擎，阿里云作为高级选项在设置页配置
- **教程页独立**：`/settings/voice/tutorial`，按服务商 tab 切换

---

## Section 1：VoiceProvider 抽象层

### 类型定义（`src/types/voice-provider.ts`）

```typescript
interface VoiceProviderConfig {
  key: string           // 'volcengine' | 'aliyun'
  name: string          // '火山引擎' | '阿里云百炼'
  asrSupported: boolean
  ttsSupported: boolean
  credentialFields: CredentialField[]
}

interface CredentialField {
  key: string           // 'appId' | 'accessToken' | 'apiKey'
  label: string         // 'App ID' | 'Access Token' | 'API Key'
  type: 'text' | 'password'
  placeholder: string
}

interface AsrResult {
  text: string
}

interface TtsWord {
  word: string
  startTime: number
  endTime: number
}

interface TtsResult {
  audioPath: string
  sentences: TtsSentence[]
  words: TtsWord[]
}
```

### Provider 配置常量

```typescript
const VOICE_PROVIDERS: Record<string, VoiceProviderConfig> = {
  volcengine: {
    key: 'volcengine',
    name: '火山引擎',
    asrSupported: true,
    ttsSupported: true,
    credentialFields: [
      { key: 'appId', label: 'App ID', type: 'text', placeholder: '在火山引擎 API 服务中心获取' },
      { key: 'accessToken', label: 'Access Token', type: 'password', placeholder: '点击小眼睛显示' },
    ],
  },
  aliyun: {
    key: 'aliyun',
    name: '阿里云百炼',
    asrSupported: true,
    ttsSupported: true,
    credentialFields: [
      { key: 'apiKey', label: 'API Key', type: 'password', placeholder: 'sk-xxx 格式' },
    ],
  },
}
```

### ASR 模式差异

| 服务商 | 端点类型 | 音频发送方式 |
|--------|---------|-------------|
| 火山引擎 | 非流式（`bigmodel_nostream`） | 一次性发送全部 PCM + gzip 压缩分块 |
| 阿里云 | 流式（`paraformer-realtime-v2`） | 全双工 WebSocket，100ms 间隔发送二进制帧 |

阿里云 ASR 需要分块发送音频并维护全双工状态（`run-task` → 音频帧 → `result-generated` → `finish-task`），实现比火山引擎复杂。两者都统一通过 `AsrProvider.transcribe()` 封装，上层调用者不感知差异。

### Electron 侧目录结构

```
electron/voice-providers/
├── types.ts              // 共享接口定义（AsrProvider, TtsProvider）
├── volcengine-asr.ts     // 从 src/lib/doubao-asr.ts 迁移核心逻辑
├── volcengine-tts.ts     // 从 electron/tts.ts 迁移核心逻辑
├── aliyun-asr.ts         // 新增：Paraformer 流式 WebSocket ASR
└── aliyun-tts.ts         // 新增：CosyVoice WebSocket TTS
```

### AsrProvider 接口

```typescript
interface AsrProvider {
  transcribe(filePath: string): Promise<AsrResult>
  validateCredentials(): Promise<void>
}
```

`AudioRecorder`（`electron/recorder.ts`）**保留**，职责不变（临时文件管理、错误处理）。改造为内部持有 `AsrProvider` 实例而非直接依赖 `DoubaoASR`：

```typescript
// 改造前
class AudioRecorder {
  private asr: DoubaoASR
  constructor(creds: VolcengineCredentials) { this.asr = new DoubaoASR(...) }
}

// 改造后
class AudioRecorder {
  private provider: AsrProvider
  constructor(provider: AsrProvider) { this.provider = provider }
  async transcribe(wavPath: string) {
    // 临时文件管理等逻辑不变，最后调用 this.provider.transcribe(filePath)
  }
}
```

创建 `AudioRecorder` 实例的工厂函数：

```typescript
function createAsrProvider(providerKey: string, credentials: Record<string, string>): AsrProvider {
  switch (providerKey) {
    case 'volcengine': return new VolcengineAsr(credentials.appId, credentials.accessToken)
    case 'aliyun': return new AliyunAsr(credentials.apiKey)
    default: throw new Error(`Unknown ASR provider: ${providerKey}`)
  }
}
```

### TtsProvider 接口

```typescript
interface TtsProvider {
  synthesize(text: string, signal?: AbortSignal): Promise<TtsResult | null>
  stop(): void
  validateCredentials(): Promise<void>
}
```

`TtsService` 改名为 `VolcengineTts`，实现 `TtsProvider` 接口。`AliyunTts` 实现同一接口。`main.ts` 中的 `ttsService` 变量类型改为 `TtsProvider`。

### 设置存储变更（`src/types/index.ts`）

```typescript
// AppSettings 新增
asrProvider?: 'volcengine' | 'aliyun'   // default: 'volcengine'
ttsProvider?: 'volcengine' | 'aliyun'   // default: 'volcengine'
```

### 密钥存储（`~/.aiva/secure/`）

| 文件 | 内容 | 格式 |
|------|------|------|
| `volcengine.json` | 火山引擎凭据（保持不变） | `{appId, accessToken}` |
| `aliyun-voice.json` | 阿里云凭据（新增） | `{apiKey}` |

---

## Section 2：设置页面改版

### `/settings/voice` 页面

分为两个独立区块：

#### ASR 区块
- 标题：「语音识别（ASR）」
- 服务商下拉选择：火山引擎 / 阿里云百炼
- 根据选择动态渲染密钥输入字段
- 「验证连接」按钮 + 状态徽章
- 「如何获取密钥？」链接 → `/settings/voice/tutorial?provider=xxx`

#### TTS 区块
- 标题：「语音合成（TTS）」
- 服务商下拉选择：火山引擎 / 阿里云百炼
- 密钥输入字段
- 「验证连接」按钮 + 状态徽章
- 「如何获取密钥？」链接

#### 密钥复用
当两个区块选择了同一服务商时，TTS 区块显示提示：「已从 ASR 配置中检测到 xxx 的密钥，是否复用？」提供一键复用按钮。

### 设置总览卡片

`/settings` 主页的「语音」卡片摘要改为：「ASR: 火山引擎 · TTS: 火山引擎」格式。

---

## Section 3：教程页面

### 路由

`/settings/voice/tutorial?provider=volcengine|aliyun`

### 页面结构

顶部服务商 tab 切换：「火山引擎」|「阿里云百炼」，默认选中 URL 参数指定的服务商。

### 火山引擎教程步骤

1. **注册账号** — 说明 + 链接火山引擎官网
2. **实名认证** — 微信/抖音扫脸认证说明
3. **创建应用** — 应用名 `aiva`，接入「豆包流式语音识别模型 2.0 小时版」
4. **获取密钥** — 在 API 服务中心找到 App ID 和 Access Token
5. **返回设置** — 「返回设置页面」按钮

### 阿里云百炼教程步骤

1. **开通百炼** — 链接百炼控制台 + 实名认证说明
2. **创建 API Key** — 百炼控制台 API-KEY 管理
3. **开通模型** — 模型广场开通 Paraformer 和 CosyVoice
4. **返回设置** — 「返回设置页面」按钮

每步包含：标题 + 简短说明 + 外部链接按钮。不依赖截图。

---

## Section 4：IPC 和 main.ts 改造

### IPC Handlers

保留现有（向后兼容）：
```
settings:save-volcengine-credentials
settings:get-volcengine-credentials
```

新增：
```
settings:save-voice-provider        → { type: 'asr'|'tts', provider: string }
settings:get-voice-provider         → { type: 'asr'|'tts' } → provider string
settings:save-aliyun-credentials    → { apiKey: string }
settings:get-aliyun-credentials     → { apiKey: string }
settings:validate-voice-credentials → { provider, type: 'asr'|'tts', credentials } → boolean
```

### main.ts 改造

#### 凭据加载流程

提取 `loadVoiceCredentials(providerKey: string): Record<string, string>` 函数：
- `volcengine` → 调用 `loadVolcengineCredentials()` 返回 `{appId, accessToken}`
- `aliyun` → 调用新增的 `loadAliyunVoiceCredentials()` 返回 `{apiKey}`

#### Provider 初始化

```typescript
function initVoiceProviders(): void {
  const settings = loadSettings()

  // ASR
  const asrKey = settings.asrProvider || 'volcengine'
  const asrCreds = loadVoiceCredentials(asrKey)
  const asrProvider = createAsrProvider(asrKey, asrCreds)
  recorder = new AudioRecorder(asrProvider)

  // TTS
  const ttsKey = settings.ttsProvider || 'volcengine'
  const ttsCreds = loadVoiceCredentials(ttsKey)
  ttsService = createTtsProvider(ttsKey, ttsCreds)
}
```

启动时调用 `initVoiceProviders()` 替代现有的硬编码初始化。

#### ASR/TTS 调用点改造

```typescript
// ASR 调用（main.ts:426 附近）
recorder.transcribeFile(wavPath).then(text => { ... })

// TTS 调用（main.ts:938 附近）
// 改造前：直接传 credentials
ttsService.synthesize({ appId: creds.appId, accessToken: creds.accessToken, text })

// 改造后：凭据已封装在 provider 内部
ttsService.synthesize(text, signal)
```

TTS provider 在创建时接收凭据，调用者不再需要手动传递。

#### Provider 热重载

当用户在设置页切换 ASR/TTS provider 或更新凭据时，IPC handler 需要重新初始化对应实例：

```typescript
ipcMain.handle('settings:save-voice-provider', async (_, { type, provider }) => {
  // 1. 验证新 provider 的凭据是否存在
  const creds = loadVoiceCredentials(provider)
  if (!creds || Object.values(creds).every(v => !v)) {
    throw new Error(`请先配置 ${VOICE_PROVIDERS[provider].name} 的密钥`)
  }

  // 2. 验证凭据有效性
  if (type === 'asr') {
    const asrProvider = createAsrProvider(provider, creds)
    await asrProvider.validateCredentials()
    recorder = new AudioRecorder(asrProvider)
  } else {
    const ttsProvider = createTtsProvider(provider, creds)
    await ttsProvider.validateCredentials()
    ttsService = ttsProvider
  }

  // 3. 保存设置
  const settings = loadSettings()
  if (type === 'asr') settings.asrProvider = provider
  else settings.ttsProvider = provider
  saveSettings(settings)
})
```

现有的 `settings:save-volcengine-credentials` handler（main.ts:1411）也需要改造：保存凭据后，如果当前 ASR/TTS provider 是火山引擎，自动重建实例。

### Onboarding

保持火山引擎配置步骤不变。阿里云作为高级选项仅在设置页提供。

---

## 阿里云百炼 API 集成细节

### 认证
- 单个 API Key（`sk-xxx` 格式）
- HTTP 头部：`Authorization: Bearer <api_key>`

### ASR（Paraformer）
- WebSocket 端点：`wss://dashscope.aliyuncs.com/api-ws/v1/inference`
- 模型：`paraformer-realtime-v2`
- 音频格式：PCM 16kHz 16bit 单声道
- 协议：全双工流式 — JSON `run-task` → 二进制音频帧（100ms 间隔）→ JSON `result-generated` 事件（部分/最终结果）→ `finish-task`
- 注意：与火山引擎非流式模式不同，需要维护全双工状态，每 100ms 发送约 3200 字节 PCM 帧

### TTS（CosyVoice）
- WebSocket 端点：同上
- 模型：`cosyvoice-v2`（支持 SSML 和字级时间戳）
- 输出格式：MP3 24kHz
- 协议：JSON `run-task` + `continue-task` 指令 → 二进制音频帧

### 价格参考
- ASR：0.00024 元/秒
- TTS：按字符计费（CosyVoice v2 有免费额度）
