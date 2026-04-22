declare module 'sherpa-onnx-node' {
  export function createOfflineRecognizer(config: any): any;
  export function readWave(path: string): { samples: Float32Array; sampleRate: number };
}
