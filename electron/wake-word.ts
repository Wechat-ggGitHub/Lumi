import path from 'path';
import fs from 'fs';
import os from 'os';
import { app } from 'electron';
import { nameToKeyword, loadPhoneDict } from '../src/lib/pinyin-keyword';
import { log } from '../src/lib/logger';

export class WakeWordEngine {
  private kws: any = null;
  private stream: any = null;
  private keyword: string = '';
  private keywordsFilePath: string = '';
  private active = false;
  private phoneDict: Map<string, string> | null = null;

  get isEnabled(): boolean {
    return this.kws !== null;
  }

  init(keyword: string): void {
    if (!keyword || !keyword.trim()) {
      throw new Error('唤醒词不能为空');
    }

    let KeywordSpotter: any;
    try {
      log.info('WakeWordEngine: 加载 sherpa-onnx-node...');
      KeywordSpotter = require('sherpa-onnx-node').KeywordSpotter;
      log.info('WakeWordEngine: sherpa-onnx-node 加载成功');
    } catch (err) {
      log.error('WakeWordEngine: 无法加载 sherpa-onnx-node:', err);
      throw new Error('唤醒词引擎加载失败，请确认 sherpa-onnx-node 已正确安装');
    }

    const resourcesDir = app.isPackaged
      ? path.join(process.resourcesPath, 'sherpa-onnx', 'kws')
      : path.join(app.getAppPath(), 'resources', 'sherpa-onnx', 'kws');

    log.info('WakeWordEngine: 模型目录:', resourcesDir, '目录存在:', fs.existsSync(resourcesDir));

    const phoneDictPath = path.join(resourcesDir, 'en.phone');
    this.phoneDict = loadPhoneDict(phoneDictPath);
    if (this.phoneDict.size === 0) {
      log.warn('WakeWordEngine: en.phone 未找到或为空，英文唤醒词将使用逐字母回退');
    }

    // Write keywords to temp file
    this.keywordsFilePath = path.join(os.tmpdir(), `aiva-keywords-${Date.now()}.txt`);
    this.keyword = keyword;
    this.writeKeywordsFile(keyword);

    log.info('WakeWordEngine: 创建 KeywordSpotter...');
    try {
      this.kws = new KeywordSpotter({
        modelConfig: {
          transducer: {
            encoder: path.join(resourcesDir, 'encoder-epoch-13-avg-2-chunk-16-left-64.onnx'),
            decoder: path.join(resourcesDir, 'decoder-epoch-13-avg-2-chunk-16-left-64.onnx'),
            joiner: path.join(resourcesDir, 'joiner-epoch-13-avg-2-chunk-16-left-64.onnx'),
          },
          tokens: path.join(resourcesDir, 'tokens.txt'),
        },
        keywordsFile: this.keywordsFilePath,
        keywordsScore: /^[A-Za-z\s]+$/.test(keyword.trim()) ? 1.5 : 1.0,
        keywordsThreshold: 0.25,
        maxActivePaths: 4,
        numTrailingBlanks: 1,
      });
    } catch (err) {
      log.error('WakeWordEngine: KeywordSpotter 创建失败:', err);
      throw new Error('唤醒词引擎初始化失败: ' + (err instanceof Error ? err.message : String(err)));
    }

    this.stream = this.kws.createStream();
    const lang = /[一-鿿]/.test(keyword) ? '中文' : '英文';
    log.info('WakeWordEngine: 初始化完成, 关键词:', keyword, '语言:', lang);
  }

  private writeKeywordsFile(keyword: string): void {
    const keywordStr = nameToKeyword(keyword, this.phoneDict ?? undefined);
    fs.writeFileSync(this.keywordsFilePath, keywordStr + '\n', 'utf-8');
  }

  updateKeyword(keyword: string): void {
    if (!this.kws) return;
    const wasActive = this.active;
    // Clean up old keywords file before re-initializing
    if (this.keywordsFilePath && fs.existsSync(this.keywordsFilePath)) {
      fs.unlinkSync(this.keywordsFilePath);
    }
    this.keyword = keyword;
    this.stream = null;
    this.kws = null;
    this.init(keyword);
    if (wasActive) {
      this.start();
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
