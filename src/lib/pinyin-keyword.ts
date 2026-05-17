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

function isVowelChar(ch: string): boolean {
  return ch.length === 1 && 'aeiou'.includes(ch);
}

function countVowelGroups(word: string): number {
  let count = 0;
  let inVowel = false;
  for (const ch of word) {
    if (isVowelChar(ch)) {
      if (!inVowel) { count++; inVowel = true; }
    } else {
      inVowel = false;
    }
  }
  return count;
}

// Custom phoneme entries for names not in en.phone that don't follow regular English rules.
// Only add entries where letterToPhone produces wrong phonemes that the model can't match.
const CUSTOM_PHONE_ENTRIES: Record<string, string> = {
  'LUMI': 'L UW1 M IY0',
};

const CONSONANT: Record<string, string> = {
  b: 'B', d: 'D', f: 'F', g: 'G', h: 'HH', j: 'JH', k: 'K',
  l: 'L', m: 'M', n: 'N', p: 'P', r: 'R', s: 'S', t: 'T',
  v: 'V', w: 'W', z: 'Z',
};

const CONSONANT_DIGRAPH: Record<string, string[]> = {
  th: ['TH'], sh: ['SH'], ch: ['CH'], ph: ['F'], wh: ['W'],
  ng: ['NG'], ck: ['K'], qu: ['K', 'W'],
};

const VOWEL_PAIR: Record<string, string> = {
  ai: 'AY1', ay: 'EY1', ae: 'EY1',
  ee: 'IY1', ea: 'IY1', ei: 'EY1', ey: 'EY1',
  oo: 'UW1', ou: 'AW1', ow: 'AW1',
  oi: 'OY1', oy: 'OY1',
  au: 'AO1', aw: 'AO1',
  ie: 'AY1',
};

export function letterToPhone(text: string): string[] {
  const w = text.toLowerCase();
  const phones: string[] = [];
  const multiSyllable = countVowelGroups(w) > 1;
  let i = 0;

  while (i < w.length) {
    const ch = w[i];
    const next = i + 1 < w.length ? w[i + 1] : '';
    const pair = ch + next;

    if (i + 1 < w.length && CONSONANT_DIGRAPH[pair]) {
      phones.push(...CONSONANT_DIGRAPH[pair]);
      i += 2;
      continue;
    }

    if (i + 1 < w.length && VOWEL_PAIR[pair]) {
      phones.push(VOWEL_PAIR[pair]);
      i += 2;
      continue;
    }

    if (CONSONANT[ch]) {
      phones.push(CONSONANT[ch]);
      i++;
      continue;
    }

    if (ch === 'c') {
      phones.push((next === 'e' || next === 'i' || next === 'y') ? 'S' : 'K');
      i++;
      continue;
    }
    if (ch === 'x') { phones.push('K', 'S'); i++; continue; }
    if (ch === 'y') {
      if (i === 0) phones.push('Y');
      else if (i === w.length - 1) phones.push('AY1');
      else phones.push('IH1');
      i++;
      continue;
    }

    const atEnd = i >= w.length - 1;
    // Open syllable: vowel followed by consonant+another vowel, or at word end
    const nextNext = i + 2 < w.length ? w[i + 2] : '';
    const openSyllable = atEnd || (isVowelChar(next)) ||
      (next !== '' && !isVowelChar(next) && isVowelChar(nextNext));

    if (ch === 'a') {
      phones.push(atEnd ? 'AH0' : 'AE1');
    } else if (ch === 'e') {
      if (!atEnd) phones.push('EH1');
    } else if (ch === 'i') {
      // In multi-syllable names (lumi, miki), final 'i' = "ee" not "eye"
      if (atEnd && multiSyllable) {
        phones.push('IY0');
      } else if (atEnd) {
        phones.push('AY1');
      } else {
        phones.push('IH1');
      }
    } else if (ch === 'o') {
      if (atEnd) {
        phones.push('OW0');
      } else if (openSyllable) {
        phones.push('OW1'); // "no" in nova
      } else {
        phones.push('AA1'); // "ho" in hot
      }
    } else if (ch === 'u') {
      if (openSyllable) {
        phones.push('UW1'); // "lu" in lumi
      } else {
        phones.push('AH1'); // "cu" in cup
      }
    }
    i++;
  }

  return phones;
}

export function englishToKeyword(text: string, phoneDict: Map<string, string>): string {
  const words = text.trim().split(/\s+/);
  const phoneParts: string[] = [];

  for (const word of words) {
    const upper = word.toUpperCase();
    const phones = phoneDict.get(upper) || CUSTOM_PHONE_ENTRIES[upper];
    if (phones) {
      phoneParts.push(phones);
    } else {
      phoneParts.push(letterToPhone(word).join(' '));
    }
  }

  return `${phoneParts.join(' ')} @${text.replace(/\s+/g, '_')}`;
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
