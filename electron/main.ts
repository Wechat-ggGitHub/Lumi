import { app, BrowserWindow, ipcMain, systemPreferences, dialog, shell, nativeTheme } from 'electron';
import path from 'path';
import fs from 'fs';
import { spawn, ChildProcess } from 'child_process';
import { LumiTray } from './tray';
import { VoiceBarWindow } from './voice-bar';
import { ShortcutManager } from './shortcuts';
import { AudioRecorder } from './recorder';
import { LumiStore } from '../src/lib/store';
import { createAsrProvider, createTtsProvider, loadVoiceCredentials } from './voice-providers'
import type { TtsProvider, TtsResult } from './voice-providers'
import { SubtitlePopup } from './subtitle-popup';
import { WakeWordEngine } from './wake-word';
import { AudioListener } from './audio-listener';
import { VoiceEndpoint } from './voice-endpoint';
import { initDb, insertExecution, updateExecution, getRecentExecutions, getExecutionById, appendMessages, getActiveExecution, getActiveSegment, endSegment, createSegment, updateSegmentSessionId, insertChatMessage, appendChatMessageContent, getChatMessages, getLatestAssistantMessage } from '../src/lib/db';
import { readProfile, writeProfile, readPersonaMarkdown, writePersonaMarkdown, saveAvatarFile, removeAvatarFile, getAvatarPath, buildPersonaContext, getPersonaDir, ensurePersonaDir } from '../src/lib/persona-file';
import { saveApiKey, loadApiKey, hasApiKey, saveVolcengineCredentials, loadVolcengineCredentials, hasVolcengineCredentials, saveAliyunVoiceCredentials, loadAliyunVoiceCredentials, hasAliyunVoiceCredentials } from '../src/lib/keychain';
import { getProvider, getDefaultProvider, resolveModel, getValidateEndpoint, getAllProviders, buildAuthHeaders } from '../src/lib/provider-config';
import { executeClaude } from '../src/lib/claude-client';
import { loadMcpServers, addMcpServer, updateMcpServer, removeMcpServer } from '../src/lib/config-files';
import { scanSkills, importSkill, importSkillFromMd, importSkillFromZip, deleteSkill, buildSkillCatalog, readSkillContent } from '../src/lib/skill-manager';
import { buildLumiContext } from '../src/lib/lumi-context';
import { listDailyMemoryDates, readDailyMemory } from '../src/lib/daily-memory-reader';
import { evaluateAndWriteDailyMemory } from '../src/lib/daily-memory-writer';
import { evaluateAndWriteCoreMemory } from '../src/lib/core-memory-evaluator';
import { log, initLogger } from '../src/lib/logger';
import type { ExecutionRecord, AppSettings, DotColor, ConversationMessage, ChatMessage, SdkSubState, ToolCallRecord } from '../src/types';

// 全局状态
import Database from 'better-sqlite3';

const isDev = !app.isPackaged;
const lumiDir = path.join(app.getPath('home'), '.lumi');
const settingsPath = path.join(lumiDir, 'settings.json');
const dbPath = path.join(lumiDir, 'lumi.db');

let db: Database.Database;
let store: LumiStore;
let tray: LumiTray;
let voiceBar: VoiceBarWindow;
let shortcutManager: ShortcutManager;
let recorder: AudioRecorder;
let mainWindow: BrowserWindow | null = null;
let serverPort = 3000;
let nextServer: ChildProcess | null = null;
let currentAbortController: AbortController | null = null;
let ttsService: TtsProvider;
let subtitlePopup: SubtitlePopup;
let ttsAbortController: AbortController | null = null;
let personaWatcher: fs.FSWatcher | null = null;
let isQuitting = false;
let wakeWordEngine: WakeWordEngine | null = null;
let audioListener: AudioListener | null = null;
let voiceEndpoint: VoiceEndpoint | null = null;
let wakeWordActive = false;
let continuousChatTimer: ReturnType<typeof setTimeout> | null = null;
let fadeOutTimer: ReturnType<typeof setTimeout> | null = null;
let recordingTimeoutTimer: ReturnType<typeof setTimeout> | null = null;
let voiceBarHideTimer: ReturnType<typeof setTimeout> | null = null;

function clearRecordingTimeoutTimer(): void {
  if (recordingTimeoutTimer) {
    clearTimeout(recordingTimeoutTimer);
    recordingTimeoutTimer = null;
  }
}

function clearVoiceBarHideTimer(): void {
  if (voiceBarHideTimer) {
    clearTimeout(voiceBarHideTimer);
    voiceBarHideTimer = null;
  }
}

