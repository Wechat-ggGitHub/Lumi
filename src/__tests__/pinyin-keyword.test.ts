import { splitPinyin, chineseToKeyword } from '@/lib/pinyin-keyword';

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
