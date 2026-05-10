# 豆包语音大模型接入 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将语音识别从 sherpa-onnx 离线模型切换为豆包流式语音识别模型 2.0（火山引擎在线 API），移除离线模型依赖。

**Architecture:** 保持现有录音流程不变（Web Audio 采集 → IPC → WAV 文件），只替换 `transcribe()` 后端实现。新增 `src/lib/doubao-asr.ts` 封装豆包 WebSocket 二进制协议（`bigmodel_nostream` 模式），通过 `src/lib/keychain.ts` 新增的凭证存取函数管理火山引擎 App ID / Access Token。

**Tech Stack:** WebSocket (Node.js 内置)、zlib (Gzip 压缩/解压)、Electron safeStorage、TypeScript

---

## File Structure

| 文件 | 动作 | 职责 |
|------|------|------|
| `src/lib/doubao-asr.ts` | 新增 | 豆包 ASR WebSocket 客户端，封装二进制协议 |
| `src/lib/keychain.ts` | 修改 | 新增火山引擎凭证存取函数 |
| `electron/recorder.ts` | 修改 | 替换 sherpa 为豆包 ASR |
| `electron/main.ts` | 修改 | 移除模型下载 IPC、新增凭证 IPC、更新 recorder 初始化 |
| `src/types/declarations.d.ts` | 修改 | 移除 sherpa-onnx 类型声明 |
| `src/components/Onboarding.tsx` | 修改 | 替换 model-download 步骤为火山引擎凭证配置 |
| `src/app/settings/page.tsx` | 修改 | 新增语音识别凭证配置 section |
| `src/lib/sherpa.ts` | 删除 | 不再需要 |
| `package.json` | 修改 | 移除 sherpa-onnx-node 依赖 |
| `electron-builder.yml` | 修改 | 移除 sherpa-onnx 打包规则 |

---

### Task 1: 新增豆包 ASR 客户端

**Files:**
- Create: `src/lib/doubao-asr.ts`

- [ ] **Step 1: 实现 DoubaoASR 类**

