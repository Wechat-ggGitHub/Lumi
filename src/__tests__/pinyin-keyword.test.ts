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
  it('converts each letter to ARPAbet phones', () => {
    expect(letterToPhone('A')).toEqual(['EY1']);
    expect(letterToPhone('B')).toEqual(['B IY1']);
    expect(letterToPhone('X')).toEqual(['EH1 K S']);
  });

  it('handles multi-letter input', () => {
    expect(letterToPhone('HI')).toEqual(['EY1 CH', 'AY1']);
  });

  it('lowercases input', () => {
    expect(letterToPhone('a')).toEqual(['EY1']);
  });

  it('ignores non-letter characters', () => {
    expect(letterToPhone('A-B')).toEqual(['EY1', 'B IY1']);
  });
});

describe('englishToKeyword', () => {
  const dict = loadPhoneDict(path.join(__dirname, 'fixtures', 'test-en.phone'));

  it('converts known word via dictionary', () => {
    expect(englishToKeyword('AIVA', dict)).toBe('EY2 IY0 V AH0 @AIVA');
  });

  it('converts multi-word name with underscore', () => {
    expect(englishToKeyword('HEY JARVIS', dict)).toBe('HH EY1_JH AA1 R V AH0 S @HEY JARVIS');
  });

  it('falls back to letter-by-letter for unknown words', () => {
    const result = englishToKeyword('XYLO', dict);
    expect(result).toContain('@XYLO');
    expect(result).toMatch(/^EH1 K S/);
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
    const result = nameToKeyword('XYLO');
    expect(result).toContain('@XYLO');
  });

  it('handles Chinese without dictionary', () => {
    expect(nameToKeyword('小狐狸')).toBe('x iǎo h ú l i @小狐狸');
  });

  it('strips special characters before detection', () => {
    const result = nameToKeyword('Aiva!', dict);
    expect(result).toContain('@Aiva');
  });
});
