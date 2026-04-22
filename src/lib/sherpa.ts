import path from 'path';
import { app } from 'electron';

type SherpaRecognizer = {
  acceptWaveform: (samples: Float32Array, sampleRate: number) => number;
  getResult: () => { text: string };
  reset: () => void;
  close: () => void;
};

export class VoiceRecognizer {
  private recognizer: SherpaRecognizer | null = null;
  private modelDir: string;
  private _isLoaded = false;

  constructor() {
    this.modelDir = path.join(app.getPath('userData'), 'models');
  }

  get isLoaded(): boolean { return this._isLoaded; }

  async load(): Promise<void> {
    if (this._isLoaded) return;

    try {
      // sherpa-onnx-node 动态导入（native module）
      const sherpaOnnx = await import('sherpa-onnx-node');

      const modelPath = path.join(this.modelDir, 'sensevoice-small-int8.onnx');

      this.recognizer = sherpaOnnx.createOfflineRecognizer({
        modelType: 'sensevoice',
        modelingUnit: 'auto',
        featConfig: { sampleRate: 16000, featureDim: 80 },
        modelConfig: {
          transducer: { encoder: '', decoder: '', joiner: '' },
          senseVoice: {
            model: modelPath,
            language: 'auto',
            useInverseTextNormalization: true,
          },
        },
      });

      this._isLoaded = true;
    } catch (error) {
      throw new Error(`Failed to load voice model: ${(error as Error).message}`);
    }
  }

  async transcribe(audioPath: string): Promise<string> {
    if (!this.recognizer) throw new Error('Recognizer not loaded');

    const sherpaOnnx = await import('sherpa-onnx-node');
    const wave = sherpaOnnx.readWave(audioPath);

    this.recognizer.acceptWaveform(wave.samples, wave.sampleRate);
    const result = this.recognizer.getResult();

    this.recognizer.reset();
    return result.text.trim();
  }

  close(): void {
    this.recognizer?.close();
    this.recognizer = null;
    this._isLoaded = false;
  }
}
