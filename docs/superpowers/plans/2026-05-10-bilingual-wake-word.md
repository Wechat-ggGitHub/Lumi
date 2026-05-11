# Bilingual Wake Word Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Chinese-only wake word model with a bilingual Chinese-English model so that English persona names (e.g. "Aiva") can be used as wake words.

**Architecture:** Replace the `sherpa-onnx-kws-zipformer-wenetspeech-3.3M-2024-01-01` model with `sherpa-onnx-kws-zipformer-zh-en-3M-2025-12-20`. Add English keyword conversion using the bundled `en.phone` ARPAbet pronunciation dictionary. Unify keyword conversion behind a `nameToKeyword()` entry point that auto-detects language.

**Tech Stack:** sherpa-onnx-node, pinyin-pro (existing), ARPAbet phoneme system

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `src/lib/pinyin-keyword.ts` | Modify | Add `loadPhoneDict()`, `englishToKeyword()`, `letterToPhone()`, `nameToKeyword()` |
| `src/__tests__/pinyin-keyword.test.ts` | Modify | Add tests for all new functions |
| `src/__tests__/fixtures/test-en.phone` | Create | Small test fixture mimicking `en.phone` format |
| `electron/wake-word.ts` | Modify | Remove Chinese-only check, update model paths, load phone dict, use `nameToKeyword()` |
| `scripts/download-kws-models.sh` | Modify | Point to new bilingual model URL |
| `resources/sherpa-onnx/kws/` | Modify | Replace model files (old → new) |

---

### Task 1: Create test fixture for `en.phone`

**Files:**
- Create: `src/__tests__/fixtures/test-en.phone`

- [ ] **Step 1: Create test fixture file**

Create a minimal `en.phone` test fixture that mimics the CMU Pronouncing Dictionary format used by sherpa-onnx:

```
!SIL  SIL
<UNK>  SPN
AIVA  EY2 IY0 V AH0
AARON  EH1 R AH0 N
BELLA  B EH1 L AH0
HELLO  HH AH L OW1
HEY  HH EY1
JARVIS  JH AA1 R V AH0 S
```

Save as `src/__tests__/fixtures/test-en.phone`. Each line is: `WORD  PHONE1 PHONE2 ...` (two-space separator between word and phones).

- [ ] **Step 2: Verify fixture exists**

Run: `cat src/__tests__/fixtures/test-en.phone`
Expected: the 8 lines above

---

### Task 2: Add `loadPhoneDict()` with tests

**Files:**
- Modify: `src/__tests__/pinyin-keyword.test.ts`
- Modify: `src/lib/pinyin-keyword.ts`

- [ ] **Step 1: Write failing test for `loadPhoneDict`**

Add to `src/__tests__/pinyin-keyword.test.ts`:

```typescript
import { loadPhoneDict } from '@/lib/pinyin-keyword';
import path from 'path';

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/__tests__/pinyin-keyword.test.ts --testNamePattern="loadPhoneDict" -v`
Expected: FAIL — `loadPhoneDict` is not exported

- [ ] **Step 3: Implement `loadPhoneDict`**

Add to `src/lib/pinyin-keyword.ts`:

```typescript
import fs from 'fs';

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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/__tests__/pinyin-keyword.test.ts --testNamePattern="loadPhoneDict" -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/__tests__/fixtures/test-en.phone src/__tests__/pinyin-keyword.test.ts src/lib/pinyin-keyword.ts
git commit -m "feat(wake-word): add loadPhoneDict for ARPAbet pronunciation dictionary"
```

---

### Task 3: Add `letterToPhone()` with tests

**Files:**
- Modify: `src/__tests__/pinyin-keyword.test.ts`
- Modify: `src/lib/pinyin-keyword.ts`

- [ ] **Step 1: Write failing test for `letterToPhone`**

Add to `src/__tests__/pinyin-keyword.test.ts`:

```typescript
import { letterToPhone } from '@/lib/pinyin-keyword';

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/__tests__/pinyin-keyword.test.ts --testNamePattern="letterToPhone" -v`
Expected: FAIL — `letterToPhone` is not exported

- [ ] **Step 3: Implement `letterToPhone`**

Add to `src/lib/pinyin-keyword.ts`:

