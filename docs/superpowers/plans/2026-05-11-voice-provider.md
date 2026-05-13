# Voice Provider 多服务商实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 Aiva 的 TTS/ASR 从硬编码火山引擎改为多服务商架构，新增阿里云百炼支持，添加密钥获取教程页面。

**Architecture:** 创建 VoiceProvider 抽象层（AsrProvider / TtsProvider 接口），每个服务商实现统一接口。AudioRecorder 保留为外壳，内部持有 AsrProvider。TTS 调用点封装凭据传递。设置页 ASR/TTS 独立选择服务商，独立教程页。

**Tech Stack:** TypeScript, WebSocket (ws), Electron IPC, Next.js App Router

**Design Spec:** `docs/superpowers/specs/2026-05-11-voice-provider-design.md`

---

## File Structure

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `electron/voice-providers/types.ts` | AsrProvider / TtsProvider 接口定义 |
| Create | `electron/voice-providers/volcengine-asr.ts` | 火山引擎 ASR（从 `src/lib/doubao-asr.ts` 迁移） |
| Create | `electron/voice-providers/volcengine-tts.ts` | 火山引擎 TTS（从 `electron/tts.ts` 迁移） |
| Create | `electron/voice-providers/aliyun-asr.ts` | 阿里云 Paraformer 流式 ASR |
| Create | `electron/voice-providers/aliyun-tts.ts` | 阿里云 CosyVoice TTS |
| Create | `electron/voice-providers/index.ts` | 工厂函数 createAsrProvider / createTtsProvider |
| Create | `src/lib/voice-provider-config.ts` | Provider 配置常量 + 供渲染层使用的类型 |
| Create | `src/app/(main)/settings/voice/tutorial/page.tsx` | 教程页面 |
| Modify | `src/types/index.ts` | AppSettings 新增 asrProvider / ttsProvider |
| Modify | `src/lib/keychain.ts` | 新增阿里云凭据存储函数 |
| Modify | `electron/recorder.ts` | 改为持有 AsrProvider 接口 |
| Modify | `electron/main.ts` | initVoiceProviders、新 IPC handlers、TTS 调用点改造 |
| Modify | `src/app/(main)/settings/page.tsx` | 语音卡片摘要更新 |
| Modify | `src/app/(main)/settings/voice/page.tsx` | ASR/TTS 独立区块 + 服务商选择 |

---

### Task 1: 类型定义与配置常量

**Files:**
- Create: `electron/voice-providers/types.ts`
- Create: `src/lib/voice-provider-config.ts`
- Modify: `src/types/index.ts:64-76`

- [ ] **Step 1: 创建 AsrProvider / TtsProvider 接口**

```typescript
// electron/voice-providers/types.ts
import { TtsSentence, TtsWord } from './volcengine-tts'

export interface AsrResult {
  text: string
}

export interface AsrProvider {
  transcribe(filePath: string): Promise<AsrResult>
  validateCredentials(): Promise<void>
}

export interface TtsResult {
  audioPath: string
  sentences: TtsSentence[]
  words: TtsWord[]
}

export interface TtsProvider {
  synthesize(text: string, signal?: AbortSignal): Promise<TtsResult | null>
  stop(): void
  validateCredentials(): Promise<void>
}
```

- [ ] **Step 2: 创建 Provider 配置常量（供前后端共享）**

```typescript
// src/lib/voice-provider-config.ts
export interface VoiceProviderConfig {
  key: string
  name: string
  asrSupported: boolean
  ttsSupported: boolean
  credentialFields: CredentialField[]
}

export interface CredentialField {
  key: string
  label: string
  type: 'text' | 'password'
  placeholder: string
}

export const VOICE_PROVIDERS: Record<string, VoiceProviderConfig> = {
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

export type VoiceProviderKey = 'volcengine' | 'aliyun'
```

- [ ] **Step 3: AppSettings 新增 asrProvider / ttsProvider**

在 `src/types/index.ts` 的 `AppSettings` 接口中新增两个字段：

```typescript
// src/types/index.ts — 在 AppSettings 接口的 disabledSkills 后面添加
  asrProvider?: string;
  ttsProvider?: string;
```

- [ ] **Step 4: Commit**

```bash
git add electron/voice-providers/types.ts src/lib/voice-provider-config.ts src/types/index.ts
git commit -m "feat(voice): add VoiceProvider types and config constants"
```

---

### Task 2: 阿里云凭据存储

**Files:**
- Modify: `src/lib/keychain.ts:58-86`

- [ ] **Step 1: 在 keychain.ts 末尾添加阿里云凭据函数**

在 `hasVolcengineCredentials()` 函数后面追加：

```typescript
const ALIYUN_VOICE_CRED_FILE = path.join(KEYCHAIN_DIR, 'aliyun-voice.json');

interface AliyunVoiceCredentials {
  apiKey: string;
}

export function saveAliyunVoiceCredentials(apiKey: string): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Encryption not available on this system');
  }
  if (!fs.existsSync(KEYCHAIN_DIR)) fs.mkdirSync(KEYCHAIN_DIR, { recursive: true });
  const json = JSON.stringify({ apiKey });
  const encrypted = safeStorage.encryptString(json);
  fs.writeFileSync(ALIYUN_VOICE_CRED_FILE, encrypted);
}

export function loadAliyunVoiceCredentials(): AliyunVoiceCredentials | null {
  if (!fs.existsSync(ALIYUN_VOICE_CRED_FILE)) return null;
  if (!safeStorage.isEncryptionAvailable()) return null;
  const encrypted = fs.readFileSync(ALIYUN_VOICE_CRED_FILE);
  const json = safeStorage.decryptString(encrypted);
  return JSON.parse(json);
}

export function hasAliyunVoiceCredentials(): boolean {
  return fs.existsSync(ALIYUN_VOICE_CRED_FILE);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/keychain.ts
git commit -m "feat(voice): add Aliyun voice credential storage"
```

---

### Task 3: 火山引擎 Provider 适配

将现有 `doubao-asr.ts` 和 `tts.ts` 的核心逻辑封装为 AsrProvider / TtsProvider 实现。

**Files:**
- Create: `electron/voice-providers/volcengine-asr.ts`
- Create: `electron/voice-providers/volcengine-tts.ts`

- [ ] **Step 1: 创建 VolcengineAsr — 封装 DoubaoASR**

