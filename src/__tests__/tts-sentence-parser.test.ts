// src/__tests__/tts-sentence-parser.test.ts
import { parseSentenceFromPayload } from '../../electron/tts-sentence-parser';

describe('parseSentenceFromPayload', () => {
  it('extracts text from top-level payload.text and computes duration from words', () => {
    const payload = {
      phonemes: [],
      text: '哈哈对呀，咱俩就这么聊着呗，挺好的。',
      words: [
        { startTime: 0.435, endTime: 0.625, word: '哈', confidence: 0.86 },
        { startTime: 0.625, endTime: 0.715, word: '哈', confidence: 0.71 },
        { startTime: 3.255, endTime: 3.485, word: '挺', confidence: 0.93 },
        { startTime: 3.485, endTime: 3.765, word: '好的。', confidence: 0.97 },
      ],
    };

    const result = parseSentenceFromPayload(payload);

    expect(result).not.toBeNull();
    expect(result!.text).toBe('哈哈对呀，咱俩就这么聊着呗，挺好的。');
    expect(result!.duration).toBeCloseTo(3.33, 1); // 3.765 - 0.435
  });

  it('returns null when text is empty', () => {
    const payload = { phonemes: [], text: '', words: [] };
    expect(parseSentenceFromPayload(payload)).toBeNull();
  });

  it('returns null when payload has no words and no duration', () => {
    const payload = { phonemes: [], text: 'some text', words: [] };
    expect(parseSentenceFromPayload(payload)).toBeNull();
  });

  it('falls back to payload.res_params.text when top-level text is missing', () => {
    const payload = {
      res_params: { text: 'fallback text', duration: 2.5 },
    };

    const result = parseSentenceFromPayload(payload);

    expect(result).not.toBeNull();
    expect(result!.text).toBe('fallback text');
    expect(result!.duration).toBe(2.5);
  });

  it('passes through words array from payload', () => {
    const payload = {
      phonemes: [],
      text: '哈哈',
      words: [
        { startTime: 0.435, endTime: 0.625, word: '哈', confidence: 0.86 },
        { startTime: 0.625, endTime: 0.715, word: '哈', confidence: 0.71 },
      ],
    };

    const result = parseSentenceFromPayload(payload);

    expect(result).not.toBeNull();
    expect(result!.words).toEqual([
      { startTime: 0.435, endTime: 0.625, word: '哈', confidence: 0.86 },
      { startTime: 0.625, endTime: 0.715, word: '哈', confidence: 0.71 },
    ]);
  });
});
