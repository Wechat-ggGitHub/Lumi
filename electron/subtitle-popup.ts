import { BrowserWindow } from 'electron';
import { log } from '../src/lib/logger';

export interface SubtitlePayload {
  sentences: { text: string; startTime: number; endTime: number }[] | null;
  words: { word: string; startTime: number; endTime: number }[] | null;
  audio: Buffer;
  personaName: string;
  personaAvatar: string | null;
}

export class SubtitlePopup {
  private win: BrowserWindow | null = null;
  private serverPort: number;

  constructor(serverPort: number) {
    this.serverPort = serverPort;
  }

  private ensureWindow(trayBounds: { x: number; y: number; width: number; height: number }): void {
    const popupWidth = 340;
    const popupX = Math.round(trayBounds.x + trayBounds.width / 2 - popupWidth / 2);
    const popupY = trayBounds.y + 8;

    if (this.win && !this.win.isDestroyed()) {
      this.win.setPosition(popupX, popupY);
      this.win.setSize(popupWidth, 150);
      return;
    }

    this.win = new BrowserWindow({
      width: popupWidth,
      height: 150,
      x: popupX,
      y: popupY,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
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

    // Send reset to clear old content before showing new data
    this.win.webContents.send('tts-reset');

    // Send audio data directly (no reload needed)
    this.win.webContents.send('tts-audio-data', {
      audio: audioUint8,
      sentences: payload.sentences,
      words: payload.words,
      personaName: payload.personaName,
      personaAvatar: payload.personaAvatar,
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

  /** 渐弱 TTS 音量并在 300ms 后停止 */
  fadeOut(): void {
    if (this.win && !this.win.isDestroyed()) {
      this.win.webContents.send('tts-fade-out');
    }
  }

  stop(): void {
    if (this.win && !this.win.isDestroyed()) {
      this.win.webContents.send('tts-stop');
    }
    this.close();
  }

  destroy(): void {
    if (this.win && !this.win.isDestroyed()) {
      this.win.close();
      this.win = null;
    }
    log.info('字幕弹窗: 已销毁');
  }
}