```typescript
// electron/voice-providers/volcengine-asr.ts
import { AsrProvider, AsrResult } from './types'
import { DoubaoASR } from '../../src/lib/doubao-asr'
import { log } from '../../src/lib/logger'
import fs from 'fs'

export class VolcengineAsr implements AsrProvider {
  private asr: DoubaoASR

  constructor(appId: string, accessToken: string) {
    this.asr = new DoubaoASR(appId, accessToken)
  }

  async transcribe(filePath: string): Promise<AsrResult> {
    const stat = fs.statSync(filePath)
    log.info('VolcengineASR: 开始转写, 文件:', filePath, '大小:', stat.size, 'bytes')
    if (stat.size < 44) {
      throw new Error('音频文件过小，可能录制失败')
    }
    const text = await this.asr.transcribe(filePath)
    log.info('VolcengineASR: 转写完成, 结果长度:', text.length)
    return { text }
  }

  async validateCredentials(): Promise<void> {
    await this.asr.validateCredentials()
  }
}
```

- [ ] **Step 2: 创建 VolcengineTts — 封装现有 TtsService**

```typescript
// electron/voice-providers/volcengine-tts.ts
import { TtsProvider, TtsResult } from './types'
import { TtsService } from '../tts'
import { loadVolcengineCredentials } from '../../src/lib/keychain'
import { log } from '../../src/lib/logger'

export interface TtsSentence {
  text: string
  startTime: number
  endTime: number
}

export interface TtsWord {
  word: string
  startTime: number
  endTime: number
}

export class VolcengineTts implements TtsProvider {
  private service: TtsService
  private appId: string
  private accessToken: string

  constructor(appId: string, accessToken: string) {
    this.service = new TtsService()
    this.appId = appId
    this.accessToken = accessToken
  }

  async synthesize(text: string, signal?: AbortSignal): Promise<TtsResult | null> {
    return this.service.synthesize({
      appId: this.appId,
      accessToken: this.accessToken,
      text,
      signal,
    })
  }

  stop(): void {
    this.service.stop()
  }

  async validateCredentials(): Promise<void> {
    // TTS 与 ASR 共用凭据，用 ASR 验证方式检查连通性
    const { DoubaoASR } = await import('../../src/lib/doubao-asr')
    const asr = new DoubaoASR(this.appId, this.accessToken)
    await asr.validateCredentials()
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add electron/voice-providers/volcengine-asr.ts electron/voice-providers/volcengine-tts.ts
git commit -m "feat(voice): add Volcengine AsrProvider and TtsProvider wrappers"
```

---

### Task 4: 阿里云 ASR Provider（Paraformer）

**Files:**
- Create: `electron/voice-providers/aliyun-asr.ts`

- [ ] **Step 1: 实现 AliyunAsr**

```typescript
// electron/voice-providers/aliyun-asr.ts
import WebSocket from 'ws'
import fs from 'fs'
import zlib from 'zlib'
import { AsrProvider, AsrResult } from './types'
import { log } from '../../src/lib/logger'

const WS_URL = 'wss://dashscope.aliyuncs.com/api-ws/v1/inference'
const CONNECT_TIMEOUT = 10_000
const TOTAL_TIMEOUT = 30_000
const SAMPLE_RATE = 16000
const BYTES_PER_SAMPLE = 2
const CHANNELS = 1
// 100ms of 16kHz 16bit mono = 3200 bytes
const CHUNK_BYTES = SAMPLE_RATE * BYTES_PER_SAMPLE * CHANNELS * (100 / 1000)

export class AliyunAsr implements AsrProvider {
  private apiKey: string

  constructor(apiKey: string) {
    this.apiKey = apiKey
  }

  async transcribe(filePath: string): Promise<AsrResult> {
    const wavBuffer = fs.readFileSync(filePath)
    const pcmData = wavBuffer.subarray(44)
    log.info('AliyunASR: 开始转写, WAV大小:', wavBuffer.length, 'PCM大小:', pcmData.length)

    return new Promise<AsrResult>((resolve, reject) => {
      let settled = false
      const done = (err: Error | null, result?: AsrResult) => {
        if (settled) return
        settled = true
        clearTimeout(totalTimer)
        if (err) reject(err)
        else resolve(result || { text: '' })
      }

      const totalTimer = setTimeout(() => {
        ws.close()
        done(new Error('语音识别超时'))
      }, TOTAL_TIMEOUT)

      const ws = new WebSocket(WS_URL, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      })

      const connectTimer = setTimeout(() => {
        ws.close()
        done(new Error('语音识别服务连接超时'))
      }, CONNECT_TIMEOUT)

      ws.on('error', (err) => {
        clearTimeout(connectTimer)
        log.error('AliyunASR: WebSocket 错误:', err.message)
        done(new Error('语音识别服务连接失败'))
      })

      ws.on('close', (code, reason) => {
        if (!settled) {
          log.warn('AliyunASR: WebSocket 意外关闭, code:', code)
          done(new Error(`连接关闭: ${code}`))
        }
      })

      ws.on('open', () => {
        clearTimeout(connectTimer)
        log.info('AliyunASR: WebSocket 已连接')

        // 发送 run-task 指令
        const taskId = crypto.randomUUID()
        const runTask = {
          header: { action: 'run-task', task_id: taskId, streaming: 'duplex' },
          payload: {
            task_group: 'audio',
            task: 'asr',
            function: 'recognition',
            model: 'paraformer-realtime-v2',
            parameters: {
              format: 'pcm',
              sample_rate: SAMPLE_RATE,
              language_hints: ['zh', 'en'],
            },
            input: {},
          },
        }
        ws.send(JSON.stringify(runTask))

        // 分块发送音频
        let offset = 0
        const sendNextChunk = () => {
          if (settled) return
          if (offset >= pcmData.length) {
            // 发送 finish-task
            ws.send(JSON.stringify({
              header: { action: 'finish-task', task_id: taskId, streaming: 'duplex' },
              payload: { input: {} },
            }))
            return
          }

          const end = Math.min(offset + CHUNK_BYTES, pcmData.length)
          const chunk = pcmData.subarray(offset, end)
          ws.send(chunk)
          offset = end

          // 100ms 间隔
          setTimeout(sendNextChunk, 100)
        }

        // 等待 task-started 事件后开始发送音频
        // audio chunks will be sent after receiving task-started
        let canSend = false
        const originalOnMessage = ws.listeners('message')

        // We handle task-started inline
      })

      ws.on('message', (data: WebSocket.Data) => {
        const msg = typeof data === 'string' ? data : data.toString('utf-8')
        let parsed: any
        try { parsed = JSON.parse(msg) } catch { return }

        const action = parsed?.header?.action
        const event = parsed?.header?.event

        if (event === 'task-started') {
          log.info('AliyunASR: 任务已启动, 开始发送音频')
          // 开始分块发送音频
          let offset = 0
          const taskId = parsed.header.task_id
          const sendChunk = () => {
            if (settled) return
            if (offset >= pcmData.length) {
              ws.send(JSON.stringify({
                header: { action: 'finish-task', task_id: taskId, streaming: 'duplex' },
                payload: { input: {} },
              }))
              return
            }
            const end = Math.min(offset + CHUNK_BYTES, pcmData.length)
            ws.send(pcmData.subarray(offset, end))
            offset = end
            setTimeout(sendChunk, 100)
          }
          sendChunk()
          return
        }

        if (event === 'result-generated') {
          const resultText = parsed?.payload?.output?.sentence?.text
          if (resultText) {
            log.info('AliyunASR: 中间结果:', resultText)
          }

          // 检查是否是最终结果
          const isFinal = parsed?.payload?.output?.sentence?.end_time != null
          // 对于非流式用法，等 task-finished 取最终全文
          return
        }

        if (event === 'task-finished') {
          // 从 result-generated 事件中累积的文本中取结果
          // 需要在收到所有 result-generated 后汇总
          // 这里我们用一个简化方案：收集所有 sentence text
          log.info('AliyunASR: 任务完成')
          return
        }

        if (event === 'task-failed') {
          const errMsg = parsed?.payload?.message || '未知错误'
          log.error('AliyunASR: 任务失败:', errMsg)
          done(new Error(`语音识别失败: ${errMsg}`))
          ws.close()
          return
        }
      })
    })
  }

  async validateCredentials(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(WS_URL, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      })
      const timer = setTimeout(() => { ws.close(); reject(new Error('连接超时')) }, CONNECT_TIMEOUT)
      ws.on('open', () => { clearTimeout(timer); ws.close(); resolve() })
      ws.on('error', () => { clearTimeout(timer); reject(new Error('API Key 无效')) })
    })
  }
}
```

