import { app, BrowserWindow, ipcMain, systemPreferences, dialog, shell } from 'electron';
import path from 'path';
import fs from 'fs';
import { spawn, ChildProcess } from 'child_process';
import { ShrewTray } from './tray';
import { VoiceBarWindow } from './voice-bar';
import { SummaryPopupWindow } from './summary-popup';
import { ShortcutManager } from './shortcuts';
import { AudioRecorder } from './recorder';
import { ShrewStore } from '../src/lib/store';
import { initDb, insertExecution, updateExecution, getRecentExecutions, getExecutionById, appendMessages, markViewed, markAllUnviewedAsViewed } from '../src/lib/db';
import { saveApiKey, loadApiKey, hasApiKey, migrateKeyFile, saveVolcengineCredentials, loadVolcengineCredentials, hasVolcengineCredentials } from '../src/lib/keychain';
import { getProvider, getDefaultProvider, resolveModel } from '../src/lib/provider-config';
import { executeClaude } from '../src/lib/claude-client';
import { log, initLogger } from '../src/lib/logger';
import type { ExecutionRecord, AppSettings, DotColor, ConversationMessage } from '../src/types';

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
let summaryPopup: SummaryPopupWindow;
let shortcutManager: ShortcutManager;
let recorder: AudioRecorder;
let mainWindow: BrowserWindow | null = null;
let serverPort = 3000;
let nextServer: ChildProcess | null = null;
let currentAbortController: AbortController | null = null;
let detailWindow: BrowserWindow | null = null;

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

function updateSummaryPopup(): void {
  // 防御：面板未打开时不查数据库
  if (!summaryPopup?.isOpen()) return;

  const recent = getRecentExecutions(db, RECENT_LIMIT);
  const totalCount = getTotalExecutionCount(db);
  summaryPopup.send('summary:update', {
    recent,
    totalCount,
    hasMore: totalCount > recent.length,
    dotColor: store.dotColor,
    appState: store.appState,
    sdkSubState: store.sdkSubState,
    currentToolName: store.currentToolName ?? undefined,
  });
}

