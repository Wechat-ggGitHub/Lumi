# 字幕弹窗流式打字机效果

日期: 2026-05-05

## 需求

将字幕弹窗从歌词式逐句高亮改为流式打字机效果——音频读到哪个字就显示哪个字，严格同步，停顿一致。播放结束后波形动画停止。

## 数据流

TTS API 返回 word 级时间戳：`{ word: "哈", startTime: 0.435, endTime: 0.625 }`。目前只用于计算 sentence duration，需要传递到前端驱动打字机效果。

### 数据传递链路

1. `tts-sentence-parser.ts` — `parseSentenceFromPayload` 返回值增加 `words` 数组
2. `tts.ts` — `EVENT_TTS_SENTENCE_END` 收集每个 sentence 的 words 到扁平数组 `allWords[]`
3. `main.ts` — `speakResult` 将 `allWords` 传入 `SubtitlePayload`
4. `subtitle-popup.ts` — IPC 传递 `words` 到渲染进程
5. `page.tsx` — 用 `words[].startTime` 驱动逐字显示

### 关键数据结构

```typescript
interface TtsWord {
  word: string;
  startTime: number; // 相对于音频起始的秒数
  endTime: number;
}
```

`allWords` 是跨句子连续的扁平数组，startTime/endTime 已在 `tts.ts` 中根据 `cumulativeTime` 累加为全局时间。

## 实现细节

### 1. `electron/tts-sentence-parser.ts`

`parseSentenceFromPayload` 返回类型增加可选 `words`：

```typescript
export interface ParsedSentence {
  text: string;
  duration: number;
  words?: Array<{ word: string; startTime: number; endTime: number }>;
}
```

从 `payload.words` 直接透传（已包含 startTime/endTime）。

### 2. `electron/tts.ts`

- `TtsResult` 增加 `words: TtsWord[]`
- `EVENT_TTS_SENTENCE_END`：将 `parsed.words` 合并到 `allWords[]`，offset 加 `cumulativeTime`（与 sentence 的 startTime 对齐）
- `EVENT_SESSION_FINISHED`：将 `allWords` 传入 result

注意：`cumulativeTime` 在 sentence 级别累加。words 的 startTime 是句子内部的相对时间，需要加上 `cumulativeTime`（即当前句子的 startTime）转为全局时间。

### 3. `electron/subtitle-popup.ts`

`SubtitlePayload` 增加 `words` 字段：

```typescript
export interface SubtitlePayload {
  sentences: { text: string; startTime: number; endTime: number }[] | null;
  words: { word: string; startTime: number; endTime: number }[] | null;
  audio: Buffer;
  personaName: string;
}
```

### 4. `electron/main.ts`

`speakResult` 中读取 `result.words`，传入 payload：

```typescript
const words = result.words.length > 0 ? result.words : null;
subtitlePopup.show(trayBounds, {
  audio: audioBuffer,
  sentences,
  words,
  personaName: profile.name,
});
```

### 5. `src/app/subtitle/page.tsx` — 核心渲染逻辑变更

**去掉：**
- sentences 渲染（`sentences.map`）
- 句子颜色层次逻辑（`getSentenceColor`）
- 自动滚动逻辑（`scrollRef.scrollTop`）
- mask-image 遮罩

**新增：**
- `words` state（替代 `sentences`）
- `requestAnimationFrame` 循环：比较 `audioCtx.currentTime - startTimeRef` 与每个 word 的 `startTime`
- 渲染逻辑：
  - `word.startTime <= elapsed`：已播字，`color: rgba(255,255,255,0.5)`
  - 当前正在播的字（`elapsed >= startTime && elapsed < endTime`）：`color: #ffffff`
  - 当前字后面显示绿色闪烁光标
  - 未播字：`color: transparent`（占位不显示）

**波形动画控制：**
- 新增 `isPlaying` state
- 音频 `source.start(0)` 时设为 `true`
- `source.onended` 时设为 `false`
- 波形条的 `animation` 属性由 `isPlaying` 控制：播放中 `waveBar 0.5s infinite alternate`，停止后无动画

**同步精度：**
- 使用 `AudioContext.currentTime` 作为时间基准（与 `source.start(0)` 的时间线一致）
- `startTimeRef.current = ctx.currentTime` 在 `source.start(0)` 同时设置
- `elapsed = ctx.currentTime - startTimeRef.current` 直接映射到 words 的 startTime
- 不使用 `Date.now()` 或 `setTimeout`，避免漂移

## 涉及文件

| 文件 | 变更类型 |
|------|---------|
| `electron/tts-sentence-parser.ts` | 修改 — 返回 words |
| `electron/tts.ts` | 修改 — 收集 words 到 allWords |
| `electron/subtitle-popup.ts` | 修改 — payload 增加 words |
| `electron/main.ts` | 修改 — 传递 words |
| `src/app/subtitle/page.tsx` | 重写渲染逻辑 |

## 验证标准

1. 音频和文字严格同步——听到某个字时该字恰好出现
2. 停顿/间隙一致——文字停顿和语音停顿完全对应
3. 当前字白色 + 绿色光标，已播字半透明
4. 播放结束后波形动画停止
5. 关闭按钮正常工作
6. 播放完毕后弹窗自动关闭