**注意：** 上面是初步结构。AliyunAsr 的 `transcribe` 实现需要正确处理全双工流式协议：在 `task-started` 事件后分块发送音频，同时收集 `result-generated` 事件中的文本。实现时需要仔细处理事件顺序和状态管理。`validateCredentials` 只需验证 WebSocket 能否连接成功。

- [ ] **Step 2: Commit**

```bash
git add electron/voice-providers/aliyun-asr.ts
git commit -m "feat(voice): add Aliyun Paraformer ASR provider"
```

---

### Task 5: 阿里云 TTS Provider（CosyVoice）

**Files:**
- Create: `electron/voice-providers/aliyun-tts.ts`

- [ ] **Step 1: 实现 AliyunTts**

```typescript
// electron/voice-providers/aliyun-tts.ts
import WebSocket from 'ws'
import fs from 'fs'
import zlib from 'zlib'
import os from 'os'
import path from 'path'
import { TtsProvider, TtsResult } from './types'
import { TtsSentence, TtsWord } from './volcengine-tts'
import { log } from '../../src/lib/logger'

const WS_URL = 'wss://dashscope.aliyuncs.com/api-ws/v1/inference'
const CONNECT_TIMEOUT = 10_000
const TOTAL_TIMEOUT = 30_000

export class AliyunTts implements TtsProvider {
  private apiKey: string
  private tempFile: string | null = null

  constructor(apiKey: string) {
    this.apiKey = apiKey
  }

  async synthesize(text: string, signal?: AbortSignal): Promise<TtsResult | null> {
    if (!text || text.trim().length === 0) {
      log.info('AliyunTTS: 文本为空，跳过合成')
      return null
    }

    const tempFile = path.join(os.tmpdir(), `aiva-tts-${Date.now()}.mp3`)
    this.tempFile = tempFile

    return new Promise<TtsResult | null>((resolve) => {
      let settled = false
      const audioChunks: Buffer[] = []
      const sentences: TtsSentence[] = []
      const allWords: TtsWord[] = []

      const done = (result: TtsResult | null) => {
        if (settled) return
        settled = true
        clearTimeout(totalTimer)
        resolve(result)
      }

      const totalTimer = setTimeout(() => { ws.close(); done(null) }, TOTAL_TIMEOUT)

      if (signal) {
        signal.addEventListener('abort', () => {
          clearTimeout(totalTimer)
          ws.close()
          this.cleanup()
          done(null)
        }, { once: true })
      }

      const ws = new WebSocket(WS_URL, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      })

      const connectTimer = setTimeout(() => { ws.close(); done(null) }, CONNECT_TIMEOUT)

      ws.on('error', (err) => {
        log.error('AliyunTTS: WebSocket 错误:', err.message)
        done(null)
      })

      ws.on('close', () => {
        if (!settled && audioChunks.length > 0) {
          const fullAudio = Buffer.concat(audioChunks)
          fs.writeFileSync(tempFile, fullAudio)
          log.info('AliyunTTS: 使用部分音频, 大小:', fullAudio.length)
          done({ audioPath: tempFile, sentences, words: allWords })
        } else if (!settled) {
          done(null)
        }
      })

      ws.on('open', () => {
        clearTimeout(connectTimer)
        log.info('AliyunTTS: WebSocket 已连接, 文本长度:', text.length)

        const taskId = crypto.randomUUID()

        // 发送 run-task
        ws.send(JSON.stringify({
          header: { action: 'run-task', task_id: taskId, streaming: 'duplex' },
          payload: {
            task_group: 'audio',
            task: 'tts',
            function: 'SpeechSynthesizer',
            model: 'cosyvoice-v2',
            parameters: {
              text_type: 'PlainText',
              voice: 'longxiaochun_v2',
              format: 'mp3',
              sample_rate: 24000,
              volume: 50,
              rate: 1.0,
              pitch: 1.0,
            },
            input: {},
          },
        }))

        // 等待 task-started 后发送文本
        const waitForStarted = (data: WebSocket.Data) => {
          const msg = typeof data === 'string' ? data : data.toString('utf-8')
          let parsed: any
          try { parsed = JSON.parse(msg) } catch { return }

          if (parsed?.header?.event === 'task-started') {
            ws.removeListener('message', waitForStarted)

            // 发送文本
            ws.send(JSON.stringify({
              header: { action: 'continue-task', task_id: taskId, streaming: 'duplex' },
              payload: { input: { text } },
            }))

            // 发送 finish-task
            ws.send(JSON.stringify({
              header: { action: 'finish-task', task_id: taskId, streaming: 'duplex' },
              payload: { input: {} },
            }))
          }

          if (parsed?.header?.event === 'task-failed') {
            log.error('AliyunTTS: 任务失败:', parsed?.payload?.message)
            done(null)
          }
        }
        ws.on('message', waitForStarted)
      })

      // 处理后续消息（音频数据和完成事件）
      ws.on('message', (data: WebSocket.Data) => {
        // 二进制帧 = 音频数据
        if (Buffer.isBuffer(data) || data instanceof ArrayBuffer) {
          const buf = Buffer.isBuffer(data) ? data : Buffer.from(data)
          if (buf.length > 0) audioChunks.push(buf)
          return
        }

        // JSON 文本帧 = 事件
        const msg = typeof data === 'string' ? data : data.toString('utf-8')
        let parsed: any
        try { parsed = JSON.parse(msg) } catch { return }

        const event = parsed?.header?.event

        if (event === 'result-generated') {
          // 可选：解析 sentence timing 信息
          const sentenceText = parsed?.payload?.output?.sentence?.text
          if (sentenceText) {
            log.info('AliyunTTS: 句子合成完成:', sentenceText.slice(0, 30))
          }
          return
        }

        if (event === 'task-finished') {
          if (audioChunks.length === 0) {
            log.warn('AliyunTTS: 无音频数据')
            done(null)
            return
          }
          const fullAudio = Buffer.concat(audioChunks)
          fs.writeFileSync(tempFile, fullAudio)
          log.info('AliyunTTS: 音频写入完成, 大小:', fullAudio.length)
          done({ audioPath: tempFile, sentences, words: allWords })
          return
        }

        if (event === 'task-failed') {
          log.error('AliyunTTS: 任务失败:', parsed?.payload?.message)
          done(null)
        }
      })
    })
  }

  stop(): void {
    this.cleanup()
  }

  async validateCredentials(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(WS_URL, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      })
      const timer = setTimeout(() => { ws.close(); reject(new Error('连接超时')) }, CONNECT_TIMEOUT)
      ws.on('open', () => { clearTimeout(timer); ws.close(); resolve() })
      ws.on('error', () => { clearTimeout(timer); reject(new Error('API Key 无效')) })
    })
  }

  private cleanup(): void {
    if (this.tempFile) {
      try { fs.unlinkSync(this.tempFile) } catch {}
      this.tempFile = null
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add electron/voice-providers/aliyun-tts.ts
git commit -m "feat(voice): add Aliyun CosyVoice TTS provider"
```

