# Shrew Icon Design Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 替换 Shrew 的 Dock 图标和菜单栏 Tray 图标为设计稿中的光球风格。

**Architecture:** Dock 图标通过生成 1024x1024 PNG 替换 `resources/icon.png`；Tray 图标通过修改 `electron/tray.ts` 中的像素绘制逻辑实现 4 层渐变圆盘 + 右上角状态点。

**Tech Stack:** Node.js (canvas 像素绘制), Electron NativeImage, sharp (图像生成)

**Spec:** `docs/superpowers/specs/2026-05-03-icon-design.md`

---

### Task 1: 生成 1024x1024 Dock 图标

**Files:**
- Create: `scripts/generate-dock-icon.mjs` (临时脚本，用完可删)
- Modify: `resources/icon.png`

- [ ] **Step 1: 安装 sharp 用于图像生成**

Run: `npm install --save-dev sharp`

- [ ] **Step 2: 编写图标生成脚本**

Create `scripts/generate-dock-icon.mjs`:

```javascript
import sharp from 'sharp';
import { mkdirSync } from 'fs';

const SIZE = 1024;
const canvas = Buffer.alloc(SIZE * SIZE * 4, 0);

// Squircle 路径参数
const rectSize = SIZE;
const cornerRadius = rectSize * 0.22; // macOS 标准 ~22%
const cx = SIZE / 2;
const cy = SIZE / 2;

// 检查点是否在 squircle 内
function isInSquircle(x, y) {
  const nx = (x - cx) / (rectSize / 2 - 2);
  const ny = (y - cy) / (rectSize / 2 - 2);
  // superellipse |x|^n + |y|^n <= 1, n=5 近似 macOS squircle
  return Math.pow(Math.abs(nx), 5) + Math.pow(Math.abs(ny), 5) <= 1;
}

// 背景色 #0f0a1e
const bgR = 15, bgG = 10, bgB = 30;

// 光球渐变色 #ff6b9d -> #c44dff -> #6e8efb -> #1e1b4b -> #0f0a1e
function orbGradient(dist) {
  // dist: 0 (center) to 1 (edge)
  let r, g, b, a;
  if (dist <= 0.2) {
    const t = dist / 0.2;
    r = lerp(255, 196, t);
    g = lerp(107, 77, t);
    b = lerp(157, 255, t);
    a = lerp(0.95, 0.8, t);
  } else if (dist <= 0.5) {
    const t = (dist - 0.2) / 0.3;
    r = lerp(196, 110, t);
    g = lerp(77, 142, t);
    b = lerp(255, 251, t);
    a = lerp(0.8, 0.5, t);
  } else if (dist <= 0.8) {
    const t = (dist - 0.5) / 0.3;
    r = lerp(110, 30, t);
    g = lerp(142, 27, t);
    b = lerp(251, 75, t);
    a = lerp(0.5, 0.3, t);
  } else {
    const t = (dist - 0.8) / 0.2;
    r = lerp(30, bgR, t);
    g = lerp(27, bgG, t);
    b = lerp(75, bgB, t);
    a = lerp(0.3, 0.0, t);
  }
  return { r, g, b, a };
}

function lerp(a, b, t) { return a + (b - a) * t; }

// 核心高光参数
const coreOffsetY = -0.08; // 偏上方 cy 的 -8%
const coreRadius = 0.35; // 相对光球半径

function coreGradient(dist) {
  let a;
  if (dist <= 0.35) {
    const t = dist / 0.35;
    a = lerp(0.7, 0.35, t);
  } else {
    const t = (dist - 0.35) / 0.65;
    a = lerp(0.35, 0.0, t);
  }
  // 白色到淡紫
  const t = Math.min(dist / 0.5, 1.0);
  const r = lerp(255, 240, t);
  const g = lerp(255, 208, t);
  const b = lerp(255, 255, t);
  return { r, g, b, a };
}

const orbRadius = SIZE * 0.32; // 约占框体 65% 的一半

for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    const idx = (y * SIZE + x) * 4;

    if (!isInSquircle(x, y)) {
      // 透明
      canvas[idx] = 0;
      canvas[idx + 1] = 0;
      canvas[idx + 2] = 0;
      canvas[idx + 3] = 0;
      continue;
    }

    // 背景
    let outR = bgR, outG = bgG, outB = bgB, outA = 255;

    // 光球
    const dx = x - cx;
    const dy = y - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const normalizedDist = dist / orbRadius;

    if (normalizedDist <= 1.0) {
      const orb = orbGradient(normalizedDist);
      outR = orb.r; outG = orb.g; outB = orb.b;
      outA = Math.round(orb.a * 255);
    }

    // 核心高光（叠加）
    const coreCX = cx;
    const coreCY = cy + orbRadius * coreOffsetY;
    const cdx = x - coreCX;
    const cdy = y - coreCY;
    const coreDist = Math.sqrt(cdx * cdx + cdy * cdy);
    const coreNormalized = coreDist / (orbRadius * coreRadius);

    if (coreNormalized <= 1.0) {
      const core = coreGradient(coreNormalized);
      const coreA = core.a;
      // Alpha blend
      outR = Math.round(core.r * coreA + outR * (1 - coreA));
      outG = Math.round(core.g * coreA + outG * (1 - coreA));
      outB = Math.round(core.b * coreA + outB * (1 - coreA));
    }

    // 反光条（顶部椭圆）
    const refCX = cx - orbRadius * 0.08;
    const refCY = cy - orbRadius * 0.38;
    const rdx = (x - refCX) / (orbRadius * 0.38);
    const rdy = (y - refCY) / (orbRadius * 0.18);
    const refDist = rdx * rdx + rdy * rdy;
    if (refDist <= 1.0) {
      const refA = 0.08;
      outR = Math.round(255 * refA + outR * (1 - refA));
      outG = Math.round(255 * refA + outG * (1 - refA));
      outB = Math.round(255 * refA + outB * (1 - refA));
    }

    canvas[idx] = outR;
    canvas[idx + 1] = outG;
    canvas[idx + 2] = outB;
    canvas[idx + 3] = outA;
  }
}

sharp(canvas, { raw: { width: SIZE, height: SIZE, channels: 4 } })
  .png()
  .toFile('resources/icon.png')
  .then(() => console.log('Generated resources/icon.png'))
  .catch(err => console.error(err));
```

