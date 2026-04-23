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
import { initDb, insertExecution, updateExecution, getRecentExecutions, getActiveExecution, getExecutionById } from '../src/lib/db';
import { saveApiKey, loadApiKey, hasApiKey, migrateKeyFile } from '../src/lib/keychain';
import { getProvider, getDefaultProvider, resolveModel } from '../src/lib/provider-config';
import { executeClaude } from '../src/lib/claude-client';
import type { ExecutionRecord, AppSettings, DotColor } from '../src/types';

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
          console.log('[next-server]', msg.trim());
          if (msg.includes('Ready') || msg.includes('started')) {
            resolve(port);
          }
        });

        nextServer.stderr?.on('data', (data: Buffer) => {
          console.error('[next-server]', data.toString().trim());
        });

        nextServer.on('error', (err) => {
          console.error('Failed to start Next.js server:', err);
          reject(err);
        });

        nextServer.on('exit', (code) => {
          console.log(`Next.js server exited with code ${code}`);
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
    voiceModel: 'sensevoice',
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

function updateSummaryPopup(): void {
  const active = getActiveExecution(db);
  const history = getRecentExecutions(db, 5);
  summaryPopup.send('summary:update', {
    execution: active,
    history,
    dotColor: store.dotColor,
  });
}

// 右 Command 按键处理
function handleRightCommand(): void {
  const action = store.getRightCommandAction();

  switch (action) {
    case 'start-recording':
      voiceBar.show();
      recorder.startRecording().catch(err => {
        console.error('Recording start failed:', err);
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
      recorder.stopRecording().then(audioPath => {
        store.transition('transcribing');
        updateTrayDot();
        voiceBar.send('voice:transcribing');

        return recorder.transcribe(audioPath);
      }).then(text => {
        if (text) {
          store.transition('editing');
          voiceBar.send('voice:transcript', { text, isAppending: false });
        } else {
          // Empty transcription — show error and go back to idle
          voiceBar.send('voice:error', { message: '未能识别语音，请重试' });
          store.transition('idle');
        }
        updateTrayDot();
      }).catch(err => {
        console.error('[main] Transcription error:', err);
        voiceBar.send('voice:error', { message: err.message });
        store.transition('idle');
        updateTrayDot();
      });
      break;

    case 'append-recording':
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
  const settings = loadSettings();
  const apiKey = loadApiKey();
  if (!apiKey) {
    tray.updateDot('red');
    return;
  }

  store.transition('sending');
  updateTrayDot();

  const executionId = insertExecution(db, {
    cwd: settings.defaultCwd.replace('~', app.getPath('home')),
    user_prompt: prompt,
  });

  store.transition('executing');
  store.setSdkSubState('thinking');
  updateTrayDot();
  updateSummaryPopup();

  voiceBar.close();

  currentAbortController = new AbortController();

  const result = await executeClaude(
    prompt,
    settings.defaultCwd.replace('~', app.getPath('home')),
    apiKey,
    settings.provider || 'glm-cn',
    settings.modelPreset || 'opus',
    {
      onSubState: (substate, toolName) => {
        store.setSdkSubState(substate);
        updateTrayDot();
        updateSummaryPopup();
      },
      onError: (error) => {
        console.error('Claude execution error:', error);
      },
    },
    currentAbortController.signal
  );

  currentAbortController = null;

  updateExecution(db, executionId, {
    status: result.status,
    summary: result.summary,
    duration_ms: result.durationMs,
    num_turns: result.numTurns,
    cost_usd: result.costUsd,
    completed_at: new Date().toISOString(),
  });

  store.transition('idle');
  store.setSdkSubState(result.status === 'completed' ? 'completed' :
                       result.status === 'cancelled' ? 'cancelled' : 'failed');
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

  ipcMain.handle('onboarding:download-model', async (event) => {
    const modelDir = path.join(userDataDir, 'models');
    if (!fs.existsSync(modelDir)) fs.mkdirSync(modelDir, { recursive: true });
    const modelPath = path.join(modelDir, 'sensevoice-small-int8.onnx');
    const tokensPath = path.join(modelDir, 'tokens.txt');

    if (fs.existsSync(modelPath) && fs.existsSync(tokensPath)) return;

    const archiveName = 'sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2024-07-17.tar.bz2';
    const extractedName = 'sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2024-07-17';
    const url = `https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/${archiveName}`;

    const tmpDir = path.join(userDataDir, 'tmp-download');
    const archivePath = path.join(tmpDir, archiveName);
    const maxRetries = 3;
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true });
        fs.mkdirSync(tmpDir, { recursive: true });

        const response = await fetch(url, { redirect: 'follow' });
        if (!response.ok) throw new Error(`Download failed: HTTP ${response.status}`);

        const contentLength = Number(response.headers.get('content-length') || 0);
        const fileStream = fs.createWriteStream(archivePath);
        const reader = response.body!.getReader();
        let downloaded = 0;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          fileStream.write(value);
          downloaded += value.length;
          if (contentLength > 0) {
            event.sender.send('onboarding:download-progress', Math.round(downloaded / contentLength * 100));
          }
        }
        fileStream.end();

        if (contentLength > 0 && downloaded !== contentLength) {
          throw new Error(`Download incomplete: received ${downloaded} bytes, expected ${contentLength} bytes`);
        }

        const { execSync } = require('child_process');
        execSync(`tar xjf "${archiveName}"`, { cwd: tmpDir });

        const extractedDir = path.join(tmpDir, extractedName);
        fs.renameSync(path.join(extractedDir, 'model.int8.onnx'), modelPath);
        fs.renameSync(path.join(extractedDir, 'tokens.txt'), tokensPath);

        fs.rmSync(tmpDir, { recursive: true });
        return;
      } catch (err: any) {
        lastError = err;
        if (attempt < maxRetries) {
          event.sender.send('onboarding:download-progress', 0);
        }
      }
    }

    try { fs.rmSync(tmpDir, { recursive: true }); } catch {}
    throw new Error(`${lastError?.message || 'Download failed'} (after ${maxRetries} attempts)`);
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

  // NOTE: globalThis IPC 不可用于 standalone 服务器（独立子进程）。
  // 所有通信通过 Electron ipcMain/ipcRenderer 进行。
}

// 启动应用
app.whenReady().then(async () => {
  // 生产模式：启动 Next.js standalone 服务器
  if (!isDev) {
    try {
      const port = await startNextServer();
      await waitForServer(port);
      console.log(`Next.js server started on port ${port}`);
    } catch (err) {
      console.error('Failed to start Next.js server:', err);
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
  tray.onPopupRequested = () => summaryPopup.show(tray as any);
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

  // 初始化录音器
  recorder = new AudioRecorder();

  // 注册 IPC
  registerIpcHandlers();

  // 检查是否需要引导
  const needsOnboarding = !hasApiKey();
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
  db?.close();
  if (nextServer) {
    nextServer.kill();
    nextServer = null;
  }
});
