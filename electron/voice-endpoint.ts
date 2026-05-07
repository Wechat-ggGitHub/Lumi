import path from 'path';
import fs from 'fs';
import os from 'os';
import { app } from 'electron';
import { createWavBuffer } from '../src/lib/wav-writer';
import { log } from '../src/lib/logger';

export class VoiceEndpoint {
  private vad: any = null;
  private chunks: Float32Array[] = [];
  private silenceTimeout: number;
  private minDuration: number;
  private maxDuration: number;
  private onComplete: ((wavPath: string) => void) | null = null;
  private onTooShort: (() => void) | null = null;
  private onVolume: ((volume: number) => void) | null = null;

  constructor(opts: {
    silenceTimeout?: number;
    minDuration?: number;
    maxDuration?: number;
  } = {}) {
    this.silenceTimeout = opts.silenceTimeout ?? 3;
    this.minDuration = opts.minDuration ?? 0.5;
    this.maxDuration = opts.maxDuration ?? 30;
  }

  init(): void {
    let Vad: any;
    try {
      Vad = require('sherpa-onnx-node').Vad;
    } catch (err) {
      log.error('VoiceEndpoint: 无法加载 sherpa-onnx-node:', err);
      throw new Error('VAD 引擎加载失败');
    }

    const resourcesDir = app.isPackaged
      ? path.join(process.resourcesPath, 'sherpa-onnx', 'vad')
      : path.join(app.getAppPath(), 'resources', 'sherpa-onnx', 'vad');

    this.vad = new Vad({
      sileroVad: {
        model: path.join(resourcesDir, 'silero_vad.onnx'),
        threshold: 0.5,
        minSpeechDuration: this.minDuration,
        minSilenceDuration: this.silenceTimeout,
        maxSpeechDuration: this.maxDuration,
        windowSize: 512,
      },
      sampleRate: 16000,
      numThreads: 1,
    });
  }

  setCallbacks(
    onComplete: (wavPath: string) => void,
    onTooShort: () => void,
    onVolume?: (volume: number) => void,
  ): void {
    this.onComplete = onComplete;
    this.onTooShort = onTooShort;
    this.onVolume = onVolume ?? null;
  }

  start(): void {
    this.chunks = [];
    log.info('VoiceEndpoint: 开始端点检测');
  }

  feed(samples: Float32Array): void {
    if (!this.vad) return;

    // 计算实时音量 (RMS)
    if (this.onVolume) {
      let sum = 0;
      for (let i = 0; i < samples.length; i++) {
        sum += samples[i] * samples[i];
      }
      const rms = Math.sqrt(sum / samples.length);
      const volume = Math.min(1, rms * 5);
      this.onVolume(volume);
    }

    this.chunks.push(samples);
    this.vad.acceptWaveform(samples);

    // Check for completed speech segments
    while (!this.vad.isEmpty()) {
      const segment = this.vad.front();
      this.vad.pop();

      const duration = segment.samples.length / 16000;
      log.info(`VoiceEndpoint: VAD 检测到语音段, 时长: ${duration.toFixed(2)}s`);

      if (duration >= this.minDuration) {
        this.complete(segment.samples);
        return;
      } else {
        log.info('VoiceEndpoint: 语音段太短，忽略');
        if (this.onTooShort) this.onTooShort();
        return;
      }
    }

    // Max duration fallback
    const totalSamples = this.chunks.reduce((acc, c) => acc + c.length, 0);
    if (totalSamples / 16000 >= this.maxDuration) {
      log.info('VoiceEndpoint: 达到最大录音时长，停止');
      this.complete(this.getAllSamples());
    }
  }

  private complete(samples: Float32Array): void {
    const wavBuffer = createWavBuffer(samples, 16000);
    const tmpDir = path.join(os.homedir(), '.shrew', 'tmp');
    fs.mkdirSync(tmpDir, { recursive: true });
    const wavPath = path.join(tmpDir, `wake-recording-${Date.now()}.wav`);
    const chunks = this.chunks;
    this.chunks = [];
    setImmediate(() => {
      fs.writeFileSync(wavPath, wavBuffer);
      log.info('VoiceEndpoint: 录音完成:', wavPath);
      if (this.onComplete) this.onComplete(wavPath);
    });
  }

  private getAllSamples(): Float32Array {
    const totalLength = this.chunks.reduce((acc, c) => acc + c.length, 0);
    const result = new Float32Array(totalLength);
    let offset = 0;
    for (const chunk of this.chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    return result;
  }

  finish(): void {
    if (!this.vad || this.chunks.length === 0) {
      log.info('VoiceEndpoint: 手动停止时无音频数据');
      if (this.onTooShort) this.onTooShort();
      return;
    }

    const allSamples = this.getAllSamples();
    const duration = allSamples.length / 16000;
    log.info(`VoiceEndpoint: 手动停止, 已录时长: ${duration.toFixed(2)}s`);

    if (duration >= this.minDuration) {
      this.complete(allSamples);
    } else {
      log.info('VoiceEndpoint: 手动停止时录音太短，忽略');
      if (this.onTooShort) this.onTooShort();
    }
  }

  reset(): void {
    this.chunks = [];
    if (this.vad) this.vad.reset();
  }

  destroy(): void {
    this.chunks = [];
    this.vad = null;
    this.onVolume = null;
    this.onComplete = null;
    this.onTooShort = null;
  }
}
