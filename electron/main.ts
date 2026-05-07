import { app, BrowserWindow, ipcMain, systemPreferences, dialog, shell, nativeTheme } from 'electron';
import path from 'path';
import fs from 'fs';
import { spawn, ChildProcess } from 'child_process';
import { ShrewTray } from './tray';
import { VoiceBarWindow } from './voice-bar';
import { ShortcutManager } from './shortcuts';
import { AudioRecorder } from './recorder';
import { ShrewStore } from '../src/lib/store';
import { TtsService, TtsResult } from './tts';
import { SubtitlePopup } from './subtitle-popup';
import { WakeWordEngine } from './wake-word';
import { AudioListener } from './audio-listener';
import { VoiceEndpoint } from './voice-endpoint';
import { initDb, insertExecution, updateExecution, getRecentExecutions, getExecutionById, appendMessages, getActiveExecution, getActiveSegment, endSegment, createSegment, updateSegmentSessionId, insertChatMessage, appendChatMessageContent, getChatMessages, getLatestAssistantMessage, migrateMemoryItems } from '../src/lib/db';
import { readProfile, writeProfile, readPersonaMarkdown, writePersonaMarkdown, saveAvatarFile, removeAvatarFile, getAvatarPath, buildPersonaContext, migratePersona, getPersonaDir, ensurePersonaDir } from '../src/lib/persona-file';
import { saveApiKey, loadApiKey, hasApiKey, migrateKeyFile, saveVolcengineCredentials, loadVolcengineCredentials, hasVolcengineCredentials } from '../src/lib/keychain';
import { getProvider, getDefaultProvider, resolveModel } from '../src/lib/provider-config';
import { executeClaude } from '../src/lib/claude-client';
import { loadMcpServers, addMcpServer, updateMcpServer, removeMcpServer } from '../src/lib/config-files';
import { scanSkills, importSkill, importSkillFromMd, importSkillFromZip, deleteSkill, buildSkillCatalog, readSkillContent } from '../src/lib/skill-manager';
import { buildShrewContext } from '../src/lib/shrew-context';
import { listDailyMemoryDates, readDailyMemory } from '../src/lib/daily-memory-reader';
import { evaluateAndWriteDailyMemory } from '../src/lib/daily-memory-writer';
import { log, initLogger } from '../src/lib/logger';
import type { ExecutionRecord, AppSettings, DotColor, ConversationMessage, ChatMessage, SdkSubState, ToolCallRecord } from '../src/types';

// 全局状态
import Database from 'better-sqlite3';

const isDev = !app.isPackaged;
const shrewDir = path.join(app.getPath('home'), '.shrew');
const settingsPath = path.join(shrewDir, 'settings.json');
const dbPath = path.join(shrewDir, 'shrew.db');

let db: Database.Database;
let store: ShrewStore;
let tray: ShrewTray;
let voiceBar: VoiceBarWindow;
let shortcutManager: ShortcutManager;
let recorder: AudioRecorder;
let mainWindow: BrowserWindow | null = null;
let serverPort = 3000;
let nextServer: ChildProcess | null = null;
let currentAbortController: AbortController | null = null;
let ttsService: TtsService;
let subtitlePopup: SubtitlePopup;
let ttsAbortController: AbortController | null = null;
let personaWatcher: fs.FSWatcher | null = null;
let isQuitting = false;
let wakeWordEngine: WakeWordEngine | null = null;
let audioListener: AudioListener | null = null;
let voiceEndpoint: VoiceEndpoint | null = null;
let wakeWordActive = false;
let endpointMode = false;

function startPersonaWatcher(): void {
  const personaDir = getPersonaDir(shrewDir);
  ensurePersonaDir(shrewDir);

  personaWatcher = fs.watch(personaDir, (eventType, filename) => {
    if (!filename) return;
    if (filename !== 'profile.json' && filename !== 'persona.md') return;

    log.info(`Persona 文件变更: ${filename} (${eventType})`);

    try {
      const profile = readProfile(shrewDir);
      if (!profile.name) {
        log.warn('Persona watcher: profile.json 缺少 name 字段，跳过广播');
        return;
      }
    } catch (err) {
      log.error('Persona watcher: 解析 profile.json 失败:', err);
      return;
    }

    BrowserWindow.getAllWindows().forEach(win => {
      if (!win.isDestroyed()) {
        win.webContents.send('persona:updated');
      }
    });
  });

  personaWatcher.on('error', (err) => {
    log.error('Persona watcher 错误:', err);
  });

  log.info('Persona file watcher 已启动');
}

// 启动 Next.js standalone 服务器（生产模式）
function startNextServer(): Promise<number> {
  return new Promise((resolve, reject) => {
    const standaloneDir = path.join(process.resourcesPath, '.next', 'standalone');
    const serverScript = path.join(standaloneDir, 'server.js');

    if (!fs.existsSync(serverScript)) {
      reject(new Error(`Standalone server not found at ${serverScript}`));
      return;
    }

    // 找一个可用端口
    const net = require('net');
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const port = (srv.address() as any).port;
      srv.close(() => {
        serverPort = port;

        const env = {
          ...process.env,
          ELECTRON_RUN_AS_NODE: '1',
          PORT: String(port),
          HOSTNAME: '127.0.0.1',
        };

        nextServer = spawn(process.execPath, [serverScript], {
          cwd: standaloneDir,
          env,
          stdio: ['pipe', 'pipe', 'pipe'],
        });

        nextServer.stdout?.on('data', (data: Buffer) => {
          const msg = data.toString();
          log.info('[next-server]', msg.trim());
          if (msg.includes('Ready') || msg.includes('started')) {
            resolve(port);
          }
        });

        nextServer.stderr?.on('data', (data: Buffer) => {
          log.error('[next-server]', data.toString().trim());
        });

        nextServer.on('error', (err) => {
          log.error('Next.js 服务器启动失败:', err);
          reject(err);
        });

        nextServer.on('exit', (code) => {
          log.info(`Next.js 服务器退出, code=${code}`);
          nextServer = null;
        });

        // 超时保护：5秒后如果还没 Ready 就 resolve（可能已经 Ready 了只是输出格式不同）
        setTimeout(() => resolve(port), 5000);
      });
    });
  });
}