- [ ] **Step 3: 运行脚本生成图标**

Run: `node scripts/generate-dock-icon.mjs`
Expected: 输出 `Generated resources/icon.png`

- [ ] **Step 4: 检查生成的图标**

Run: `sips -g pixelWidth -g pixelHeight -g format resources/icon.png`
Expected: 1024x1024, PNG format。目视检查图标效果。

- [ ] **Step 5: 提交**

```bash
git add resources/icon.png scripts/generate-dock-icon.mjs
git commit -m "feat: generate orb-style Dock icon (1024x1024)"
```

---

### Task 2: 重写 Tray 图标为 4 层渐变圆盘 + 右上角状态点

**Files:**
- Modify: `electron/tray.ts:1-70` (替换 `createBaseIcon` 和 `createDotIcon`)

**参考:** 当前 `createBaseIcon()` 在 `electron/tray.ts:5-33`，`createDotIcon()` 在 `electron/tray.ts:35-70`

- [ ] **Step 1: 替换 `createBaseIcon` 为 4 层渐变圆盘**

将 `electron/tray.ts` 的第 4-33 行替换为：

```typescript
// 生成 Template 图标 (22x22)：4 层渐变圆盘
function createBaseIcon(): Electron.NativeImage {
  const size = 22;
  const canvas = Buffer.alloc(size * size * 4, 0);

  const center = size / 2;

  // 4 层渐变圆盘参数（半径, alpha）
  const layers = [
    { radius: 9.5, alpha: 0.10 },  // 外层
    { radius: 6.8, alpha: 0.18 },  // 中外
    { radius: 4.1, alpha: 0.35 },  // 中内
    { radius: 1.4, alpha: 1.00 },  // 核心
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

      canvas[idx] = 0;
      canvas[idx + 1] = 0;
      canvas[idx + 2] = 0;
      canvas[idx + 3] = Math.round(alpha * 255);
    }
  }

  const image = nativeImage.createFromBuffer(canvas, {
    width: size,
    height: size,
    scaleFactor: 2.0,
  });
  image.setTemplateImage(true);
  return image;
}
```

- [ ] **Step 2: 替换 `createDotIcon` 为圆盘 + 右上角状态点**

将 `electron/tray.ts` 的第 35-70 行替换为：

```typescript
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

      canvas[idx] = 0;
      canvas[idx + 1] = 0;
      canvas[idx + 2] = 0;
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
```

- [ ] **Step 3: 验证构建**

Run: `npm run build:electron`
Expected: 构建成功，无 TypeScript 错误

- [ ] **Step 4: 提交**

```bash
git add electron/tray.ts
git commit -m "feat: redesign tray icon as 4-layer gradient disc with upper-right status dot"
```

---

### Task 3: 端到端验证

- [ ] **Step 1: 运行 Electron 开发模式验证**

Run: `npm run electron:dev`
Expected: 菜单栏 Tray 图标显示为渐变圆盘（非纯黑圆），状态点在右上角

- [ ] **Step 2: 验证状态切换**

触发不同状态（录音/执行/错误），确认状态点颜色正确切换：
- idle → 灰色
- recording → 蓝色
- executing → 绿色
- error → 红色
- editing → 黄色

- [ ] **Step 3: 验证构建打包**

Run: `npm run electron:build`
Expected: DMG 中 Dock 图标为紫蓝青光球（非默认 Electron 图标）

- [ ] **Step 4: 清理临时脚本（可选）**

如果 `scripts/generate-dock-icon.mjs` 不再需要：

```bash
git rm scripts/generate-dock-icon.mjs
git commit -m "chore: remove temporary icon generation script"
```
