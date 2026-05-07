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
    const display = screen.getPrimaryDisplay();
    return {
      x: Math.round((display.workAreaSize.width - width) / 2),
      y: display.workAreaSize.height - height - 40,
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

  /** 显示呼吸灯提示（连续对话待机），小尺寸 */
  showHint(): void {
    if (!this.win || this.win.isDestroyed()) {
      this.preCreate();
    }
    this.win!.setSize(120, 6);
    const pos = this.centerPosition(120, 6);
    this.win!.setPosition(pos.x, pos.y);
    this.win!.showInactive();
  }

  /** 显示录音指示器，正常尺寸 */
  show(): void {
    if (!this.win || this.win.isDestroyed()) {
      this.preCreate();
    }
    this.win!.setSize(200, 48);
    const pos = this.centerPosition(200, 48);
    this.win!.setPosition(pos.x, pos.y);
    this.win!.showInactive();
    this.win!.once('blur', () => {
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