// 等待服务器响应
function waitForServer(port: number, maxRetries = 20): Promise<void> {
  return new Promise((resolve, reject) => {
    const http = require('http');
    let attempts = 0;
    const check = () => {
      attempts++;
      const req = http.get(`http://127.0.0.1:${port}/api/health`, (res: any) => {
        resolve();
      });
      req.on('error', () => {
        if (attempts >= maxRetries) {
          reject(new Error('Server health check timed out'));
        } else {
          setTimeout(check, 500);
        }
      });
      req.setTimeout(2000, () => {
        req.destroy();
        if (attempts >= maxRetries) {
          reject(new Error('Server health check timed out'));
        } else {
          setTimeout(check, 500);
        }
      });
    };
    check();
  });
}

function loadSettings(): AppSettings {
  try {
    if (fs.existsSync(settingsPath)) {
      return JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    }
  } catch {}
  return {
    shortcut: 'right_cmd',
    claudePermissionMode: 'bypassPermissions',
    defaultCwd: '~/Documents',
    vadTimeout: 2,
    theme: 'system',
    provider: 'glm-cn',
    modelPreset: 'opus',
    disabledSkills: [],
  };
}

function saveSettings(settings: AppSettings): void {
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
}

function updateTrayDot(): void {
  if (store.appState === 'executing' || store.appState === 'thinking') {
    tray.startAnimation();
  } else {
    tray.updateDot(store.dotColor);
  }
}

const RECENT_LIMIT = 10;

function sendToMainWindow(channel: string, data?: unknown): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, data);
  }
}

function broadcastChatState(): void {
  sendToMainWindow('chat:state-update', {
    appState: store.appState,
    sdkSubState: store.sdkSubState,
    currentToolName: store.currentToolName ?? undefined,
  });
}

// --- Wake Word Functions ---

function isWakeWordEnabled(): boolean {
  const settings = loadSettings();
  return settings.wakeWordEnabled === true;
}

function getKeyword(): string {
  const profile = readProfile(shrewDir);
  return profile.name || 'Shrew';
}

async function startWakeWord(): Promise<void> {
  if (wakeWordActive) return;

  const keyword = getKeyword();

  if (!wakeWordEngine) {
    try {
      wakeWordEngine = new WakeWordEngine();
      wakeWordEngine.init(keyword);
    } catch (err) {
      wakeWordEngine = null;
      throw err;
    }
  }

  try {
    if (!audioListener) {
      audioListener = new AudioListener();
      audioListener.create();
      audioListener.registerChunkHandler(handleAudioChunk);
      await audioListener.start();
    } else if (!audioListener.isActive()) {
      await audioListener.start();
    }
  } catch (err) {
    audioListener = null;
    throw err;
  }

  wakeWordEngine.start();
  wakeWordActive = true;
  log.info('唤醒词监听已启动, 关键词:', keyword);
}

function stopWakeWord(): void {
  if (wakeWordEngine) wakeWordEngine.stop();
  if (audioListener) audioListener.stop();
  wakeWordActive = false;
  endpointMode = false;
  log.info('唤醒词监听已停止');
}

function destroyWakeWord(): void {
  stopWakeWord();
  if (wakeWordEngine) {
    wakeWordEngine.destroy();
    wakeWordEngine = null;
  }
  if (audioListener) {
    audioListener.destroy();
    audioListener = null;
  }
  if (voiceEndpoint) {
    voiceEndpoint.destroy();
    voiceEndpoint = null;
  }
}

function handleAudioChunk(samples: Float32Array): void {
  if (endpointMode) {
    voiceEndpoint?.feed(samples);
    return;
  }

  if (wakeWordActive && wakeWordEngine) {
    const detected = wakeWordEngine.feed(samples);
    if (detected) {
      onWakeWordDetected();
    }
  }
}

function resumeWakeWord(): void {
  if (!wakeWordEngine || !isWakeWordEnabled()) return;
  wakeWordEngine.reset();
  wakeWordEngine.start();
  wakeWordActive = true;
  endpointMode = false;
  log.info('唤醒词监听已恢复');
}

function onWakeWordDetected(): void {
  if (store.appState !== 'idle') {
    log.info('唤醒词检测到但状态非 idle，忽略:', store.appState);
    return;
  }

  log.info('唤醒词检测到！切换到录音模式');
  endpointMode = true;

  const settings = loadSettings();
  const timeout = settings.wakeWordSilenceTimeout ?? 3;

  if (voiceEndpoint) voiceEndpoint.destroy();
  voiceEndpoint = new VoiceEndpoint({
    silenceTimeout: timeout,
    minDuration: 0.5,
    maxDuration: 30,
  });
  voiceEndpoint.init();
  voiceEndpoint.setCallbacks(
    (wavPath) => onRecordingComplete(wavPath),
    () => onRecordingTooShort(),
  );
  voiceEndpoint.start();

  voiceBar.show();
  store.transition('recording');
  updateTrayDot();
}

function onRecordingComplete(wavPath: string): void {
  endpointMode = false;
  if (voiceEndpoint) { voiceEndpoint.destroy(); voiceEndpoint = null; }
  log.info('唤醒词录音完成, 开始转写');

  store.transition('transcribing');
  updateTrayDot();
  voiceBar.send('voice:transcribing');

  recorder.transcribe(wavPath).then(text => {
    log.info('转写结果:', text || '(空)');
    if (text) {
      store.transition('editing');
      voiceBar.send('voice:transcript', { text, isAppending: false });
    } else {
      voiceBar.send('voice:error', { message: '未能识别语音，请重试' });
      store.transition('idle');
    }
    updateTrayDot();
  }).catch(err => {
    log.error('转写失败:', err);
    try { fs.unlinkSync(wavPath); } catch {}
    voiceBar.send('voice:error', { message: err.message });
    store.transition('idle');
    updateTrayDot();
  });
}

