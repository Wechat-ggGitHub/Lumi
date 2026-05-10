import { pinyin } from 'pinyin-pro';
import fs from 'fs';

const INITIALS = ['zh', 'ch', 'sh', 'b', 'p', 'm', 'f', 'd', 't', 'n', 'l', 'g', 'k', 'h', 'j', 'q', 'x', 'r', 'z', 'c', 's', 'y', 'w'];

export function splitPinyin(syllable: string): [string, string] {
  for (const initial of INITIALS) {
    if (syllable.startsWith(initial)) {
      return [initial, syllable.slice(initial.length)];
    }
  }
  return ['', syllable];
}

export function chineseToKeyword(text: string): string {
  // 如果不包含中文字符，无法生成有效的中文关键词格式
  if (!/[一-鿿]/.test(text)) {
    return `${text.split('').join(' ')} @${text}`;
  }
  const syllables = pinyin(text, { toneType: 'symbol', type: 'array' });
  const parts = syllables.map((s) => {
    const [initial, final] = splitPinyin(s);
    return initial ? `${initial} ${final}` : final;
  });
  return `${parts.join(' ')} @${text}`;
}

export function loadPhoneDict(phoneDictPath: string): Map<string, string> {
  const dict = new Map<string, string>();
  if (!fs.existsSync(phoneDictPath)) return dict;

  const content = fs.readFileSync(phoneDictPath, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('!') || trimmed.startsWith('<')) continue;
    const parts = trimmed.split(/\s+/);
    if (parts.length < 2) continue;
    const word = parts[0].toUpperCase();
    const phones = parts.slice(1).join(' ');
    dict.set(word, phones);
  }
  return dict;
}

const LETTER_PHONES: Record<string, string> = {
  a: 'EY1', b: 'B IY1', c: 'S IY1', d: 'D IY1', e: 'IY1',
  f: 'EH1 F', g: 'JH IY1', h: 'EY1 CH', i: 'AY1', j: 'JH EY1',
  k: 'K EY1', l: 'EH1 L', m: 'EH1 M', n: 'EH1 N', o: 'OW1',
  p: 'P IY1', q: 'K Y UW1', r: 'AA1 R', s: 'EH1 S', t: 'T IY1',
  u: 'Y UW1', v: 'V IY1', w: 'D AH1 B AH0 L Y UW0', x: 'EH1 K S',
  y: 'W AY1', z: 'Z IY1',
};

export function letterToPhone(text: string): string[] {
  const phones: string[] = [];
  for (const ch of text.toUpperCase()) {
    if (LETTER_PHONES[ch.toLowerCase()]) {
      phones.push(LETTER_PHONES[ch.toLowerCase()]);
    }
  }
  return phones;
}

export function englishToKeyword(text: string, phoneDict: Map<string, string>): string {
  const words = text.trim().split(/\s+/);
  const phoneParts: string[] = [];

  for (const word of words) {
    const upper = word.toUpperCase();
    const phones = phoneDict.get(upper);
    if (phones) {
      phoneParts.push(phones);
    } else {
      phoneParts.push(letterToPhone(word).join(' '));
    }
  }

  return `${phoneParts.join('_')} @${text}`;
}

export function nameToKeyword(text: string, phoneDict?: Map<string, string>): string {
  const cleaned = text.replace(/[^\p{L}\p{N}\s]/gu, '').trim();
  if (!cleaned) return `${text} @${text}`;

  if (/[一-鿿㐀-䶿]/.test(cleaned)) {
    return chineseToKeyword(cleaned);
  }

  const dict = phoneDict ?? new Map();
  return englishToKeyword(cleaned, dict);
}
