import path from 'path';
import fs from 'fs';
import os from 'os';
import { app } from 'electron';
import { createWavBuffer } from '../src/lib/wav-writer';
import { log } from '../src/lib/logger';

const { Vad } = require('sherpa-onnx-node');

export class VoiceEndpoint {
  private vad: any = null;
  private chunks: Float32Array[] = [];
  private silenceTimeout: number;
  private minDuration: number;
  private maxDuration: number;
  private onComplete: ((wavPath: string) => void) | null = null;
  private onTooShort: (() => void) | null = null;

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

  setCallbacks(onComplete: (wavPath: string) => void, onTooShort: () => void): void {
    this.onComplete = onComplete;
    this.onTooShort = onTooShort;
  }

  start(): void {
    this.chunks = [];
    log.info('VoiceEndpoint: 开始端点检测');
  }

  feed(samples: Float32Array): void {
    if (!this.vad) return;

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
    fs.writeFileSync(wavPath, wavBuffer);
    log.info('VoiceEndpoint: 录音完成:', wavPath);
    if (this.onComplete) this.onComplete(wavPath);
    this.chunks = [];
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

  reset(): void {
    this.chunks = [];
    if (this.vad) this.vad.reset();
  }

  destroy(): void {
    this.chunks = [];
    this.vad = null;
  }
}
