import { systemPreferences, ipcMain, BrowserWindow } from 'electron';
import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import { DoubaoASR } from '../src/lib/doubao-asr';
import { createWavBuffer } from '../src/lib/wav-writer';

interface VolcengineCredentials {
  appId: string;
  accessToken: string;
}

export class AudioRecorder {
  private win: BrowserWindow | null = null;
  private tmpDir: string;
  private asr: DoubaoASR;
  private hasCredentials: boolean;

  constructor(credentials?: VolcengineCredentials | null) {
    this.tmpDir = path.join(app.getPath('userData'), 'tmp');
    if (!fs.existsSync(this.tmpDir)) fs.mkdirSync(this.tmpDir, { recursive: true });

    if (credentials?.appId && credentials?.accessToken) {
      this.asr = new DoubaoASR(credentials.appId, credentials.accessToken);
      this.hasCredentials = true;
    } else {
      this.asr = new DoubaoASR('', '');
      this.hasCredentials = false;
    }
  }

  setWindow(win: BrowserWindow): void {
    this.win = win;
  }

  static async checkMicrophonePermission(): Promise<boolean> {
    return systemPreferences.askForMediaAccess('microphone');
  }

  async startRecording(): Promise<void> {
    if (!this.win || this.win.isDestroyed()) {
      throw new Error('语音窗口不可用');
    }

    const granted = await systemPreferences.askForMediaAccess('microphone');
    if (!granted) {
      throw new Error('麦克风访问被拒绝，请在系统设置中允许麦克风权限');
    }

    return new Promise((resolve, reject) => {
      if (!this.win || this.win.isDestroyed()) {
        return reject(new Error('语音窗口不可用'));
      }

      const timeout = setTimeout(() => {
        reject(new Error('录音启动超时'));
      }, 10000);

      ipcMain.once('voice:capture-started', (_event, success: boolean) => {
        clearTimeout(timeout);
        console.log('[recorder] Received capture-started:', success);
        if (success) resolve();
        else reject(new Error('麦克风访问被拒绝，请在系统设置中允许麦克风权限'));
      });

      console.log('[recorder] Sending voice:start-capture to window');
      this.win.webContents.send('voice:start-capture');
    });
  }

  stopRecording(): Promise<string> {
    const outputPath = path.join(this.tmpDir, `recording-${Date.now()}.wav`);

    return new Promise((resolve) => {
      if (!this.win || this.win.isDestroyed()) {
        resolve(outputPath);
        return;
      }

      ipcMain.once('voice:audio-data', (_event, data: { samples: Float32Array; sampleRate: number }) => {
        const buffer = createWavBuffer(data.samples, data.sampleRate);
        fs.writeFileSync(outputPath, buffer);
        resolve(outputPath);
      });

      this.win.webContents.send('voice:stop-capture');
    });
  }

  async transcribe(audioPath?: string): Promise<string> {
    if (!this.hasCredentials) {
      throw new Error('请先在设置中配置火山引擎语音识别凭证');
    }

    const filePath = audioPath || '';

    if (!filePath || !fs.existsSync(filePath)) {
      console.error('[recorder] Audio file not found:', filePath);
      throw new Error('音频文件不存在');
    }

    const stat = fs.statSync(filePath);
    console.log(`[recorder] Audio file: ${filePath} (${stat.size} bytes)`);
    if (stat.size < 44) {
      throw new Error('音频文件过小，可能录制失败');
    }

    const text = await this.asr.transcribe(filePath);
    console.log(`[recorder] Transcription result: "${text}" (length: ${text.length})`);

    try { fs.unlinkSync(filePath); } catch {}

    return text;
  }
}