```typescript
// src/lib/doubao-asr.ts
import WebSocket from 'ws';
import fs from 'fs';
import zlib from 'zlib';

const WS_URL = 'wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_nostream';
const RESOURCE_ID = 'volc.seedasr.sauc.duration';
const CONNECT_TIMEOUT = 10_000;
const TOTAL_TIMEOUT = 30_000;
const CHUNK_DURATION_MS = 200;
const SAMPLE_RATE = 16000;
const BYTES_PER_SAMPLE = 2;
const CHANNELS = 1;
// 200ms of 16kHz 16bit mono audio = 6400 bytes
const CHUNK_BYTES = SAMPLE_RATE * BYTES_PER_SAMPLE * CHANNELS * (CHUNK_DURATION_MS / 1000);

// Binary protocol byte constructors (big-endian)
function makeHeader(
  messageType: number,
  messageFlags: number,
  serialization: number,
  compression: number,
): Buffer {
  // byte 0: protocol version (4 bits) | header size (4 bits) = 0x11
  // byte 1: message type (4 bits) | flags (4 bits)
  // byte 2: serialization (4 bits) | compression (4 bits)
  // byte 3: reserved = 0x00
  return Buffer.from([
    0x11,
    (messageType << 4) | messageFlags,
    (serialization << 4) | compression,
    0x00,
  ]);
}

const HEADER_FULL_CLIENT = makeHeader(0x1, 0x0, 0x1, 0x1); // type=1 flags=0 json+gzip
const HEADER_AUDIO = (isLast: boolean) =>
  makeHeader(0x2, isLast ? 0x2 : 0x0, 0x0, 0x1); // type=2, flags=0or2, raw+gzip

// Message type from server
const MSG_SERVER_RESPONSE = 0x9;
const MSG_ERROR = 0xf;

function gzipSync(data: Buffer): Buffer {
  return zlib.gzipSync(data);
}

function gunzipSync(data: Buffer): Buffer {
  return zlib.gunzipSync(data);
}

export class DoubaoASR {
  private appId: string;
  private accessToken: string;

  constructor(appId: string, accessToken: string) {
    this.appId = appId;
    this.accessToken = accessToken;
  }

  async transcribe(wavFilePath: string): Promise<string> {
    const wavBuffer = fs.readFileSync(wavFilePath);
    // Skip WAV header (44 bytes), get raw PCM data
    const pcmData = wavBuffer.subarray(44);

    return new Promise<string>((resolve, reject) => {
      const totalTimer = setTimeout(() => {
        ws.close();
        reject(new Error('语音识别超时，请重试'));
      }, TOTAL_TIMEOUT);

      const ws = new WebSocket(WS_URL, {
        headers: {
          'X-Api-App-Key': this.appId,
          'X-Api-Access-Key': this.accessToken,
          'X-Api-Resource-Id': RESOURCE_ID,
          'X-Api-Connect-Id': crypto.randomUUID(),
        },
      });

      let settled = false;
      const done = (err: Error | null, result?: string) => {
        if (settled) return;
        settled = true;
        clearTimeout(totalTimer);
        if (err) reject(err);
        else resolve(result || '');
      };

      ws.on('error', (err) => {
        done(new Error('语音识别服务连接失败，请检查网络'));
      });

      ws.on('close', (code, reason) => {
        if (!settled) {
          done(new Error(`连接关闭: ${code} ${reason}`));
        }
      });

      const connectTimer = setTimeout(() => {
        ws.close();
        done(new Error('语音识别服务连接失败，请检查网络'));
      }, CONNECT_TIMEOUT);

      ws.on('open', () => {
        clearTimeout(connectTimer);

        // 1. Send full client request (JSON config, gzip compressed)
        const config = JSON.stringify({
          user: { uid: 'aiva-app' },
          audio: {
            format: 'wav',
            rate: SAMPLE_RATE,
            bits: BYTES_PER_SAMPLE * 8,
            channel: CHANNELS,
          },
          request: {
            model_name: 'bigmodel',
            enable_itn: true,
            enable_punc: true,
            enable_ddc: true,
            result_type: 'full',
          },
        });

        const configPayload = gzipSync(Buffer.from(config));
        const configSize = Buffer.alloc(4);
        configSize.writeUInt32BE(configPayload.length, 0);

        ws.send(Buffer.concat([HEADER_FULL_CLIENT, configSize, configPayload]));

        // 2. Send audio chunks
        let offset = 0;
        while (offset < pcmData.length) {
          const end = Math.min(offset + CHUNK_BYTES, pcmData.length);
          const chunk = pcmData.subarray(offset, end);
          const isLast = end >= pcmData.length;

          const header = HEADER_AUDIO(isLast);
          const compressed = gzipSync(chunk);
          const sizeBuf = Buffer.alloc(4);
          sizeBuf.writeUInt32BE(compressed.length, 0);

          ws.send(Buffer.concat([header, sizeBuf, compressed]));
          offset = end;
        }

        // Edge case: empty PCM data — send last-empty packet
        if (pcmData.length === 0) {
          const header = HEADER_AUDIO(true);
          const compressed = gzipSync(Buffer.alloc(0));
          const sizeBuf = Buffer.alloc(4);
          sizeBuf.writeUInt32BE(compressed.length, 0);
          ws.send(Buffer.concat([header, sizeBuf, compressed]));
        }
      });

      ws.on('message', (data: WebSocket.Data) => {
        const buf = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
        if (buf.length < 4) return;

        const messageType = (buf[1] >> 4) & 0xf;

        if (messageType === MSG_ERROR) {
          // Error frame: 4-byte header + 4-byte error code + 4-byte msg size + msg
          if (buf.length >= 12) {
            const errorCode = buf.readUInt32BE(4);
            const errorMsgSize = buf.readUInt32BE(8);
            const errorMsg = buf.subarray(12, 12 + errorMsgSize).toString('utf-8');
            done(new Error(mapErrorCode(errorCode, errorMsg)));
          } else {
            done(new Error('语音识别服务返回错误'));
          }
          ws.close();
          return;
        }

        if (messageType === MSG_SERVER_RESPONSE) {
          // Response: 4-byte header + 4-byte sequence + 4-byte payload size + payload
          if (buf.length < 12) return;

          const flags = buf[1] & 0xf;
          const compression = buf[2] & 0xf;
          const payloadSize = buf.readUInt32BE(8);
          const payloadBuf = buf.subarray(12, 12 + payloadSize);

          let payloadStr: string;
          if (compression === 0x1) {
            payloadStr = gunzipSync(payloadBuf).toString('utf-8');
          } else {
            payloadStr = payloadBuf.toString('utf-8');
          }

          const payload = JSON.parse(payloadStr);

          // Check for error in response payload
          if (payload.code && payload.code !== 0) {
            done(new Error(mapErrorCode(payload.code, payload.message || '')));
            ws.close();
            return;
          }

          // Check if this is the final response (flags=3 means last packet)
          if (flags === 0x3) {
            const text = payload?.result?.text?.trim() || '';
            done(null, text);
            ws.close();
          }
          // For intermediate responses (flags=1), we ignore — nostream mode
          // typically only returns one final result anyway
        }
      });
    });
  }
}

function mapErrorCode(code: number, serverMsg: string): string {
  switch (code) {
    case 45000001: return '请求参数错误';
    case 45000002: return '音频为空，请重新录制';
    case 45000081: return '等待超时';
    case 45000151: return '音频格式不正确';
    case 55000031: return '服务繁忙，请稍后重试';
    default:
      if (Math.floor(code / 100000) === 550) return '语音识别服务内部错误';
      return `语音识别失败: ${serverMsg || code}`;
  }
}
```

