import { Tray, nativeImage, Menu } from 'electron';
import type { DotColor } from '../src/types';

const ICON_SIZE = 44;
const CENTER = ICON_SIZE / 2;

// 3 层渐变圆盘参数（2x 缩放，适配 22pt @2x retina）
const DISC_LAYERS = [
  { radius: 17.8, alpha: 0.25 },
  { radius: 10.4, alpha: 0.60 },
  { radius: 3.4, alpha: 1.00 },
];

// 动画帧参数（cosine 呼吸脉冲）
const ANIM_FRAMES = 8;
const ANIM_INTERVAL = 250; // ms, 8 frames × 250ms = 2s 周期
// 各层最大/最小 alpha
const ANIM_RANGE = {
  outer: { min: 0.08, max: 0.25 },
  mid:   { min: 0.15, max: 0.60 },
  core:  { min: 0.30, max: 1.00 },
};

// Smoothstep anti-aliasing: 1.0 inside, smooth falloff at edge, 0.0 outside
function smoothEdge(dist: number, radius: number, feather: number = 1.0): number {
  if (dist <= radius - feather) return 1.0;
  if (dist >= radius + feather) return 0.0;
  const t = (radius + feather - dist) / (2 * feather);
  return t * t * (3 - 2 * t);
}

function drawDisc(canvas: Buffer, layers: { radius: number; alpha: number }[]): void {
  for (let y = 0; y < ICON_SIZE; y++) {
    for (let x = 0; x < ICON_SIZE; x++) {
      const dx = x - CENTER;
      const dy = y - CENTER;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const idx = (y * ICON_SIZE + x) * 4;

      let alpha = 0;
      for (const layer of layers) {
        const edge = smoothEdge(dist, layer.radius);
        alpha = Math.max(alpha, edge * layer.alpha);
      }

      canvas[idx] = 255;
      canvas[idx + 1] = 255;
      canvas[idx + 2] = 255;
      canvas[idx + 3] = Math.round(alpha * 255);
    }
  }
}

function drawDot(canvas: Buffer, r: number, g: number, b: number, a: number): void {
  const dotCX = ICON_SIZE - 8;
  const dotCY = 8;
  const dotRadius = 5;

  for (let y = 0; y < ICON_SIZE; y++) {
    for (let x = 0; x < ICON_SIZE; x++) {
      const ddx = x - dotCX;
      const ddy = y - dotCY;
      const dotDist = Math.sqrt(ddx * ddx + ddy * ddy);
      const edge = smoothEdge(dotDist, dotRadius);
      if (edge > 0) {
        const idx = (y * ICON_SIZE + x) * 4;
        canvas[idx] = r;
        canvas[idx + 1] = g;
        canvas[idx + 2] = b;
        canvas[idx + 3] = Math.round(edge * a);
      }
    }
  }
}

function createBaseIcon(): Electron.NativeImage {
  const canvas = Buffer.alloc(ICON_SIZE * ICON_SIZE * 4, 0);
  drawDisc(canvas, DISC_LAYERS);
  return nativeImage.createFromBuffer(canvas, {
    width: ICON_SIZE,
    height: ICON_SIZE,
    scaleFactor: 2.0,
  });
}

const DOT_COLORS: Record<DotColor, [number, number, number, number]> = {
  gray:   [142, 142, 147, 200],
  blue:   [50, 173, 255, 255],
  green:  [52, 199, 89, 255],
  red:    [255, 69, 58, 255],
  yellow: [255, 214, 10, 255],
  purple: [175, 82, 222, 255],
};

function createDotIcon(color: DotColor): Electron.NativeImage {
  const canvas = Buffer.alloc(ICON_SIZE * ICON_SIZE * 4);
  drawDisc(canvas, DISC_LAYERS);
  drawDot(canvas, ...DOT_COLORS[color]);
  return nativeImage.createFromBuffer(canvas, { width: ICON_SIZE, height: ICON_SIZE, scaleFactor: 2.0 });
}

function createAnimFrame(t: number): Electron.NativeImage {
  // cosine: factor goes 1.0 → 0.0 → 1.0
  const factor = (Math.cos(2 * Math.PI * t) + 1) / 2;
  const canvas = Buffer.alloc(ICON_SIZE * ICON_SIZE * 4, 0);

  const layers = [
    { radius: DISC_LAYERS[0].radius, alpha: ANIM_RANGE.outer.min + factor * (ANIM_RANGE.outer.max - ANIM_RANGE.outer.min) },
    { radius: DISC_LAYERS[1].radius, alpha: ANIM_RANGE.mid.min + factor * (ANIM_RANGE.mid.max - ANIM_RANGE.mid.min) },
    { radius: DISC_LAYERS[2].radius, alpha: ANIM_RANGE.core.min + factor * (ANIM_RANGE.core.max - ANIM_RANGE.core.min) },
  ];

  drawDisc(canvas, layers);
  return nativeImage.createFromBuffer(canvas, { width: ICON_SIZE, height: ICON_SIZE, scaleFactor: 2.0 });
}

function generateAnimFrames(): Electron.NativeImage[] {
  const frames: Electron.NativeImage[] = [];
  for (let i = 0; i < ANIM_FRAMES; i++) {
    frames.push(createAnimFrame(i / ANIM_FRAMES));
  }
  return frames;
}

const TOOLTIPS: Record<DotColor, string> = {
  gray: 'Shrew - 待命中',
  blue: 'Shrew - 执行中',
  green: 'Shrew - 已完成',
  red: 'Shrew - 出错了',
  yellow: 'Shrew - 等待中',
  purple: 'Shrew - 执行中',
};

export class ShrewTray {
  private tray: Tray;
  private dotIcons: Record<string, Electron.NativeImage>;
  private baseIcon: Electron.NativeImage;
  private animFrames: Electron.NativeImage[];
  private animTimer: ReturnType<typeof setInterval> | null = null;
  private animIndex = 0;
  private contextMenu: Menu;

  constructor() {
    this.baseIcon = createBaseIcon();
    this.dotIcons = {
      blue: createDotIcon('blue'),
      green: createDotIcon('green'),
      red: createDotIcon('red'),
      yellow: createDotIcon('yellow'),
      purple: createDotIcon('purple'),
    };
    this.animFrames = generateAnimFrames();

    this.tray = new Tray(this.baseIcon);
    this.tray.setToolTip('Shrew - 待命中');

    this.contextMenu = Menu.buildFromTemplate([
      { label: '设置', click: () => this.openSettings() },
      { type: 'separator' },
      { label: '退出', role: 'quit' },
    ]);

    this.tray.on('click', () => this.onPopupRequested?.());
    this.tray.on('right-click', () => {
      this.contextMenu.popup();
    });
  }

  updateDot(color: DotColor): void {
    this.stopAnimation();

    if (color === 'gray') {
      this.tray.setImage(this.baseIcon);
    } else {
      const dot = this.dotIcons[color];
      if (dot) {
        this.tray.setImage(dot);
      }
    }

    this.tray.setToolTip(TOOLTIPS[color] || 'Shrew');
  }

  startAnimation(): void {
    this.stopAnimation();
    this.animIndex = 0;
    this.tray.setToolTip('Shrew - 执行中');

    this.animTimer = setInterval(() => {
      this.animIndex = (this.animIndex + 1) % ANIM_FRAMES;
      this.tray.setImage(this.animFrames[this.animIndex]);
    }, ANIM_INTERVAL);
  }

  stopAnimation(): void {
    if (this.animTimer) {
      clearInterval(this.animTimer);
      this.animTimer = null;
    }
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
    this.stopAnimation();
    this.tray.destroy();
  }
}
