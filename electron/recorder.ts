import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import { DoubaoASR } from '../src/lib/doubao-asr';
import { log } from '../src/lib/logger';

interface VolcengineCredentials {
  appId: string;
  accessToken: string;
}

export class AudioRecorder {
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
