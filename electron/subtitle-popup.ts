import { BrowserWindow } from 'electron';
import { log } from '../src/lib/logger';

export class SubtitlePopup {
  private win: BrowserWindow | null = null;
  private serverPort: number;

  constructor(serverPort: number) {
    this.serverPort = serverPort;
  }

  show(text: string, trayBounds: { x: number; y: number; width: number; height: number }): void {
    this.close();

    const { x: trayX, y: trayY, width: trayWidth } = trayBounds;
    const popupWidth = 300;
    const popupX = Math.round(trayX + trayWidth / 2 - popupWidth / 2);
    const popupY = trayY + 8;

    this.win = new BrowserWindow({
      width: popupWidth,
      height: 120,
      x: popupX,
      y: popupY,
      frame: false,
      transparent: true,
      resizable: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      hasShadow: false,
      show: false,
      focusable: false,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
      },
    });

    this.win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    this.win.loadURL(`http://127.0.0.1:${this.serverPort}/subtitle?text=${encodeURIComponent(text)}`);
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
