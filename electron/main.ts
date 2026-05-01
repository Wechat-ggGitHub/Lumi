import { app, BrowserWindow, ipcMain, systemPreferences, dialog, shell } from 'electron';
import path from 'path';
import fs from 'fs';
import { spawn, ChildProcess } from 'child_process';
import { ShrewTray } from './tray';
import { VoiceBarWindow } from './voice-bar';
import { ShortcutManager } from './shortcuts';
import { AudioRecorder } from './recorder';
import { ShrewStore } from '../src/lib/store';
import { initDb, insertExecution, updateExecution, getRecentExecutions, getExecutionById, appendMessages, getActiveExecution, getActiveSegment, endSegment, createSegment, updateSegmentSessionId, insertChatMessage, appendChatMessageContent, getChatMessages, getLatestAssistantMessage, getPersona, updatePersona, listMemories, addMemory, updateMemory, deleteMemory, toggleMemoryStatus, toggleMemoryPin } from '../src/lib/db';
import { saveApiKey, loadApiKey, hasApiKey, migrateKeyFile, saveVolcengineCredentials, loadVolcengineCredentials, hasVolcengineCredentials } from '../src/lib/keychain';
import { getProvider, getDefaultProvider, resolveModel } from '../src/lib/provider-config';
import { executeClaude } from '../src/lib/claude-client';
import { loadSkills, toggleSkill, configureSkill, loadMcpServers, addMcpServer, updateMcpServer, removeMcpServer } from '../src/lib/config-files';
import { buildShrewContext, getActiveMemories, writeShrewClaudeMd } from '../src/lib/shrew-context';
import { extractMemories } from '../src/lib/memory-extractor';
import { log, initLogger } from '../src/lib/logger';
import type { ExecutionRecord, AppSettings, DotColor, ConversationMessage, ChatMessage } from '../src/types';

// 全局状态
import Database from 'better-sqlite3';

const isDev = !app.isPackaged;
const userDataDir = app.getPath('userData');
const settingsPath = path.join(userDataDir, 'settings.json');
const dbPath = path.join(userDataDir, 'shrew.db');

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
  };
}

function saveSettings(settings: AppSettings): void {
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
}

function updateTrayDot(): void {
  tray.updateDot(store.dotColor);
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

    case 'none':
      break;
  }
}

