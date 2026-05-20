import { BrowserWindow, screen } from 'electron';
import { log } from '../src/lib/logger';

const TOGGLE_DEBOUNCE_MS = 200;
const WINDOW_WIDTH = 960;
const WINDOW_HEIGHT = 680;

export class DetailWindow {
  private win: BrowserWindow | null = null;
  private serverPort: number;
  private lastHiddenAt = 0;

  constructor(serverPort: number) {
    this.serverPort = serverPort;
  }

  isOpen(): boolean {
    return !!(this.win && !this.win.isDestroyed());
  }

  isVisible(): boolean {
    return this.isOpen() && this.win!.isVisible();
  }

  toggle(): void {
    if (this.isVisible()) {
      this.hide();
      return;
    }
    if (Date.now() - this.lastHiddenAt < TOGGLE_DEBOUNCE_MS) {
      log.info('详情窗口: 200ms 内刚隐藏，跳过本次打开');
      return;
    }
    this.show();
  }

  show(): void {
    if (!this.isOpen()) {
      this.createWindow();
    }
    this.win!.show();
    this.win!.focus();
    this.send('detail:show');
  }

  hide(): void {
    if (!this.isVisible()) return;
    this.lastHiddenAt = Date.now();
    this.win!.hide();
    log.info('详情窗口: 已隐藏');
  }

  send(channel: string, data?: unknown): void {
    if (this.isOpen()) {
      this.win!.webContents.send(channel, data);
    }
  }

  private createWindow(): void {
    if (this.isOpen()) {
      this.win!.close();
      this.win = null;
    }

    const primaryDisplay = screen.getPrimaryDisplay();
    const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;
    const x = screenWidth - WINDOW_WIDTH - 40;
    const y = Math.round((screenHeight - WINDOW_HEIGHT) / 2);

    this.win = new BrowserWindow({
      width: WINDOW_WIDTH,
      height: WINDOW_HEIGHT,
      x,
      y,
      title: 'Lumi',
      minWidth: 720,
      minHeight: 480,
      show: false,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
      },
    });

    this.win.loadURL(`http://127.0.0.1:${this.serverPort}/detail`);
    log.info('详情窗口: 已创建');

    this.win.on('close', (e) => {
      if (this.win) {
        e.preventDefault();
        this.hide();
      }
    });
  }

  destroy(): void {
    if (this.isOpen()) {
      this.win!.removeAllListeners();
      this.win!.close();
      this.win = null;
    }
  }
}
