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

  constructor(serverPort: number) {
    this.serverPort = serverPort;
  }

  show(
    trayBounds: { x: number; y: number; width: number; height: number },
    payload: SubtitlePayload,
  ): void {
    this.close();

    const { x: trayX, y: trayY, width: trayWidth } = trayBounds;
    const popupWidth = 340;
    const popupX = Math.round(trayX + trayWidth / 2 - popupWidth / 2);
    const popupY = trayY + 8;

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
      },
    });

    this.win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

    // Convert Buffer to Uint8Array for IPC transfer
    const audioUint8 = new Uint8Array(payload.audio);

    this.win.loadURL(`http://127.0.0.1:${this.serverPort}/subtitle`);
    // Wait for subtitle page to signal readiness (React mounted) before sending data
    // to avoid race condition with IPC listener registration
    ipcMain.once('tts-page-ready', () => {
      this.win?.webContents.send('tts-audio-data', {
        audio: audioUint8,
        sentences: payload.sentences,
        words: payload.words,
        personaName: payload.personaName,
      });
    });
    this.win.once('ready-to-show', () => {
      this.win?.show();
      log.info('字幕弹窗: 已显示');
    });
  }

  close(): void {
    if (this.win && !this.win.isDestroyed()) {
      this.win.close();
      this.win = null;
      log.info('字幕弹窗: 已关闭');
    }
  }

  destroy(): void {
    this.close();
  }
}