- [ ] **Step 2: 安装 ws 类型定义**

Run: `cd /Users/rikiwang/Documents/Agent/Aiva/Aiva && npm ls ws 2>/dev/null || echo "ws not found"`

如果 ws 未安装（Electron 内置 WebSocket 在主进程中可用，但 Node.js 的 `ws` 包提供更完整的客户端 API），检查 Electron 版本是否自带 WebSocket。Electron 主进程有 `WebSocket` 全局对象，但为了稳定性和类型安全，使用 `ws` 包。

Run: `cd /Users/rikiwang/Documents/Agent/Aiva/Aiva && npm install ws && npm install -D @types/ws`

- [ ] **Step 3: Commit**

```bash
git add src/lib/doubao-asr.ts package.json package-lock.json
git commit -m "feat: add DoubaoASR client for volcengine speech recognition"
```

---

### Task 2: 新增火山引擎凭证存取

**Files:**
- Modify: `src/lib/keychain.ts`

- [ ] **Step 1: 添加凭证存取函数**

在 `src/lib/keychain.ts` 末尾添加：

```typescript
const VOLCENGINE_CRED_FILE = path.join(KEYCHAIN_DIR, 'volcengine.json');

interface VolcengineCredentials {
  appId: string;
  accessToken: string;
}

export function saveVolcengineCredentials(appId: string, accessToken: string): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Encryption not available on this system');
  }
  if (!fs.existsSync(KEYCHAIN_DIR)) fs.mkdirSync(KEYCHAIN_DIR, { recursive: true });
  const json = JSON.stringify({ appId, accessToken });
  const encrypted = safeStorage.encryptString(json);
  fs.writeFileSync(VOLCENGINE_CRED_FILE, encrypted);
}

export function loadVolcengineCredentials(): VolcengineCredentials | null {
  if (!fs.existsSync(VOLCENGINE_CRED_FILE)) return null;
  if (!safeStorage.isEncryptionAvailable()) return null;
  const encrypted = fs.readFileSync(VOLCENGINE_CRED_FILE);
  const json = safeStorage.decryptString(encrypted);
  return JSON.parse(json);
}

export function hasVolcengineCredentials(): boolean {
  return fs.existsSync(VOLCENGINE_CRED_FILE);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/keychain.ts
git commit -m "feat: add volcengine credentials storage via safeStorage"
```

---

### Task 3: 重写 recorder.ts 使用豆包 ASR

**Files:**
- Modify: `electron/recorder.ts`

- [ ] **Step 1: 重写 recorder.ts**

将整个 `electron/recorder.ts` 替换为：

