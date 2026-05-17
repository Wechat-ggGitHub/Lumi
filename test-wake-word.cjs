const { KeywordSpotter } = require('sherpa-onnx-node');
const fs = require('fs');
const path = require('path');

const resourcesDir = path.join(process.cwd(), 'resources/sherpa-onnx/kws');

// Read WAV file properly (handle different header sizes)
function readWav(filePath) {
  const buf = fs.readFileSync(filePath);
  // Find 'data' chunk
  let offset = 12;
  let dataOffset = -1;
  let dataSize = 0;
  while (offset < buf.length - 8) {
    const chunkId = buf.toString('ascii', offset, offset + 4);
    const chunkSize = buf.readUInt32LE(offset + 4);
    if (chunkId === 'data') {
      dataOffset = offset + 8;
      dataSize = chunkSize;
      break;
    }
    offset += 8 + chunkSize;
  }
  if (dataOffset < 0) throw new Error('No data chunk found');
  
  const numSamples = dataSize / 2;
  const samples = new Float32Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    samples[i] = buf.readInt16LE(dataOffset + i * 2) / 32768;
  }
  return { samples, sampleRate: 16000 };
}

// Pad audio with silence
function padWithSilence(samples, silenceSeconds, sampleRate) {
  const silenceSamples = Math.floor(silenceSeconds * sampleRate);
  const padded = new Float32Array(samples.length + silenceSamples);
  padded.set(samples);
  // rest is already 0 (silence)
  return padded;
}

const keywords = [
  { label: 'CUSTOM (EY2 IY0 V AH0)', phonemes: 'EY2 IY0 V AH0 @Aiva', threshold: 0.15 },
  { label: 'letterToPhone (AY1 V AH0)', phonemes: 'AY1 V AH0 @Aiva', threshold: 0.15 },
  { label: 'Lower threshold', phonemes: 'EY2 IY0 V AH0 @Aiva', threshold: 0.05 },
  { label: 'Very low threshold', phonemes: 'EY2 IY0 V AH0 @Aiva', threshold: 0.01 },
];

const wavFiles = [
  { label: 'aiva-default', path: '/tmp/aiva-default.wav' },
  { label: 'aiva-spelled', path: '/tmp/aiva-spelled.wav' },
  { label: 'aiva-ayeeva', path: '/tmp/aiva-ayeeva.wav' },
];

for (const kw of keywords) {
  console.log(`\n=== ${kw.label} (threshold: ${kw.threshold}) ===`);
  
  const kwFile = `/tmp/test-kw-${Date.now()}.txt`;
  fs.writeFileSync(kwFile, kw.phonemes + '\n');
  
  try {
    const kws = new KeywordSpotter({
      modelConfig: {
        transducer: {
          encoder: path.join(resourcesDir, 'encoder-epoch-13-avg-2-chunk-16-left-64.onnx'),
          decoder: path.join(resourcesDir, 'decoder-epoch-13-avg-2-chunk-16-left-64.onnx'),
          joiner: path.join(resourcesDir, 'joiner-epoch-13-avg-2-chunk-16-left-64.onnx'),
        },
        tokens: path.join(resourcesDir, 'tokens.txt'),
      },
      keywordsFile: kwFile,
      keywordsScore: 2.0,
      keywordsThreshold: kw.threshold,
      maxActivePaths: 4,
      numTrailingBlanks: 1,
    });

    for (const wav of wavFiles) {
      const { samples, sampleRate } = readWav(wav.path);
      const padded = padWithSilence(samples, 1.0, sampleRate); // 1s trailing silence
      
      const stream = kws.createStream();
      
      // Feed in chunks like real audio (320 samples = 20ms at 16kHz)
      const chunkSize = 320;
      let detected = false;
      for (let i = 0; i < padded.length; i += chunkSize) {
        const chunk = padded.slice(i, Math.min(i + chunkSize, padded.length));
        stream.acceptWaveform({ samples: chunk, sampleRate });
        
        while (kws.isReady(stream)) {
          kws.decode(stream);
          const result = kws.getResult(stream);
          if (result.keyword && result.keyword !== '') {
            console.log(`  [${wav.label}] ✓ DETECTED: "${result.keyword}"`);
            detected = true;
            break;
          }
        }
        if (detected) break;
      }
      if (!detected) {
        console.log(`  [${wav.label}] ✗ NOT detected`);
      }
    }
  } catch (err) {
    console.log(`  Error: ${err.message}`);
  }
  
  try { fs.unlinkSync(kwFile); } catch {}
}
