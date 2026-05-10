# Bilingual Wake Word Support Design

Replace the Chinese-only wake word model with a bilingual Chinese-English model so that English persona names (e.g. "Aiva") can be used as wake words alongside Chinese names.

## Problem

The current wake word system uses `sherpa-onnx-kws-zipformer-wenetspeech-3.3M-2024-01-01`, a Chinese-only model. The `WakeWordEngine.init()` enforces `/[一-鿿]/` regex check — non-Chinese names throw an error. As an open-source project, users worldwide need both Chinese and English wake word support.

## Approach

Replace with `sherpa-onnx-kws-zipformer-zh-en-3M-2025-12-20`, a single bilingual zipformer transducer model that supports both Chinese and English keywords simultaneously.

## Model Replacement

**Old model** (delete from `resources/sherpa-onnx/kws/`):
- All `epoch-12-avg-2-chunk-16-left-64.*` and `epoch-99-avg-1-chunk-16-left-64.*` files (fp32 + int8)
- Old `tokens.txt` (pinyin-only, 228 entries)
- `keywords.txt`, `keywords_raw.txt`, `test_wavs/`, `README.md`, `configuration.json`

**New model** (download from `https://github.com/k2-fsa/sherpa-onnx/releases/download/kws-models/sherpa-onnx-kws-zipformer-zh-en-3M-2025-12-20.tar.bz2`):
- `encoder-epoch-13-avg-2-chunk-16-left-64.onnx` (12M)
- `decoder-epoch-13-avg-2-chunk-16-left-64.onnx` (743K)
- `joiner-epoch-13-avg-2-chunk-16-left-64.onnx` (331K)
- `tokens.txt` (1.9K — pinyin + ARPAbet phones)
- `en.phone` (3.2M — English pronunciation dictionary)

Total size increase: ~18M → ~38M (+20M), acceptable for a desktop app.

## Keyword Conversion

### Chinese keywords (unchanged)

Detection: `/[一-鿿]/` regex match → use existing `pinyin-pro` conversion.

Example: `"钱钱"` → `"q ian q ian @钱钱"`

### English keywords (new)

Detection: `/^[A-Za-z\s]+$/` regex match → ARPAbet phone lookup.

1. Load `en.phone` dictionary into a `Map<string, string>` during `WakeWordEngine.init()`
2. For each word in the name, look up in dictionary
3. If found, use the phone sequence directly
4. If not found (rare names), fall back to letter-by-letter ARPAbet mapping
5. Spaces in multi-word names are replaced with underscores for sherpa-onnx

Example: `"AIVA"` → dictionary lookup → `"EY2 IY0 V AH0 @AIVA"`

Fallback example: `"XYLO"` → not in dictionary → `"EH1 K S AY1 L OW1 @XYLO"`

### Mixed-language names

Names containing both Chinese and non-Chinese characters are treated as Chinese (the Chinese portion is used for pinyin conversion).

## Code Changes

### `src/lib/pinyin-keyword.ts`

Add:
- `loadPhoneDict(phoneDictPath: string): Map<string, string>` — parses `en.phone` into a word→phones map
- `englishToKeyword(text: string, phoneDict: Map<string, string>): string` — converts English text to ARPAbet keyword format
- `letterToPhone(letter: string): string[]` — fallback letter-to-ARPAbet mapping
- `nameToKeyword(text: string, phoneDict?: Map<string, string>): string` — unified entry point that detects language and delegates

Keep `chineseToKeyword()` and `splitPinyin()` unchanged.

### `electron/wake-word.ts`

- Remove `/[一-鿿]/` check from `init()`
- Update model paths: `epoch-12` → `epoch-13`
- Load `en.phone` dictionary in `init()` and pass to keyword conversion
- Call `nameToKeyword()` instead of `chineseToKeyword()` in `writeKeywordsFile()`
- When keyword is pure English, set `keywordsScore: 1.5` (vs default 1.0) to boost English sensitivity
- Add language type to initialization log

### Build config

No changes needed — existing `electron-builder.yml` ASAR unpack rules already cover `resources/sherpa-onnx/**/*.onnx`.

## Backward Compatibility

The bilingual model's Chinese keyword format is identical to the old model. Existing Chinese persona names continue to work without any changes.

## Edge Cases

- **Empty/whitespace-only names**: reject as before
- **Names with numbers or special characters**: strip non-alphanumeric characters, then detect language
- **Very short English names** (1-2 letters): may have higher false-positive rate; consider adjusting `keywordsThreshold` upward if needed
- **`en.phone` not found**: fall back to letter-by-letter mapping, log a warning
