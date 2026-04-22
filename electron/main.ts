import { app, BrowserWindow, ipcMain, systemPreferences, dialog, shell } from 'electron';
import path from 'path';
import fs from 'fs';
import { ShrewTray } from './tray';
import { VoiceBarWindow } from './voice-bar';
import { SummaryPopupWindow } from './summary-popup';
import { ShortcutManager } from './shortcuts';
import { AudioRecorder } from './recorder';
import { ShrewStore } from '../src/lib/store';
import { initDb, insertExecution, updateExecution, getRecentExecutions, getActiveExecution } from '../src/lib/db';
import { saveApiKey, loadApiKey, hasApiKey } from '../src/lib/keychain';
import { executeClaude } from '../src/lib/claude-client';
import type { ExecutionRecord, AppSettings, DotColor } from '../src/types';

// 全局状态
import Database from 'better-sqlite3';

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
let currentAbortController: AbortController | null = null;

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
      recorder.startRecording();
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
          voiceBar.send('voice:error', { message: '未检测到语音，请重试' });
          store.transition('editing');
        }
        updateTrayDot();
      }).catch(err => {
        voiceBar.send('voice:error', { message: err.message });
        store.transition('error');
        store.transition('idle');
        updateTrayDot();
      });
      break;

    case 'append-recording':
      recorder.startRecording();
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
    voiceBar.close();
    store.transition('idle');
    updateTrayDot();
  });

  ipcMain.on('voice:request-append', () => {
    recorder.startRecording();
    store.transition('recording');
    updateTrayDot();
  });

  // summary
  ipcMain.on('summary:ready', () => updateSummaryPopup());

  // settings
  ipcMain.handle('settings:load', () => {
    const settings = loadSettings();
    return { ...settings, hasApiKey: hasApiKey() };
  });

  ipcMain.handle('settings:save-api-key', (_, { key }: { key: string }) => {
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

  ipcMain.handle('onboarding:download-model', async (_, { onProgress }: { onProgress: (p: number) => void }) => {
    const modelDir = path.join(userDataDir, 'models');
    if (!fs.existsSync(modelDir)) fs.mkdirSync(modelDir, { recursive: true });
    const modelPath = path.join(modelDir, 'sensevoice-small-int8.onnx');

    // 下载模型（URL 需要配置为实际下载地址）
    const response = await fetch('https://modelscope.cn/models/iic/SenseVoiceSmall/resolve/master/model.onnx');
    if (!response.ok) throw new Error('Download failed');
    const contentLength = Number(response.headers.get('content-length') || 0);
    const fileStream = fs.createWriteStream(modelPath);
    const reader = response.body!.getReader();
    let downloaded = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      fileStream.write(value);
      downloaded += value.length;
      if (contentLength > 0) {
        onProgress(Math.round(downloaded / contentLength * 100));
      }
    }

    fileStream.end();
  });

  ipcMain.handle('onboarding:validate-api-key', async (_, { key }: { key: string }) => {
    // 简单验证：尝试调用 Anthropic API
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'hi' }],
      }),
    });
    if (!response.ok) throw new Error('Invalid API key');
    saveApiKey(key);
  });

  ipcMain.handle('onboarding:finish', (_, { defaultCwd }: { defaultCwd: string }) => {
    const settings = loadSettings();
    saveSettings({ ...settings, defaultCwd });
  });

  // 暴露给 API routes
  (globalThis as any).__shrewStore = store;
  (globalThis as any).__shrewExecutor = {
    execute: executePrompt,
  };
}

// 启动应用
app.whenReady().then(async () => {
  // 初始化数据库
  db = new Database(dbPath);
  initDb(db);

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
    shortcutManager.start(handleRightCommand);
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
  // Onboarding 通过 settings 页面中的 Onboarding 组件实现
  // 判断逻辑：如果没有 API key，显示 Onboarding；否则显示 Settings
  mainWindow.loadURL(`http://127.0.0.1:${serverPort}/settings`);
  mainWindow.once('ready-to-show', () => mainWindow?.show());
}

app.on('window-all-closed', () => {
  // macOS 不退出，保持菜单栏常驻
});

app.on('before-quit', () => {
  shortcutManager?.stop();
  db?.close();
});