---

### Task 6: Provider 工厂函数

**Files:**
- Create: `electron/voice-providers/index.ts`

- [ ] **Step 1: 创建工厂函数和凭据加载辅助**

```typescript
// electron/voice-providers/index.ts
import { AsrProvider, TtsProvider } from './types'
import { VolcengineAsr } from './volcengine-asr'
import { VolcengineTts } from './volcengine-tts'
import { AliyunAsr } from './aliyun-asr'
import { AliyunTts } from './aliyun-tts'
import { loadVolcengineCredentials, loadAliyunVoiceCredentials } from '../../src/lib/keychain'

export { VolcengineAsr, VolcengineTts, AliyunAsr, AliyunTts }
export type { AsrProvider, TtsProvider, TtsResult, AsrResult } from './types'

export function loadVoiceCredentials(providerKey: string): Record<string, string> | null {
  switch (providerKey) {
    case 'volcengine': {
      const creds = loadVolcengineCredentials()
      if (!creds) return null
      return { appId: creds.appId, accessToken: creds.accessToken }
    }
    case 'aliyun': {
      const creds = loadAliyunVoiceCredentials()
      if (!creds) return null
      return { apiKey: creds.apiKey }
    }
    default:
      return null
  }
}

export function createAsrProvider(providerKey: string, credentials: Record<string, string>): AsrProvider {
  switch (providerKey) {
    case 'volcengine':
      return new VolcengineAsr(credentials.appId, credentials.accessToken)
    case 'aliyun':
      return new AliyunAsr(credentials.apiKey)
    default:
      throw new Error(`Unknown ASR provider: ${providerKey}`)
  }
}

export function createTtsProvider(providerKey: string, credentials: Record<string, string>): TtsProvider {
  switch (providerKey) {
    case 'volcengine':
      return new VolcengineTts(credentials.appId, credentials.accessToken)
    case 'aliyun':
      return new AliyunTts(credentials.apiKey)
    default:
      throw new Error(`Unknown TTS provider: ${providerKey}`)
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add electron/voice-providers/index.ts
git commit -m "feat(voice): add provider factory functions"
```

---

### Task 7: AudioRecorder 改造

**Files:**
- Modify: `electron/recorder.ts`

- [ ] **Step 1: 改造 AudioRecorder 使用 AsrProvider**

将 `electron/recorder.ts` 整体重写为：

```typescript
import fs from 'fs'
import path from 'path'
import { app } from 'electron'
import { AsrProvider } from './voice-providers/types'
import { log } from '../src/lib/logger'

export class AudioRecorder {
  private tmpDir: string
  private provider: AsrProvider
  private hasCredentials: boolean

  constructor(provider: AsrProvider | null) {
    this.tmpDir = path.join(app.getPath('home'), '.aiva', 'tmp')
    if (!fs.existsSync(this.tmpDir)) fs.mkdirSync(this.tmpDir, { recursive: true })

    if (provider) {
      this.provider = provider
      this.hasCredentials = true
      log.info('录音器初始化: 凭证已配置')
    } else {
      // 占位 provider，调用时会报错
      this.provider = null as unknown as AsrProvider
      this.hasCredentials = false
      log.warn('录音器初始化: 未配置语音识别凭证')
    }
  }

  async transcribeFile(wavPath: string): Promise<string> {
    return this.transcribe(wavPath)
  }

  async transcribe(audioPath?: string): Promise<string> {
    if (!this.hasCredentials) {
      log.error('录音器: 未配置语音识别凭证')
      throw new Error('请先在设置中配置语音识别服务凭证')
    }

    const filePath = audioPath || ''

    if (!filePath || !fs.existsSync(filePath)) {
      log.error('录音器: 音频文件不存在:', filePath)
      throw new Error('音频文件不存在')
    }

    const stat = fs.statSync(filePath)
    log.info('录音器: 开始转写, 文件:', filePath, '大小:', stat.size, 'bytes')
    if (stat.size < 44) {
      log.error('录音器: 音频文件过小:', stat.size, 'bytes')
      throw new Error('音频文件过小，可能录制失败')
    }

    try {
      const result = await this.provider.transcribe(filePath)
      log.info('录音器: 转写完成, 结果长度:', result.text.length, '内容:', result.text.slice(0, 50))

      try { fs.unlinkSync(filePath) } catch {}
      return result.text
    } catch (err) {
      log.error('录音器: 转写失败:', err)
      try { fs.unlinkSync(filePath) } catch {}
      throw err
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add electron/recorder.ts
git commit -m "refactor(voice): AudioRecorder uses AsrProvider interface"
```

---

### Task 8: main.ts 改造

**Files:**
- Modify: `electron/main.ts`

这是最大的改造任务。改动点分散在文件的不同位置。

- [ ] **Step 1: 更新 import**

在 `electron/main.ts` 顶部添加 voice-providers 导入，替换部分现有导入：

```typescript
// 在现有 import 后添加（约第 10 行之后）
import { createAsrProvider, createTtsProvider, loadVoiceCredentials } from './voice-providers'
import type { TtsProvider, TtsResult } from './voice-providers'
import { saveAliyunVoiceCredentials, loadAliyunVoiceCredentials, hasAliyunVoiceCredentials } from '../src/lib/keychain'
```

