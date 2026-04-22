import { systemPreferences } from 'electron';
import fs from 'fs';
import path from 'path';
import { app } from 'electron';
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

  async startRecording(): Promise<void> {
    // 使用 macOS 的 afrecord 或 sox 录音
    // MVP 用 child_process 调用系统录音工具
    const { spawn } = await import('child_process');

    this.outputPath = path.join(
      path.dirname(this.outputPath),
      `recording-${Date.now()}.wav`
    );

    // 使用 macOS 内置的 afrecord（无额外依赖）
    this.recordingProcess = spawn('afrecord', [
      '-f', 'WAVE',
      '-r', '16000',
      '-c', '1',
      this.outputPath,
    ]);

    return new Promise((resolve, reject) => {
      this.recordingProcess!.on('error', (err) => reject(err));
      // 录音开始后立即 resolve（不等待结束）
      setTimeout(() => resolve(), 100);
    });
  }

  stopRecording(): Promise<string> {
    return new Promise((resolve) => {
      if (!this.recordingProcess) {
        resolve(this.outputPath);
        return;
      }

      // 发送 SIGINT 停止录音
      this.recordingProcess.kill('SIGINT');
      this.recordingProcess = null;

      // 等待文件写入完成
      setTimeout(() => resolve(this.outputPath), 200);
    });
  }

  async transcribe(audioPath?: string): Promise<string> {
    if (!this.recognizer.isLoaded) {
      await this.recognizer.load();
    }

    const filePath = audioPath || this.outputPath;
    const text = await this.recognizer.transcribe(filePath);

    // 清理临时文件
    try { fs.unlinkSync(filePath); } catch {}

    return text;
  }

  getRecognizer(): VoiceRecognizer {
    return this.recognizer;
  }
}
