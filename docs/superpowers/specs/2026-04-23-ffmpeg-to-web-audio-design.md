# Fix: Replace ffmpeg Recording with Electron Web Audio API

**Date**: 2026-04-23
**Status**: Draft
**Scope**: `electron/recorder.ts`, `src/lib/audio-capture.ts` (new), `electron/voice-bar.ts`, `electron/main.ts`, `src/components/VoiceInput.tsx`

## Problem

The voice recording feature relies on spawning `ffmpeg` as an external process (`spawn('ffmpeg', ['-f', 'avfoundation', ...])`). On a fresh macOS installation, ffmpeg is not present, causing `spawn ffmpeg ENOENT` and the error message:

> 录音失败: 录音启动失败，请确保已安装 ffmpeg: spawn ffmpeg ENOENT

This is a hard blocker for new users who have not installed ffmpeg via Homebrew.

## Solution

Replace the ffmpeg-based recording with Electron's native Web Audio API (`getUserMedia` + `AudioContext` + `ScriptProcessorNode`). Audio capture moves from the main process (spawning external ffmpeg) to the voice-bar renderer process (using browser APIs). PCM samples are sent back to the main process via IPC, where they are written to a WAV file and passed to sherpa-onnx for transcription.

## Architecture

### Data Flow

```
User presses Right Cmd
  → main.ts: handleRightCommand()
  → store.transition('recording')
  → voiceBar.show()
  → recorder.startRecording()
    → sends IPC 'voice:start-capture' to voiceBar window
    → renderer: getUserMedia({ audio: true })
    → renderer: AudioContext({ sampleRate: 16000 }) + ScriptProcessorNode
    → renderer: sends IPC 'voice:capture-started' back to main
User releases Right Cmd
  → recorder.stopRecording()
    → sends IPC 'voice:stop-capture' to voiceBar window
    → renderer: stops capture, concatenates Float32 chunks
    → renderer: sends IPC 'voice:audio-data' { samples: Float32Array, sampleRate }
    → main: converts Float32 → Int16 PCM → writes WAV file
  → recorder.transcribe(wavPath)
    → sherpa-onnx reads WAV → returns text
  → voice:transcript IPC to renderer
```

### File Changes

| File | Change | Description |
|------|--------|-------------|
| `src/lib/audio-capture.ts` | New | Renderer-side audio capture using Web Audio API |
| `electron/recorder.ts` | Rewrite | Remove ffmpeg spawn; use IPC for capture; add WAV writer |
| `electron/voice-bar.ts` | Modify | Add `getWindow()`; change `close()` to `hide()` |
| `electron/main.ts` | Modify | Pre-create voice-bar window; pass window ref to recorder |
| `src/components/VoiceInput.tsx` | Modify | Import and initialize AudioCapture in useEffect |
| `CLAUDE.md` | Fix | Correct "macOS afrecord" to "Web Audio API" |

## Module Design

### `src/lib/audio-capture.ts` (new, renderer process)

```typescript
export class AudioCapture {
  private audioContext: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private processor: ScriptProcessorNode | null = null;
  private chunks: Float32Array[] = [];
  private sampleRate = 16000;

  async start(): Promise<void> {
    this.chunks = [];
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
      },
    });

    this.audioContext = new AudioContext({ sampleRate: this.sampleRate });
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }

    const source = this.audioContext.createMediaStreamSource(this.stream);
    this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);

    // Silence output to prevent feedback
    const silence = this.audioContext.createGain();
    silence.gain.value = 0;

    source.connect(this.processor);
    this.processor.connect(silence);
    silence.connect(this.audioContext.destination);

    this.processor.onaudioprocess = (e: AudioProcessingEvent) => {
      const data = e.inputBuffer.getChannelData(0);
      this.chunks.push(new Float32Array(data));
    };
  }

  stop(): { samples: Float32Array; sampleRate: number } {
    this.processor?.disconnect();
    this.stream?.getTracks().forEach(t => t.stop());

    const totalLength = this.chunks.reduce((acc, c) => acc + c.length, 0);
    const samples = new Float32Array(totalLength);
    let offset = 0;
    for (const chunk of this.chunks) {
      samples.set(chunk, offset);
      offset += chunk.length;
    }
    this.chunks = [];
    return { samples, sampleRate: this.sampleRate };
  }
}
```

IPC integration in VoiceInput.tsx:
- Listen for `voice:start-capture` → `audioCapture.start()` → send `voice:capture-started`
- Listen for `voice:stop-capture` → `audioCapture.stop()` → send `voice:audio-data`