同时移除原有的 `TtsService` 导入（第 10 行），改为使用 `TtsProvider` 类型：

```typescript
// 删除: import { TtsService, TtsResult } from './tts';
// 上面已经通过 voice-providers 导入了 TtsResult
```

- [ ] **Step 2: 修改全局变量类型**

```typescript
// 第 47 行附近
// 改前: let ttsService: TtsService;
// 改后:
let ttsService: TtsProvider;
```

- [ ] **Step 3: 添加 initVoiceProviders 函数**

在 `startPersonaWatcher()` 函数附近添加：

```typescript
function initVoiceProviders(): void {
  const settings = loadSettings()

  // ASR
  const asrKey = settings.asrProvider || 'volcengine'
  const asrCreds = loadVoiceCredentials(asrKey)
  if (asrCreds) {
    const asrProvider = createAsrProvider(asrKey, asrCreds)
    recorder = new AudioRecorder(asrProvider)
    log.info('ASR 初始化:', asrKey, '已配置')
  } else {
    recorder = new AudioRecorder(null)
    log.info('ASR 初始化: 无凭据')
  }

  // TTS
  const ttsKey = settings.ttsProvider || 'volcengine'
  const ttsCreds = loadVoiceCredentials(ttsKey)
  if (ttsCreds) {
    ttsService = createTtsProvider(ttsKey, ttsCreds)
    log.info('TTS 初始化:', ttsKey, '已配置')
  } else {
    // 创建占位，调用时会失败
    const { VolcengineTts } = require('./voice-providers/volcengine-tts')
    ttsService = new VolcengineTts('', '')
    log.info('TTS 初始化: 无凭据')
  }
}
```

- [ ] **Step 4: 替换 app.whenReady 中的初始化代码**

在 `app.whenReady()` 中（约 1629-1642 行），替换：

```typescript
// 删除这些行:
// ttsService = new TtsService();
// const volcengineCreds = loadVolcengineCredentials();
// log.info('语音识别凭证:', volcengineCreds ? '已配置' : '未配置');
// recorder = new AudioRecorder(volcengineCreds);

// 替换为:
subtitlePopup = new SubtitlePopup(serverPort);
initVoiceProviders();
```

保留 `ttsService` 和 `recorder` 之外的初始化代码（voiceBar, shortcutManager, subtitlePopup 等）。

- [ ] **Step 5: 改造 TTS 调用点**

找到 main.ts 中所有 `ttsService.synthesize(...)` 调用（约 938 行和 953 行），从：

```typescript
ttsResult = await ttsService.synthesize({
  appId: creds.appId,
  accessToken: creds.accessToken,
  text: summary,
  signal: controller.signal,
});
```

改为：

```typescript
ttsResult = await ttsService.synthesize(summary, controller.signal);
```

注意：当前 TTS 调用点在 `executeVoiceFlow` 函数中，该函数可能需要移除 `creds` 变量的使用（凭据已封装在 provider 中）。

- [ ] **Step 6: 添加新 IPC handlers**

在现有 `settings:save-volcengine-credentials` handler 之后添加：

```typescript
  // voice provider selection
  ipcMain.handle('settings:load-voice-provider', (_, { type }: { type: 'asr' | 'tts' }) => {
    const settings = loadSettings()
    if (type === 'asr') return settings.asrProvider || 'volcengine'
    return settings.ttsProvider || 'volcengine'
  })

  ipcMain.handle('settings:save-voice-provider', async (_, { type, provider }: { type: 'asr' | 'tts'; provider: string }) => {
    const creds = loadVoiceCredentials(provider)
    if (!creds || Object.values(creds).every(v => !v)) {
      throw new Error('请先配置该服务商的密钥')
    }

    if (type === 'asr') {
      const asrProvider = createAsrProvider(provider, creds)
      await asrProvider.validateCredentials()
      recorder = new AudioRecorder(asrProvider)
    } else {
      const ttsProvider = createTtsProvider(provider, creds)
      await ttsProvider.validateCredentials()
      ttsService = ttsProvider
    }

    const settings = loadSettings()
    if (type === 'asr') settings.asrProvider = provider
    else settings.ttsProvider = provider
    saveSettings(settings)
  })

  // aliyun voice credentials
  ipcMain.handle('settings:load-aliyun-credentials', () => {
    const creds = loadAliyunVoiceCredentials()
    return { hasCredentials: !!creds, apiKey: creds?.apiKey ? '••••' + creds.apiKey.slice(-4) : '' }
  })

  ipcMain.handle('settings:save-aliyun-credentials', async (_, { apiKey }: { apiKey: string }) => {
    const { AliyunAsr } = await import('./voice-providers/aliyun-asr')
    const asr = new AliyunAsr(apiKey)
    try {
      await asr.validateCredentials()
      saveAliyunVoiceCredentials(apiKey)
      // 如果当前 ASR 或 TTS provider 是 aliyun，重建实例
      const settings = loadSettings()
      if (settings.asrProvider === 'aliyun') {
        recorder = new AudioRecorder(createAsrProvider('aliyun', { apiKey }))
      }
      if (settings.ttsProvider === 'aliyun') {
        ttsService = createTtsProvider('aliyun', { apiKey })
      }
    } catch (err) {
      console.error('[aliyun] 凭证验证失败:', err)
      throw err
    }
  })
```

- [ ] **Step 7: 改造现有 volcengine credentials handler**

修改 `settings:save-volcengine-credentials` handler（约 1411 行），保存后自动重建实例：

```typescript
ipcMain.handle('settings:save-volcengine-credentials', async (_, { appId, accessToken }: { appId: string; accessToken: string }) => {
  const { DoubaoASR } = await import('../src/lib/doubao-asr')
  const asr = new DoubaoASR(appId, accessToken)
  try {
    await asr.validateCredentials()
    saveVolcengineCredentials(appId, accessToken)
    // 如果当前 ASR 或 TTS provider 是 volcengine，重建实例
    const settings = loadSettings()
    const creds = { appId, accessToken }
    if (!settings.asrProvider || settings.asrProvider === 'volcengine') {
      recorder = new AudioRecorder(createAsrProvider('volcengine', creds))
    }
    if (!settings.ttsProvider || settings.ttsProvider === 'volcengine') {
      ttsService = createTtsProvider('volcengine', creds)
    }
  } catch (err) {
    console.error('[volcengine] 凭证验证失败:', err)
    throw err
  }
})
```

- [ ] **Step 8: 验证构建**

```bash
npm run build:electron
```

Expected: 编译成功，无类型错误。

- [ ] **Step 9: Commit**

```bash
git add electron/main.ts
git commit -m "feat(voice): refactor main.ts to use VoiceProvider abstraction"
```

---

### Task 9: 设置页面改版 — 语音设置