```typescript
import { systemPreferences, ipcMain, BrowserWindow } from 'electron';
import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import { DoubaoASR } from '../src/lib/doubao-asr';
import { createWavBuffer } from '../src/lib/wav-writer';

interface VolcengineCredentials {
  appId: string;
  accessToken: string;
}

export class AudioRecorder {
  private win: BrowserWindow | null = null;
  private tmpDir: string;
  private asr: DoubaoASR;
  private hasCredentials: boolean;

  constructor(credentials?: VolcengineCredentials | null) {
    this.tmpDir = path.join(app.getPath('userData'), 'tmp');
    if (!fs.existsSync(this.tmpDir)) fs.mkdirSync(this.tmpDir, { recursive: true });

    if (credentials?.appId && credentials?.accessToken) {
      this.asr = new DoubaoASR(credentials.appId, credentials.accessToken);
      this.hasCredentials = true;
    } else {
      this.asr = new DoubaoASR('', '');
      this.hasCredentials = false;
    }
  }

  setWindow(win: BrowserWindow): void {
    this.win = win;
  }

  static async checkMicrophonePermission(): Promise<boolean> {
    return systemPreferences.askForMediaAccess('microphone');
  }

  async startRecording(): Promise<void> {
    if (!this.win || this.win.isDestroyed()) {
      throw new Error('语音窗口不可用');
    }

    const granted = await systemPreferences.askForMediaAccess('microphone');
    if (!granted) {
      throw new Error('麦克风访问被拒绝，请在系统设置中允许麦克风权限');
    }

    return new Promise((resolve, reject) => {
      if (!this.win || this.win.isDestroyed()) {
        return reject(new Error('语音窗口不可用'));
      }

      const timeout = setTimeout(() => {
        reject(new Error('录音启动超时'));
      }, 10000);

      ipcMain.once('voice:capture-started', (_event, success: boolean) => {
        clearTimeout(timeout);
        console.log('[recorder] Received capture-started:', success);
        if (success) resolve();
        else reject(new Error('麦克风访问被拒绝，请在系统设置中允许麦克风权限'));
      });

      console.log('[recorder] Sending voice:start-capture to window');
      this.win.webContents.send('voice:start-capture');
    });
  }

  stopRecording(): Promise<string> {
    const outputPath = path.join(this.tmpDir, `recording-${Date.now()}.wav`);

    return new Promise((resolve) => {
      if (!this.win || this.win.isDestroyed()) {
        resolve(outputPath);
        return;
      }

      ipcMain.once('voice:audio-data', (_event, data: { samples: Float32Array; sampleRate: number }) => {
        const buffer = createWavBuffer(data.samples, data.sampleRate);
        fs.writeFileSync(outputPath, buffer);
        resolve(outputPath);
      });

      this.win.webContents.send('voice:stop-capture');
    });
  }

  async transcribe(audioPath?: string): Promise<string> {
    if (!this.hasCredentials) {
      throw new Error('请先在设置中配置火山引擎语音识别凭证');
    }

    const filePath = audioPath || '';

    if (!filePath || !fs.existsSync(filePath)) {
      console.error('[recorder] Audio file not found:', filePath);
      throw new Error('音频文件不存在');
    }

    const stat = fs.statSync(filePath);
    console.log(`[recorder] Audio file: ${filePath} (${stat.size} bytes)`);
    if (stat.size < 44) {
      throw new Error('音频文件过小，可能录制失败');
    }

    const text = await this.asr.transcribe(filePath);
    console.log(`[recorder] Transcription result: "${text}" (length: ${text.length})`);

    try { fs.unlinkSync(filePath); } catch {}

    return text;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add electron/recorder.ts
git commit -m "feat: rewrite recorder to use DoubaoASR instead of sherpa-onnx"
```

---

### Task 4: 更新 main.ts — 移除 sherpa、新增凭证 IPC

**Files:**
- Modify: `electron/main.ts`

- [ ] **Step 1: 更新 import 区**

在 `electron/main.ts` 头部，将：
```typescript
import { AudioRecorder } from './recorder';
```
保持不变。

添加：
```typescript
import { saveVolcengineCredentials, loadVolcengineCredentials, hasVolcengineCredentials } from '../src/lib/keychain';
```

- [ ] **Step 2: 移除 VoiceRecognizer/sherpa 相关 import**

删除这一行（如果存在）：
```typescript
// 此 import 不在 main.ts 中，但在 recorder.ts 中已移除
```

- [ ] **Step 3: 修改 recorder 初始化**

将 `recorder = new AudioRecorder();` 替换为：

```typescript
// 初始化录音器并预创建 voice-bar 窗口
const volcengineCreds = loadVolcengineCredentials();
recorder = new AudioRecorder(volcengineCreds);
voiceBar.preCreate();
recorder.setWindow(voiceBar.getWindow()!);
```

- [ ] **Step 4: 移除 onboarding:download-model IPC handler**

删除 `registerIpcHandlers()` 函数中从 `ipcMain.handle('onboarding:download-model'` 开始到对应的 `});` 结束的整个 handler（大约在 line 400-464）。

- [ ] **Step 5: 移除 loadSettings 中的 voiceModel 默认值**

在 `loadSettings()` 函数的默认返回值中删除 `voiceModel: 'sensevoice',` 这一行。

- [ ] **Step 6: 新增凭证 IPC handlers**

在 `registerIpcHandlers()` 中新增：

