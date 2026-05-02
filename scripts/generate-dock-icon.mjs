import sharp from 'sharp';

const SIZE = 1024;

const SUPERELLIPSE_N = 5;

// Raw superellipse distance: <1 inside, =1 boundary, >1 outside
function superellipseDist(x, y) {
  const r = SIZE / 2;
  const nx = (x - r) / r;
  const ny = (y - r) / r;
  return Math.pow(Math.abs(nx), SUPERELLIPSE_N) + Math.pow(Math.abs(ny), SUPERELLIPSE_N);
}

// macOS squircle (superellipse n=5 approximation)
// Returns opacity 0..1 for a point (x,y) within SIZE x SIZE
function squircleOpacity(x, y) {
  const dist = superellipseDist(x, y);

  if (dist >= 1) {
    // Anti-alias: 1px soft edge
    // Compute the distance in pixels from the boundary
    // Approximate: check at sub-pixel offsets
    const r = SIZE / 2;
    const nx = (x - r) / r;
    const ny = (y - r) / r;
    const aaSamples = 4;
    let insideCount = 0;
    for (let sy = 0; sy < aaSamples; sy++) {
      for (let sx = 0; sx < aaSamples; sx++) {
        const ox = (sx - (aaSamples - 1) / 2) / (aaSamples * r);
        const oy = (sy - (aaSamples - 1) / 2) / (aaSamples * r);
        const d = Math.pow(Math.abs(nx + ox), SUPERELLIPSE_N) + Math.pow(Math.abs(ny + oy), SUPERELLIPSE_N);
        if (d < 1) insideCount++;
      }
    }
    return insideCount / (aaSamples * aaSamples);
  }
  return 1.0;
}

// Parse hex color to [r, g, b]
function hexToRgb(hex) {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

// Multi-stop radial gradient
function radialGradient(px, py, centerX, centerY, radius, stops) {
  const dx = px - centerX;
  const dy = py - centerY;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const t = Math.min(dist / radius, 1.0);

  // Find the two stops we're between
  let lower = stops[0];
  let upper = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i++) {
    if (t >= stops[i].pos && t <= stops[i + 1].pos) {
      lower = stops[i];
      upper = stops[i + 1];
      break;
    }
  }

  // Interpolate
  const range = upper.pos - lower.pos;
  const localT = range > 0 ? (t - lower.pos) / range : 0;
  const [r1, g1, b1] = hexToRgb(lower.color);
  const [r2, g2, b2] = hexToRgb(upper.color);
  const a1 = lower.alpha;
  const a2 = upper.alpha;

  return {
    r: Math.round(r1 + (r2 - r1) * localT),
    g: Math.round(g1 + (g2 - g1) * localT),
    b: Math.round(b1 + (b2 - b1) * localT),
    a: a1 + (a2 - a1) * localT,
  };
}

// Alpha blend: composite src over dst (premultiplied-ish)
function blendOver(dst, src) {
  const srcA = src.a;
  const dstA = dst.a;
  const outA = srcA + dstA * (1 - srcA);
  if (outA === 0) return { r: 0, g: 0, b: 0, a: 0 };
  return {
    r: Math.round((src.r * srcA + dst.r * dstA * (1 - srcA)) / outA),
    g: Math.round((src.g * srcA + dst.g * dstA * (1 - srcA)) / outA),
    b: Math.round((src.b * srcA + dst.b * dstA * (1 - srcA)) / outA),
    a: outA,
  };
}

const pixels = Buffer.alloc(SIZE * SIZE * 4);
const cx = SIZE / 2;
const cy = SIZE / 2;

// Orb parameters
const orbRadius = SIZE * 0.32; // ~328px at 1024
const orbCenterY = cy - SIZE * 0.00; // centered vertically
const orbCenterX = cx;

// Core highlight parameters
const highlightOffsetY = -SIZE * 0.08; // 8% up
const highlightRadius = orbRadius * 0.35;
const highlightCX = cx;
const highlightCY = cy + highlightOffsetY;

// Reflection bar parameters
const reflectRX = orbRadius * 0.38;
const reflectRY = orbRadius * 0.18;
const reflectCX = cx;
const reflectCY = cy - orbRadius * 0.25; // above center
const reflectAlpha = 0.08;

// Orb gradient stops
const orbStops = [
  { pos: 0.0, color: '#ff6b9d', alpha: 0.95 },
  { pos: 0.2, color: '#c44dff', alpha: 0.80 },
  { pos: 0.5, color: '#6e8efb', alpha: 0.50 },
  { pos: 0.8, color: '#1e1b4b', alpha: 0.30 },
  { pos: 1.0, color: '#0f0a1e', alpha: 0.00 },
];

// Core highlight gradient stops
const highlightStops = [
  { pos: 0.0, color: '#ffffff', alpha: 0.70 },
  { pos: 0.35, color: '#f0d0ff', alpha: 0.35 },
  { pos: 1.0, color: '#c44dff', alpha: 0.00 },
];

const bgColor = hexToRgb('#0f0a1e');

for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    const idx = (y * SIZE + x) * 4;

    // Check squircle shape
    const shapeA = squircleOpacity(x, y);

    if (shapeA === 0) {
      // Fully outside squircle - transparent
      pixels[idx + 0] = 0;
      pixels[idx + 1] = 0;
      pixels[idx + 2] = 0;
      pixels[idx + 3] = 0;
      continue;
    }

    // Start with background color
    let current = { r: bgColor[0], g: bgColor[1], b: bgColor[2], a: 1.0 };

    // Draw orb (radial gradient)
    const orb = radialGradient(x, y, orbCenterX, orbCenterY, orbRadius, orbStops);
    current = blendOver(current, orb);

    // Draw core highlight (on top of orb)
    const hl = radialGradient(x, y, highlightCX, highlightCY, highlightRadius, highlightStops);
    current = blendOver(current, hl);

    // Draw reflection bar (ellipse at top)
    const rdx = (x - reflectCX) / reflectRX;
    const rdy = (y - reflectCY) / reflectRY;
    const inReflection = (rdx * rdx + rdy * rdy) < 1.0;
    if (inReflection) {
      // Soft edge
      const reflectDist = Math.sqrt(rdx * rdx + rdy * rdy);
      const edgeAlpha = reflectDist > 0.85 ? reflectAlpha * (1.0 - (reflectDist - 0.85) / 0.15) : reflectAlpha;
      current = blendOver(current, { r: 255, g: 255, b: 255, a: Math.max(0, edgeAlpha) });
    }

    // 1px white border along squircle edge (alpha 0.06)
    const rawDist = superellipseDist(x, y);
    if (rawDist >= 0.95 && rawDist <= 1.05) {
      current = blendOver(current, { r: 255, g: 255, b: 255, a: 0.06 });
    }

    // Apply squircle shape mask
    pixels[idx + 0] = current.r;
    pixels[idx + 1] = current.g;
    pixels[idx + 2] = current.b;
    pixels[idx + 3] = Math.round(current.a * shapeA * 255);
  }
}

// Write using sharp
await sharp(Buffer.from(pixels.buffer), {
  raw: { width: SIZE, height: SIZE, channels: 4 },
})
  .png()
  .toFile('resources/icon.png');

console.log(`Dock icon generated: resources/icon.png (${SIZE}x${SIZE})`);