**Files:**
- Modify: `src/app/(main)/settings/voice/page.tsx`

- [ ] **Step 1: 重写语音设置页**

完全替换 `src/app/(main)/settings/voice/page.tsx`。新页面包含 ASR 和 TTS 两个独立区块，各自有服务商选择和密钥配置。

核心结构：

```typescript
'use client'

import { useState, useEffect } from 'react'
import { getIpcRenderer } from '@/lib/electron-ipc'
import { PageHeader } from '@/components/ui/PageHeader'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { SingleLineInput } from '@/components/ui/SingleLineInput'
import { Select } from '@/components/ui/Select'
import { Button } from '@/components/ui/Button'
import { BottomActionBar } from '@/components/ui/BottomActionBar'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { VOICE_PROVIDERS } from '@/lib/voice-provider-config'

const PROVIDER_OPTIONS = [
  { value: 'volcengine', label: '火山引擎' },
  { value: 'aliyun', label: '阿里云百炼' },
]

export default function VoiceSettingsPage() {
  const [asrProvider, setAsrProvider] = useState('volcengine')
  const [ttsProvider, setTtsProvider] = useState('volcengine')

  // 火山引擎凭据
  const [volcAppId, setVolcAppId] = useState('')
  const [volcAccessToken, setVolcAccessToken] = useState('')
  const [hasVolcCreds, setHasVolcCreds] = useState(false)

  // 阿里云凭据
  const [aliyunApiKey, setAliyunApiKey] = useState('')
  const [hasAliyunCreds, setHasAliyunCreds] = useState(false)

  const [asrStatus, setAsrStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [ttsStatus, setTtsStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [asrError, setAsrError] = useState('')
  const [ttsError, setTtsError] = useState('')

  useEffect(() => {
    const ipc = getIpcRenderer()
    // 加载当前 provider 选择
    ipc?.invoke('settings:load-voice-provider', { type: 'asr' }).then((p: string) => setAsrProvider(p))
    ipc?.invoke('settings:load-voice-provider', { type: 'tts' }).then((p: string) => setTtsProvider(p))
    // 加载凭据状态
    ipc?.invoke('settings:load-volcengine-credentials').then((c: any) => {
      if (c) {
        setVolcAppId(c.appId || '')
        setHasVolcCreds(c.hasCredentials || false)
      }
    })
    ipc?.invoke('settings:load-aliyun-credentials').then((c: any) => {
      if (c) {
        setAliyunApiKey(c.hasCredentials ? c.apiKey : '')
        setHasAliyunCreds(c.hasCredentials || false)
      }
    })
  }, [])

  const navigate = (path: string) => getIpcRenderer()?.send('navigate:route', { path })

  // 判断当前 ASR/TTS 区块的凭据是否已配置
  const asrCredConfigured = asrProvider === 'volcengine' ? hasVolcCreds : hasAliyunCreds
  const ttsCredConfigured = ttsProvider === 'volcengine' ? hasVolcCreds : hasAliyunCreds

  // 密钥复用提示：如果 ASR 和 TTS 选择了同一 provider 且 ASR 已配置但 TTS 未配置
  const showReuseHint = asrProvider === ttsProvider && asrCredConfigured && !ttsCredConfigured

  // 保存 ASR provider 选择
  const handleSaveAsrProvider = async () => {
    if (!asrCredConfigured) {
      setAsrError('请先配置该服务商的密钥')
      setAsrStatus('error')
      setTimeout(() => { setAsrStatus('idle'); setAsrError('') }, 3000)
      return
    }
    setAsrStatus('saving')
    try {
      await getIpcRenderer()?.invoke('settings:save-voice-provider', { type: 'asr', provider: asrProvider })
      setAsrStatus('saved')
    } catch (e: any) {
      setAsrError(e?.message || '未知错误')
      setAsrStatus('error')
    }
    setTimeout(() => { setAsrStatus('idle'); setAsrError('') }, 2000)
  }

  // 保存 TTS provider 选择
  const handleSaveTtsProvider = async () => {
    if (!ttsCredConfigured) {
      setTtsError('请先配置该服务商的密钥')
      setTtsStatus('error')
      setTimeout(() => { setTtsStatus('idle'); setTtsError('') }, 3000)
      return
    }
    setTtsStatus('saving')
    try {
      await getIpcRenderer()?.invoke('settings:save-voice-provider', { type: 'tts', provider: ttsProvider })
      setTtsStatus('saved')
    } catch (e: any) {
      setTtsError(e?.message || '未知错误')
      setTtsStatus('error')
    }
    setTimeout(() => { setTtsStatus('idle'); setTtsError('') }, 2000)
  }

  // 保存火山引擎凭据
  const handleSaveVolcengine = async () => {
    if (!volcAppId.trim() || !volcAccessToken.trim()) {
      setAsrError('App ID 和 Access Token 需同时填写')
      setAsrStatus('error')
      setTimeout(() => { setAsrStatus('idle'); setAsrError('') }, 3000)
      return
    }
    setAsrStatus('saving')
    try {
      await getIpcRenderer()?.invoke('settings:save-volcengine-credentials', {
        appId: volcAppId.trim(),
        accessToken: volcAccessToken.trim(),
      })
      setHasVolcCreds(true)
      setVolcAccessToken('')
      setAsrStatus('saved')
    } catch (e: any) {
      setAsrError(e?.message || '未知错误')
      setAsrStatus('error')
    }
    setTimeout(() => { setAsrStatus('idle'); setAsrError('') }, 2000)
  }

  // 保存阿里云凭据
  const handleSaveAliyun = async () => {
    if (!aliyunApiKey.trim()) {
      setAsrError('请输入 API Key')
      setAsrStatus('error')
      setTimeout(() => { setAsrStatus('idle'); setAsrError('') }, 3000)
      return
    }
    setAsrStatus('saving')
    try {
      await getIpcRenderer()?.invoke('settings:save-aliyun-credentials', { apiKey: aliyunApiKey.trim() })
      setHasAliyunCreds(true)
      setAliyunApiKey('')
      setAsrStatus('saved')
    } catch (e: any) {
      setAsrError(e?.message || '未知错误')
      setAsrStatus('error')
    }
    setTimeout(() => { setAsrStatus('idle'); setAsrError('') }, 2000)
  }

  // 渲染凭据输入区
  const renderCredentialInputs = (providerKey: string, context: 'asr' | 'tts') => {
    if (providerKey === 'volcengine') {
      const configured = hasVolcCreds
      return (
        <>
          <SingleLineInput label="App ID" value={volcAppId} onChange={e => setVolcAppId(e.target.value)}
            placeholder={configured ? '已存储（输入新 ID 替换）' : '输入 App ID'} />
          <SingleLineInput label="Access Token" type="password" value={volcAccessToken}
            onChange={e => setVolcAccessToken(e.target.value)}
            placeholder={configured ? '输入新 Token 替换' : '输入 Access Token'} />
          <Button variant="secondary" onClick={handleSaveVolcengine}>保存火山引擎密钥</Button>
        </>
      )
    }
    if (providerKey === 'aliyun') {
      const configured = hasAliyunCreds
      return (
        <>
          <SingleLineInput label="API Key" type="password" value={aliyunApiKey}
            onChange={e => setAliyunApiKey(e.target.value)}
            placeholder={configured ? '已存储（输入新 Key 替换）' : '输入 API Key'} />
          <Button variant="secondary" onClick={handleSaveAliyun}>保存阿里云密钥</Button>
        </>
      )
    }
    return null
  }

  return (
    <div className="min-h-screen bg-bg-window flex flex-col">
      <PageHeader title="语音" subtitle="语音识别与合成服务配置"
        onBack={() => navigate('/settings')} />

      <div className="flex-1 overflow-auto px-page-x pb-6">
        {/* ASR 区块 */}
        <div className="mb-section-gap">
          <SectionHeader title="语音识别（ASR）" description="将语音转为文字" />
          <div className="flex items-center gap-2 mb-3">
            <span className="text-body-sm text-text-muted">连接状态:</span>
            <StatusBadge status={asrCredConfigured ? 'success' : 'warning'}
              label={asrCredConfigured ? '已配置' : '未配置'} />
          </div>
          <Select label="服务商" options={PROVIDER_OPTIONS} value={asrProvider}
            onChange={v => setAsrProvider(v)} />
          {renderCredentialInputs(asrProvider, 'asr')}
          {asrStatus === 'error' && <p className="text-body-sm text-danger mt-1">{asrError}</p>}
          {asrStatus === 'saved' && <p className="text-body-sm text-success mt-1">已保存</p>}
          <div className="mt-3">
            <Button variant="primary" onClick={handleSaveAsrProvider}
              disabled={asrStatus === 'saving'}>
              {asrStatus === 'saving' ? '切换中...' : '应用 ASR 服务商'}
            </Button>
          </div>
          <button className="text-body-sm text-brand mt-2 block"
            onClick={() => navigate(`/settings/voice/tutorial?provider=${asrProvider}`)}>
            如何获取密钥？
          </button>
        </div>

        {/* TTS 区块 */}
        <div className="mb-section-gap">
          <SectionHeader title="语音合成（TTS）" description="将文字转为语音播报" />
          <div className="flex items-center gap-2 mb-3">
            <span className="text-body-sm text-text-muted">连接状态:</span>
            <StatusBadge status={ttsCredConfigured ? 'success' : 'warning'}
              label={ttsCredConfigured ? '已配置' : '未配置'} />
          </div>
          <Select label="服务商" options={PROVIDER_OPTIONS} value={ttsProvider}
            onChange={v => setTtsProvider(v)} />
          {showReuseHint && (
            <div className="flex items-center gap-2 p-2 rounded-input bg-bg-surface-2 mt-2 mb-2">
              <span className="text-body-sm text-text-muted">
                已从 ASR 配置中检测到 {VOICE_PROVIDERS[ttsProvider].name} 的密钥
              </span>
              <Button variant="secondary" size="sm" onClick={handleSaveTtsProvider}>复用</Button>
            </div>
          )}
          {ttsProvider !== asrProvider && renderCredentialInputs(ttsProvider, 'tts')}
          {ttsStatus === 'error' && <p className="text-body-sm text-danger mt-1">{ttsError}</p>}
          {ttsStatus === 'saved' && <p className="text-body-sm text-success mt-1">已保存</p>}
          <div className="mt-3">
            <Button variant="primary" onClick={handleSaveTtsProvider}
              disabled={ttsStatus === 'saving'}>
              {ttsStatus === 'saving' ? '切换中...' : '应用 TTS 服务商'}
            </Button>
          </div>
          <button className="text-body-sm text-brand mt-2 block"
            onClick={() => navigate(`/settings/voice/tutorial?provider=${ttsProvider}`)}>
            如何获取密钥？
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/\(main\)/settings/voice/page.tsx
git commit -m "feat(voice): redesign voice settings with ASR/TTS provider selection"
```

