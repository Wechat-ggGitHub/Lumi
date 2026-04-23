import { createWavBuffer } from '@/lib/wav-writer';

describe('createWavBuffer', () => {
  it('writes correct WAV header for 16kHz mono', () => {
    const samples = new Float32Array([0, 0.5, -0.5, 1.0, -1.0]);
    const buffer = createWavBuffer(samples, 16000);

    // RIFF header
    expect(buffer.toString('ascii', 0, 4)).toBe('RIFF');
    expect(buffer.readUInt32LE(4)).toBe(36 + samples.length * 2); // file size - 8
    expect(buffer.toString('ascii', 8, 12)).toBe('WAVE');

    // fmt chunk
    expect(buffer.toString('ascii', 12, 16)).toBe('fmt ');
    expect(buffer.readUInt32LE(16)).toBe(16);         // chunk size
    expect(buffer.readUInt16LE(20)).toBe(1);          // PCM format
    expect(buffer.readUInt16LE(22)).toBe(1);          // mono
    expect(buffer.readUInt32LE(24)).toBe(16000);      // sample rate
    expect(buffer.readUInt32LE(28)).toBe(32000);      // byte rate (16000 * 2)
    expect(buffer.readUInt16LE(32)).toBe(2);          // block align
    expect(buffer.readUInt16LE(34)).toBe(16);         // bits per sample

    // data chunk
    expect(buffer.toString('ascii', 36, 40)).toBe('data');
    expect(buffer.readUInt32LE(40)).toBe(samples.length * 2);
  });

  it('converts Float32 samples to Int16 PCM correctly', () => {
    const samples = new Float32Array([0, 0.5, -0.5, 1.0, -1.0]);
    const buffer = createWavBuffer(samples, 16000);

    // PCM data starts at byte 44
    expect(buffer.readInt16LE(44)).toBe(0);          // 0.0 → 0
    expect(buffer.readInt16LE(46)).toBe(16384);      // 0.5 → ~16384
    expect(buffer.readInt16LE(48)).toBe(-16384);     // -0.5 → ~-16384
    expect(buffer.readInt16LE(50)).toBe(32767);      // 1.0 → 32767
    expect(buffer.readInt16LE(52)).toBe(-32768);     // -1.0 → -32768
  });

  it('clamps values outside [-1, 1]', () => {
    const samples = new Float32Array([2.0, -2.0]);
    const buffer = createWavBuffer(samples, 16000);

    expect(buffer.readInt16LE(44)).toBe(32767);      // clamped to 1.0
    expect(buffer.readInt16LE(46)).toBe(-32768);     // clamped to -1.0
  });

  it('handles empty samples', () => {
    const samples = new Float32Array(0);
    const buffer = createWavBuffer(samples, 16000);

    expect(buffer.length).toBe(44); // header only, no data
    expect(buffer.readUInt32LE(40)).toBe(0); // data size = 0
  });
});