function onRecordingTooShort(): void {
  endpointMode = false;
  if (voiceEndpoint) { voiceEndpoint.destroy(); voiceEndpoint = null; }
  log.info('唤醒词录音太短，忽略');
  voiceBar.close();
  store.transition('idle');
  updateTrayDot();
  resumeWakeWord();
}

// 右 Command 按键处理
function handleRightCommand(): void {
  const action = store.getRightCommandAction();

  switch (action) {
    case 'start-recording':
      log.info('开始录音');
      voiceBar.show();
      recorder.startRecording().catch(err => {
        log.error('录音启动失败:', err);
        if (store.appState === 'recording') {
          voiceBar.send('voice:error', { message: `录音失败: ${err.message}` });
          store.transition('idle');
          updateTrayDot();
        }
      });
      store.transition('recording');
      updateTrayDot();
      break;

    case 'stop-recording':
      log.info('停止录音');
      recorder.stopRecording().then(audioPath => {
        store.transition('transcribing');
        updateTrayDot();
        voiceBar.send('voice:transcribing');

        return recorder.transcribe(audioPath);
      }).then(text => {
        log.info('转写结果:', text || '(空)');
        if (text) {
          store.transition('editing');
          voiceBar.send('voice:transcript', { text, isAppending: false });
        } else {
          voiceBar.send('voice:error', { message: '未能识别语音，请重试' });
          store.transition('idle');
        }
        updateTrayDot();
      }).catch(err => {
        log.error('转写失败:', err);
        voiceBar.send('voice:error', { message: err.message });
        store.transition('idle');
        updateTrayDot();
      });
      break;

    case 'append-recording':
      log.info('追加录音');
      recorder.startRecording().catch(err => {
        log.error('追加录音失败:', err);
        if (store.appState === 'recording') {
          voiceBar.send('voice:error', { message: `录音失败: ${err.message}` });
          store.transition('idle');
          updateTrayDot();
        }
      });
      store.transition('recording');
      updateTrayDot();
      break;

    case 'cancel-execution':
      if (currentAbortController) {
        currentAbortController.abort();
        currentAbortController = null;
      }
      break;

    case 'stop-speaking':
      log.info('中断语音朗读');
      if (ttsAbortController) {
        ttsAbortController.abort();
        ttsAbortController = null;
      }
      ttsService.stop();
      subtitlePopup.stop();
      store.setSpeaking(false);
      updateTrayDot();
      break;

    case 'none':
      break;
  }
}