---

### Task 10: 设置总览卡片更新

**Files:**
- Modify: `src/app/(main)/settings/page.tsx:18-46,64-70`

- [ ] **Step 1: 更新 SummaryCard 的语音摘要**

在 `src/app/(main)/settings/page.tsx` 中：

1. 扩展 `SettingsSummary` 接口，新增 `asrProvider` 和 `ttsProvider` 字段：

```typescript
interface SettingsSummary {
  provider: string;
  modelPreset: string;
  hasApiKey: boolean;
  hasVolcCreds: boolean;
  hasAliyunCreds: boolean;
  asrProvider: string;
  ttsProvider: string;
  defaultCwd: string;
  vadTimeout: number;
}
```

2. 更新 `useState` 初始值：

```typescript
const [summary, setSummary] = useState<SettingsSummary>({
  provider: 'glm-cn',
  modelPreset: 'opus',
  hasApiKey: false,
  hasVolcCreds: false,
  hasAliyunCreds: false,
  asrProvider: 'volcengine',
  ttsProvider: 'volcengine',
  defaultCwd: '~/Documents',
  vadTimeout: 2,
});
```

3. 在 `useEffect` 中加载新数据：

```typescript
// 在现有的 volcengine credentials 加载后添加
ipcRenderer?.invoke('settings:load-aliyun-credentials').then((creds: any) => {
  if (creds) {
    setSummary(prev => ({ ...prev, hasAliyunCreds: creds.hasCredentials || false }));
  }
});
ipcRenderer?.invoke('settings:load-voice-provider', { type: 'asr' }).then((p: string) => {
  setSummary(prev => ({ ...prev, asrProvider: p || 'volcengine' }));
});
ipcRenderer?.invoke('settings:load-voice-provider', { type: 'tts' }).then((p: string) => {
  setSummary(prev => ({ ...prev, ttsProvider: p || 'volcengine' }));
});
```

4. 更新语音卡片的摘要文案：

```typescript
{
  title: '语音',
  summary: summary.hasVolcCreds || summary.hasAliyunCreds
    ? `ASR: ${VOICE_PROVIDERS[summary.asrProvider]?.name || '火山引擎'} · TTS: ${VOICE_PROVIDERS[summary.ttsProvider]?.name || '火山引擎'}`
    : '语音识别服务未配置',
  status: (summary.hasVolcCreds || summary.hasAliyunCreds) ? 'configured' as const : 'unconfigured' as const,
  path: '/settings/voice',
},
```

5. 在文件顶部添加 import：

```typescript
import { VOICE_PROVIDERS } from '@/lib/voice-provider-config';
```

- [ ] **Step 2: Commit**

