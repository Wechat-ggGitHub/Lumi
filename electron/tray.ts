import { Tray, nativeImage, Menu } from 'electron';
import type { DotColor } from '../src/types';

// 生成 Template 图标 (22x22)：4 层渐变圆盘
function createBaseIcon(): Electron.NativeImage {
  const size = 22;
  const canvas = Buffer.alloc(size * size * 4, 0);

  const center = size / 2;

  // 4 层渐变圆盘参数（半径, alpha）
  const layers = [
    { radius: 9.5, alpha: 0.10 },
    { radius: 6.8, alpha: 0.18 },
    { radius: 4.1, alpha: 0.35 },
    { radius: 1.4, alpha: 1.00 },
  ];

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - center;
      const dy = y - center;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const idx = (y * size + x) * 4;

      // 叠加各层 alpha（从外到内累加）
      let alpha = 0;
      for (const layer of layers) {
        if (dist <= layer.radius) {
          alpha = layer.alpha;
        }
      }

      canvas[idx] = 255;
      canvas[idx + 1] = 255;
      canvas[idx + 2] = 255;
      canvas[idx + 3] = Math.round(alpha * 255);
    }
  }

  return nativeImage.createFromBuffer(canvas, {
    width: size,
    height: size,
    scaleFactor: 2.0,
  });
}

function createDotIcon(color: DotColor): Electron.NativeImage {
  const size = 22;
  const canvas = Buffer.alloc(size * size * 4);

  const center = size / 2;

  const colors: Record<DotColor, [number, number, number, number]> = {
    gray:   [142, 142, 147, 200],
    blue:   [50, 173, 255, 255],
    green:  [52, 199, 89, 255],
    red:    [255, 69, 58, 255],
    yellow: [255, 214, 10, 255],
    purple: [175, 82, 222, 255],
  };

  // 绘制 4 层圆盘主体（同 baseIcon）
  const layers = [
    { radius: 9.5, alpha: 0.10 },
    { radius: 6.8, alpha: 0.18 },
    { radius: 4.1, alpha: 0.35 },
    { radius: 1.4, alpha: 1.00 },
  ];

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - center;
      const dy = y - center;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const idx = (y * size + x) * 4;

      // 圆盘主体
      let alpha = 0;
      for (const layer of layers) {
        if (dist <= layer.radius) {
          alpha = layer.alpha;
        }
      }

      canvas[idx] = 255;
      canvas[idx + 1] = 255;
      canvas[idx + 2] = 255;
      canvas[idx + 3] = Math.round(alpha * 255);

      // 状态点（右上角）
      const dotCX = size - 4;
      const dotCY = 4;
      const dotRadius = 2.5;
      const ddx = x - dotCX;
      const ddy = y - dotCY;
      const dotDist = Math.sqrt(ddx * ddx + ddy * ddy);

      if (dotDist <= dotRadius) {
        const [r, g, b, a] = colors[color];
        canvas[idx] = r;
        canvas[idx + 1] = g;
        canvas[idx + 2] = b;
        canvas[idx + 3] = a;
      }
    }
  }

  return nativeImage.createFromBuffer(canvas, { width: size, height: size });
}

export class ShrewTray {
  private tray: Tray;
  private dotIcons: Record<DotColor, Electron.NativeImage>;
  private baseIcon: Electron.NativeImage;
  private contextMenu: Menu;

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

    // Build context menu but do NOT use setContextMenu()
    // On macOS, setContextMenu() overrides left-click behavior
    this.contextMenu = Menu.buildFromTemplate([
      { label: 'Shrew', type: 'normal', enabled: false },
      { type: 'separator' },
      { label: '设置...', click: () => this.openSettings() },
      { type: 'separator' },
      { label: '退出 Shrew', role: 'quit' },
    ]);

    // Left click: toggle summary popup
    this.tray.on('click', () => this.onPopupRequested?.());

    // Right click: show context menu
    this.tray.on('right-click', () => {
      this.contextMenu.popup();
    });
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

  private openSettings(): void {
    this.onSettingsRequested?.();
  }

  getBounds(): Electron.Rectangle {
    return this.tray.getBounds();
  }

  onPopupRequested?: () => void;
  onSettingsRequested?: () => void;

  destroy(): void {
    this.tray.destroy();
  }
}