// 执行 Claude 命令
async function executePrompt(prompt: string, isVoice = false): Promise<void> {
  log.info('executePrompt 开始, prompt:', prompt.slice(0, 100));
  const settings = loadSettings();
  const apiKey = loadApiKey();

  // 无论 API key 是否存在，都先推送用户消息
  const segment = getActiveSegment(db);
  insertChatMessage(db, {
    segmentId: segment.id,
    role: 'user',
    content: prompt,
  });
  sendToMainWindow('chat:user-message', { content: prompt });

  if (!apiKey) {
    log.error('API Key 未配置');
    sendToMainWindow('chat:stream-chunk', {
      messageId: `error-${Date.now()}`,
      content: 'API Key 未配置，请在设置中配置 API Key 后重试。',
      done: false,
    });
    tray.updateDot('red');
    store.transition('idle');
    updateTrayDot();
    return;
  }

  const cwd = settings.defaultCwd.replace('~', app.getPath('home'));
  const providerKey = settings.provider || 'glm-cn';
  const modelPreset = settings.modelPreset || 'opus';

  // 生产模式下定位 claude 原生二进制（绕过 ASAR）
  let claudeExecutablePath: string | undefined;
  if (!isDev) {
    const unpackedRoot = app.getAppPath().replace(/\.asar$/, '.asar.unpacked');
    const candidates = [
      'node_modules/@anthropic-ai/claude-agent-sdk/node_modules/@anthropic-ai/claude-agent-sdk-darwin-arm64/claude',
      'node_modules/@anthropic-ai/claude-agent-sdk-darwin-arm64/claude',
    ];
    for (const rel of candidates) {
      const full = path.join(unpackedRoot, rel);
      if (fs.existsSync(full)) {
        claudeExecutablePath = full;
        log.info('Claude 二进制路径:', claudeExecutablePath);
        break;
      }
    }
    if (!claudeExecutablePath) {
      log.error('Claude 二进制未找到，搜索目录:', unpackedRoot);
    }
  }

  log.info('执行参数:', { cwd, provider: providerKey, model: modelPreset, claudeExecutablePath });

  const executionId = insertExecution(db, {
    cwd,
    user_prompt: prompt,
    segment_id: segment.id,
  });

  const conversationMessages: ConversationMessage[] = [];
  conversationMessages.push({ role: 'user', content: prompt });

  store.transition('thinking');
  store.setSdkSubState('thinking');
  updateTrayDot();
  broadcastChatState();

  voiceBar.close();

  currentAbortController = new AbortController();

  // 流式 assistant 消息的 ID（首次创建后持续追加）
  let assistantMessageId: string | null = null;

  // 构建 persona + 每日记忆上下文
  const personaContent = buildPersonaContext(shrewDir);
  const shrewContext = buildShrewContext(shrewDir, personaContent);

  // 构建 skill catalog
  const skillCatalog = buildSkillCatalog(
    path.join(shrewDir, 'skills'),
    settings.disabledSkills || []
  );

  const fullPrompt = shrewContext ? shrewContext + '\n\n' + prompt : prompt;

  const resumeSessionId = segment.sdk_session_id ?? undefined;

  const callbacks = {
    onSubState: (substate: SdkSubState, toolName?: string) => {
      log.debug('SDK 子状态:', substate, toolName || '');
      store.setSdkSubState(substate, toolName);
      updateTrayDot();
      broadcastChatState();

      if (substate === 'executing_tool' && store.appState === 'thinking') {
        store.transition('executing');
        updateTrayDot();
        broadcastChatState();
      }
    },
    onError: (error: string) => {
      log.error('Claude 执行错误:', error);
    },
    onMessage: (msg: ConversationMessage) => {
      conversationMessages.push(msg);

      if (msg.role === 'assistant' && msg.content) {
        if (!assistantMessageId) {
          assistantMessageId = insertChatMessage(db, {
            segmentId: segment.id,
            role: 'assistant',
            content: msg.content,
            executionId,
          });
        } else {
          appendChatMessageContent(db, assistantMessageId, msg.content);
        }
        sendToMainWindow('chat:stream-chunk', {
          messageId: assistantMessageId,
          content: msg.content,
          done: false,
        });
      }
    },
    onToolCall: (toolCall: ToolCallRecord) => {
      log.debug('工具调用:', toolCall.type, toolCall.target);
    },
  };

  try {
    let result = await executeClaude(
      fullPrompt,
      cwd,
      apiKey,
      providerKey,
      modelPreset,
      callbacks,
      currentAbortController.signal,
      claudeExecutablePath,
      resumeSessionId,
      skillCatalog,
    );

    // Resume 失败：旧 session 不存在，清除后重试
    if (result.status === 'failed' && result.error?.includes('No conversation found') && resumeSessionId) {
      log.info('旧 session 不存在，清除后重试');
      updateSegmentSessionId(db, segment.id, null);
      conversationMessages.length = 0;
      conversationMessages.push({ role: 'user', content: prompt });
      assistantMessageId = null;
      result = await executeClaude(
        fullPrompt,
        cwd,
        apiKey,
        providerKey,
        modelPreset,
        callbacks,
        currentAbortController.signal,
        claudeExecutablePath,
        undefined,
        skillCatalog,
      );
    }

    currentAbortController = null;
    log.info('执行完成:', { status: result.status, duration: result.durationMs, cost: result.costUsd });

    updateExecution(db, executionId, {
      status: result.status,
      summary: result.summary,
      duration_ms: result.durationMs,
      num_turns: result.numTurns,
      cost_usd: result.costUsd,
      completed_at: new Date().toISOString(),
      sdk_session_id: result.sdkSessionId,
      title: result.summary ? result.summary.split('\n')[0] : prompt.slice(0, 50),
    });

    if (conversationMessages.length > 0) {
      appendMessages(db, executionId, conversationMessages);
    }

    // 更新 segment 的 SDK session ID
    if (result.sdkSessionId) {
      updateSegmentSessionId(db, segment.id, result.sdkSessionId);
    }

    // 发送流式完成信号
    if (assistantMessageId) {
      sendToMainWindow('chat:stream-chunk', {
        messageId: assistantMessageId,
        content: '',
        done: true,
      });
    }

    sendToMainWindow('chat:execution-complete', { executionId });

    // 语音播报结果（仅语音输入触发）
    if (isVoice) {
      log.info('TTS 检查: status=', result.status, 'summary长度=', result.summary?.length ?? 0);
      if (result.status === 'completed' && result.summary) {
        log.info('TTS: 开始语音播报, summary:', result.summary.slice(0, 100));
        speakResult(result.summary);
      } else if (result.status === 'completed') {
        // summary 为空时，使用 assistant 消息作为 fallback
        const assistantText = conversationMessages
          .filter(m => m.role === 'assistant')
          .map(m => m.content)
          .join('\n')
          .trim();
        if (assistantText) {
          const fallback = assistantText.length > 500 ? assistantText.slice(-500) : assistantText;
          log.info('TTS: summary 为空，使用 assistant 消息 fallback, 长度:', fallback.length);
          speakResult(fallback);
        } else {
          log.info('TTS: 无可播报内容');
        }
      }
    }

    // 异步写入每日记忆（不阻塞主流程）
    if (result.status === 'completed') {
      const ak = loadApiKey();
      if (ak) {
        const assistantContent = conversationMessages
          .filter(m => m.role === 'assistant').map(m => m.content).join('\n');
        evaluateAndWriteDailyMemory(
          shrewDir, prompt, result.summary || assistantContent,
          ak, providerKey,
        ).catch(err => log.error('每日记忆写入异常:', err));
      }
    }

    // 语音输入：speakResult 负责在音频就绪时 transition to completed
    // 非语音输入：直接 transition
    if (!isVoice) {
      store.transition('completed');
    }
    store.setSdkSubState(result.status === 'completed' ? 'completed' :
                         result.status === 'cancelled' ? 'cancelled' : 'failed');
  } catch (err) {
    currentAbortController = null;
    log.error('executePrompt 异常:', err);
    updateExecution(db, executionId, {
      status: 'failed',
      completed_at: new Date().toISOString(),
    });
    if (conversationMessages.length > 0) {
      appendMessages(db, executionId, conversationMessages);
    }

    if (assistantMessageId) {
      sendToMainWindow('chat:stream-chunk', {
        messageId: assistantMessageId,
        content: '',
        done: true,
      });
    }

    sendToMainWindow('chat:execution-complete', { executionId });

    store.transition('error');
    store.setSdkSubState('failed');
  }

  updateTrayDot();
  broadcastChatState();
}

// 语音输入路径：transition to completed 并更新 tray dot
function finishVoiceExecution(): void {
  if (store.appState !== 'completed') {
    store.transition('completed');
  }
  updateTrayDot();
  broadcastChatState();
}