function initVoiceProviders(): void {
  const settings = loadSettings();

  // ASR
  const asrKey = settings.asrProvider || 'volcengine';
  const asrCreds = loadVoiceCredentials(asrKey);
  if (asrCreds) {
    const asrProvider = createAsrProvider(asrKey, asrCreds);
    recorder = new AudioRecorder(asrProvider);
    log.info('ASR 初始化:', asrKey, '已配置');
  } else {
    recorder = new AudioRecorder(null);
    log.info('ASR 初始化: 无凭据');
  }

  // TTS
  const ttsKey = settings.ttsProvider || 'volcengine';
  const ttsCreds = loadVoiceCredentials(ttsKey);
  if (ttsCreds) {
    ttsService = createTtsProvider(ttsKey, ttsCreds);
    log.info('TTS 初始化:', ttsKey, '已配置');
  } else {
    // Create a no-op placeholder
    const { NoopTtsProvider } = require('./voice-providers/types');
    ttsService = new NoopTtsProvider();
    log.info('TTS 初始化: 无凭据');
  }
}

function startPersonaWatcher(): void {
  const personaDir = getPersonaDir(lumiDir);
  ensurePersonaDir(lumiDir);

  personaWatcher = fs.watch(personaDir, (eventType, filename) => {
    if (!filename) return;
    if (filename !== 'profile.json' && filename !== 'persona.md') return;

    log.info(`Persona 文件变更: ${filename} (${eventType})`);

    try {
      const profile = readProfile(lumiDir);
      if (!profile.name) {
        log.warn('Persona watcher: profile.json 缺少 name 字段，跳过广播');
        return;
      }

      // 同步更新唤醒词关键词
      if (wakeWordEngine && wakeWordActive) {
        wakeWordEngine.updateKeyword(profile.name);
        log.info('唤醒词关键词已更新:', profile.name);
      }

      BrowserWindow.getAllWindows().forEach(win => {
        if (!win.isDestroyed()) {
          win.webContents.send('persona:updated');
        }
      });
    } catch (err) {
      log.error('Persona watcher: 解析 profile.json 失败:', err);
      return;
    }
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
        log.info(`分配端口: ${port}, 启动服务器进程...`);

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

        let resolved = false;

        nextServer.stdout?.on('data', (data: Buffer) => {
          const msg = data.toString();
          log.info('[next-server]', msg.trim());
          if (!resolved && (msg.includes('Ready') || msg.includes('started'))) {
            resolved = true;
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
        setTimeout(() => {
          if (!resolved) {
            log.warn('服务器未在 5 秒内报告 Ready，继续等待健康检查确认');
            resolved = true;
            resolve(port);
          }
        }, 5000);
      });
    });
  });
}

// 等待服务器响应
function waitForServer(port: number, maxRetries = 50): Promise<void> {
  return new Promise((resolve, reject) => {
    const http = require('http');
    let attempts = 0;
    let resolved = false;
    const check = () => {
      if (resolved) return;
      attempts++;
      const req = http.get(`http://127.0.0.1:${port}/api/health`, (res: any) => {
        if (resolved) return;
        req.destroy(); // 立即销毁请求，避免超时回调触发
        if (res.statusCode === 200) {
          resolved = true;
          log.info(`健康检查成功 (${attempts}/${maxRetries})`);
          resolve();
        } else {
          log.warn(`健康检查返回状态码: ${res.statusCode}`);
          if (attempts >= maxRetries) {
            resolved = true;
            reject(new Error(`Server health check failed with status ${res.statusCode}`));
          } else {
            setTimeout(check, 300);
          }
        }
      });
      req.on('error', (err: Error) => {
        if (resolved) return;
        log.debug(`健康检查失败 (${attempts}/${maxRetries}): ${err.message}`);
        if (attempts >= maxRetries) {
          resolved = true;
          reject(new Error('Server health check timed out'));
        } else {
          setTimeout(check, 300);
        }
      });
      req.setTimeout(3000, () => {
        if (resolved) return;
        req.destroy();
        if (attempts >= maxRetries) {
          resolved = true;
          reject(new Error('Server health check timed out'));
        } else {
          setTimeout(check, 300);
        }
      });
    };
    log.info('开始健康检查...');
    check();
  });
}

