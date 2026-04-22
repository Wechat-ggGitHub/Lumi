import { BrowserWindow, Tray } from 'electron';

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
      return; // toggle off
    }

    const trayBounds = tray.getBounds();
    const popupWidth = 380;
    const popupHeight = 400;

    // 定位在 Tray 图标正下方
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

    this.win.once('ready-to-show', () => this.win?.show());

    // 点击外部关闭
    this.win.on('blur', () => {
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
    }
  }
}
