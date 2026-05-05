import { BrowserWindow, ipcMain } from 'electron';
import { log } from '../src/lib/logger';

export interface SubtitlePayload {
  sentences: { text: string; startTime: number; endTime: number }[] | null;
  words: { word: string; startTime: number; endTime: number }[] | null;
  audio: Buffer;
  personaName: string;
}

export class SubtitlePopup {
  private win: BrowserWindow | null = null;
  private serverPort: number;
  private readyResolve: (() => void) | null = null;

  constructor(serverPort: number) {
    this.serverPort = serverPort;
  }

  private ensureWindow(trayBounds: { x: number; y: number; width: number; height: number }): void {
    const popupWidth = 340;
    const popupX = Math.round(trayBounds.x + trayBounds.width / 2 - popupWidth / 2);
    const popupY = trayBounds.y + 8;

    if (this.win && !this.win.isDestroyed()) {
      this.win.setPosition(popupX, popupY);
      this.win.setSize(popupWidth, 140);
      return;
    }

    this.win = new BrowserWindow({
      width: popupWidth,
      height: 140,
      x: popupX,
      y: popupY,
      frame: false,
      transparent: true,
      resizable: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      hasShadow: false,
      show: false,
      focusable: true,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
        backgroundThrottling: false,
      },
    });

    this.win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    this.win.loadURL(`http://127.0.0.1:${this.serverPort}/subtitle`);

    this.win.on('closed', () => {
      this.win = null;
      this.readyResolve = null;
    });

    // Listen for dynamic height changes from renderer
    this.win.webContents.on('ipc-message', (_event, channel, args) => {
      if (channel === 'tts-content-height' && typeof args === 'number') {
        const contentHeight = args;
        const winHeight = Math.max(140, Math.min(400, 42 + contentHeight + 28));
        this.win?.setSize(340, winHeight);
      }
    });
  }

  prepare(trayBounds: { x: number; y: number; width: number; height: number }): Promise<void> {
    this.ensureWindow(trayBounds);

    if (!this.win) return Promise.reject(new Error('Failed to create subtitle window'));

    // If page is still loading, wait for it
    if (this.win.webContents.isLoading()) {
      return new Promise<void>((resolve) => {
        this.win!.webContents.once('did-finish-load', () => resolve());
      });
    }

    return Promise.resolve();
  }

  show(
    trayBounds: { x: number; y: number; width: number; height: number },
    payload: SubtitlePayload,
  ): void {
    this.ensureWindow(trayBounds);

    if (!this.win) return;

    const audioUint8 = new Uint8Array(payload.audio);

    // Reload page to reset state
    this.win.webContents.reload();

    ipcMain.removeAllListeners('tts-page-ready');
    ipcMain.once('tts-page-ready', () => {
      this.win?.webContents.send('tts-audio-data', {
        audio: audioUint8,
        sentences: payload.sentences,
        words: payload.words,
        personaName: payload.personaName,
      });
    });

    this.win.show();
    log.info('字幕弹窗: 已显示');
  }

  close(): void {
    if (this.win && !this.win.isDestroyed() && this.win.isVisible()) {
      this.win.hide();
      log.info('字幕弹窗: 已隐藏');
    }
  }

  destroy(): void {
    if (this.win && !this.win.isDestroyed()) {
      this.win.close();
      this.win = null;
    }
    ipcMain.removeAllListeners('tts-page-ready');
    log.info('字幕弹窗: 已销毁');
  }
}
