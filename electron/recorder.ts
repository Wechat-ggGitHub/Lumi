import { systemPreferences, ipcMain, BrowserWindow } from 'electron';
import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import { DoubaoASR } from '../src/lib/doubao-asr';
import { createWavBuffer } from '../src/lib/wav-writer';
import { log } from '../src/lib/logger';

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
    this.tmpDir = path.join(app.getPath('home'), '.shrew', 'tmp');
    if (!fs.existsSync(this.tmpDir)) fs.mkdirSync(this.tmpDir, { recursive: true });

    if (credentials?.appId && credentials?.accessToken) {
      this.asr = new DoubaoASR(credentials.appId, credentials.accessToken);
      this.hasCredentials = true;
      log.info('录音器初始化: 凭证已配置, appId:', credentials.appId.slice(0, 4) + '***');
    } else {
      this.asr = new DoubaoASR('', '');
      this.hasCredentials = false;
      log.warn('录音器初始化: 未配置语音识别凭证');
    }
  }

  setWindow(win: BrowserWindow): void {
    this.win = win;
    log.info('录音器: 窗口已设置');
  }

  static async checkMicrophonePermission(): Promise<boolean> {
    return systemPreferences.askForMediaAccess('microphone');
  }

  async startRecording(): Promise<void> {
    if (!this.win || this.win.isDestroyed()) {
      log.error('录音器: 窗口不可用');
      throw new Error('语音窗口不可用');
    }

    log.info('录音器: 请求麦克风权限');
    const granted = await systemPreferences.askForMediaAccess('microphone');
    if (!granted) {
      log.error('录音器: 麦克风权限被拒绝');
      throw new Error('麦克风访问被拒绝，请在系统设置中允许麦克风权限');
    }
    log.info('录音器: 麦克风权限已获取');

    return new Promise((resolve, reject) => {
      if (!this.win || this.win.isDestroyed()) {
        return reject(new Error('语音窗口不可用'));
      }

      const timeout = setTimeout(() => {
        log.error('录音器: 录音启动超时 (10s)');
        reject(new Error('录音启动超时'));
      }, 10000);

      ipcMain.once('voice:capture-started', (_event, success: boolean) => {
        clearTimeout(timeout);
        log.info('录音器: capture-started 回调, success:', success);
        if (success) resolve();
        else reject(new Error('麦克风访问被拒绝，请在系统设置中允许麦克风权限'));
      });

      log.info('录音器: 发送 voice:start-capture 到渲染进程');
      this.win.webContents.send('voice:start-capture');
    });
  }

  stopRecording(): Promise<string> {
    const outputPath = path.join(this.tmpDir, `recording-${Date.now()}.wav`);
    log.info('录音器: 停止录音, 输出路径:', outputPath);

    return new Promise((resolve) => {
      if (!this.win || this.win.isDestroyed()) {
        log.warn('录音器: 窗口不可用，返回空路径');
        resolve(outputPath);
        return;
      }

      ipcMain.once('voice:audio-data', (_event, data: { samples: Float32Array; sampleRate: number }) => {
        const buffer = createWavBuffer(data.samples, data.sampleRate);
        fs.writeFileSync(outputPath, buffer);
        log.info('录音器: 音频已写入, 大小:', buffer.length, 'bytes, 采样率:', data.sampleRate);
        resolve(outputPath);
      });

      this.win.webContents.send('voice:stop-capture');
    });
  }

  async transcribeFile(wavPath: string): Promise<string> {
    return this.transcribe(wavPath);
  }

  async transcribe(audioPath?: string): Promise<string> {
    if (!this.hasCredentials) {
      log.error('录音器: 未配置语音识别凭证');
      throw new Error('请先在设置中配置火山引擎语音识别凭证');
    }

    const filePath = audioPath || '';

    if (!filePath || !fs.existsSync(filePath)) {
      log.error('录音器: 音频文件不存在:', filePath);
      throw new Error('音频文件不存在');
    }

    const stat = fs.statSync(filePath);
    log.info('录音器: 开始转写, 文件:', filePath, '大小:', stat.size, 'bytes');
    if (stat.size < 44) {
      log.error('录音器: 音频文件过小:', stat.size, 'bytes');
      throw new Error('音频文件过小，可能录制失败');
    }

    try {
      const text = await this.asr.transcribe(filePath);
      log.info('录音器: 转写完成, 结果长度:', text.length, '内容:', text.slice(0, 50));

      try { fs.unlinkSync(filePath); } catch {}
      return text;
    } catch (err) {
      log.error('录音器: 转写失败:', err);
      try { fs.unlinkSync(filePath); } catch {}
      throw err;
    }
  }
}
