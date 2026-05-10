import path from 'path';
import fs from 'fs';
import { app } from 'electron';
import { log } from '../src/lib/logger';

const RENDERER_HTML = `<!DOCTYPE html>
<html>
<body>
<script>
const { ipcRenderer } = require('electron');

let audioContext = null;
let stream = null;
let processor = null;
let silenceGain = null;

ipcRenderer.on('audio-listener:start', () => {
  (async () => {
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });

      audioContext = new AudioContext({ sampleRate: 16000 });
      if (audioContext.state === 'suspended') {
        await audioContext.resume();
      }

      const source = audioContext.createMediaStreamSource(stream);
      processor = audioContext.createScriptProcessor(4096, 1, 1);

      silenceGain = audioContext.createGain();
      silenceGain.gain.value = 0;

      source.connect(processor);
      processor.connect(silenceGain);
      silenceGain.connect(audioContext.destination);

      processor.onaudioprocess = (e) => {
        const data = e.inputBuffer.getChannelData(0);
        ipcRenderer.send('audio-listener:pcm-chunk', new Float32Array(data));
      };

      ipcRenderer.send('audio-listener:started');
    } catch (err) {
      ipcRenderer.send('audio-listener:error', err.message || String(err));
    }
  })();
});

ipcRenderer.on('audio-listener:stop', () => {
  if (processor) { processor.disconnect(); processor = null; }
  if (silenceGain) { silenceGain.disconnect(); silenceGain = null; }
  if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
  if (audioContext) { audioContext.close(); audioContext = null; }
});
</script>
</body>
</html>`;

export type ListenerMode = 'wake-word' | 'recording' | 'continuous-chat';

export class AudioListener {
  private win: Electron.BrowserWindow | null = null;
  private capturing = false;
  private chunkHandler: ((chunk: Float32Array) => void) | null = null;
  private _mode: ListenerMode = 'wake-word';

  get mode(): ListenerMode { return this._mode; }

  setMode(mode: ListenerMode): void {
    this._mode = mode;
    log.info(`AudioListener: 模式切换为 ${mode}`);
  }

  create(): void {
    const { BrowserWindow } = require('electron') as typeof import('electron');

    if (this.win && !this.win.isDestroyed()) return;

    this.win = new BrowserWindow({
      width: 1,
      height: 1,
      show: false,
      skipTaskbar: true,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
      },
    });

    // data: URL 不是安全上下文，navigator.mediaDevices 不可用
    // 用 file:// 加载以确保 getUserMedia 可用
    const tmpDir = path.join(app.getPath('temp'), 'aiva');
    fs.mkdirSync(tmpDir, { recursive: true });
    const htmlPath = path.join(tmpDir, 'audio-listener.html');
    fs.writeFileSync(htmlPath, RENDERER_HTML, 'utf-8');
    this.win.loadFile(htmlPath);
    log.info('AudioListener: hidden window created');
  }

  registerChunkHandler(handler: (chunk: Float32Array) => void): void {
    const { ipcMain } = require('electron') as typeof import('electron');

    if (this.chunkHandler) return;
    this.chunkHandler = handler;
    ipcMain.on('audio-listener:pcm-chunk', this._onChunk);
    log.info('AudioListener: chunk handler registered');
  }

  private _onChunk = (_event: Electron.IpcMainEvent, chunk: Float32Array): void => {
    if (this.chunkHandler) {
      this.chunkHandler(chunk);
    }
  };

  async start(): Promise<void> {
    const { ipcMain } = require('electron') as typeof import('electron');

    if (!this.win || this.win.isDestroyed()) {
      this.create();
    }

    // 等待页面加载完成，确保 navigator.mediaDevices 可用
    if (this.win!.webContents.isLoading()) {
      await new Promise<void>(resolve => {
        this.win!.webContents.once('did-finish-load', resolve);
      });
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        ipcMain.removeListener('audio-listener:started', onStarted);
        ipcMain.removeListener('audio-listener:error', onError);
        this.capturing = false;
        reject(new Error('AudioListener start timed out (10s)'));
      }, 10000);

      const onStarted = () => {
        clearTimeout(timeout);
        ipcMain.removeListener('audio-listener:error', onError);
        this.capturing = true;
        log.info('AudioListener: capture started');
        resolve();
      };

      const onError = (_event: Electron.IpcMainEvent, errMsg: string) => {
        clearTimeout(timeout);
        ipcMain.removeListener('audio-listener:started', onStarted);
        this.capturing = false;
        log.error('AudioListener: start error:', errMsg);
        reject(new Error(errMsg));
      };

      ipcMain.once('audio-listener:started', onStarted);
      ipcMain.once('audio-listener:error', onError);

      this.win!.webContents.send('audio-listener:start');
    });
  }

  stop(): void {
    if (!this.capturing) return;

    if (this.win && !this.win.isDestroyed()) {
      this.win.webContents.send('audio-listener:stop');
    }

    this.capturing = false;
    log.info('AudioListener: capture stopped');
  }

  destroy(): void {
    this.stop();

    if (this.chunkHandler) {
      const { ipcMain } = require('electron') as typeof import('electron');
      ipcMain.removeListener('audio-listener:pcm-chunk', this._onChunk);
      this.chunkHandler = null;
    }

    if (this.win && !this.win.isDestroyed()) {
      this.win.close();
      this.win = null;
    }

    log.info('AudioListener: destroyed');
  }

  isActive(): boolean {
    return this.capturing;
  }
}