```typescript
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/__tests__/pinyin-keyword.test.ts --testNamePattern="letterToPhone" -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/__tests__/pinyin-keyword.test.ts src/lib/pinyin-keyword.ts
git commit -m "feat(wake-word): add letterToPhone fallback for unknown English words"
```

---

### Task 4: Add `englishToKeyword()` with tests

**Files:**
- Modify: `src/__tests__/pinyin-keyword.test.ts`
- Modify: `src/lib/pinyin-keyword.ts`

- [ ] **Step 1: Write failing test for `englishToKeyword`**

Add to `src/__tests__/pinyin-keyword.test.ts`:

```typescript
import { englishToKeyword } from '@/lib/pinyin-keyword';

describe('englishToKeyword', () => {
  const dict = loadPhoneDict(path.join(__dirname, 'fixtures', 'test-en.phone'));

  it('converts known word via dictionary', () => {
    expect(englishToKeyword('AIVA', dict)).toBe('EY2 IY0 V AH0 @AIVA');
  });

  it('converts multi-word name with underscore', () => {
    expect(englishToKeyword('HEY JARVIS', dict)).toBe('HH EY1_JH AA1 R V AH0 S @HEY JARVIS');
  });

  it('falls back to letter-by-letter for unknown words', () => {
    // "XYLO" is not in test dictionary
    const result = englishToKeyword('XYLO', dict);
    expect(result).toContain('@XYLO');
    expect(result).toMatch(/^EH1 K S/);
  });

  it('handles lowercase input', () => {
    expect(englishToKeyword('aiva', dict)).toBe('EY2 IY0 V AH0 @aiva');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/__tests__/pinyin-keyword.test.ts --testNamePattern="englishToKeyword" -v`
Expected: FAIL — `englishToKeyword` is not exported

- [ ] **Step 3: Implement `englishToKeyword`**

Add to `src/lib/pinyin-keyword.ts`:

```typescript
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/__tests__/pinyin-keyword.test.ts --testNamePattern="englishToKeyword" -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/__tests__/pinyin-keyword.test.ts src/lib/pinyin-keyword.ts
git commit -m "feat(wake-word): add englishToKeyword with dictionary lookup and fallback"
```

---

### Task 5: Add unified `nameToKeyword()` with tests

**Files:**
- Modify: `src/__tests__/pinyin-keyword.test.ts`
- Modify: `src/lib/pinyin-keyword.ts`

- [ ] **Step 1: Write failing test for `nameToKeyword`**

Add to `src/__tests__/pinyin-keyword.test.ts`:

```typescript
import { nameToKeyword } from '@/lib/pinyin-keyword';

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/__tests__/pinyin-keyword.test.ts --testNamePattern="nameToKeyword" -v`
Expected: FAIL — `nameToKeyword` is not exported

- [ ] **Step 3: Implement `nameToKeyword`**

Add to `src/lib/pinyin-keyword.ts`:

```typescript
export function nameToKeyword(text: string, phoneDict?: Map<string, string>): string {
  // Strip non-alphanumeric, non-CJK characters
  const cleaned = text.replace(/[^\p{L}\p{N}\s]/gu, '').trim();
  if (!cleaned) return `${text} @${text}`;

  // Detect language: if contains any CJK character, treat as Chinese
  if (/[一-鿿㐀-䶿]/.test(cleaned)) {
    return chineseToKeyword(cleaned);
  }

  // Pure English/Latin — use ARPAbet conversion
  const dict = phoneDict ?? new Map();
  return englishToKeyword(cleaned, dict);
}
```