function loadSettings(): AppSettings {
  try {
    if (fs.existsSync(settingsPath)) {
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      if (settings.shortcut === 'right_cmd') settings.shortcut = 'right_option';
      return settings;
    }
  } catch {}
  return {
    shortcut: 'right_option',
    claudePermissionMode: 'bypassPermissions',
    defaultCwd: '~/Documents',
    vadTimeout: 2,
    theme: 'system',
    provider: 'anthropic',
    model: 'claude-sonnet-4-6',
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
  const profile = readProfile(lumiDir);
  return profile.name || 'Lumi';
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
    await ensureAudioListener();
    if (audioListener) audioListener.setMode('wake-word');
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
  clearRecordingTimeoutTimer();
  clearVoiceBarHideTimer();
}

function handleAudioChunk(samples: Float32Array): void {
  if (!audioListener) return;

  switch (audioListener.mode) {
    case 'recording':
    case 'continuous-chat':
      voiceEndpoint?.feed(samples);
      break;
    case 'wake-word':
      if (wakeWordActive && wakeWordEngine) {
        const detected = wakeWordEngine.feed(samples);
        if (detected) {
          onWakeWordDetected();
        }
      }
      break;
  }
}

function startRecordingSession(trigger: 'wake-word' | 'shortcut' | 'continuous-chat'): void {
  log.info(`开始录音 (trigger: ${trigger})`);
  clearVoiceBarHideTimer();
  if (audioListener) audioListener.setMode('recording');

  const settings = loadSettings();
  const timeout = settings.wakeWordSilenceTimeout ?? 1.5;

  if (voiceEndpoint) voiceEndpoint.destroy();
  voiceEndpoint = new VoiceEndpoint({
    silenceTimeout: timeout,
    minDuration: 0.5,
    maxDuration: 30,
  });

  try {
    voiceEndpoint.init();
  } catch (err) {
    log.error('VoiceEndpoint 初始化失败:', err);
    if (audioListener) audioListener.setMode('wake-word');
    voiceEndpoint.destroy();
    voiceEndpoint = null;
    resumeWakeWord();
    return;
  }

  voiceEndpoint.setCallbacks(
    (wavPath) => onRecordingComplete(wavPath),
    () => onRecordingTooShort(),
    (volume) => voiceBar.send('voice:volume', { volume }),
  );
  voiceEndpoint.start();

  voiceBar.show();
  voiceBar.send('voice:state', { state: 'recording', message: '在听…' });
  store.transition('recording');
  updateTrayDot();

  // 8s 绝对超时兜底：避免 VAD 卡死永不收尾
  clearRecordingTimeoutTimer();
  recordingTimeoutTimer = setTimeout(() => {
    log.warn('录音绝对超时（8s），强制 finish');
    recordingTimeoutTimer = null;
    if (voiceEndpoint) voiceEndpoint.finish();
  }, 8000);
}

async function ensureAudioListener(): Promise<void> {
  if (!audioListener) {
    audioListener = new AudioListener();
    audioListener.create();
    audioListener.registerChunkHandler(handleAudioChunk);
    await audioListener.start();
  } else if (!audioListener.isActive()) {
    audioListener.create();
    await audioListener.start();
  }
}

function resumeWakeWord(): void {
  if (!wakeWordEngine || !isWakeWordEnabled()) return;
  wakeWordEngine.reset();
  wakeWordEngine.start();
  wakeWordActive = true;
  if (audioListener) audioListener.setMode('wake-word');
  log.info('唤醒词监听已恢复');
}

function onWakeWordDetected(): void {
  if (store.appState !== 'idle') {
    log.info('唤醒词检测到但状态非 idle，忽略:', store.appState);
    return;
  }
  log.info('唤醒词检测到！');
  startRecordingSession('wake-word');
}

function onRecordingComplete(wavPath: string): void {
  clearRecordingTimeoutTimer();
  if (voiceEndpoint) { voiceEndpoint.destroy(); voiceEndpoint = null; }
  log.info('录音完成, 开始转写');

  // 切换 voice bar 视觉到 transcribing；不再 hide
  voiceBar.send('voice:state', { state: 'transcribing', message: '识别中…' });
  store.transition('transcribing');
  updateTrayDot();

  recorder.transcribeFile(wavPath).then(text => {
    log.info('转写结果:', text || '(空)');
    if (text) {
      // 成功路径：交给 executePrompt（其内部会在 thinking 时关闭 voice bar）
      executePrompt(text, true);
    } else {
      // ASR 成功但识别为空：显示 too-short 1.2s
      voiceBar.send('voice:state', { state: 'too-short', message: '没听清' });
      clearVoiceBarHideTimer();
      voiceBarHideTimer = setTimeout(() => {
        voiceBarHideTimer = null;
        voiceBar.hide();
      }, 1200);
      store.transition('idle');
      updateTrayDot();
      resumeWakeWord();
    }
  }).catch(err => {
    log.error('转写失败:', err);
    try { fs.unlinkSync(wavPath); } catch {}
    // ASR 失败：显示 error 2s
    voiceBar.send('voice:state', { state: 'error', message: '识别失败' });
    clearVoiceBarHideTimer();
    voiceBarHideTimer = setTimeout(() => {
      voiceBarHideTimer = null;
      voiceBar.hide();
    }, 2000);
    store.transition('idle');
    updateTrayDot();
    resumeWakeWord();
  });
}

function onRecordingTooShort(): void {
  clearRecordingTimeoutTimer();
  if (voiceEndpoint) { voiceEndpoint.destroy(); voiceEndpoint = null; }
  log.info('录音太短，忽略');

  voiceBar.send('voice:state', { state: 'too-short', message: '没听清' });
  clearVoiceBarHideTimer();
  voiceBarHideTimer = setTimeout(() => {
    voiceBarHideTimer = null;
    voiceBar.hide();
    if (store.continuousChatWindow) {
      // 连续对话期间静默期保持 audioListener 在 continuous-chat 模式
      if (audioListener) audioListener.setMode('continuous-chat');
    } else {
      store.transition('idle');
      updateTrayDot();
      resumeWakeWord();
    }
  }, 1200);
}

// 右 Option 按键处理
function handleRightOption(): void {
  // 如果正在录音中，手动结束
  if (voiceEndpoint && audioListener?.mode === 'recording') {
    voiceEndpoint.finish();
    return;
  }

  const action = store.getRightOptionAction();

  switch (action) {
    case 'start-recording':
      if (!audioListener || !audioListener.isActive()) {
        ensureAudioListener().then(() => {
          startRecordingSession('shortcut');
        }).catch(err => {
          log.error('启动 AudioListener 失败:', err);
        });
      } else {
        startRecordingSession('shortcut');
      }
      break;

    case 'stop-recording':
      if (voiceEndpoint) {
        voiceEndpoint.finish();
      }
      break;

    case 'cancel-execution':
      if (currentAbortController) {
        currentAbortController.abort();
        currentAbortController = null;
      }
      break;

    case 'stop-speaking':
      log.info('中断语音朗读');
      cancelContinuousChat();
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

function startContinuousChat(): void {
  log.info('进入连续对话模式');
  if (continuousChatTimer) {
    clearTimeout(continuousChatTimer);
    continuousChatTimer = null;
  }

  store.setContinuousChatWindow(true);

  if (audioListener && audioListener.isActive()) {
    audioListener.setMode('continuous-chat');
  }

  const settings = loadSettings();
  const timeout = settings.wakeWordSilenceTimeout ?? 1.5;

  if (voiceEndpoint) voiceEndpoint.destroy();
  voiceEndpoint = new VoiceEndpoint({
    silenceTimeout: timeout,
    minDuration: 0.5,
    maxDuration: 30,
  });

  try {
    voiceEndpoint.init();
  } catch (err) {
    log.error('连续对话 VAD 初始化失败:', err);
    voiceEndpoint.destroy();
    voiceEndpoint = null;
    return;
  }

  voiceEndpoint.setCallbacks(
    (wavPath) => {
      subtitlePopup.fadeOut();
      fadeOutTimer = setTimeout(() => {
        fadeOutTimer = null;
        onRecordingComplete(wavPath);
      }, 350);
    },
    () => {
      log.info('连续对话: 语音太短，保持监听');
    },
    (volume) => {
      // 连续对话期间 voice bar 默认 hidden；用户开口达到阈值才显示 recording
      if (volume > 0.2 && !voiceBar.isVisible()) {
        voiceBar.show();
        voiceBar.send('voice:state', { state: 'recording', message: '在听…' });
        // 用户开口后重置连续对话窗口计时器
        if (continuousChatTimer) {
          clearTimeout(continuousChatTimer);
          continuousChatTimer = setTimeout(() => {
            if (store.continuousChatWindow && !voiceBar.isVisible()) {
              log.info('连续对话窗口过期');
              cancelContinuousChat();
              store.transition('idle');
              updateTrayDot();
            }
            continuousChatTimer = null;
          }, 5000);
        }
      }
      voiceBar.send('voice:volume', { volume });
    },
  );
  voiceEndpoint.start();

  // 不再调用 voiceBar.showHint()——5 秒静默期保持 hidden
}

function cancelContinuousChat(): void {
  if (continuousChatTimer) {
    clearTimeout(continuousChatTimer);
    continuousChatTimer = null;
  }
  if (fadeOutTimer) {
    clearTimeout(fadeOutTimer);
    fadeOutTimer = null;
  }
  store.setContinuousChatWindow(false);
  if (voiceEndpoint) { voiceEndpoint.destroy(); voiceEndpoint = null; }
  voiceBar.hide();
  resumeWakeWord();
}

// 执行 Claude 命令
async function executePrompt(prompt: string, isVoice = false): Promise<void> {
  log.info('executePrompt 开始, prompt:', prompt.slice(0, 100));
  const settings = loadSettings();
  const apiKey = loadApiKey(settings.provider || 'glm-cn');

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
  if (!fs.existsSync(cwd)) {
    fs.mkdirSync(cwd, { recursive: true });
    log.info(`已创建工作目录: ${cwd}`);
  }
  const providerKey = settings.provider || 'anthropic';
  const model = settings.model || 'claude-sonnet-4-6';

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

  log.info('执行参数:', { cwd, provider: providerKey, model, claudeExecutablePath });

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
  const personaContent = buildPersonaContext(lumiDir);
  const lumiContext = buildLumiContext(lumiDir, personaContent);

  // 构建 skill catalog
  const skillCatalog = buildSkillCatalog(
    path.join(lumiDir, 'skills'),
    settings.disabledSkills || []
  );

  const voiceHint = isVoice
    ? '\n\n## 输入方式\n用户通过语音输入，经语音识别转写为文字。回复时应考虑口语化表达的特点：指令可能简短、省略上下文、包含语气词或口语习惯。请直接理解用户意图并执行，无需指出或纠正口语化表达。回复尽量简洁，适合语音播报。\n'
    : '';

  const fullPrompt = lumiContext ? lumiContext + voiceHint + '\n' + prompt : voiceHint + prompt;

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
      model,
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
        model,
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
      const ak = loadApiKey(providerKey);
      if (ak) {
        const assistantContent = conversationMessages
          .filter(m => m.role === 'assistant').map(m => m.content).join('\n');
        evaluateAndWriteDailyMemory(
          lumiDir, prompt, result.summary || assistantContent,
          ak, providerKey,
        ).catch(err => log.error('每日记忆写入异常:', err));
        evaluateAndWriteCoreMemory(
          lumiDir, prompt, assistantContent,
          ak, providerKey,
        ).catch(err => log.error('核心记忆评估异常:', err));
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
    const profile = readProfile(lumiDir);
    const controller = ttsAbortController;

    // Prepare subtitle popup while synthesizing
    const preparePromise = subtitlePopup.prepare(trayBounds);

    let ttsResult = await ttsService.synthesize(summary, controller.signal);

    // Retry once if synthesis failed completely
    if (!ttsResult && !controller.signal.aborted) {
      log.info('TTS: 首次合成失败，1秒后重试');
      await new Promise(r => setTimeout(r, 1000));
      if (controller.signal.aborted) {
        finishVoiceExecution();
        return;
      }
      ttsResult = await ttsService.synthesize(summary, controller.signal);
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
    const avatarPath = getAvatarPath(lumiDir);
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
      if (isWakeWordEnabled()) {
        startContinuousChat();
        continuousChatTimer = setTimeout(() => {
          if (store.continuousChatWindow && !voiceBar.isVisible()) {
            log.info('连续对话窗口过期');
            cancelContinuousChat();
            store.transition('idle');
            updateTrayDot();
          }
          continuousChatTimer = null;
        }, 3000);
      } else {
        store.transition('idle');
      }
    } else if (store.appState === 'executing') {
      store.transition('completed');
    }
    updateTrayDot();
  }
}

// IPC Handlers
function registerIpcHandlers(): void {
  // voice-bar messages
  ipcMain.on('voice:cancel', () => {
    cancelContinuousChat();
    clearRecordingTimeoutTimer();
    clearVoiceBarHideTimer();
    if (voiceEndpoint) { voiceEndpoint.destroy(); voiceEndpoint = null; }
    voiceBar.close();
    store.transition('idle');
    updateTrayDot();
    resumeWakeWord();
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
    return {
      ...settings,
      hasApiKey: hasApiKey(settings.provider || 'glm-cn'),
      apiKeyStatus: Object.fromEntries(
        getAllProviders().map(p => [p.key, hasApiKey(p.key)])
      ),
    };
  });

  ipcMain.handle('settings:save-api-key', async (_, { key, providerKey }: { key: string; providerKey: string }) => {
    const provider = getProvider(providerKey);
    const headers = buildAuthHeaders(provider, key);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    let response: Response;
    try {
      response = await fetch(getValidateEndpoint(provider), {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: provider.defaultModel,
          max_tokens: 1,
          messages: [{ role: 'user', content: 'hi' }],
        }),
        signal: controller.signal,
      });
    } catch (e: any) {
      if (e.name === 'AbortError') {
        log.error('API Key 验证超时 (15s)');
        throw new Error('验证请求超时，请检查网络连接');
      }
      log.error('API Key 验证网络错误:', e.message);
      throw new Error('网络请求失败，请检查网络连接');
    } finally {
      clearTimeout(timeout);
    }
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      log.error(`API Key 验证失败, status: ${response.status}, body: ${body}`);
      throw new Error('Invalid API key');
    }
    saveApiKey(key, providerKey);
  });

  ipcMain.on('open-external', (_, url: string) => {
    shell.openExternal(url);
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

  ipcMain.handle('onboarding:validate-api-key', async (_, { key, providerKey, modelId }: { key: string; providerKey: string; modelId?: string }) => {
    const provider = getProvider(providerKey);
    const model = modelId && provider.models.some(m => m.id === modelId) ? modelId : provider.defaultModel;
    log.info(`API Key 验证开始, provider: ${provider.key}, model: ${model}, endpoint: ${getValidateEndpoint(provider)}`);
    const headers = buildAuthHeaders(provider, key);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    let response: Response;
    try {
      response = await fetch(getValidateEndpoint(provider), {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model,
          max_tokens: 1,
          messages: [{ role: 'user', content: 'hi' }],
        }),
        signal: controller.signal,
      });
    } catch (e: any) {
      if (e.name === 'AbortError') {
        log.error('API Key 验证超时 (30s)');
        throw new Error('验证请求超时，请检查网络连接');
      }
      log.error('API Key 验证网络错误:', e.message);
      throw new Error('网络请求失败，请检查网络连接');
    } finally {
      clearTimeout(timeout);
    }
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      log.error(`API Key 验证失败, status: ${response.status}, body: ${body}`);
      throw new Error('API Key 验证失败，请检查密钥是否正确');
    }
    saveApiKey(key, providerKey);
    const settings = loadSettings();
    saveSettings({ ...settings, provider: provider.key, model: model || provider.defaultModel });
    log.info('API Key 验证成功并已保存');
  });

  ipcMain.handle('onboarding:finish', (_, { defaultCwd }: { defaultCwd: string }) => {
    const settings = loadSettings();
    saveSettings({ ...settings, defaultCwd });
  });

  ipcMain.on('onboarding:complete', () => {
    const settings = loadSettings();
    if (settings.wakeWordEnabled === undefined) {
      settings.wakeWordEnabled = true;
      saveSettings(settings);
    }
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.removeAllListeners('close');
      mainWindow.close();
    }
    createMainWindow();
    // Onboarding 完成后才设置 wakeWordEnabled，但启动初始化已经跳过了，
    // 需要在这里补启动唤醒词引擎
    if (isWakeWordEnabled()) {
      startWakeWord().catch(err => log.error('Onboarding 后启动唤醒词失败:', err));
    }
  });

  // persona
  ipcMain.handle('persona:load', () => {
    const profile = readProfile(lumiDir);
    const content = readPersonaMarkdown(lumiDir);
    const avatarPath = getAvatarPath(lumiDir);
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
    writeProfile(lumiDir, { name });
    writePersonaMarkdown(lumiDir, content);
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
    ensurePersonaDir(lumiDir);
    const filename = `avatar.${ext}`;
    fs.writeFileSync(path.join(getPersonaDir(lumiDir), filename), buffer);
    writeProfile(lumiDir, { avatar: filename });
    return dataUrl;
  });

  ipcMain.handle('persona:avatar:remove', () => {
    removeAvatarFile(lumiDir);
    writeProfile(lumiDir, { avatar: null });
  });

  // skills
  ipcMain.handle('skills:list', () => {
    const settings = loadSettings();
    return scanSkills(path.join(lumiDir, 'skills'), settings.disabledSkills || []);
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
    const skillsDir = path.join(lumiDir, 'skills');

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
    return scanSkills(path.join(lumiDir, 'skills'), disabled);
  });

  ipcMain.handle('skills:delete', (_, { name }) => {
    deleteSkill(name, path.join(lumiDir, 'skills'));
    const settings = loadSettings();
    const disabled = (settings.disabledSkills || []).filter((s: string) => s !== name);
    saveSettings({ ...settings, disabledSkills: disabled });
    return scanSkills(path.join(lumiDir, 'skills'), disabled);
  });

  ipcMain.handle('skills:read', (_, { name }) => {
    return readSkillContent(name, path.join(lumiDir, 'skills'));
  });

  // services
  ipcMain.handle('services:list', () => {
    return loadMcpServers(lumiDir);
  });

  ipcMain.handle('services:add', (_, config) => {
    return addMcpServer(lumiDir, config);
  });

  ipcMain.handle('services:update', (_, { id, ...updates }) => {
    return updateMcpServer(lumiDir, id, updates);
  });

  ipcMain.handle('services:remove', (_, { id }) => {
    return removeMcpServer(lumiDir, id);
  });

  ipcMain.handle('services:test', async (_, { id }) => {
    const servers = loadMcpServers(lumiDir);
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
    const memoriesDir = path.join(lumiDir, 'memories');
    if (!fs.existsSync(memoriesDir)) return [];
    const files = fs.readdirSync(memoriesDir).filter(f => f.endsWith('.md') && f !== 'MEMORY.md');
    return files.map(f => {
      const content = fs.readFileSync(path.join(memoriesDir, f), 'utf-8');
      return { filename: f, content };
    });
  });

  ipcMain.handle('memory:update-core', (_, { filename, content }: { filename: string; content: string }) => {
    if (filename.includes('/') || filename.includes('\\') || filename.includes('..')) return false;
    const memoriesDir = path.join(lumiDir, 'memories');
    const filePath = path.join(memoriesDir, filename);
    if (!filePath.startsWith(memoriesDir) || !fs.existsSync(filePath)) return false;
    fs.writeFileSync(filePath, content);
    return true;
  });

  ipcMain.handle('memory:delete-core', (_, { filename }: { filename: string }) => {
    if (filename.includes('/') || filename.includes('\\') || filename.includes('..')) return false;
    const memoriesDir = path.join(lumiDir, 'memories');
    const filePath = path.join(memoriesDir, filename);
    if (!filePath.startsWith(memoriesDir) || !fs.existsSync(filePath)) return false;
    fs.unlinkSync(filePath);
    return true;
  });

  ipcMain.handle('memory:list-daily', () => {
    return listDailyMemoryDates(lumiDir);
  });

  ipcMain.handle('memory:read-daily', (_, { date }: { date: string }) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
    return readDailyMemory(lumiDir, date);
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
      // If current ASR or TTS provider is volcengine, rebuild instances
      const settings = loadSettings();
      const creds = { appId, accessToken };
      if (!settings.asrProvider || settings.asrProvider === 'volcengine') {
        recorder = new AudioRecorder(createAsrProvider('volcengine', creds));
      }
      if (!settings.ttsProvider || settings.ttsProvider === 'volcengine') {
        ttsService = createTtsProvider('volcengine', creds);
      }
    } catch (err) {
      console.error('[volcengine] 凭证验证失败:', err);
      throw err;
    }
  });

  // voice provider selection
  ipcMain.handle('settings:load-voice-provider', (_, { type }: { type: 'asr' | 'tts' }) => {
    const settings = loadSettings();
    if (type === 'asr') return settings.asrProvider || 'volcengine';
    return settings.ttsProvider || 'volcengine';
  });

  ipcMain.handle('settings:save-voice-provider', async (_, { type, provider }: { type: 'asr' | 'tts'; provider: string }) => {
    const creds = loadVoiceCredentials(provider);
    if (!creds || Object.values(creds).every(v => !v)) {
      throw new Error('请先配置该服务商的密钥');
    }

    if (type === 'asr') {
      const asrProvider = createAsrProvider(provider, creds);
      await asrProvider.validateCredentials();
      recorder = new AudioRecorder(asrProvider);
    } else {
      const ttsProvider = createTtsProvider(provider, creds);
      await ttsProvider.validateCredentials();
      ttsService = ttsProvider;
    }

    const settings = loadSettings();
    if (type === 'asr') settings.asrProvider = provider;
    else settings.ttsProvider = provider;
    saveSettings(settings);
  });

  // aliyun voice credentials
  ipcMain.handle('settings:load-aliyun-credentials', () => {
    const creds = loadAliyunVoiceCredentials();
    return { hasCredentials: !!creds, apiKey: creds?.apiKey ? '••••' + creds.apiKey.slice(-4) : '' };
  });

  ipcMain.handle('settings:save-aliyun-credentials', async (_, { apiKey }: { apiKey: string }) => {
    const { AliyunAsr } = await import('./voice-providers/aliyun-asr');
    const asr = new AliyunAsr(apiKey);
    try {
      await asr.validateCredentials();
      saveAliyunVoiceCredentials(apiKey);
      // If current ASR or TTS provider is aliyun, rebuild instances
      const settings = loadSettings();
      if (settings.asrProvider === 'aliyun') {
        recorder = new AudioRecorder(createAsrProvider('aliyun', { apiKey }));
      }
      if (settings.ttsProvider === 'aliyun') {
        ttsService = createTtsProvider('aliyun', { apiKey });
      }
    } catch (err) {
      console.error('[aliyun] 凭证验证失败:', err);
      throw err;
    }
  });

  // NOTE: globalThis IPC 不可用于 standalone 服务器（独立子进程）。
  // 所有通信通过 Electron ipcMain/ipcRenderer 进行。

  // Wake word IPC handlers
  ipcMain.handle('wake-word:toggle', async (_event, { enabled }: { enabled: boolean }) => {
    if (enabled) {
      try {
        await startWakeWord();
        const settings = loadSettings();
        settings.wakeWordEnabled = true;
        saveSettings(settings);
        return { success: true };
      } catch (err: any) {
        log.error('启动唤醒词失败:', err);
        return { success: false, error: err.message };
      }
    } else {
      destroyWakeWord();
      const settings = loadSettings();
      settings.wakeWordEnabled = false;
      saveSettings(settings);
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

// 启动应用 — 单实例锁 + 崩溃清理
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
}

process.on('exit', () => {
  if (nextServer) {
    nextServer.kill();
    nextServer = null;
  }
});

if (gotTheLock) {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isDestroyed()) {
        createMainWindow();
      } else {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.show();
        mainWindow.focus();
      }
    } else {
      createMainWindow();
    }
  });

