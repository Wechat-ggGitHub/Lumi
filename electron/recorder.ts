import { systemPreferences } from 'electron';
import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import { spawn } from 'child_process';
import { VoiceRecognizer } from '../src/lib/sherpa';

export class AudioRecorder {
  private recordingProcess: import('child_process').ChildProcess | null = null;
  private outputPath: string;
  private recognizer: VoiceRecognizer;

  constructor() {
    const tmpDir = path.join(app.getPath('userData'), 'tmp');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    this.outputPath = path.join(tmpDir, `recording-${Date.now()}.wav`);
    this.recognizer = new VoiceRecognizer();
  }

  static async checkMicrophonePermission(): Promise<boolean> {
    return systemPreferences.askForMediaAccess('microphone');
  }

  static checkRecordingAvailable(): boolean {
    try {
      const result = require('child_process').spawnSync('ffmpeg', ['-version'], { timeout: 3000 });
      return result.status === 0;
    } catch {
      return false;
    }
  }

  async startRecording(): Promise<void> {
    this.outputPath = path.join(
      path.dirname(this.outputPath),
      `recording-${Date.now()}.wav`
    );

    this.recordingProcess = spawn('ffmpeg', [
      '-loglevel', 'error',
      '-f', 'avfoundation',
      '-i', ':0',
      '-acodec', 'pcm_s16le',
      '-ar', '16000',
      '-ac', '1',
      '-y',
      this.outputPath,
    ], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    return new Promise((resolve, reject) => {
      let settled = false;

      const settle = (fn: () => void) => {
        if (settled) return;
        settled = true;
        fn();
      };

      this.recordingProcess!.on('error', (err) => {
        settle(() => reject(new Error(`录音启动失败，请确保已安装 ffmpeg: ${err.message}`)));
      });

      this.recordingProcess!.on('exit', (code) => {
        if (code !== 0 && code !== null) {
          settle(() => reject(new Error(`录音进程异常退出 (code: ${code})`)));
        }
      });

      // ffmpeg 启动需要一点时间初始化 avfoundation
      setTimeout(() => {
        settle(() => {
          if (this.recordingProcess && !this.recordingProcess.killed) {
            resolve();
          } else {
            reject(new Error('录音启动失败'));
          }
        });
      }, 800);
    });
  }

  stopRecording(): Promise<string> {
    return new Promise((resolve) => {
      if (!this.recordingProcess) {
        resolve(this.outputPath);
        return;
      }

      try {
        this.recordingProcess.stdin.write('q');
      } catch {
        this.recordingProcess.kill('SIGINT');
      }
      this.recordingProcess = null;

      setTimeout(() => resolve(this.outputPath), 500);
    });
  }

  async transcribe(audioPath?: string): Promise<string> {
    if (!this.recognizer.isLoaded) {
      console.log('[recorder] Loading voice model...');
      await this.recognizer.load();
      console.log('[recorder] Voice model loaded successfully');
    }

    const filePath = audioPath || this.outputPath;

    if (!fs.existsSync(filePath)) {
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
