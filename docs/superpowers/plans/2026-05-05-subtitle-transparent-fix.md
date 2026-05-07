# 字幕弹窗全透明 + 句子解析修复 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking tracking.

**Goal:** 修复 TTS 句子解析 bug（只显示省略号），并将字幕弹窗 UI 从磨砂半透明改为全透明。

**Architecture:** 修复 `tts.ts` 中 `EVENT_TTS_SENTENCE_END` 的 payload 解析路径（`payload.text` 在顶层但代码没检查），同时从 `words` 数组计算 duration。UI 端去掉背景、模糊、边框、阴影和渐变遮罩。

**Tech Stack:** TypeScript, Electron, React, Jest

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `src/__tests__/tts-sentence-parser.test.ts` | Create | 测试句子解析逻辑 |
| `electron/tts.ts` | Modify | 修复句子解析路径 + 提取解析函数 |
| `src/app/subtitle/page.tsx` | Modify | 去掉磨砂背景/边框/阴影/遮罩 |

---

### Task 1: Write failing test for sentence parsing

**Files:**
- Create: `src/__tests__/tts-sentence-parser.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
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
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/__tests__/tts-sentence-parser.test.ts --no-cache 2>&1 | head -20`
Expected: FAIL — `Cannot find module '../../electron/tts-sentence-parser'`

---

### Task 2: Implement sentence parser and fix tts.ts

**Files:**
- Create: `electron/tts-sentence-parser.ts`
- Modify: `electron/tts.ts:297-309`

- [ ] **Step 1: Create the parser module**

```typescript
// electron/tts-sentence-parser.ts

interface ParsedSentence {
  text: string;
  duration: number;
}

export function parseSentenceFromPayload(payload: any): ParsedSentence | null {
  const sentenceText =
    payload?.text
    ?? payload?.res_params?.text
    ?? payload?.payload?.text
    ?? payload?.sentence?.text
    ?? '';

  let duration =
    payload?.res_params?.duration
    ?? payload?.payload?.duration
    ?? 0;

  if (duration === 0 && payload?.words?.length > 0) {
    duration = payload.words[payload.words.length - 1].endTime - payload.words[0].startTime;
  }

  if (duration > 0 && sentenceText) {
    return { text: sentenceText, duration };
  }

  return null;
}
```

- [ ] **Step 2: Run test to verify it passes**

Run: `npx jest src/__tests__/tts-sentence-parser.test.ts --no-cache`
Expected: 4 tests PASS

- [ ] **Step 3: Update tts.ts to use the parser**

In `electron/tts.ts`, add import at the top:

```typescript
import { parseSentenceFromPayload } from './tts-sentence-parser';
```

Replace lines 297-309 (the `EVENT_TTS_SENTENCE_END` case body):

```typescript
            case EVENT_TTS_SENTENCE_END:
              log.info('TTS: SentenceEnd payload:', JSON.stringify(payload));
              {
                const parsed = parseSentenceFromPayload(payload);
                if (parsed) {
                  sentences.push({
                    text: parsed.text,
                    startTime: cumulativeTime,
                    endTime: cumulativeTime + parsed.duration,
                  });
                  cumulativeTime += parsed.duration;
                }
              }
              break;
```

- [ ] **Step 4: Run test again to confirm nothing broke**

Run: `npx jest src/__tests__/tts-sentence-parser.test.ts --no-cache`
Expected: 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add electron/tts-sentence-parser.ts src/__tests__/tts-sentence-parser.test.ts electron/tts.ts
git commit -m "fix: correct TTS sentence parsing — use top-level payload.text and compute duration from words"
```

---

### Task 3: Remove frosted glass UI from subtitle page

**Files:**
- Modify: `src/app/subtitle/page.tsx:142-283`

- [ ] **Step 1: Replace the outer container styles**

In `src/app/subtitle/page.tsx`, replace the outer `<div>` style block (lines 143-159). Change from:

```typescript
        background: 'rgba(40, 40, 55, 0.75)',
        borderRadius: '14px',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        border: '1px solid rgba(255, 255, 255, 0.12)',
        boxShadow: '0 4px 24px rgba(0, 0, 0, 0.3)',
```

To:

```typescript
        background: 'transparent',
```

Remove these 5 lines entirely: `borderRadius`, `backdropFilter`, `WebkitBackdropFilter`, `border`, `boxShadow`. Keep all other style properties in the block (position, display, flexDirection, padding, opacity, transition, minHeight, color, fontFamily).

- [ ] **Step 2: Remove the gradient mask divs**

Delete lines 258-282 — the two gradient mask `<div>` elements (top mask and bottom mask). These used `rgba(40, 40, 55, 0.9)` which was the old background color and have no purpose with a transparent background.

- [ ] **Step 3: Verify the page compiles**

Run: `npx next build 2>&1 | tail -5`
Expected: Build succeeds with no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/subtitle/page.tsx
git commit -m "style: remove frosted glass from subtitle popup, use fully transparent background"
```

---

### Task 4: Manual verification

- [ ] **Step 1: Start Electron dev mode**

Run: `npm run electron:dev`

- [ ] **Step 2: Trigger a voice command that produces a TTS response**

Press right Option key, speak a prompt, let Claude execute and respond.

- [ ] **Step 3: Verify all 5 acceptance criteria**

1. Subtitle popup shows actual sentence text (not `...`)
2. Sentences highlight in sync with audio playback
3. Popup background is fully transparent — only text visible on desktop
4. Close button works
5. Popup auto-closes after playback finishes