app.whenReady().then(async () => {
  initLogger(path.join(lumiDir, 'logs'));
  fs.mkdirSync(lumiDir, { recursive: true });
  fs.mkdirSync(path.join(lumiDir, 'skills'), { recursive: true });
  fs.mkdirSync(path.join(lumiDir, 'mcp'), { recursive: true });
  log.info('=== Lumi 应用启动 ===');
  log.info('日志文件:', log.logPath);
  log.info('版本:', app.getVersion(), '模式:', isDev ? '开发' : '生产');
  log.info('lumiDir:', lumiDir);

  // 生产模式：启动 Next.js standalone 服务器
  if (!isDev) {
    try {
      log.info('正在启动 Next.js standalone 服务器...');
      const port = await startNextServer();
      log.info(`Next.js 服务器已启动在端口 ${port}，开始健康检查...`);
      await waitForServer(port);
      log.info(`Next.js 服务器完全就绪, port=${port}`);
    } catch (err) {
      log.error('Next.js 服务器启动失败:', err);
      dialog.showErrorBox('启动失败', `无法启动内置服务器: ${err}`);
      app.quit();
      return;
    }
  }

  // 初始化数据库
  log.info('初始化数据库...');
  db = new Database(dbPath);
  log.info('数据库已创建');

  log.info('初始化数据库表...');
  initDb(db);
  log.info('数据库表初始化完成');

  log.info('启动 Persona watcher...');
  startPersonaWatcher();
  log.info('Persona watcher 已启动');

  // 初始化状态管理
  log.info('初始化状态管理...');
  store = new LumiStore();
  log.info('状态管理已初始化');
  store.onChange(() => {
    updateTrayDot();
    broadcastChatState();

    // Resume wake word spotting when returning to idle
    if (store.appState === 'idle' && isWakeWordEnabled() && !store.continuousChatWindow) {
      if (!wakeWordActive) {
        startWakeWord().catch(err => log.error('恢复唤醒词监听失败:', err));
      } else if (wakeWordEngine) {
        resumeWakeWord();
      }
    }
  });

  // 创建菜单栏 Tray
  log.info('创建菜单栏 Tray...');
  tray = new LumiTray();
  log.info('菜单栏 Tray 已创建');
  log.info('设置 Tray 回调...');
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
  log.info('创建窗口管理器...');
  voiceBar = new VoiceBarWindow(serverPort);
  subtitlePopup = new SubtitlePopup(serverPort);
  log.info('窗口管理器已创建');

  // 初始化快捷键
  log.info('初始化快捷键...');
  shortcutManager = new ShortcutManager();
  log.info('等待快捷键管理器 init...');
  const shortcutReady = await shortcutManager.init();
  log.info('快捷键 init 完成');
  if (shortcutReady) {
    shortcutManager.start(() => handleRightOption());
  }

  // 初始化语音引擎（ASR + TTS）
  log.info('初始化语音引擎...');
  initVoiceProviders();
  voiceBar.preCreate();
  log.info('快捷键:', shortcutReady ? '已就绪' : '未授权');

  // 注册 IPC
  registerIpcHandlers();
  log.info('IPC handlers 已注册');

  // 【关键】优先创建窗口，让用户看到界面
  const settings = loadSettings();
  const needsOnboarding = !hasApiKey(settings.provider || 'glm-cn');
  log.info('启动检查完成, 需要引导:', needsOnboarding, ', provider:', settings.provider);
  if (needsOnboarding) {
    log.info('创建 Onboarding 窗口...');
    createOnboardingWindow();
  } else {
    log.info('创建主窗口...');
    createMainWindow();
  }

  // voice-bar 失焦自动关闭（连续对话模式下不响应 blur）
  voiceBar.onBlur = () => {
    if (store.continuousChatWindow) return;
    if (voiceEndpoint) {
      voiceEndpoint.destroy();
      voiceEndpoint = null;
    }
    if (store.appState !== 'transcribing' && store.appState !== 'thinking' && store.appState !== 'executing') {
      voiceBar.close();
      store.transition('idle');
      updateTrayDot();
      if (isWakeWordEnabled()) resumeWakeWord();
    }
  };

  // Initialize wake word if enabled (窗口创建后再初始化，避免阻塞)
  if (isWakeWordEnabled()) {
    try {
      log.info('开始初始化唤醒词功能...');
      await startWakeWord();
      log.info('唤醒词功能已启动');
    } catch (err) {
      log.error('启动唤醒词功能失败:', err);
      const settings = loadSettings();
      settings.wakeWordEnabled = false;
      saveSettings(settings);
      log.info('已自动关闭唤醒词设置，防止启动崩溃循环');
    }
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
} // end if (gotTheLock)

function createMainWindow(): void {
  log.info('创建主窗口...');
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
  const url = `http://127.0.0.1:${serverPort}/chat`;
  log.info('加载 URL:', url);
  mainWindow.loadURL(url);
  mainWindow.once('ready-to-show', () => {
    log.info('主窗口 ready-to-show 事件触发');
    mainWindow?.show();
  });
  mainWindow.webContents.on('did-finish-load', () => {
    log.info('主页面加载完成');
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
      log.warn('ready-to-show did not fire, showing window after did-finish-load');
      mainWindow.show();
    }
  });
  mainWindow.webContents.on('did-fail-load', (_, code, desc) => {
    log.error('主页面加载失败:', code, desc);
    // 如果加载失败，显示错误对话框
    dialog.showErrorBox('页面加载失败', `无法加载主页面: ${desc} (错误码: ${code})`);
  });

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
  log.info('创建 Onboarding 窗口...');
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
  const url = `http://127.0.0.1:${serverPort}/onboarding`;
  log.info('加载 URL:', url);
  mainWindow.loadURL(url);
  mainWindow.once('ready-to-show', () => {
    log.info('Onboarding 窗口 ready-to-show 事件触发');
    mainWindow?.show();
  });
  mainWindow.webContents.on('did-finish-load', () => {
    log.info('Onboarding 页面加载完成');
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
      log.warn('ready-to-show did not fire, showing window after did-finish-load');
      mainWindow.show();
    }
  });
  mainWindow.webContents.on('did-fail-load', (_, code, desc) => {
    log.error('Onboarding 页面加载失败:', code, desc);
    // 如果加载失败，显示错误对话框
    dialog.showErrorBox('页面加载失败', `无法加载 Onboarding 页面: ${desc} (错误码: ${code})`);
  });
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
