import { BrowserWindow, Tray } from 'electron';
import { log } from '../src/lib/logger';

export class SummaryPopupWindow {
  private win: BrowserWindow | null = null;
  private serverPort: number;

  constructor(serverPort: number) {
    this.serverPort = serverPort;
  }

  show(tray: Tray): void {
    if (this.win && !this.win.isDestroyed()) {
      this.win.close();
      this.win = null;
      log.info('摘要弹窗: 关闭 (切换)');
      return;
    }

    const trayBounds = tray.getBounds();
    const popupWidth = 380;
    const popupHeight = 480;

    const x = Math.round(trayBounds.x + trayBounds.width / 2 - popupWidth / 2);
    const y = Math.round(trayBounds.y + trayBounds.height + 4);

    this.win = new BrowserWindow({
      width: popupWidth,
      height: popupHeight,
      x,
      y,
      frame: false,
      resizable: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      show: false,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
      },
    });

    this.win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    this.win.loadURL(`http://127.0.0.1:${this.serverPort}/summary`);
    log.info('摘要弹窗: 打开, 位置:', { x, y });

    this.win.once('ready-to-show', () => this.win?.show());

    this.win.on('blur', () => {
      log.info('摘要弹窗: 失焦关闭');
      this.win?.close();
      this.win = null;
    });
  }

  send(channel: string, data?: unknown): void {
    if (this.win && !this.win.isDestroyed()) {
      this.win.webContents.send(channel, data);
    }
  }

  close(): void {
    if (this.win && !this.win.isDestroyed()) {
      this.win.close();
      this.win = null;
      log.info('摘要弹窗: 已关闭');
    }
  }
}
