import esbuild from 'esbuild';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

esbuild.build({
  entryPoints: [path.join(root, 'electron/main.ts')],
  bundle: true,
  platform: 'node',
  target: 'node22',
  outfile: path.join(root, 'dist-electron/main.js'),
  external: [
    'electron',
    'better-sqlite3',
    'sherpa-onnx-node',
    'uiohook-napi',
    '@anthropic-ai/claude-agent-sdk',
  ],
  alias: {
    '@': path.join(root, 'src'),
  },
  format: 'cjs',
  sourcemap: true,
  minify: false,
}).then(() => {
  console.log('Electron main process built to dist-electron/main.js');
}).catch((err) => {
  console.error(err);
  process.exit(1);
});