async function speakResult(summary: string): Promise<void> {
  const creds = loadVolcengineCredentials();
  if (!creds) {
    log.info('TTS: 火山引擎凭证未配置，跳过语音播报');
    finishVoiceExecution();
    return;
  }

  if (!summary || summary.trim().length === 0) {
    log.info('TTS: summary 为空，跳过语音播报');
    finishVoiceExecution();
    return;
  }

  if (store.speaking) {
    log.info('TTS: 正在播报中，跳过重复调用');
    return;
  }

  ttsAbortController = new AbortController();

  try {
    const trayBounds = tray.getBounds();
    const profile = readProfile(shrewDir);
    const controller = ttsAbortController;

    // Prepare subtitle popup while synthesizing
    const preparePromise = subtitlePopup.prepare(trayBounds);

    let ttsResult = await ttsService.synthesize({
      appId: creds.appId,
      accessToken: creds.accessToken,
      text: summary,
      signal: controller.signal,
    });

    // Retry once if synthesis failed completely
    if (!ttsResult && !controller.signal.aborted) {
      log.info('TTS: 首次合成失败，1秒后重试');
      await new Promise(r => setTimeout(r, 1000));
      if (controller.signal.aborted) {
        finishVoiceExecution();
        return;
      }
      ttsResult = await ttsService.synthesize({
        appId: creds.appId,
        accessToken: creds.accessToken,
        text: summary,
        signal: controller.signal,
      });
    }

    await preparePromise;

    if (!ttsResult) {
      log.info('TTS: 合成失败或被中断，跳过播放');
      finishVoiceExecution();
      return;
    }

    const sentences = ttsResult.sentences.length > 0 ? ttsResult.sentences : null;
    const words = ttsResult.words.length > 0 ? ttsResult.words : null;
    const audioBuffer = fs.readFileSync(ttsResult.audioPath);

    // Read avatar as base64 data URL
    const avatarPath = getAvatarPath(shrewDir);
    let personaAvatar: string | null = null;
    if (avatarPath && fs.existsSync(avatarPath)) {
      const data = fs.readFileSync(avatarPath);
      const ext = path.extname(avatarPath).slice(1);
      const mime = ext === 'jpg' ? 'jpeg' : ext;
      personaAvatar = `data:image/${mime};base64,${data.toString('base64')}`;
    }

    // Audio ready — transition to completed (green dot) and start speaking
    store.setSpeaking(true);
    finishVoiceExecution();

    subtitlePopup.show(trayBounds, {
      audio: audioBuffer,
      sentences,
      words,
      personaName: profile.name,
      personaAvatar,
    });

    // Wait for subtitle renderer to finish playing or user to stop
    await new Promise<void>((resolve) => {
      const onDone = () => {
        ipcMain.removeListener('tts-stop-requested', onStop);
        resolve();
      };
      const onStop = () => {
        ipcMain.removeListener('tts-playback-done', onDone);
        resolve();
      };
      ipcMain.once('tts-playback-done', onDone);
      ipcMain.once('tts-stop-requested', onStop);
    });
  } catch (err) {
    log.error('TTS: 语音播报异常:', err);
  } finally {
    store.setSpeaking(false);
    ttsAbortController = null;
    subtitlePopup.close();
    ttsService.stop();
    if (store.appState === 'completed') {
      store.transition('idle');
    } else if (store.appState === 'executing') {
      store.transition('completed');
    }
    updateTrayDot();
  }
}