```bash
git add src/app/\(main\)/settings/page.tsx
git commit -m "feat(voice): update settings summary card with provider info"
```

---

### Task 11: 教程页面

**Files:**
- Create: `src/app/(main)/settings/voice/tutorial/page.tsx`

- [ ] **Step 1: 创建教程页面**

```typescript
'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { getIpcRenderer } from '@/lib/electron-ipc'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'

interface TutorialStep {
  title: string
  description: string
  link?: { label: string; url: string }
}

const VOLCENGINE_STEPS: TutorialStep[] = [
  {
    title: '1. 注册火山引擎账号',
    description: '访问火山引擎官网，使用手机号注册并登录。',
    link: { label: '打开火山引擎官网', url: 'https://www.volcengine.com/' },
  },
  {
    title: '2. 完成实名认证',
    description: '进入控制台后，按提示完成实名认证（支持微信/抖音扫脸，约 1 分钟）。所有 API 开通都需要实名认证。',
  },
  {
    title: '3. 进入豆包语音服务',
    description: '访问豆包语音控制台，点击「创建应用」。',
    link: { label: '打开豆包语音控制台', url: 'https://console.volcengine.com/speech/service/overview' },
  },
  {
    title: '4. 创建应用',
    description: '应用名称填 aiva，应用简介写「自己用」，接入能力选择「豆包流式语音识别模型 2.0 小时版」，点击确定。',
  },
  {
    title: '5. 获取密钥',
    description: '创建成功后，在左侧「API 服务中心」找到 App ID 和 Access Token（点击小眼睛显示）。火山引擎提供 20 小时免费额度。',
  },
]

const ALIYUN_STEPS: TutorialStep[] = [
  {
    title: '1. 开通阿里云百炼',
    description: '访问百炼控制台，使用阿里云账号登录。新用户需完成实名认证。',
    link: { label: '打开百炼控制台', url: 'https://bailian.console.aliyun.com/' },
  },
  {
    title: '2. 创建 API Key',
    description: '在百炼控制台左侧菜单找到「API-KEY 管理」，点击「创建 API Key」。复制生成的密钥（sk-xxx 格式），只显示一次。',
    link: { label: '打开 API-KEY 管理', url: 'https://bailian.console.aliyun.com/#/api-key' },
  },
  {
    title: '3. 开通语音模型',
    description: '在模型广场搜索并开通以下模型（免费额度可用）：\n· 语音识别：Paraformer（实时语音识别）\n· 语音合成：CosyVoice',
    link: { label: '打开模型广场', url: 'https://bailian.console.aliyun.com/cn-beijing#/model-market' },
  },
]

export default function VoiceTutorialPage() {
  const searchParams = useSearchParams()
  const initialProvider = searchParams.get('provider') || 'volcengine'
  const [activeTab, setActiveTab] = useState<'volcengine' | 'aliyun'>(
    initialProvider === 'aliyun' ? 'aliyun' : 'volcengine'
  )

  const steps = activeTab === 'volcengine' ? VOLCENGINE_STEPS : ALIYUN_STEPS

  return (
    <div className="min-h-screen bg-bg-window flex flex-col">
      <PageHeader title="获取密钥教程" subtitle="按步骤获取语音服务的 API 密钥"
        onBack={() => getIpcRenderer()?.send('navigate:route', { path: '/settings/voice' })} />

      <div className="flex-1 overflow-auto px-page-x pb-6">
        {/* Tab 切换 */}
        <div className="flex gap-2 mb-section-gap">
          <button
            className={`px-4 py-2 rounded-input text-body-sm transition-colors ${
              activeTab === 'volcengine'
                ? 'bg-brand text-white'
                : 'bg-bg-surface-2 text-text-primary'
            }`}
            onClick={() => setActiveTab('volcengine')}
          >
            火山引擎
          </button>
          <button
            className={`px-4 py-2 rounded-input text-body-sm transition-colors ${
              activeTab === 'aliyun'
                ? 'bg-brand text-white'
                : 'bg-bg-surface-2 text-text-primary'
            }`}
            onClick={() => setActiveTab('aliyun')}
          >
            阿里云百炼
          </button>
        </div>

        {/* 步骤卡片 */}
        <div className="flex flex-col gap-4">
          {steps.map((step, i) => (
            <div key={i} className="p-4 rounded-card bg-bg-surface-1">
              <h3 className="text-body font-medium text-text-primary mb-2">{step.title}</h3>
              <p className="text-body-sm text-text-muted whitespace-pre-line">{step.description}</p>
              {step.link && (
                <button
                  className="text-body-sm text-brand mt-2 block"
                  onClick={() => getIpcRenderer()?.send('open-external', { url: step.link!.url })}
                >
                  {step.link.label} →
                </button>
              )}
            </div>
          ))}
        </div>

        {/* 返回按钮 */}
        <div className="mt-section-gap">
          <Button variant="primary" onClick={() =>
            getIpcRenderer()?.send('navigate:route', { path: '/settings/voice' })
          }>
            返回设置页面
          </Button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/\(main\)/settings/voice/tutorial/page.tsx
git commit -m "feat(voice): add voice provider tutorial page"
```

---

### Task 12: esbuild 配置更新

确认 `electron/voice-providers/` 目录下的文件能被 esbuild 正确编译。

**Files:**
- Read: `scripts/build-electron.mjs`（确认 entry points）

- [ ] **Step 1: 检查构建脚本**

读取 `scripts/build-electron.mjs`，确认 esbuild 的 entry point 包含新的 `electron/voice-providers/` 文件。由于 `voice-providers/` 是通过 `electron/main.ts` import 链引入的，esbuild 会自动处理。只需确认没有 external 化冲突。

运行构建验证：

```bash
npm run build:electron
```

Expected: 编译成功。

- [ ] **Step 2: 如有构建错误则修复并 Commit**

```bash
git add -A
git commit -m "fix(voice): resolve build issues for voice providers"
```

---

### Task 13: 集成验证

- [ ] **Step 1: 启动开发环境**

```bash
npm run electron:dev
```

- [ ] **Step 2: 验证设置页**
1. 打开设置 → 语音页面
2. 确认 ASR 和 TTS 区块独立显示
3. 切换服务商下拉，确认密钥输入动态变化
4. 输入火山引擎凭据，点击保存，确认验证成功
5. 点击「如何获取密钥？」，确认跳转到教程页面
6. 教程页 tab 切换正常

- [ ] **Step 3: 验证语音识别**
1. 使用火山引擎 ASR 进行语音输入
2. 切换到阿里云 ASR（需要有效 API Key）
3. 确认识别结果正常

- [ ] **Step 4: 验证语音合成**
1. 使用火山引擎 TTS 进行语音播报
2. 切换到阿里云 TTS
3. 确认语音播放正常

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat(voice): multi-provider voice architecture with Aliyun support"
```
