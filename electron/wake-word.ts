import path from 'path';
import fs from 'fs';
import os from 'os';
import { app } from 'electron';
import { chineseToKeyword } from '../src/lib/pinyin-keyword';
import { log } from '../src/lib/logger';

const { KeywordSpotter } = require('sherpa-onnx-node');

export class WakeWordEngine {
  private kws: any = null;
  private stream: any = null;
  private keyword: string = '';
  private keywordsFilePath: string = '';
  private active = false;

  get isEnabled(): boolean {
    return this.kws !== null;
  }

  init(keyword: string): void {
    const resourcesDir = app.isPackaged
      ? path.join(process.resourcesPath, 'sherpa-onnx', 'kws')
      : path.join(app.getAppPath(), 'resources', 'sherpa-onnx', 'kws');

    // Write keywords to temp file
    this.keywordsFilePath = path.join(os.tmpdir(), `shrew-keywords-${Date.now()}.txt`);
    this.keyword = keyword;
    this.writeKeywordsFile(keyword);

    this.kws = new KeywordSpotter({
      modelConfig: {
        transducer: {
          encoder: path.join(resourcesDir, 'encoder-epoch-12-avg-2-chunk-16-left-64.onnx'),
          decoder: path.join(resourcesDir, 'decoder-epoch-12-avg-2-chunk-16-left-64.onnx'),
          joiner: path.join(resourcesDir, 'joiner-epoch-12-avg-2-chunk-16-left-64.onnx'),
        },
        tokens: path.join(resourcesDir, 'tokens.txt'),
      },
      keywordsFile: this.keywordsFilePath,
      keywordsScore: 1.0,
      keywordsThreshold: 0.25,
      maxActivePaths: 4,
      numTrailingBlanks: 1,
    });

    this.stream = this.kws.createStream();
    log.info('WakeWordEngine: 初始化完成, 关键词:', keyword);
  }

  private writeKeywordsFile(keyword: string): void {
    const keywordStr = chineseToKeyword(keyword);
    fs.writeFileSync(this.keywordsFilePath, keywordStr + '\n', 'utf-8');
  }

  updateKeyword(keyword: string): void {
    if (!this.kws) return;
    this.keyword = keyword;
    // Must recreate KWS when keyword changes (no runtime keyword update API)
    this.stream = null;
    this.kws = null;
    this.init(keyword);
    if (this.active) {
      // Re-activate after recreation
    }
  }

  feed(samples: Float32Array): string | null {
    if (!this.active || !this.kws || !this.stream) return null;

    this.stream.acceptWaveform({ samples, sampleRate: 16000 });

    while (this.kws.isReady(this.stream)) {
      this.kws.decode(this.stream);
      const result = this.kws.getResult(this.stream);
      if (result.keyword && result.keyword !== '') {
        log.info('WakeWordEngine: 检测到唤醒词:', result.keyword);
        this.kws.reset(this.stream);
        return result.keyword;
      }
    }
    return null;
  }

  start(): void {
    this.active = true;
    log.info('WakeWordEngine: 开始监听');
  }

  stop(): void {
    this.active = false;
    log.info('WakeWordEngine: 停止监听');
  }

  reset(): void {
    if (this.stream && this.kws) {
      this.kws.reset(this.stream);
    }
  }

  destroy(): void {
    this.active = false;
    this.stream = null;
    this.kws = null;
    // Clean up temp keywords file
    if (this.keywordsFilePath && fs.existsSync(this.keywordsFilePath)) {
      fs.unlinkSync(this.keywordsFilePath);
    }
    log.info('WakeWordEngine: 已销毁');
  }
}