```typescript
  // volcengine credentials
  ipcMain.handle('settings:load-volcengine-credentials', () => {
    const creds = loadVolcengineCredentials();
    return { hasCredentials: !!creds, appId: creds?.appId || '' };
  });

  ipcMain.handle('settings:save-volcengine-credentials', async (_, { appId, accessToken }: { appId: string; accessToken: string }) => {
    // Validate by attempting a connection
    const { DoubaoASR } = await import('../src/lib/doubao-asr');
    const asr = new DoubaoASR(appId, accessToken);
    // Create a minimal valid WAV for testing (0.5s silence)
    const silence = Buffer.alloc(44 + 16000, 0);
    silence.write('RIFF', 0);
    silence.writeUInt32LE(36 + 16000, 4);
    silence.write('WAVE', 8);
    silence.write('fmt ', 12);
    silence.writeUInt32LE(16, 16);
    silence.writeUInt16LE(1, 20);
    silence.writeUInt16LE(1, 22);
    silence.writeUInt32LE(16000, 24);
    silence.writeUInt32LE(32000, 28);
    silence.writeUInt16LE(2, 32);
    silence.writeUInt16LE(16, 34);
    silence.write('data', 36);
    silence.writeUInt32LE(16000, 40);

    const tmpPath = path.join(app.getPath('userData'), 'tmp', 'test-connection.wav');
    if (!fs.existsSync(path.dirname(tmpPath))) fs.mkdirSync(path.dirname(tmpPath), { recursive: true });
    fs.writeFileSync(tmpPath, silence);

    try {
      await asr.transcribe(tmpPath);
      saveVolcengineCredentials(appId, accessToken);
      // Update recorder with new credentials
      const creds = loadVolcengineCredentials();
      recorder = new AudioRecorder(creds);
      recorder.setWindow(voiceBar.getWindow()!);
    } finally {
      try { fs.unlinkSync(tmpPath); } catch {}
    }
  });
```

- [ ] **Step 7: Commit**

```bash
git add electron/main.ts
git commit -m "feat: update main.ts — remove model download, add volcengine credential IPC"
```

---

### Task 5: 更新 Onboarding — 替换模型下载为凭证配置

**Files:**
- Modify: `src/components/Onboarding.tsx`

- [ ] **Step 1: 重写 Onboarding 组件**

将 `src/components/Onboarding.tsx` 替换为：