// IPC Handlers
function registerIpcHandlers(): void {
  // voice-bar messages
  ipcMain.on('voice:send', (_, data: { text: string }) => {
    executePrompt(data.text, true);
  });

  ipcMain.on('voice:cancel', () => {
    if (store.appState === 'recording') {
      recorder.stopRecording().catch(() => {});
    }
    voiceBar.close();
    store.transition('idle');
    updateTrayDot();
  });

  ipcMain.on('voice:request-append', () => {
    recorder.startRecording().catch(err => {
      console.error('Append recording failed:', err);
      if (store.appState === 'recording') {
        voiceBar.send('voice:error', { message: `录音失败: ${err.message}` });
        store.transition('idle');
        updateTrayDot();
      }
    });
    store.transition('recording');
    updateTrayDot();
  });

  // chat window IPC
  ipcMain.on('chat:ready', () => {
    const segment = getActiveSegment(db);
    const messages = getChatMessages(db, segment.id);
    sendToMainWindow('chat:history', { messages, segmentId: segment.id });
    broadcastChatState();
  });

  ipcMain.on('chat:send-message', (_, data: { text: string }) => {
    executePrompt(data.text);
  });

  ipcMain.on('chat:clear', () => {
    const segment = getActiveSegment(db);
    // 写入系统消息
    insertChatMessage(db, {
      segmentId: segment.id,
      role: 'system',
      content: '对话已清空',
    });
    // 结束当前段并创建新段
    endSegment(db, segment.id);
    const newSegmentId = createSegment(db);
    log.info('chat:clear 旧段:', segment.id, '新段:', newSegmentId);
    // 发送空历史
    sendToMainWindow('chat:history', { messages: [], segmentId: newSegmentId });
    broadcastChatState();
  });

  // settings
  ipcMain.handle('settings:load', () => {
    const settings = loadSettings();
    return { ...settings, hasApiKey: hasApiKey() };
  });

  ipcMain.handle('settings:save-api-key', async (_, { key }: { key: string }) => {
    const settings = loadSettings();
    const provider = getProvider(settings.provider || 'glm-cn');
    const response = await fetch(provider.validateEndpoint, {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: provider.defaultModels[2].modelId,
        max_tokens: 1,
        messages: [{ role: 'user', content: 'hi' }],
      }),
    });
    if (!response.ok) throw new Error('Invalid API key');
    saveApiKey(key);
  });

  ipcMain.handle('settings:save', (_, data: Partial<AppSettings>) => {
    const settings = loadSettings();
    saveSettings({ ...settings, ...data });
  });

  ipcMain.handle('settings:pick-directory', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
    });
    return result.canceled ? null : result.filePaths[0];
  });

  // onboarding
  ipcMain.handle('onboarding:check-accessibility', () => {
    return systemPreferences.isTrustedAccessibilityClient(false);
  });

  ipcMain.on('onboarding:open-accessibility', () => {
    shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility');
  });

  ipcMain.handle('onboarding:validate-api-key', async (_, { key, providerKey }: { key: string; providerKey?: string }) => {
    const provider = getProvider(providerKey || 'glm-cn');
    const headers: Record<string, string> = {
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    };
    if (provider.authStyle === 'auth_token') {
      headers['x-api-key'] = key;
    } else {
      headers['x-api-key'] = key;
    }
    const response = await fetch(provider.validateEndpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: provider.defaultModels[2].modelId,
        max_tokens: 1,
        messages: [{ role: 'user', content: 'hi' }],
      }),
    });
    if (!response.ok) throw new Error('Invalid API key');
    saveApiKey(key);
    // Save provider selection
    const settings = loadSettings();
    saveSettings({ ...settings, provider: provider.key });
  });

  ipcMain.handle('onboarding:finish', (_, { defaultCwd }: { defaultCwd: string }) => {
    const settings = loadSettings();
    saveSettings({ ...settings, defaultCwd });
  });

  ipcMain.on('onboarding:complete', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.removeAllListeners('close');
      mainWindow.close();
    }
    createMainWindow();
  });

  // persona
  ipcMain.handle('persona:load', () => {
    const profile = readProfile(shrewDir);
    const content = readPersonaMarkdown(shrewDir);
    const avatarPath = getAvatarPath(shrewDir);
    let avatarDataUrl: string | null = null;
    if (avatarPath && fs.existsSync(avatarPath)) {
      const data = fs.readFileSync(avatarPath);
      const ext = path.extname(avatarPath).slice(1);
      const mime = ext === 'jpg' ? 'jpeg' : ext;
      avatarDataUrl = `data:image/${mime};base64,${data.toString('base64')}`;
    }
    return {
      name: profile.name,
      avatar: avatarDataUrl,
      content,
    };
  });

  ipcMain.handle('persona:save', (_, { name, content }: { name: string; content: string }) => {
    writeProfile(shrewDir, { name });
    writePersonaMarkdown(shrewDir, content);
    return { name, content };
  });

  ipcMain.handle('persona:avatar:select', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      title: '选择头像',
      filters: [{ name: '图片', extensions: ['jpg', 'jpeg', 'png', 'webp'] }],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    const filePath = result.filePaths[0];
    const ext = path.extname(filePath).slice(1).toLowerCase();
    const mime = ext === 'jpg' ? 'jpeg' : ext;
    const data = fs.readFileSync(filePath);
    return `data:image/${mime};base64,${data.toString('base64')}`;
  });

  ipcMain.handle('persona:avatar:save', (_, { dataUrl }: { dataUrl: string }) => {
    const matches = dataUrl.match(/^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/);
    if (!matches) return null;
    const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1];
    const buffer = Buffer.from(matches[2], 'base64');
    ensurePersonaDir(shrewDir);
    const filename = `avatar.${ext}`;
    fs.writeFileSync(path.join(getPersonaDir(shrewDir), filename), buffer);
    writeProfile(shrewDir, { avatar: filename });
    return dataUrl;
  });

  ipcMain.handle('persona:avatar:remove', () => {
    removeAvatarFile(shrewDir);
    writeProfile(shrewDir, { avatar: null });
  });

  // skills
  ipcMain.handle('skills:list', () => {
    const settings = loadSettings();
    return scanSkills(path.join(shrewDir, 'skills'), settings.disabledSkills || []);
  });

  ipcMain.handle('skills:import', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile', 'openDirectory'],
      title: '导入技能',
      filters: [{ name: '技能文件', extensions: ['md', 'zip'] }],
    });
    if (result.canceled || result.filePaths.length === 0) return null;

    const selected = result.filePaths[0];
    const stat = fs.statSync(selected);
    const skillsDir = path.join(shrewDir, 'skills');

    let imported: boolean;
    if (stat.isDirectory()) {
      imported = importSkill(selected, skillsDir);
    } else if (selected.endsWith('.md')) {
      imported = importSkillFromMd(selected, skillsDir);
    } else if (selected.endsWith('.zip')) {
      imported = importSkillFromZip(selected, skillsDir);
    } else {
      return { error: '不支持的文件类型' };
    }

    if (!imported) return { error: '导入失败：文件缺少有效的 SKILL.md，或已存在同名技能' };
    const settings = loadSettings();
    return scanSkills(skillsDir, settings.disabledSkills || []);
  });

  ipcMain.handle('skills:toggle', (_, { name, enabled }) => {
    const settings = loadSettings();
    let disabled = settings.disabledSkills || [];
    if (enabled) {
      disabled = disabled.filter((s: string) => s !== name);
    } else {
      if (!disabled.includes(name)) disabled.push(name);
    }
    saveSettings({ ...settings, disabledSkills: disabled });
    return scanSkills(path.join(shrewDir, 'skills'), disabled);
  });

  ipcMain.handle('skills:delete', (_, { name }) => {
    deleteSkill(name, path.join(shrewDir, 'skills'));
    const settings = loadSettings();
    const disabled = (settings.disabledSkills || []).filter((s: string) => s !== name);
    saveSettings({ ...settings, disabledSkills: disabled });
    return scanSkills(path.join(shrewDir, 'skills'), disabled);
  });

  ipcMain.handle('skills:read', (_, { name }) => {
    return readSkillContent(name, path.join(shrewDir, 'skills'));
  });

  // services
  ipcMain.handle('services:list', () => {
    return loadMcpServers(shrewDir);
  });

  ipcMain.handle('services:add', (_, config) => {
    return addMcpServer(shrewDir, config);
  });

  ipcMain.handle('services:update', (_, { id, ...updates }) => {
    return updateMcpServer(shrewDir, id, updates);
  });

  ipcMain.handle('services:remove', (_, { id }) => {
    return removeMcpServer(shrewDir, id);
  });

  ipcMain.handle('services:test', async (_, { id }) => {
    const servers = loadMcpServers(shrewDir);
    const server = servers.find(s => s.id === id);
    if (!server) throw new Error('服务未找到');
    // 基本可用性检查：命令是否能找到
    try {
      const { spawn } = require('child_process');
      const proc = spawn(server.command, server.args || [], {
        env: { ...process.env, ...server.env },
        timeout: 5000,
      });
      return new Promise((resolve) => {
        proc.on('error', (err: Error) => {
          resolve({ success: false, error: err.message });
        });
        setTimeout(() => {
          proc.kill();
          resolve({ success: true });
        }, 2000);
      });
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  });

  // memory (file-based)
  ipcMain.handle('memory:list-core', () => {
    const memoriesDir = path.join(shrewDir, 'memories');
    if (!fs.existsSync(memoriesDir)) return [];
    const files = fs.readdirSync(memoriesDir).filter(f => f.endsWith('.md') && f !== 'MEMORY.md');
    return files.map(f => {
      const content = fs.readFileSync(path.join(memoriesDir, f), 'utf-8');
      return { filename: f, content };
    });
  });

  ipcMain.handle('memory:update-core', (_, { filename, content }: { filename: string; content: string }) => {
    if (filename.includes('/') || filename.includes('\\') || filename.includes('..')) return false;
    const memoriesDir = path.join(shrewDir, 'memories');
    const filePath = path.join(memoriesDir, filename);
    if (!filePath.startsWith(memoriesDir) || !fs.existsSync(filePath)) return false;
    fs.writeFileSync(filePath, content);
    return true;
  });

  ipcMain.handle('memory:delete-core', (_, { filename }: { filename: string }) => {
    if (filename.includes('/') || filename.includes('\\') || filename.includes('..')) return false;
    const memoriesDir = path.join(shrewDir, 'memories');
    const filePath = path.join(memoriesDir, filename);
    if (!filePath.startsWith(memoriesDir) || !fs.existsSync(filePath)) return false;
    fs.unlinkSync(filePath);
    return true;
  });

  ipcMain.handle('memory:list-daily', () => {
    return listDailyMemoryDates(shrewDir);
  });

  ipcMain.handle('memory:read-daily', (_, { date }: { date: string }) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
    return readDailyMemory(shrewDir, date);
  });

  // navigation
  ipcMain.on('navigate:route', (_, { path: routePath }: { path: string }) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.loadURL(`http://127.0.0.1:${serverPort}${routePath}`);
    }
  });

  // volcengine credentials
  ipcMain.handle('settings:load-volcengine-credentials', () => {
    const creds = loadVolcengineCredentials();
    return { hasCredentials: !!creds, appId: creds?.appId || '' };
  });

  ipcMain.handle('settings:save-volcengine-credentials', async (_, { appId, accessToken }: { appId: string; accessToken: string }) => {
    const { DoubaoASR } = await import('../src/lib/doubao-asr');
    const asr = new DoubaoASR(appId, accessToken);
    try {
      await asr.validateCredentials();
      saveVolcengineCredentials(appId, accessToken);
      const creds = loadVolcengineCredentials();
      recorder = new AudioRecorder(creds);
      recorder.setWindow(voiceBar.getWindow()!);
    } catch (err) {
      console.error('[volcengine] 凭证验证失败:', err);
      throw err;
    }
  });

  // NOTE: globalThis IPC 不可用于 standalone 服务器（独立子进程）。
  // 所有通信通过 Electron ipcMain/ipcRenderer 进行。

  // Wake word IPC handlers
  ipcMain.handle('wake-word:toggle', async (_event, { enabled }: { enabled: boolean }) => {
    const settings = loadSettings();
    settings.wakeWordEnabled = enabled;
    saveSettings(settings);

    if (enabled) {
      try {
        await startWakeWord();
        return { success: true };
      } catch (err: any) {
        log.error('启动唤醒词失败:', err);
        return { success: false, error: err.message };
      }
    } else {
      destroyWakeWord();
      return { success: true };
    }
  });

  ipcMain.handle('wake-word:status', () => {
    return {
      enabled: isWakeWordEnabled(),
      active: wakeWordActive,
      keyword: getKeyword(),
    };
  });

  ipcMain.handle('wake-word:update-keyword', (_event, { keyword }: { keyword: string }) => {
    if (wakeWordEngine) {
      wakeWordEngine.updateKeyword(keyword);
    }
  });
}