Note: `chineseToKeyword()` and `englishToKeyword()` are already defined above in the same file. The regex range `[一-鿿]` matches CJK Unified Ideographs (equivalent to the existing `[一-鿿]` pattern).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/__tests__/pinyin-keyword.test.ts --testNamePattern="nameToKeyword" -v`
Expected: PASS

- [ ] **Step 5: Run all tests together**

Run: `npx jest src/__tests__/pinyin-keyword.test.ts -v`
Expected: All tests PASS (existing `splitPinyin` + `chineseToKeyword` + all new tests)

- [ ] **Step 6: Commit**

```bash
git add src/__tests__/pinyin-keyword.test.ts src/lib/pinyin-keyword.ts
git commit -m "feat(wake-word): add nameToKeyword unified entry point with language detection"
```

---

### Task 6: Update `download-kws-models.sh` for bilingual model

**Files:**
- Modify: `scripts/download-kws-models.sh`

- [ ] **Step 1: Update download script**

Replace the KWS section in `scripts/download-kws-models.sh`. Change:

```
KWS_URL="https://github.com/k2-fsa/sherpa-onnx/releases/download/kws-models/sherpa-onnx-kws-zipformer-wenetspeech-3.3M-2024-01-01.tar.bz2"
KWS_TARBALL="sherpa-onnx-kws-zipformer-wenetspeech-3.3M-2024-01-01.tar.bz2"
```

To:

```
KWS_URL="https://github.com/k2-fsa/sherpa-onnx/releases/download/kws-models/sherpa-onnx-kws-zipformer-zh-en-3M-2025-12-20.tar.bz2"
KWS_TARBALL="sherpa-onnx-kws-zipformer-zh-en-3M-2025-12-20.tar.bz2"
```

Also update the idempotency check from:

```
if [ -f "$KWS_DIR/encoder-epoch-12-avg-2-chunk-16-left-64.onnx" ] && ...
```

To:

```
if [ -f "$KWS_DIR/encoder-epoch-13-avg-2-chunk-16-left-64.onnx" ] && [ -f "$KWS_DIR/decoder-epoch-13-avg-2-chunk-16-left-64.onnx" ] && [ -f "$KWS_DIR/joiner-epoch-13-avg-2-chunk-16-left-64.onnx" ]; then
```

And the extraction copy path from:

```
cp -r "$TMPDIR_KWS/sherpa-onnx-kws-zipformer-wenetspeech-3.3M-2024-01-01/"* "$KWS_DIR/"
```

To:

```
cp -r "$TMPDIR_KWS/sherpa-onnx-kws-zipformer-zh-en-3M-2025-12-20/"* "$KWS_DIR/"
```

- [ ] **Step 2: Commit**

```bash
git add scripts/download-kws-models.sh
git commit -m "feat(wake-word): update download script for bilingual zh-en model"
```

---

### Task 7: Download new model and clean up old files

**Files:**
- Modify: `resources/sherpa-onnx/kws/` directory contents

- [ ] **Step 1: Remove old model files**

Run:
```bash
cd resources/sherpa-onnx/kws
rm -f encoder-epoch-12-avg-2-chunk-16-left-64.onnx \
      encoder-epoch-12-avg-2-chunk-16-left-64.int8.onnx \
      decoder-epoch-12-avg-2-chunk-16-left-64.onnx \
      decoder-epoch-12-avg-2-chunk-16-left-64.int8.onnx \
      joiner-epoch-12-avg-2-chunk-16-left-64.onnx \
      joiner-epoch-12-avg-2-chunk-16-left-64.int8.onnx \
      encoder-epoch-99-avg-1-chunk-16-left-64.onnx \
      encoder-epoch-99-avg-1-chunk-16-left-64.int8.onnx \
      decoder-epoch-99-avg-1-chunk-16-left-64.onnx \
      decoder-epoch-99-avg-1-chunk-16-left-64.int8.onnx \
      joiner-epoch-99-avg-1-chunk-16-left-64.onnx \
      joiner-epoch-99-avg-1-chunk-16-left-64.int8.onnx \
      keywords.txt keywords_raw.txt README.md configuration.json
rm -rf test_wavs
```

- [ ] **Step 2: Download and extract new model**

Run: `bash scripts/download-kws-models.sh`
Expected: downloads `sherpa-onnx-kws-zipformer-zh-en-3M-2025-12-20.tar.bz2`, extracts into `resources/sherpa-onnx/kws/`

- [ ] **Step 3: Verify new model files exist**

Run: `ls -la resources/sherpa-onnx/kws/`
Expected: see `encoder-epoch-13-avg-2-chunk-16-left-64.onnx`, `decoder-epoch-13-avg-2-chunk-16-left-64.onnx`, `joiner-epoch-13-avg-2-chunk-16-left-64.onnx`, `tokens.txt`, `en.phone`

- [ ] **Step 4: Verify `en.phone` format**

Run: `head -5 resources/sherpa-onnx/kws/en.phone`
Expected: lines in format `WORD  PHONE1 PHONE2 ...` (verify CMUdict-like format)

- [ ] **Step 5: Commit**

```bash
git add resources/sherpa-onnx/kws/
git commit -m "feat(wake-word): replace Chinese-only model with bilingual zh-en model"
```

---

### Task 8: Update `WakeWordEngine` to use bilingual model

**Files:**
- Modify: `electron/wake-word.ts`

- [ ] **Step 1: Update imports and class properties**

Replace the import line:
```typescript
import { chineseToKeyword } from '../src/lib/pinyin-keyword';
```
With:
```typescript
import { nameToKeyword, loadPhoneDict } from '../src/lib/pinyin-keyword';
```

Add a class property after `private active = false;`:
```typescript
  private phoneDict: Map<string, string> | null = null;