function getTotalExecutionCount(db: Database.Database): number {
  const row = db.prepare(`SELECT COUNT(*) as count FROM execution_history`).get() as { count: number };
  return row.count;
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

  store.transition('sending');
  updateTrayDot();

  const cwd = settings.defaultCwd.replace('~', app.getPath('home'));
  const providerKey = settings.provider || 'glm-cn';
  const modelPreset = settings.modelPreset || 'opus';

  // 生产模式下定位 claude 原生二进制（绕过 ASAR）
  let claudeExecutablePath: string | undefined;
  if (!isDev) {
    const unpackedRoot = app.getAppPath().replace(/\.asar$/, '.asar.unpacked');
    const candidates = [
      // SDK 的平台包可能作为嵌套依赖存在
      'node_modules/@anthropic-ai/claude-agent-sdk/node_modules/@anthropic-ai/claude-agent-sdk-darwin-arm64/claude',
      // 也可能在顶层（npm hoisted）
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

  store.transition('executing');
  store.setSdkSubState('thinking');
  updateTrayDot();
  updateSummaryPopup();

  voiceBar.close();

  currentAbortController = new AbortController();

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
          updateSummaryPopup();
        },
        onError: (error) => {
          log.error('Claude 执行错误:', error);
        },
        onMessage: (msg) => {
          conversationMessages.push(msg);
        },
        onToolCall: (toolCall) => {
          log.debug('工具调用:', toolCall.type, toolCall.target);
        },
      },
      currentAbortController.signal,
      claudeExecutablePath
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

    store.transition('idle');
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
    store.transition('idle');
    store.setSdkSubState('failed');
  }

  updateTrayDot();
  updateSummaryPopup();
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

  // summary
  ipcMain.on('summary:ready', () => updateSummaryPopup());

  ipcMain.on('summary:open-detail', (_, { id }: { id: string }) => {
    if (detailWindow && !detailWindow.isDestroyed()) {
      detailWindow.close();
    }

    detailWindow = new BrowserWindow({
      width: 500,
      height: 600,
      title: '执行详情',
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
      },
    });

    detailWindow.loadURL(`http://127.0.0.1:${serverPort}/summary/detail?id=${id}`);
    detailWindow.on('closed', () => { detailWindow = null; });
  });

  ipcMain.on('summary:fetch-detail', (event, { id }: { id: string }) => {
    const record = getExecutionById(db, id);
    event.sender.send('summary:detail-data', { record });
  });

  ipcMain.on('summary:mark-viewed', (_, { id }: { id: string }) => {
    markViewed(db, id);
  });

  // detail window: 发送后续消息
  ipcMain.on('detail:send-message', async (event, { id, text }: { id: string; text: string }) => {
    const record = getExecutionById(db, id);
    if (!record?.sdk_session_id) {
      log.error('detail:send-message: 无 sdk_session_id');
      event.sender.send('detail:execution-complete', {
        record: { ...record, status: 'failed' },
      });
      return;
    }

    const apiKey = loadApiKey();
    if (!apiKey) {
      log.error('detail:send-message: API Key 未配置');
      return;
    }

    const settings = loadSettings();
    const cwd = record.cwd;
    const providerKey = settings.provider || 'glm-cn';
    const modelPreset = settings.modelPreset || 'opus';

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
          break;
        }
      }
    }

    log.info('detail:send-message: 恢复会话', record.sdk_session_id);

    const continueAbortController = new AbortController();
    const conversationMessages: ConversationMessage[] = [];
    conversationMessages.push({ role: 'user', content: text });

    try {
      const result = await executeClaude(
        text,
        cwd,
        apiKey,
        providerKey,
        modelPreset,
        {
          onSubState: (substate, toolName) => {
            log.debug('detail SDK 子状态:', substate, toolName || '');
          },
          onError: (error) => {
            log.error('detail Claude 执行错误:', error);
            event.sender.send('detail:execution-complete', { record: getExecutionById(db, id) });
          },
          onMessage: (msg) => {
            conversationMessages.push(msg);
            event.sender.send('detail:stream-chunk', {
              id,
              content: msg.content,
              done: false,
            });
          },
          onToolCall: (toolCall) => {
            event.sender.send('detail:tool-call', { id, toolCall });
          },
        },
        continueAbortController.signal,
        claudeExecutablePath,
        record.sdk_session_id
      );

      const existingMessages = JSON.parse(record.messages || '[]') as ConversationMessage[];
      const allMessages = [...existingMessages, ...conversationMessages];
      appendMessages(db, id, allMessages);

      const updatedRecord = getExecutionById(db, id);
      if (updatedRecord) {
        const newDuration = (updatedRecord.duration_ms || 0) + (result.durationMs || 0);
        const newCost = (updatedRecord.cost_usd || 0) + (result.costUsd || 0);
        const newTurns = (updatedRecord.num_turns || 0) + (result.numTurns || 0);
        updateExecution(db, id, {
          duration_ms: newDuration,
          cost_usd: newCost,
          num_turns: newTurns,
          summary: result.summary || updatedRecord.summary,
        });

        const finalRecord = getExecutionById(db, id);
        event.sender.send('detail:execution-complete', { record: finalRecord });
      }
    } catch (err) {
      log.error('detail:send-message 执行异常:', err);
      event.sender.send('detail:execution-complete', { record: getExecutionById(db, id) });
    }
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
  store.onChange(() => updateTrayDot());

  // 创建菜单栏 Tray
  tray = new ShrewTray();
  tray.onPopupRequested = () => {
    store.clearCompletedState();
    updateTrayDot();
    summaryPopup.show(tray as any);
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
  summaryPopup = new SummaryPopupWindow(serverPort);

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
    if (store.appState !== 'transcribing' && store.appState !== 'executing') {
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
  mainWindow.loadURL(`http://127.0.0.1:${serverPort}/settings`);
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