```typescript
'use client';

import { useState } from 'react';
import { getIpcRenderer } from '@/lib/electron-ipc';

type Step = 'welcome' | 'accessibility' | 'volcengine' | 'api-key' | 'cwd' | 'done';

export function Onboarding({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState<Step>('welcome');
  const [apiKey, setApiKey] = useState('');
  const [volcAppId, setVolcAppId] = useState('');
  const [volcToken, setVolcToken] = useState('');
  const [defaultCwd, setDefaultCwd] = useState('~/Documents');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const ipcRenderer = getIpcRenderer();

  const checkAccessibility = async () => {
    const granted = await ipcRenderer?.invoke('onboarding:check-accessibility');
    if (granted) setStep('volcengine');
  };

  const saveVolcengine = async () => {
    if (!volcAppId.trim() || !volcToken.trim()) {
      setError('请填写 App ID 和 Access Token');
      return;
    }
    setError('');
    setSaving(true);
    try {
      await ipcRenderer?.invoke('settings:save-volcengine-credentials', {
        appId: volcAppId.trim(),
        accessToken: volcToken.trim(),
      });
      setStep('api-key');
    } catch (e: any) {
      setError(e.message || '凭证验证失败');
    } finally {
      setSaving(false);
    }
  };

  const validateApiKey = async () => {
    setError('');
    try {
      await ipcRenderer?.invoke('onboarding:validate-api-key', { key: apiKey.trim(), providerKey: 'glm-cn' });
      setStep('cwd');
    } catch {
      setError('API Key 验证失败，请检查后重试');
    }
  };

  const finish = async () => {
    await ipcRenderer?.invoke('onboarding:finish', { defaultCwd });
    setStep('done');
    onComplete();
  };

  const steps: Record<Step, React.ReactNode> = {
    welcome: (
      <OnboardingStep
        title="欢迎使用 Aiva"
        description="Aiva 让你用语音驱动 Claude Code。按下右 Command，说一句话，Claude 帮你干活。"
        buttonText="开始设置"
        onAction={() => setStep('accessibility')}
      />
    ),
    accessibility: (
      <OnboardingStep
        title="辅助功能权限"
        description="为了响应右 Command 键唤起语音，Aiva 需要辅助功能权限。这与 Raycast、Alfred 等应用所需的权限相同。Aiva 只会监听右 Command 键，不会记录任何其他按键。"
        buttonText="打开系统设置"
        onAction={() => {
          ipcRenderer?.send('onboarding:open-accessibility');
          const interval = setInterval(async () => {
            const granted = await ipcRenderer?.invoke('onboarding:check-accessibility');
            if (granted) {
              clearInterval(interval);
              setStep('volcengine');
            }
          }, 1000);
        }}
        secondaryButton="已授权，下一步"
        onSecondary={() => checkAccessibility()}
      />
    ),
    volcengine: (
      <div style={stepStyle}>
        <h2 style={titleStyle}>语音识别配置</h2>
        <p style={descStyle}>
          Aiva 使用豆包语音大模型进行在线语音识别。请填写火山引擎的凭证。
        </p>
        <input
          type="text"
          value={volcAppId}
          onChange={e => setVolcAppId(e.target.value)}
          placeholder="App ID"
          style={{ ...inputStyle, marginBottom: 8 }}
        />
        <input
          type="password"
          value={volcToken}
          onChange={e => setVolcToken(e.target.value)}
          placeholder="Access Token"
          style={{ ...inputStyle, marginBottom: 12 }}
        />
        {error && <p style={{ color: '#FF453A', fontSize: 13, marginBottom: 8 }}>{error}</p>}
        <button onClick={saveVolcengine} disabled={saving || !volcAppId.trim() || !volcToken.trim()} style={{
          ...buttonStyle,
          opacity: (!saving && volcAppId.trim() && volcToken.trim()) ? 1 : 0.5,
          cursor: (!saving && volcAppId.trim() && volcToken.trim()) ? 'pointer' : 'default',
        }}>
          {saving ? '验证中...' : '验证并保存'}
        </button>
      </div>
    ),
    'api-key': (
      <div style={stepStyle}>
        <h2 style={titleStyle}>API Key</h2>
        <p style={descStyle}>需要 GLM API Key 来调用 Claude。Key 将安全存储在 macOS 钥匙串中。</p>
        <input
          type="password"
          value={apiKey}
          onChange={e => setApiKey(e.target.value)}
          placeholder="从 open.bigmodel.cn 获取您的 API Key"
          style={{ ...inputStyle, marginBottom: 12 }}
        />
        {error && <p style={{ color: '#FF453A', fontSize: 13, marginBottom: 8 }}>{error}</p>}
        <button onClick={validateApiKey} disabled={!apiKey.trim()} style={{
          ...buttonStyle,
          opacity: apiKey.trim() ? 1 : 0.5,
          cursor: apiKey.trim() ? 'pointer' : 'default',
        }}>
          验证并保存
        </button>
      </div>
    ),
    cwd: (
      <div style={stepStyle}>
        <h2 style={titleStyle}>工作目录</h2>
        <p style={descStyle}>Claude Code 将在此目录下执行命令。</p>
        <input
          type="text"
          value={defaultCwd}
          onChange={e => setDefaultCwd(e.target.value)}
          style={{ ...inputStyle, marginBottom: 12 }}
        />
        <button onClick={() => {
          ipcRenderer?.invoke('settings:pick-directory').then((p: string | null) => {
            if (p) setDefaultCwd(p);
          });
        }} style={{ ...buttonStyle, background: '#fff', color: '#007AFF', border: '1px solid #007AFF', marginBottom: 12 }}>
          浏览
        </button>
        <button onClick={finish} style={buttonStyle}>完成设置</button>
      </div>
    ),
    done: (
      <OnboardingStep
        title="设置完成！"
        description="按下右 Command 开始使用 Aiva。"
        buttonText="开始使用"
        onAction={onComplete}
      />
    ),
  };

  return (
    <div style={{
      display: 'flex', justifyContent: 'center', alignItems: 'center',
      minHeight: '100vh', background: '#fafafa',
    }}>
      {steps[step]}
    </div>
  );
}

function OnboardingStep({ title, description, buttonText, onAction, secondaryButton, onSecondary }: {
  title: string; description: string; buttonText: string;
  onAction: () => void; secondaryButton?: string; onSecondary?: () => void;
}) {
  return (
    <div style={stepStyle}>
      <h2 style={titleStyle}>{title}</h2>
      <p style={descStyle}>{description}</p>
      <button onClick={onAction} style={buttonStyle}>{buttonText}</button>
      {secondaryButton && onSecondary && (
        <button onClick={onSecondary} style={{ ...linkStyle, marginTop: 8 }}>{secondaryButton}</button>
      )}
    </div>
  );
}

const stepStyle: React.CSSProperties = { maxWidth: 420, padding: 40, textAlign: 'center' as const };
const titleStyle: React.CSSProperties = { fontSize: 22, fontWeight: 700, marginBottom: 12 };
const descStyle: React.CSSProperties = { fontSize: 14, color: '#666', lineHeight: 1.6, marginBottom: 24 };
const buttonStyle: React.CSSProperties = {
  padding: '10px 24px', borderRadius: 8, border: 'none',
  background: '#007AFF', color: '#fff', fontSize: 15, cursor: 'pointer',
};
const linkStyle: React.CSSProperties = {
  background: 'none', border: 'none', color: '#007AFF',
  fontSize: 13, cursor: 'pointer', textDecoration: 'underline',
};
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', borderRadius: 8,
  border: '1px solid #ddd', fontSize: 14, boxSizing: 'border-box',
};
```

