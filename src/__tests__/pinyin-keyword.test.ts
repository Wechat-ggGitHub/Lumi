import { splitPinyin, chineseToKeyword, loadPhoneDict, letterToPhone, englishToKeyword, nameToKeyword } from '@/lib/pinyin-keyword';
import path from 'path';

describe('splitPinyin', () => {
  it('splits syllable with single-letter initial', () => {
    expect(splitPinyin('qián')).toEqual(['q', 'ián']);
  });

  it('splits syllable with two-letter initial', () => {
    expect(splitPinyin('zhōng')).toEqual(['zh', 'ōng']);
  });

  it('splits syllable without initial', () => {
    expect(splitPinyin('ài')).toEqual(['', 'ài']);
  });

  it('splits syllable with sh initial', () => {
    expect(splitPinyin('shì')).toEqual(['sh', 'ì']);
  });

  it('splits syllable with ch initial', () => {
    expect(splitPinyin('chén')).toEqual(['ch', 'én']);
  });
});

describe('chineseToKeyword', () => {
  it('converts 钱钱 to keyword format', () => {
    expect(chineseToKeyword('钱钱')).toBe('q ián q ián @钱钱');
  });

  it('converts 小狐狸 to keyword format', () => {
    expect(chineseToKeyword('小狐狸')).toBe('x iǎo h ú l i @小狐狸');
  });

  it('converts single character', () => {
    expect(chineseToKeyword('啊')).toBe('a @啊');
  });
});

describe('loadPhoneDict', () => {
  const fixturePath = path.join(__dirname, 'fixtures', 'test-en.phone');

  it('parses en.phone into a word-to-phones map', () => {
    const dict = loadPhoneDict(fixturePath);
    expect(dict.get('AIVA')).toBe('EY2 IY0 V AH0');
    expect(dict.get('HELLO')).toBe('HH AH L OW1');
    expect(dict.get('JARVIS')).toBe('JH AA1 R V AH0 S');
  });

  it('skips comment lines and special entries', () => {
    const dict = loadPhoneDict(fixturePath);
    expect(dict.has('!SIL')).toBe(false);
    expect(dict.has('<UNK>')).toBe(false);
  });

  it('handles missing file gracefully', () => {
    const dict = loadPhoneDict('/nonexistent/path/en.phone');
    expect(dict.size).toBe(0);
  });
});

describe('letterToPhone', () => {
  it('converts single vowels', () => {
    expect(letterToPhone('a')).toEqual(['AH0']);
    expect(letterToPhone('o')).toEqual(['OW0']);
  });

  it('converts consonants', () => {
    expect(letterToPhone('b')).toEqual(['B']);
    expect(letterToPhone('k')).toEqual(['K']);
  });

  it('handles vowel pairs', () => {
    expect(letterToPhone('ai')).toEqual(['AY1']);
    expect(letterToPhone('oo')).toEqual(['UW1']);
  });

  it('handles open syllable u (lumi) vs closed (cup)', () => {
    // "lumi": u before consonant+vowel = open syllable → UW1
    const lumi = letterToPhone('lumi');
    expect(lumi).toEqual(['L', 'UW1', 'M', 'IY0']);

    // "cup": u before consonant at end = closed syllable → AH1
    const cup = letterToPhone('cup');
    expect(cup).toEqual(['K', 'AH1', 'P']);
  });

  it('handles open syllable o (nova) vs closed (hot)', () => {
    // "nova": o before consonant+vowel = open → OW1
    const nova = letterToPhone('nova');
    expect(nova).toEqual(['N', 'OW1', 'V', 'AH0']);

    // "hot": o before consonant at end = closed → AA1
    const hot = letterToPhone('hot');
    expect(hot).toEqual(['HH', 'AA1', 'T']);
  });

  it('final i in multi-syllable = IY0, single = AY1', () => {
    // "lumi" (2 syllables): final i → IY0
    expect(letterToPhone('lumi')[3]).toBe('IY0');

    // "hi" (1 syllable): final i → AY1
    expect(letterToPhone('hi')).toEqual(['HH', 'AY1']);
  });

  it('lowercases input', () => {
    expect(letterToPhone('a')).toEqual(letterToPhone('A'));
  });

  it('ignores non-letter characters', () => {
    expect(letterToPhone('a-b')).toEqual(['AH0', 'B']);
  });
});

describe('englishToKeyword', () => {
  const dict = loadPhoneDict(path.join(__dirname, 'fixtures', 'test-en.phone'));

  it('converts known word via dictionary', () => {
    expect(englishToKeyword('AIVA', dict)).toBe('EY2 IY0 V AH0 @AIVA');
  });

  it('uses CUSTOM_PHONE_ENTRIES when not in dictionary', () => {
    // LUMI is not in test fixture but is in CUSTOM_PHONE_ENTRIES
    const emptyDict = new Map<string, string>();
    expect(englishToKeyword('lumi', emptyDict)).toBe('L UW1 M IY0 @lumi');
  });

  it('AIVA falls back to letterToPhone (not in CUSTOM_PHONE_ENTRIES)', () => {
    // AIVA was removed from CUSTOM_PHONE_ENTRIES because letterToPhone produces
    // the correct phonemes (AY1 V AH0) that the sherpa-onnx model can detect
    const emptyDict = new Map<string, string>();
    expect(englishToKeyword('aiva', emptyDict)).toBe('AY1 V AH0 @aiva');
  });

  it('converts multi-word name with underscore', () => {
    expect(englishToKeyword('HEY JARVIS', dict)).toBe('HH EY1 JH AA1 R V AH0 S @HEY_JARVIS');
  });

  it('falls back to letterToPhone for unknown words', () => {
    const emptyDict = new Map<string, string>();
    const result = englishToKeyword('koda', emptyDict);
    expect(result).toContain('@koda');
    // "ko" = open syllable (k before o, o before d+a) → OW1
    expect(result).toContain('OW1');
  });

  it('handles lowercase input', () => {
    expect(englishToKeyword('aiva', dict)).toBe('EY2 IY0 V AH0 @aiva');
  });
});

describe('nameToKeyword', () => {
  const dict = loadPhoneDict(path.join(__dirname, 'fixtures', 'test-en.phone'));

  it('delegates Chinese names to chineseToKeyword', () => {
    expect(nameToKeyword('钱钱', dict)).toBe('q ián q ián @钱钱');
  });

  it('delegates English names to englishToKeyword', () => {
    expect(nameToKeyword('AIVA', dict)).toBe('EY2 IY0 V AH0 @AIVA');
  });

  it('handles English without dictionary (letter fallback)', () => {
    const result = nameToKeyword('koda');
    expect(result).toContain('@koda');
  });

  it('handles Chinese without dictionary', () => {
    expect(nameToKeyword('小狐狸')).toBe('x iǎo h ú l i @小狐狸');
  });

  it('strips special characters before detection', () => {
    const result = nameToKeyword('Aiva!', dict);
    expect(result).toContain('@Aiva');
  });
});
