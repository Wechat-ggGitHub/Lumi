import { Tray, nativeImage, Menu, BrowserWindow } from 'electron';
import path from 'path';
import type { DotColor } from '../src/types';

// 动态生成 Template 图标 (22x22 黑色 Shrew logo 轮廓)
function createBaseIcon(): Electron.NativeImage {
  const size = 22;
  // macOS Template 图标：黑色像素自动适配明暗模式
  const img = nativeImage.createEmpty();
  return img;
}

// 动态生成状态小点图标
function createDotIcon(color: DotColor): Electron.NativeImage {
  const size = 22;
  const canvas = Buffer.alloc(size * size * 4); // RGBA

  const colors: Record<DotColor, [number, number, number, number]> = {
    gray:   [142, 142, 147, 200],
    blue:   [50, 173, 255, 255],
    green:  [52, 199, 89, 255],
    red:    [255, 69, 58, 255],
    yellow: [255, 214, 10, 255],
  };

  const [r, g, b, a] = colors[color];
  const center = size / 2;
  const radius = 8;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - center;
      const dy = y - center;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const idx = (y * size + x) * 4;

      if (dist <= radius) {
        canvas[idx] = r;
        canvas[idx + 1] = g;
        canvas[idx + 2] = b;
        canvas[idx + 3] = a;
      } else {
        canvas[idx + 3] = 0; // transparent
      }
    }
  }

  return nativeImage.createFromBuffer(canvas, { width: size, height: size });
}

export class ShrewTray {
  private tray: Tray;
  private dotIcons: Record<DotColor, Electron.NativeImage>;
  private baseIcon: Electron.NativeImage;
  private summaryWindow: BrowserWindow | null = null;

  constructor() {
    this.baseIcon = createBaseIcon();
    this.dotIcons = {
      gray: createDotIcon('gray'),
      blue: createDotIcon('blue'),
      green: createDotIcon('green'),
      red: createDotIcon('red'),
      yellow: createDotIcon('yellow'),
    };

    this.tray = new Tray(this.baseIcon);
    this.tray.setToolTip('Shrew - 待命中');
    this.updateDot('gray');

    const contextMenu = Menu.buildFromTemplate([
      { label: 'Shrew', type: 'normal', enabled: false },
      { type: 'separator' },
      { label: '设置...', click: () => this.openSettings() },
      { type: 'separator' },
      { label: '退出 Shrew', role: 'quit' },
    ]);
    this.tray.setContextMenu(contextMenu);

    this.tray.on('click', () => this.toggleSummaryPopup());
  }

  updateDot(color: DotColor): void {
    const dot = this.dotIcons[color];
    this.tray.setImage(dot);

    const tooltips: Record<DotColor, string> = {
      gray: 'Shrew - 待命中',
      blue: 'Shrew - 执行中',
      green: 'Shrew - 已完成',
      red: 'Shrew - 出错了',
      yellow: 'Shrew - 等待中',
    };
    this.tray.setToolTip(tooltips[color]);
  }

  private toggleSummaryPopup(): void {
    if (this.summaryWindow && !this.summaryWindow.isDestroyed()) {
      this.summaryWindow.close();
      this.summaryWindow = null;
    } else {
      this.onPopupRequested?.();
    }
  }

  private openSettings(): void {
    this.onSettingsRequested?.();
  }

  // 回调，由 main.ts 注入
  onPopupRequested?: () => void;
  onSettingsRequested?: () => void;

  destroy(): void {
    this.tray.destroy();
  }
}