```

- [ ] **Step 2: Remove Chinese-only check from `init()`**

Remove lines 20-22:
```typescript
    if (!/[一-鿿]/.test(keyword)) {
      throw new Error('唤醒词必须包含中文字符，请在 Persona 设置中修改为中文名称');
    }
```

Replace with a check for empty/whitespace:
```typescript
    if (!keyword || !keyword.trim()) {
      throw new Error('唤醒词不能为空');
    }
```

- [ ] **Step 3: Update model paths from `epoch-12` to `epoch-13`**

In the `KeywordSpotter` config, change all three model paths:
```typescript
            encoder: path.join(resourcesDir, 'encoder-epoch-13-avg-2-chunk-16-left-64.onnx'),
            decoder: path.join(resourcesDir, 'decoder-epoch-13-avg-2-chunk-16-left-64.onnx'),
            joiner: path.join(resourcesDir, 'joiner-epoch-13-avg-2-chunk-16-left-64.onnx'),
```

- [ ] **Step 4: Load phone dict and add language-aware keywordsScore**

After the `resourcesDir` line and before writing keywords file, load the phone dict:

```typescript
    const phoneDictPath = path.join(resourcesDir, 'en.phone');
    this.phoneDict = loadPhoneDict(phoneDictPath);
    if (this.phoneDict.size === 0) {
      log.warn('WakeWordEngine: en.phone 未找到或为空，英文唤醒词将使用逐字母回退');
    }
```

In the `KeywordSpotter` config, set `keywordsScore` based on language:
```typescript
        keywordsScore: /^[A-Za-z\s]+$/.test(keyword.trim()) ? 1.5 : 1.0,
```

- [ ] **Step 5: Update `writeKeywordsFile()` to use `nameToKeyword()`**

Replace:
```typescript
  private writeKeywordsFile(keyword: string): void {
    const keywordStr = chineseToKeyword(keyword);
    fs.writeFileSync(this.keywordsFilePath, keywordStr + '\n', 'utf-8');
  }
```
With:
```typescript
  private writeKeywordsFile(keyword: string): void {
    const keywordStr = nameToKeyword(keyword, this.phoneDict ?? undefined);
    fs.writeFileSync(this.keywordsFilePath, keywordStr + '\n', 'utf-8');
  }
```

- [ ] **Step 6: Update init log with language info**

Replace:
```typescript
    log.info('WakeWordEngine: 初始化完成, 关键词:', keyword);
```
With:
```typescript
    const lang = /[一-鿿]/.test(keyword) ? '中文' : '英文';
    log.info('WakeWordEngine: 初始化完成, 关键词:', keyword, '语言:', lang);
```

- [ ] **Step 7: Verify final `wake-word.ts` compiles**

Run: `npx tsc --noEmit --project tsconfig.electron.json`
Expected: no errors

- [ ] **Step 8: Commit**

```bash
git add electron/wake-word.ts
git commit -m "feat(wake-word): update WakeWordEngine for bilingual zh-en model"
```

---

### Task 9: Build verification

- [ ] **Step 1: Build Electron main process**

Run: `npm run build:electron`
Expected: successful build, no errors

- [ ] **Step 2: Run all tests**

Run: `npx jest src/__tests__/pinyin-keyword.test.ts -v`
Expected: All tests PASS

- [ ] **Step 3: Verify dev mode launches**

Run: `npm run electron:dev`
Expected: App launches, check `~/.aiva/logs/aiva-$(date +%Y-%m-%d).log` for:
- `WakeWordEngine: 模型目录: ... 目录存在: true`
- If wake word enabled: `WakeWordEngine: 初始化完成, 关键词: Aiva 语言: 英文` (or Chinese name if persona uses Chinese)

- [ ] **Step 4: Final commit (if any fixes were needed)**

```bash
git add -A
git commit -m "fix(wake-word): address build verification issues"
```
