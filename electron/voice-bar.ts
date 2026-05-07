import { screen } from 'electron';
import { log } from '../src/lib/logger';

export class VoiceBarWindow {
  private win: Electron.BrowserWindow | null = null;
  onBlur: (() => void) | null = null;
  private serverPort: number;

  constructor(serverPort: number) {
    this.serverPort = serverPort;
  }

  private centerPosition(width: number, height: number): { x: number; y: number } {
    const point = screen.getCursorScreenPoint();
    const display = screen.getDisplayNearestPoint(point);
    const bounds = display.workArea;
    return {
      x: Math.round(bounds.x + (bounds.width - width) / 2),
      y: Math.round(bounds.y + bounds.height - height - 40),
    };
  }

  preCreate(): void {
    if (this.win && !this.win.isDestroyed()) return;

    const { BrowserWindow } = require('electron') as typeof import('electron');

    this.win = new BrowserWindow({
      width: 200,
      height: 48,
      show: false,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      resizable: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      hasShadow: false,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
      },
    });

    this.win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    const pos = this.centerPosition(200, 48);
    this.win.setPosition(pos.x, pos.y);
    this.win.loadURL(`http://127.0.0.1:${this.serverPort}/voice-bar`);
  }

  show(): void {
    if (!this.win || this.win.isDestroyed()) {
      this.preCreate();
    }
    const win = this.win!;
    win.setSize(200, 48);
    const pos = this.centerPosition(200, 48);
    win.setPosition(pos.x, pos.y);

    // 清除之前残留的 blur 监听器，防止快速连按累积回调
    win.removeAllListeners('blur');

    win.showInactive();
    // 强制刷新层级，确保透明窗口不被 Dock / 全屏应用遮挡
    win.setAlwaysOnTop(true, 'floating');

    win.once('blur', () => {
      if (this.onBlur) this.onBlur();
    });
  }

  hide(): void {
    if (this.win && !this.win.isDestroyed()) {
      this.win.hide();
    }
  }

  close(): void {
    this.hide();
  }

  destroy(): void {
    if (this.win && !this.win.isDestroyed()) {
      this.win.close();
      this.win = null;
    }
  }

  send(channel: string, data?: any): void {
    if (this.win && !this.win.isDestroyed()) {
      this.win.webContents.send(channel, data);
    }
  }

  getWindow(): Electron.BrowserWindow | null {
    return this.win;
  }

  isVisible(): boolean {
    return this.win ? this.win.isVisible() : false;
  }
}
