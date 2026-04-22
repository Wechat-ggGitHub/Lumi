import { BrowserWindow, screen } from 'electron';

export class VoiceBarWindow {
  private win: BrowserWindow | null = null;
  private serverPort: number;

  constructor(serverPort: number) {
    this.serverPort = serverPort;
  }

  show(): void {
    if (this.win && !this.win.isDestroyed()) {
      this.win.show();
      return;
    }

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
    this.win.once('ready-to-show', () => this.win?.show());
  }

  hide(): void {
    if (this.win && !this.win.isDestroyed()) {
      this.win.hide();
    }
  }

  close(): void {
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

  isVisible(): boolean {
    return this.win !== null && !this.win.isDestroyed() && this.win.isVisible();
  }
}