- [ ] **Step 2: Commit**

```bash
git add src/components/Onboarding.tsx
git commit -m "feat: replace model download with volcengine credentials in onboarding"
```

---

### Task 6: 更新设置页 — 新增语音识别凭证 section

**Files:**
- Modify: `src/app/settings/page.tsx`

- [ ] **Step 1: 添加语音识别凭证 section**

在 `SettingsPage` 组件中：

1. 新增 state：
```typescript
const [volcAppId, setVolcAppId] = useState('');
const [volcToken, setVolcToken] = useState('');
const [hasVolcCreds, setHasVolcCreds] = useState(false);
const [volcStatus, setVolcStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
```

2. 在 `useEffect` 的 `settings:load` 回调中追加：
```typescript
const volcCreds = await getIpcRenderer()?.invoke('settings:load-volcengine-credentials');
if (volcCreds) {
  setVolcAppId(volcCreds.appId || '');
  setHasVolcCreds(volcCreds.hasCredentials || false);
}
```

注意：需要将 `useEffect` 改为 `async` 以使用 `await`。将 IPC 调用拆开：

```typescript
useEffect(() => {
  const ipcRenderer = getIpcRenderer();
  ipcRenderer?.invoke('settings:load').then((settings: any) => {
    setDefaultCwd(settings.defaultCwd || '~/Documents');
    setVadTimeout(settings.vadTimeout || 2);
    setHasKey(settings.hasApiKey || false);
    setProvider(settings.provider || 'glm-cn');
    setModelPreset(settings.modelPreset || 'opus');
  });
  ipcRenderer?.invoke('settings:load-volcengine-credentials').then((creds: any) => {
    if (creds) {
      setVolcAppId(creds.appId || '');
      setHasVolcCreds(creds.hasCredentials || false);
    }
  });
}, []);
```

3. 添加保存函数：
```typescript
const handleSaveVolcengine = async () => {
  if (!volcAppId.trim() || !volcToken.trim()) return;
  setVolcStatus('saving');
  try {
    await getIpcRenderer()?.invoke('settings:save-volcengine-credentials', {
      appId: volcAppId.trim(),
      accessToken: volcToken.trim(),
    });
    setHasVolcCreds(true);
    setVolcToken('');
    setVolcStatus('saved');
    setTimeout(() => setVolcStatus('idle'), 2000);
  } catch {
    setVolcStatus('error');
    setTimeout(() => setVolcStatus('idle'), 2000);
  }
};
```

4. 在 API Key section 之后、工作目录 section 之前，添加语音识别 section：

```tsx
{/* 语音识别 */}
<section style={{ marginBottom: 32 }}>
  <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>语音识别</h2>
  <p style={{ fontSize: 13, color: '#666', marginBottom: 8 }}>
    豆包语音大模型（火山引擎在线识别）。凭证将安全存储。
  </p>
  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
    <input
      type="text"
      value={volcAppId}
      onChange={e => setVolcAppId(e.target.value)}
      placeholder={hasVolcCreds ? '已存储（输入新 App ID 替换）' : 'App ID'}
      style={{
        padding: '8px 12px', borderRadius: 8,
        border: '1px solid #ddd', fontSize: 14,
      }}
    />
    <div style={{ display: 'flex', gap: 8 }}>
      <input
        type="password"
        value={volcToken}
        onChange={e => setVolcToken(e.target.value)}
        placeholder={hasVolcCreds ? '输入新 Access Token 替换' : 'Access Token'}
        style={{
          flex: 1, padding: '8px 12px', borderRadius: 8,
          border: '1px solid #ddd', fontSize: 14,
        }}
      />
      <button
        onClick={handleSaveVolcengine}
        disabled={!volcAppId.trim() || !volcToken.trim() || volcStatus === 'saving'}
        style={{
          padding: '8px 16px', borderRadius: 8, border: 'none',
          background: (volcAppId.trim() && volcToken.trim()) ? '#007AFF' : '#ccc',
          color: '#fff', cursor: (volcAppId.trim() && volcToken.trim()) ? 'pointer' : 'default',
        }}
      >
        {volcStatus === 'saving' ? '验证中...' : '保存'}
      </button>
    </div>
  </div>
  {volcStatus === 'saved' && <p style={{ color: '#34C759', fontSize: 13, marginTop: 4 }}>已保存</p>}
  {volcStatus === 'error' && <p style={{ color: '#FF453A', fontSize: 13, marginTop: 4 }}>凭证验证失败，请检查是否正确</p>}
</section>
```