// 启动应用
app.whenReady().then(async () => {
  initLogger(path.join(shrewDir, 'logs'));
  fs.mkdirSync(shrewDir, { recursive: true });
  fs.mkdirSync(path.join(shrewDir, 'skills'), { recursive: true });
  fs.mkdirSync(path.join(shrewDir, 'mcp'), { recursive: true });
  log.info('=== Shrew 应用启动 ===');
  log.info('日志文件:', log.logPath);
  log.info('版本:', app.getVersion(), '模式:', isDev ? '开发' : '生产');
  log.info('shrewDir:', shrewDir);

  // 迁移旧数据到 ~/.shrew/
  const oldDir = app.getPath('userData');
  const markerFile = path.join(shrewDir, '.migrated');
  if (fs.existsSync(oldDir) && !fs.existsSync(markerFile)) {
    log.info('检测到旧数据目录，开始迁移:', oldDir, '→', shrewDir);
    try {
      // 迁移数据库
      const oldDb = path.join(oldDir, 'shrew.db');
      if (fs.existsSync(oldDb)) {
        fs.copyFileSync(oldDb, dbPath);
        for (const ext of ['-wal', '-shm']) {
          const src = oldDb + ext;
          if (fs.existsSync(src)) fs.copyFileSync(src, dbPath + ext);
        }
        log.info('迁移: 数据库');
      }

      // 迁移 settings（并添加 disabledSkills 字段）
      const oldSettings = path.join(oldDir, 'settings.json');
      if (fs.existsSync(oldSettings)) {
        const raw = JSON.parse(fs.readFileSync(oldSettings, 'utf-8'));
        if (!raw.disabledSkills) raw.disabledSkills = [];
        fs.writeFileSync(settingsPath, JSON.stringify(raw, null, 2));
        log.info('迁移: 设置');
      }

      // 迁移 MCP 配置
      const oldMcp = path.join(oldDir, 'config', 'mcp-servers.json');
      if (fs.existsSync(oldMcp)) {
        fs.mkdirSync(path.join(shrewDir, 'mcp'), { recursive: true });
        fs.copyFileSync(oldMcp, path.join(shrewDir, 'mcp', 'servers.json'));
        log.info('迁移: MCP 配置');
      }

      // 迁移加密凭据
      const oldSecure = path.join(oldDir, 'secure');
      if (fs.existsSync(oldSecure)) {
        fs.cpSync(oldSecure, path.join(shrewDir, 'secure'), { recursive: true });
        log.info('迁移: 凭据');
      }

      // 迁移日志
      const oldLogs = path.join(oldDir, 'logs');
      if (fs.existsSync(oldLogs)) {
        fs.cpSync(oldLogs, path.join(shrewDir, 'logs'), { recursive: true });
        log.info('迁移: 日志');
      }

      // 不迁移 config/skills.json（旧的 voice-input/auto-memory 不再需要）
      // 不迁移 config/claude.md（persona+memory 改为通过 SDK 注入）

      fs.writeFileSync(markerFile, new Date().toISOString());
      log.info('迁移完成');
    } catch (err) {
      log.error('迁移失败:', err);
    }
  }

  // 生产模式：启动 Next.js standalone 服务器
  if (!isDev) {
    try {
      const port = await startNextServer();
      await waitForServer(port);
      log.info(`Next.js 服务器就绪, port=${port}`);
    } catch (err) {
      log.error('Next.js 服务器启动失败:', err);
      dialog.showErrorBox('启动失败', `无法启动内置服务器: ${err}`);
      app.quit();
      return;
    }
  }

  // 初始化数据库
  db = new Database(dbPath);

  // 迁移 persona 旧字段到 persona.md（必须在 initDb 删列之前）
  migratePersona(shrewDir, db);

  initDb(db);

  migrateMemoryItems(db, shrewDir);

  startPersonaWatcher();

  // 迁移旧的 API key 文件
  migrateKeyFile();

  // 初始化状态管理
  store = new ShrewStore();
  store.onChange(() => {
    updateTrayDot();
    broadcastChatState();

    // Resume wake word spotting when returning to idle
    if (store.appState === 'idle' && isWakeWordEnabled() && !endpointMode) {
      if (!wakeWordActive) {
        startWakeWord().catch(err => log.error('恢复唤醒词监听失败:', err));
      } else if (wakeWordEngine) {
        resumeWakeWord();
      }
    }
  });

  // 创建菜单栏 Tray
  tray = new ShrewTray();
  tray.onPopupRequested = () => {
    store.clearCompletedState();
    updateTrayDot();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
      mainWindow.focus();
    } else {
      createMainWindow();
    }
  };
  tray.onSettingsRequested = () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
      mainWindow.loadURL(`http://127.0.0.1:${serverPort}/settings`);
    } else {
      createMainWindow();
    }
  };

  // 创建窗口管理器
  voiceBar = new VoiceBarWindow(serverPort);
  ttsService = new TtsService();
  subtitlePopup = new SubtitlePopup(serverPort);

  // 初始化快捷键
  shortcutManager = new ShortcutManager();
  const shortcutReady = await shortcutManager.init();
  if (shortcutReady) {
    shortcutManager.start(() => handleRightCommand());
  }

  // 初始化录音器并预创建 voice-bar 窗口
  const volcengineCreds = loadVolcengineCredentials();
  log.info('语音识别凭证:', volcengineCreds ? '已配置' : '未配置');
  recorder = new AudioRecorder(volcengineCreds);
  voiceBar.preCreate();
  recorder.setWindow(voiceBar.getWindow()!);
  log.info('快捷键:', shortcutReady ? '已就绪' : '未授权');

  // Initialize wake word if enabled
  if (isWakeWordEnabled()) {
    try {
      await startWakeWord();
      log.info('唤醒词功能已启动');
    } catch (err) {
      log.error('启动唤醒词功能失败:', err);
    }
  }

  // voice-bar 失焦自动关闭
  voiceBar.onBlur = () => {
    if (endpointMode) {
      endpointMode = false;
      if (voiceEndpoint) {
        voiceEndpoint.destroy();
        voiceEndpoint = null;
      }
    }
    if (store.appState === 'recording') {
      recorder.stopRecording().catch(() => {});
    }
    if (store.appState !== 'transcribing' && store.appState !== 'thinking' && store.appState !== 'executing') {
      voiceBar.close();
      store.transition('idle');
      updateTrayDot();
    }
  };

  // 注册 IPC
  registerIpcHandlers();

  // 检查是否需要引导
  const needsOnboarding = !hasApiKey();
  log.info('启动完成, 需要引导:', needsOnboarding);
  if (needsOnboarding) {
    createOnboardingWindow();
  } else {
    createMainWindow();
  }

  app.on('activate', () => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      createMainWindow();
    } else {
      mainWindow.show();
      mainWindow.focus();
    }
  });
});

