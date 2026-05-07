# 字幕弹窗全透明 + 句子解析修复

日期: 2026-05-05

## 问题

1. **Bug: 字幕只显示省略号** — TTS 合成成功（有音频），但字幕区域只显示 `...`，无文字。
2. **UI: 磨砂半透明改为全透明** — 当前 `rgba(40,40,55,0.75)` + `backdropFilter: blur(24px)` 效果需要去掉，改为纯文字无背景。

## Bug 根因

`electron/tts.ts` 的 `EVENT_TTS_SENTENCE_END` 处理器解析句子数据的路径与火山引擎 TTS API v3 实际返回结构不匹配。

**API 实际返回** (来自日志):
```json
{
  "phonemes": [],
  "text": "哈哈对呀，咱俩就这么聊着呗...",
  "words": [
    {"startTime": 0.435, "endTime": 0.625, "word": "哈"},
    ...
  ]
}
```

**当前代码尝试的路径** (`tts.ts:301-302`):
- `payload.res_params.text` — 不存在
- `payload.payload.text` — 不存在
- `payload.sentence.text` — 不存在
- `payload.text` — **存在但未被检查**

`duration` 同理：API 不返回顶层 `duration`，需要从 `words` 数组计算。

**结果**: `sentences` 为空数组 → `main.ts:602` 转为 `null` → `page.tsx:256` 渲染 fallback `'...'`。

## 修复方案

### 1. `electron/tts.ts` — 句子解析修复

在 `EVENT_TTS_SENTENCE_END` case 中:

- 文本提取增加 `payload?.text` 作为首选路径（放在最前面）
- duration 计算增加从 `words` 数组推导的逻辑：`lastWord.endTime - firstWord.startTime`
- 保留原有 fallback 路径作为兼容

```typescript
case EVENT_TTS_SENTENCE_END:
  {
    const sentenceText = payload?.text
      ?? payload?.res_params?.text
      ?? payload?.payload?.text
      ?? payload?.sentence?.text
      ?? '';

    let duration = payload?.res_params?.duration
      ?? payload?.payload?.duration
      ?? 0;

    if (duration === 0 && payload?.words?.length > 0) {
      duration = payload.words[payload.words.length - 1].endTime - payload.words[0].startTime;
    }

    if (duration > 0 && sentenceText) {
      sentences.push({
        text: sentenceText,
        startTime: cumulativeTime,
        endTime: cumulativeTime + duration,
      });
      cumulativeTime += duration;
    }
  }
  break;
```

### 2. `src/app/subtitle/page.tsx` — 全透明 UI

**去掉的样式**:
- `background: rgba(40, 40, 55, 0.75)` → `background: transparent`
- `backdropFilter: blur(24px)` → 移除
- `WebkitBackdropFilter: blur(24px)` → 移除
- `border: 1px solid rgba(255, 255, 255, 0.12)` → 移除
- `boxShadow: 0 4px 24px rgba(0, 0, 0, 0.3)` → 移除
- 顶部/底部渐变遮罩 div → 移除（颜色基于旧背景色，全透明下无意义）

**保留的元素**:
- 头像 + 波形动画（Header 区域）
- 文字颜色层次（当前句白色、已播灰暗、未播渐亮）
- 关闭按钮（右上角）
- 自动滚动逻辑
- 透明度渐入动画

## 涉及文件

| 文件 | 变更类型 |
|------|---------|
| `electron/tts.ts` | Bug fix — 句子解析路径 |
| `src/app/subtitle/page.tsx` | UI — 去背景/边框/遮罩 |

## 验证标准

1. TTS 播报时字幕弹窗显示实际句子文字（不再显示省略号）
2. 句子按时序高亮同步
3. 弹窗背景完全透明，只看到文字浮在桌面上
4. 关闭按钮正常工作
5. 播放完毕后弹窗自动关闭