- [ ] **Step 2: Commit**

```bash
git add src/app/settings/page.tsx
git commit -m "feat: add volcengine ASR credentials section to settings page"
```

---

### Task 7: 清理 — 删除 sherpa 相关代码和依赖

**Files:**
- Delete: `src/lib/sherpa.ts`
- Modify: `src/types/declarations.d.ts`
- Modify: `package.json`
- Modify: `electron-builder.yml`

- [ ] **Step 1: 删除 sherpa.ts**

Run: `rm src/lib/sherpa.ts`

- [ ] **Step 2: 清理 declarations.d.ts**

将 `src/types/declarations.d.ts` 替换为（移除 sherpa-onnx-node 模块声明）：

```typescript
// Type declarations for native modules used in this project
```

如果文件中只有 sherpa-onnx-node 的声明，就清空为上述注释。如果还有其他声明，只移除 sherpa-onnx-node 部分。

- [ ] **Step 3: 从 package.json 移除 sherpa-onnx-node**

在 `package.json` 的 `dependencies` 中移除这一行：
```
"sherpa-onnx-node": "^1.10.0",
```

- [ ] **Step 4: 从 electron-builder.yml 移除 sherpa 打包规则**

在 `electron-builder.yml` 的 `files` 数组中移除这两行：
```
- "node_modules/sherpa-onnx-node/**/*"
- "node_modules/sherpa-onnx-darwin-arm64/**/*"
```

- [ ] **Step 5: 安装依赖（移除 sherpa-onnx-node，添加 ws）**

Run: `npm install`

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: remove sherpa-onnx dependency and related code"
```

---

### Task 8: 更新 CLAUDE.md 项目文档

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: 更新关键模块描述**

将 `electron/recorder.ts` 的描述从：
```
`electron/recorder.ts` | 录音（Web Audio API via IPC）→ sherpa-onnx 本地转写
```
改为：
```
`electron/recorder.ts` | 录音（Web Audio API via IPC）→ 豆包语音大模型在线转写
```

将 `src/lib/sherpa.ts` 行移除，替换为：
```
`src/lib/doubao-asr.ts` | 豆包流式语音识别 WebSocket 客户端
```

- [ ] **Step 2: 更新 Native Dependencies**

移除 `sherpa-onnx-node` 条目。Native Dependencies 只保留：
```
- `better-sqlite3` — SQLite 绑定
- `uiohook-napi` — 全局键盘/鼠标钩子
```

- [ ] **Step 3: 更新 Key Design Decisions**

将：
```
- **sherpa-onnx 使用 SenseVoice Small ONNX (Int8 量化)** 模型，中文效果优于 Whisper
```
改为：
```
- **语音识别使用豆包流式语音识别模型 2.0**（火山引擎在线 API），通过 WebSocket 二进制协议通信
```

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md for Doubao ASR integration"
```

---

### Task 9: 验证构建

- [ ] **Step 1: 检查 TypeScript 编译**

Run: `npx tsc --noEmit 2>&1 | head -50`

预期：无与 doubao-asr / recorder / keychain 相关的错误。如果有，修复。

- [ ] **Step 2: 检查 esbuild 编译**

Run: `npm run build:electron 2>&1 | tail -20`

预期：编译成功，输出 `dist-electron/main.js`。

- [ ] **Step 3: 检查 Next.js 构建**

Run: `npm run build 2>&1 | tail -30`

预期：构建成功，无 import sherpa-onnx 相关错误。

- [ ] **Step 4: 确认所有改动**

Run: `git diff --stat main...HEAD`

检查改动文件列表是否符合预期。
