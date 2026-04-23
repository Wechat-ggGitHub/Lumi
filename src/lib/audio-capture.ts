export class AudioCapture {
  private audioContext: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private processor: ScriptProcessorNode | null = null;
  private silenceGain: GainNode | null = null;
  private chunks: Float32Array[] = [];

  async start(): Promise<void> {
    this.chunks = [];

    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
      },
    });

    this.audioContext = new AudioContext({ sampleRate: 16000 });
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }

    const source = this.audioContext.createMediaStreamSource(this.stream);
    this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);

    // Mute output to prevent speaker feedback
    this.silenceGain = this.audioContext.createGain();
    this.silenceGain.gain.value = 0;

    source.connect(this.processor);
    this.processor.connect(this.silenceGain);
    this.silenceGain.connect(this.audioContext.destination);

    this.processor.onaudioprocess = (e: AudioProcessingEvent) => {
      const data = e.inputBuffer.getChannelData(0);
      this.chunks.push(new Float32Array(data));
    };
  }

  stop(): { samples: Float32Array; sampleRate: number } {
    this.processor?.disconnect();
    this.silenceGain?.disconnect();
    this.stream?.getTracks().forEach(t => t.stop());

    const totalLength = this.chunks.reduce((acc, c) => acc + c.length, 0);
    const samples = new Float32Array(totalLength);
    let offset = 0;
    for (const chunk of this.chunks) {
      samples.set(chunk, offset);
      offset += chunk.length;
    }

    this.chunks = [];
    this.close();
    return { samples, sampleRate: 16000 };
  }

  close(): void {
    this.processor?.disconnect();
    this.silenceGain?.disconnect();
    this.stream?.getTracks().forEach(t => t.stop());
    this.audioContext?.close();
    this.audioContext = null;
    this.stream = null;
    this.processor = null;
    this.silenceGain = null;
  }
}
