import { BrowserWindow, screen } from 'electron';

export class VoiceBarWindow {
  private win: BrowserWindow | null = null;
  private serverPort: number;
  onBlur: (() => void) | null = null;

  constructor(serverPort: number) {
    this.serverPort = serverPort;
  }

  preCreate(): void {
    if (this.win && !this.win.isDestroyed()) return;

    const cursorScreen = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    const { width: screenWidth, height: screenHeight } = cursorScreen.workAreaSize;
    const barWidth = 640;
    const barHeight = 100;
    const x = cursorScreen.workArea.x + Math.round((screenWidth - barWidth) / 2);
    const y = cursorScreen.workArea.y + screenHeight - barHeight - 40;

    this.win = new BrowserWindow({
      width: barWidth,
      height: barHeight,
      x,
      y,
      frame: false,
      transparent: true,
      resizable: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      hasShadow: false,
      show: false,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
      },
    });

    this.win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    this.win.loadURL(`http://127.0.0.1:${this.serverPort}/voice-bar`);
  }

  show(): void {
    if (!this.win || this.win.isDestroyed()) {
      this.preCreate();
    }
    const win = this.win!;
    win.removeAllListeners('blur');
    win.once('blur', () => {
      if (this.onBlur) this.onBlur();
    });
    win.show();
  }

  hide(): void {
    if (this.win && !this.win.isDestroyed()) {
      this.win.hide();
    }
  }

  /** Keep for API compat — now just hides instead of destroying */
  close(): void {
    this.hide();
  }

  /** Actually destroy the window — only called on app quit */
  destroy(): void {
    if (this.win && !this.win.isDestroyed()) {
      this.win.close();
      this.win = null;
    }
  }

  send(channel: string, data?: unknown): void {
    if (this.win && !this.win.isDestroyed()) {
      this.win.webContents.send(channel, data);
    }
  }

  getWindow(): BrowserWindow | null {
    return this.win && !this.win.isDestroyed() ? this.win : null;
  }

  isVisible(): boolean {
    return this.win !== null && !this.win.isDestroyed() && this.win.isVisible();
  }
}