// 执行 Claude 命令
async function executePrompt(prompt: string): Promise<void> {
  log.info('executePrompt 开始, prompt:', prompt.slice(0, 100));
  const settings = loadSettings();
  const apiKey = loadApiKey();
  if (!apiKey) {
    log.error('API Key 未配置');
    tray.updateDot('red');
    store.transition('idle');
    updateTrayDot();
    return;
  }

  const cwd = settings.defaultCwd.replace('~', app.getPath('home'));
  const providerKey = settings.provider || 'glm-cn';
  const modelPreset = settings.modelPreset || 'opus';

  // 获取当前 context segment
  const segment = getActiveSegment(db);

  // 写入用户消息到 chat_message
  insertChatMessage(db, {
    segmentId: segment.id,
    role: 'user',
    content: prompt,
  });

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

  try {
    const result = await executeClaude(
      prompt,
      cwd,
      apiKey,
      providerKey,
      modelPreset,
      {
        onSubState: (substate, toolName) => {
          log.debug('SDK 子状态:', substate, toolName || '');
          store.setSdkSubState(substate, toolName);
          updateTrayDot();
          broadcastChatState();

          // thinking → executing_tool 切换时更新 appState
          if (substate === 'executing_tool' && store.appState === 'thinking') {
            store.transition('executing');
            updateTrayDot();
            broadcastChatState();
          }
        },
        onError: (error) => {
          log.error('Claude 执行错误:', error);
        },
        onMessage: (msg) => {
          conversationMessages.push(msg);

          if (msg.role === 'assistant' && msg.content) {
            if (!assistantMessageId) {
              // 首次收到 assistant 内容，创建消息记录
              assistantMessageId = insertChatMessage(db, {
                segmentId: segment.id,
                role: 'assistant',
                content: msg.content,
                executionId,
              });
            } else {
              // 追加内容
              appendChatMessageContent(db, assistantMessageId, msg.content);
            }
            sendToMainWindow('chat:stream-chunk', {
              messageId: assistantMessageId,
              content: msg.content,
              done: false,
            });
          }
        },
        onToolCall: (toolCall) => {
          log.debug('工具调用:', toolCall.type, toolCall.target);
        },
      },
      currentAbortController.signal,
      claudeExecutablePath,
      segment.sdk_session_id ?? undefined
    );

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

    // 异步触发 Memory 提炼（不阻塞主流程）
    if (result.status === 'completed') {
      const segment = getActiveSegment(db);
      const settings = loadSettings();
      const ak = loadApiKey();
      if (ak) {
        extractMemories(
          db, prompt, result.summary || assistantContent,
          ak, settings.provider || 'glm-cn', executionId
        ).catch(err => log.error('Memory 提炼异常:', err));
      }
    }

    store.transition('completed');
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

// IPC Handlers
function registerIpcHandlers(): void {
  // voice-bar messages
  ipcMain.on('voice:send', (_, data: { text: string }) => {
    executePrompt(data.text);
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
    mainWindow?.close();
    createMainWindow();
  });

  // persona
  ipcMain.handle('persona:load', () => {
    return getPersona(db);
  });

  ipcMain.handle('persona:save', (_, updates) => {
    const persona = updatePersona(db, updates);
    // 更新 claude.md 备份
    const memories = getActiveMemories(db);
    const context = buildShrewContext(persona, memories);
    writeShrewClaudeMd(userDataDir, context);
    return persona;
  });

  // skills
  ipcMain.handle('skills:list', () => {
    return loadSkills(userDataDir);
  });

  ipcMain.handle('skills:toggle', (_, { id, enabled }) => {
    return toggleSkill(userDataDir, id, enabled);
  });

  ipcMain.handle('skills:configure', (_, { id, params }) => {
    return configureSkill(userDataDir, id, params);
  });

  // services
  ipcMain.handle('services:list', () => {
    return loadMcpServers(userDataDir);
  });

  ipcMain.handle('services:add', (_, config) => {
    return addMcpServer(userDataDir, config);
  });

  ipcMain.handle('services:update', (_, { id, ...updates }) => {
    return updateMcpServer(userDataDir, id, updates);
  });

  ipcMain.handle('services:remove', (_, { id }) => {
    return removeMcpServer(userDataDir, id);
  });

  ipcMain.handle('services:test', async (_, { id }) => {
    const servers = loadMcpServers(userDataDir);
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

  // memory
  ipcMain.handle('memory:list', () => {
    return listMemories(db);
  });

  ipcMain.handle('memory:add', (_, { type, content, source }) => {
    return addMemory(db, { type, content, source });
  });

  ipcMain.handle('memory:update', (_, { id, content }) => {
    updateMemory(db, id, content);
    return listMemories(db);
  });

  ipcMain.handle('memory:delete', (_, { id }) => {
    deleteMemory(db, id);
    return listMemories(db);
  });

  ipcMain.handle('memory:toggle-status', (_, { id }) => {
    toggleMemoryStatus(db, id);
    return listMemories(db);
  });

  ipcMain.handle('memory:toggle-pin', (_, { id }) => {
    toggleMemoryPin(db, id);
    return listMemories(db);
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
}

// 启动应用
app.whenReady().then(async () => {
  initLogger(path.join(userDataDir, 'logs'));
  log.info('=== Shrew 应用启动 ===');
  log.info('日志文件:', log.logPath);
  log.info('版本:', app.getVersion(), '模式:', isDev ? '开发' : '生产');
  log.info('userData:', userDataDir);

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
  initDb(db);

  // 迁移旧的 API key 文件
  migrateKeyFile();

  // 初始化状态管理
  store = new ShrewStore();
  store.onChange(() => {
    updateTrayDot();
    broadcastChatState();
  });

  // 创建菜单栏 Tray
  tray = new ShrewTray();
  tray.onPopupRequested = () => {
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

  // voice-bar 失焦自动关闭
  voiceBar.onBlur = () => {
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
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

function createMainWindow(): void {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });
  mainWindow.loadURL(`http://127.0.0.1:${serverPort}/chat`);
  mainWindow.once('ready-to-show', () => mainWindow?.show());
}

function createOnboardingWindow(): void {
  mainWindow = new BrowserWindow({
    width: 600,
    height: 500,
    show: false,
    resizable: false,
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
  shortcutManager?.stop();
  voiceBar?.destroy();
  db?.close();
  if (nextServer) {
    nextServer.kill();
    nextServer = null;
  }
});
