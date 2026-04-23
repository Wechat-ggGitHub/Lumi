import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const standaloneModules = path.join(root, '.next', 'standalone', 'node_modules');

const nativeDeps = [
  'better-sqlite3',
  'sherpa-onnx-node',
  'sherpa-onnx-darwin-arm64',
];

if (!fs.existsSync(standaloneModules)) {
  console.error('Standalone node_modules not found. Run `next build` first.');
  process.exit(1);
}

for (const dep of nativeDeps) {
  const src = path.join(root, 'node_modules', dep);
  const dest = path.join(standaloneModules, dep);
  if (!fs.existsSync(src)) {
    console.warn(`Skipping ${dep}: not found in node_modules`);
    continue;
  }
  if (fs.existsSync(dest)) {
    console.log(`Already exists: ${dep}`);
    continue;
  }
  fs.cpSync(src, dest, { recursive: true });
  console.log(`Copied: ${dep}`);
}

console.log('Native deps copy complete.');
