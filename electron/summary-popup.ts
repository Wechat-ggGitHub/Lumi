import { BrowserWindow, Tray } from 'electron';
import { log } from '../src/lib/logger';

const TOGGLE_DEBOUNCE_MS = 200;

export class SummaryPopupWindow {
  private win: BrowserWindow | null = null;
  private serverPort: number;
  private lastClosedAt = 0;

  /** 主进程注册的关闭回调，在 blur 触发关闭后调用，用于 mark-viewed / 清 dot */
  onClose?: () => void;

  constructor(serverPort: number) {
    this.serverPort = serverPort;
  }

  /** 是否当前已打开（供主进程在推送前判断） */
  isOpen(): boolean {
    return !!(this.win && !this.win.isDestroyed());
  }

  show(tray: Tray): void {
    // 200ms 内被关过 → 视为 toggle 关闭，不开新窗口
    if (Date.now() - this.lastClosedAt < TOGGLE_DEBOUNCE_MS) {
      log.info('摘要弹窗: 200ms 内刚关闭，跳过本次打开（toggle 关闭）');
      return;
    }

    // 防御：极端情况下窗口仍存在（理论不会发生，因为 blur 会立刻关）
    if (this.isOpen()) {
      log.warn('摘要弹窗: show() 被调用但窗口已存在，先关闭旧窗口');
      this.win?.close();
      this.win = null;
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
      this.lastClosedAt = Date.now();
      try {
        this.onClose?.();
      } catch (err) {
        log.error('摘要弹窗 onClose 回调异常:', err);
      }
      this.win?.close();
      this.win = null;
    });
  }

  send(channel: string, data?: unknown): void {
    if (this.isOpen()) {
      this.win!.webContents.send(channel, data);
    }
  }

  close(): void {
    if (this.isOpen()) {
      this.lastClosedAt = Date.now();
      this.win!.close();
      this.win = null;
      log.info('摘要弹窗: 已关闭');
    }
  }
}