### `electron/recorder.ts` (rewrite)

```typescript
export class AudioRecorder {
  private outputPath: string;
  private recognizer: VoiceRecognizer;
  private win: BrowserWindow | null = null;

  setWindow(win: BrowserWindow): void { this.win = win; }

  startRecording(): Promise<void> {
    // Send IPC to renderer to start Web Audio capture
    return new Promise((resolve, reject) => {
      if (!this.win || this.win.isDestroyed()) {
        return reject(new Error('Voice bar window not available'));
      }

      const timer = setTimeout(() => {
        reject(new Error('Recording start timeout'));
      }, 5000);

      ipcMain.once('voice:capture-started', (_, success: boolean) => {
        clearTimeout(timer);
        if (success) resolve();
        else reject(new Error('Microphone access denied'));
      });

      this.win.webContents.send('voice:start-capture');
    });
  }

  stopRecording(): Promise<string> {
    return new Promise((resolve) => {
      if (!this.win || this.win.isDestroyed()) {
        resolve(this.outputPath);
        return;
      }

      ipcMain.once('voice:audio-data', (_, data: { samples: Float32Array, sampleRate: number }) => {
        const samples = data.samples;
        this.writeWavFile(samples, data.sampleRate);
        resolve(this.outputPath);
      });

      this.win.webContents.send('voice:stop-capture');
    });
  }

  private writeWavFile(samples: Float32Array, sampleRate: number): void {
    const numSamples = samples.length;
    const buffer = Buffer.alloc(44 + numSamples * 2);

    // WAV header
    buffer.write('RIFF', 0);
    buffer.writeUInt32LE(36 + numSamples * 2, 4);
    buffer.write('WAVE', 8);
    buffer.write('fmt ', 12);
    buffer.writeUInt32LE(16, 16);       // chunk size
    buffer.writeUInt16LE(1, 20);        // PCM format
    buffer.writeUInt16LE(1, 22);        // mono
    buffer.writeUInt32LE(sampleRate, 24);
    buffer.writeUInt32LE(sampleRate * 2, 28); // byte rate
    buffer.writeUInt16LE(2, 32);        // block align
    buffer.writeUInt16LE(16, 34);       // bits per sample
    buffer.write('data', 36);
    buffer.writeUInt32LE(numSamples * 2, 40);

    // Convert Float32 to Int16 PCM
    for (let i = 0; i < numSamples; i++) {
      const s = Math.max(-1, Math.min(1, samples[i]));
      buffer.writeInt16LE(s < 0 ? s * 0x8000 : s * 0x7FFF, 44 + i * 2);
    }

    fs.writeFileSync(this.outputPath, buffer);
  }

  // transcribe() unchanged
}
```

### `electron/voice-bar.ts` (modify)

- Add `getWindow(): BrowserWindow | null` method
- Change `close()` to call `hide()` instead of `close()`/destroy — keep window alive for reuse
- Actual cleanup only in app quit

### `electron/main.ts` (modify)

- Pre-create voice-bar window at startup (hidden), pass BrowserWindow ref to recorder
- Register `voice:capture-started` and `voice:audio-data` IPC forwarding if needed
- Remove `checkRecordingAvailable()` ffmpeg check (or replace with mic permission check)

### Onboarding: Microphone Permission

Add microphone permission check to the onboarding flow:
- Use Electron's `systemPreferences.getMediaAccessStatus('microphone')` to check current status
- If not granted, prompt with `systemPreferences.askForMediaAccess('microphone')`
- Display a permission step in the onboarding wizard between accessibility and model download

## Edge Cases

1. **Microphone denied**: `getUserMedia` throws `NotAllowedError` → catch and send `voice:capture-started(false)` → main process shows error in voice-bar
2. **No microphone hardware**: `getUserMedia` throws `NotFoundError` → same error path
3. **Window destroyed during recording**: `stopRecording()` checks `win.isDestroyed()` → returns empty path → transcribe detects missing file
4. **AudioContext suspended**: Call `audioContext.resume()` before starting processor
5. **Append recording (second recording)**: AudioCapture re-initializes cleanly since `start()` creates a fresh stream and context

## Testing Strategy

- Unit test `writeWavFile()` with known Float32 input, verify WAV header and PCM data
- Unit test Float32 → Int16 conversion edge cases (clipping at -1.0 and 1.0)
- Manual test: full flow on a fresh macOS without ffmpeg installed
- Manual test: deny microphone permission → verify error message shown
- Manual test: append recording → verify second capture works
