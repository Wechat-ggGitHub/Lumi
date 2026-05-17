import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import { AsrProvider } from './voice-providers/types';
import { log } from '../src/lib/logger';

export class AudioRecorder {
  private tmpDir: string;
  private provider: AsrProvider;
  private hasCredentials: boolean;

  constructor(provider: AsrProvider | null) {
    this.tmpDir = path.join(app.getPath('home'), '.lumi', 'tmp');
    if (!fs.existsSync(this.tmpDir)) fs.mkdirSync(this.tmpDir, { recursive: true });

    if (provider) {
      this.provider = provider;
      this.hasCredentials = true;
      log.info('录音器初始化: 凭证已配置');
    } else {
      this.provider = null as unknown as AsrProvider;
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
      throw new Error('请先在设置中配置语音识别服务凭证');
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
      const result = await this.provider.transcribe(filePath);
      log.info('录音器: 转写完成, 结果长度:', result.text.length, '内容:', result.text.slice(0, 50));

      try { fs.unlinkSync(filePath); } catch {}
      return result.text;
    } catch (err) {
      log.error('录音器: 转写失败:', err);
      try { fs.unlinkSync(filePath); } catch {}
      throw err;
    }
  }
}
