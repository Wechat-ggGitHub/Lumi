import fs from 'fs';
import zlib from 'zlib';

const SIZE = 512;

// Purple background: #6C47FF → rounded square with 80px corner radius
const pixels = Buffer.alloc(SIZE * SIZE * 4);
const cx = SIZE / 2;
const cy = SIZE / 2;
const halfSide = SIZE / 2 - 40; // 20px margin
const cornerRadius = 80;

for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    const idx = (y * SIZE + x) * 4;

    const dx = Math.abs(x - cx);
    const dy = Math.abs(y - cy);

    let inside = true;
    if (dx > halfSide || dy > halfSide) {
      inside = false;
    } else if (dx > halfSide - cornerRadius && dy > halfSide - cornerRadius) {
      const cornerDx = dx - (halfSide - cornerRadius);
      const cornerDy = dy - (halfSide - cornerRadius);
      if (cornerDx * cornerDx + cornerDy * cornerDy > cornerRadius * cornerRadius) {
        inside = false;
      }
    }

    if (inside) {
      pixels[idx + 0] = 0x6C; // R
      pixels[idx + 1] = 0x47; // G
      pixels[idx + 2] = 0xFF; // B
      pixels[idx + 3] = 0xFF; // A
    }
  }
}

// Draw a white "S" letter (simplified pixel art, 12px grid)
const grid = [
  '  ########  ',
  ' ##      ## ',
  '##        ##',
  '##         #',
  '#          #',
  '#          #',
  '##         #',
  ' ###       #',
  '   ###    ##',
  '     ###  ##',
  '#      ### #',
  '#       ## #',
  '#       #  #',
  '##     ##  #',
  '##    ##   #',
  ' ##  ##    #',
  '  ####   ###',
  '   ##   ### ',
  '        ##  ',
  '         #  ',
];

const letterSize = 18;
const offsetX = Math.round((SIZE - grid[0].length * letterSize) / 2);
const offsetY = Math.round((SIZE - grid.length * letterSize) / 2);

for (let gy = 0; gy < grid.length; gy++) {
  for (let gx = 0; gx < grid[gy].length; gx++) {
    if (grid[gy][gx] === '#') {
      for (let py = 0; py < letterSize; py++) {
        for (let px = 0; px < letterSize; px++) {
          const pixelX = offsetX + gx * letterSize + px;
          const pixelY = offsetY + gy * letterSize + py;
          if (pixelX >= 0 && pixelX < SIZE && pixelY >= 0 && pixelY < SIZE) {
            const idx = (pixelY * SIZE + pixelX) * 4;
            pixels[idx + 0] = 0xFF;
            pixels[idx + 1] = 0xFF;
            pixels[idx + 2] = 0xFF;
            pixels[idx + 3] = 0xFF;
          }
        }
      }
    }
  }
}

// PNG encoding
const rawData = Buffer.alloc(SIZE * (SIZE * 4 + 1));
for (let y = 0; y < SIZE; y++) {
  rawData[y * (SIZE * 4 + 1)] = 0;
  pixels.copy(rawData, y * (SIZE * 4 + 1) + 1, y * SIZE * 4, (y + 1) * SIZE * 4);
}

const compressed = zlib.deflateSync(rawData);

function crc32(buf) {
  let c = 0xFFFFFFFF;
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let cc = n;
    for (let k = 0; k < 8; k++) cc = cc & 1 ? 0xEDB88320 ^ (cc >>> 1) : cc >>> 1;
    table[n] = cc;
  }
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function chunk(type, data) {
  const typeData = Buffer.concat([Buffer.from(type), data]);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeData));
  return Buffer.concat([len, typeData, crc]);
}

const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8;
ihdr[9] = 6;
ihdr[10] = 0;
ihdr[11] = 0;
ihdr[12] = 0;

const png = Buffer.concat([
  signature,
  chunk('IHDR', ihdr),
  chunk('IDAT', compressed),
  chunk('IEND', Buffer.alloc(0)),
]);

fs.mkdirSync('resources', { recursive: true });
fs.writeFileSync('resources/icon.png', png);
console.log('Icon created: resources/icon.png (' + png.length + ' bytes)');