function createMainWindow(): void {
  mainWindow = new BrowserWindow({
    width: 920,
    height: 640,
    minWidth: 880,
    minHeight: 620,
    show: false,
    titleBarStyle: 'hidden',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#111110' : '#faf9f5',
    trafficLightPosition: { x: 16, y: 18 },
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });
  mainWindow.loadURL(`http://127.0.0.1:${serverPort}/chat`);
  mainWindow.once('ready-to-show', () => mainWindow?.show());

  mainWindow.on('close', (event) => {
    if (isQuitting) return;
    event.preventDefault();
    mainWindow!.hide();
  });
}

nativeTheme.on('updated', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setBackgroundColor(
      nativeTheme.shouldUseDarkColors ? '#111110' : '#faf9f5'
    );
  }
});

function createOnboardingWindow(): void {
  mainWindow = new BrowserWindow({
    width: 600,
    height: 500,
    show: false,
    resizable: false,
    titleBarStyle: 'hidden',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#111110' : '#faf9f5',
    trafficLightPosition: { x: 16, y: 18 },
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });
  mainWindow.loadURL(`http://127.0.0.1:${serverPort}/onboarding`);
  mainWindow.once('ready-to-show', () => mainWindow?.show());
}

app.on('window-all-closed', () => {
  // macOS 不退出，保持菜单栏常驻
});

app.on('before-quit', () => {
  isQuitting = true;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.removeAllListeners('close');
    mainWindow.close();
  }
  personaWatcher?.close();
  destroyWakeWord();
  shortcutManager?.stop();
  ttsService?.stop();
  subtitlePopup?.destroy();
  voiceBar?.destroy();
  db?.close();
  if (nextServer) {
    nextServer.kill();
    nextServer = null;
  }
});
