import { pinyin } from 'pinyin-pro';

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
  const syllables = pinyin(text, { toneType: 'symbol', type: 'array' });
  const parts = syllables.map((s) => {
    const [initial, final] = splitPinyin(s);
    return initial ? `${initial} ${final}` : final;
  });
  return `${parts.join(' ')} @${text}`;
}
