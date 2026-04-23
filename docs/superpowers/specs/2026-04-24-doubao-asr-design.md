# 豆包语音大模型接入设计

## 目标

将语音识别从 sherpa-onnx 离线模型切换为豆包流式语音识别模型 2.0（火山引擎在线 API），移除离线模型依赖。

## 架构

**当前流程**：
```
录音(Web Audio) → IPC Float32Array → WAV 文件 → sherpa-onnx 本地推理 → 文本
```

**新流程**：
```
录音(Web Audio) → IPC Float32Array → WAV 文件 → 豆包 WebSocket API → 文本
```

录音采集和 WAV 写入完全不变。只替换 `transcribe()` 方法的实现。

## 方案选择

采用 **方案 A（录音后一次性识别）**：使用 `bigmodel_nostream` 接口。录音完成后将 WAV 音频分包发送到豆包 API，等待最终识别结果。

选择理由：改动最小，UI 完全不需要改，录音流程不变。

## 模块变更

### 新增 `src/lib/doubao-asr.ts`

豆包 ASR 客户端，封装 `bigmodel_nostream` WebSocket 二进制协议。

- 构造函数接收 `appId` + `accessToken`
- `transcribe(wavFilePath: string): Promise<string>` 方法流程：
  1. 建立 WebSocket 到 `wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_nostream`
  2. HTTP Header 携带鉴权：`X-Api-App-Key`、`X-Api-Access-Key`、`X-Api-Resource-Id: volc.seedasr.sauc.duration`
  3. 发送 full client request（JSON 配置：`format: wav, rate: 16000, bits: 16, channel: 1, model_name: bigmodel`）
  4. 读取 WAV 文件，分包发送音频数据（每包约 200ms，Gzip 压缩）
  5. 发送最后一包（message type specific flags = `0b0010`，负包标志）
  6. 等待服务端 full server response，解析二进制协议（4 字节 header + 4 字节 sequence + payload size + payload）
  7. 从 JSON payload 中提取 `result.text`
  8. 关闭 WebSocket 连接

二进制协议细节（大端序）：
- Byte 0: protocol version (4 bits) | header size (4 bits) → `0x11`
- Byte 1: message type (4 bits) | flags (4 bits)
  - full client request: `0x10` (type=1, flags=0, no sequence)
  - audio only: `0x20` (type=2, flags=0, positive sequence)
  - last audio: `0x22` (type=2, flags=2, negative/last)
- Byte 2: serialization (4 bits) | compression (4 bits)
  - JSON + Gzip: `0x11`
  - No serialization + Gzip: `0x01`
- Byte 3: reserved → `0x00`

### 修改 `electron/recorder.ts`

- 移除 `VoiceRecognizer` import 和实例
- `transcribe(audioPath)` 改为使用 `DoubaoASR` 实例
- 移除 `getRecognizer()` 方法
- 构造函数接收火山引擎凭证参数

### 修改 `src/lib/keychain.ts`

新增函数：
- `saveVolcengineCredentials(appId: string, accessToken: string)` — safeStorage 加密，存入 `~/Library/Application Support/Shrew/secure/volcengine.json`
- `loadVolcengineCredentials(): { appId: string; accessToken: string } | null`

### 修改 `electron/main.ts`

- 移除 `onboarding:download-model` IPC handler（整个 handler 删除）
- 移除 `VoiceRecognizer` / `sherpa` 相关 import
- `recorder` 初始化改为 `new AudioRecorder(volcengineCredentials)`，从 keychain 读取凭证
- 新增 IPC handlers：
  - `settings:save-volcengine-credentials` — 保存火山引擎凭证（保存前验证）
  - `settings:load-volcengine-credentials` — 读取火山引擎凭证

### 修改 onboarding 流程

- 移除模型下载步骤
- 新增火山引擎 App ID / Access Token 配置步骤（放在 API Key 配置之后）

### 修改 `src/types/declarations.d.ts`

- `AppSettings` 中移除 `voiceModel: 'sensevoice'` 字段

### 移除的代码/依赖

- 删除 `src/lib/sherpa.ts`
- 从 `package.json` 移除 `sherpa-onnx-node` 依赖
- 从 `electron-builder.yml` 移除 `*.dylib` / sherpa 相关 ASAR 解包规则
- 清理 onboarding 页面中的模型下载 UI

## 错误处理

### 网络错误
- WebSocket 连接失败 / 超时（10s）→ voice-bar: "语音识别服务连接失败，请检查网络"
- 整个识别过程超时（30s）→ voice-bar: "语音识别超时，请重试"

### 服务端错误
解析豆包 error frame 中的错误码：
- `45000001` → "请求参数错误"
- `45000002` → "音频为空，请重新录制"
- `45000081` → "等待超时"
- `45000151` → "音频格式不正确"
- `55000031` → "服务繁忙，请稍后重试"
- 其他 `550xxxxx` → "语音识别服务内部错误"

### 凭证缺失
未配置火山引擎凭证 → voice-bar: "请先在设置中配置火山引擎语音识别凭证"

### WAV 文件异常
沿用现有逻辑：文件不存在或过小时抛出对应错误。

## 凭证配置

**存储**：Electron `safeStorage.encryptString()` 加密，存入 `~/Library/Application Support/Shrew/secure/volcengine.json`

**配置入口**：
- 设置页新增"语音识别"section，包含 App ID 和 Access Token 输入框
- onboarding 流程中新增配置步骤

**验证**：保存前尝试建立 WebSocket 连接并发送短音频测试，验证凭证有效性。

## 资源 ID

使用豆包流式语音识别模型 2.0 小时版：`volc.seedasr.sauc.duration`

## 不改动的部分

- `electron/voice-bar.ts` — 窗口管理不变
- `src/components/VoiceInput.tsx` — UI 不变，IPC 接口不变
- `src/lib/audio-capture.ts` — Web Audio 采集不变
- `src/lib/wav-writer.ts` — WAV 写入不变
- `src/lib/store.ts` — 状态机不变
- `src/lib/claude-client.ts` — Claude 执行不变
