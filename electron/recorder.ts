import { systemPreferences, ipcMain, BrowserWindow } from 'electron';
import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import { VoiceRecognizer } from '../src/lib/sherpa';
import { createWavBuffer } from '../src/lib/wav-writer';

export class AudioRecorder {
  private win: BrowserWindow | null = null;
  private tmpDir: string;
  private recognizer: VoiceRecognizer;

  constructor() {
    this.tmpDir = path.join(app.getPath('userData'), 'tmp');
    if (!fs.existsSync(this.tmpDir)) fs.mkdirSync(this.tmpDir, { recursive: true });
    this.recognizer = new VoiceRecognizer();
  }

  setWindow(win: BrowserWindow): void {
    this.win = win;
  }

  static async checkMicrophonePermission(): Promise<boolean> {
    return systemPreferences.askForMediaAccess('microphone');
  }

  async startRecording(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.win || this.win.isDestroyed()) {
        return reject(new Error('语音窗口不可用'));
      }

      const timeout = setTimeout(() => {
        reject(new Error('录音启动超时'));
      }, 5000);

      ipcMain.once('voice:capture-started', (_event, success: boolean) => {
        clearTimeout(timeout);
        if (success) resolve();
        else reject(new Error('麦克风访问被拒绝，请在系统设置中允许麦克风权限'));
      });

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
    if (!this.recognizer.isLoaded) {
      console.log('[recorder] Loading voice model...');
      await this.recognizer.load();
      console.log('[recorder] Voice model loaded successfully');
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

    const text = await this.recognizer.transcribe(filePath);
    console.log(`[recorder] Transcription result: "${text}" (length: ${text.length})`);

    try { fs.unlinkSync(filePath); } catch {}

    return text;
  }

  getRecognizer(): VoiceRecognizer {
    return this.recognizer;
  }
}
