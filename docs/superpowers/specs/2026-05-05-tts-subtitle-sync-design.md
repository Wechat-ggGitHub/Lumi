# TTS 字幕同步 + 关闭按钮设计

## 概述

解决两个问题：1）字幕滚动与语音朗读不同步；2）缺少点击关闭朗读的交互方式。

## 需求

- 字幕滚动与 TTS 朗读精确同步（句级别）
- 字幕弹窗右上角添加关闭按钮，点击即停止朗读并关闭弹窗

## 现状分析

当前字幕滚动使用基于文件大小估算时长的均匀线性滚动（`elapsed / estimatedDuration`），没有句子级别的时间戳，导致文字和声音不同步。字幕弹窗设置了 `focusable: false`，无法接收点击事件。

## 数据流

```
TTS 合成阶段
  → audio_params 中启用 enable_timestamp: true
  → TTSSentenceEnd (event=351) 事件中收集每句 text + startTime + endTime
  → synthesize() 返回 { audioPath, sentences }

播放阶段
  → subtitlePopup.show() 接收 sentences 数组
  → 前端根据本地计时器计算 elapsed
  → 匹配当前句子并滚动到对应位置
```

## 改动清单

### 1. electron/tts.ts — 收集句子时间戳

**数据结构**：
```typescript
export interface TtsSentence {
  text: string;       // 句子文本
  startTime: number;  // 该句开始时间（秒）
  endTime: number;    // 该句结束时间（秒）
}
```

**synthesize() 返回值变更**：
```typescript
// 之前: Promise<string | null>
// 之后: Promise<{ audioPath: string; sentences: TtsSentence[] } | null>
```

**改动点**：
- `StartSession` 的 `audio_params` 中添加 `enable_timestamp: true`
- 在 `EVENT_TTS_SENTENCE_END` (351) 事件处理中解析 payload，提取 `payload.res_params.duration` 和累计时间计算每句的 `startTime/endTime`
- 从 `payload.res_params.text`（或 `payload.sentence.text`）获取句子文本
- 将收集的 `sentences` 随音频路径一起返回

**时间计算逻辑**：
- 维护 `cumulativeTime = 0` 变量
- 每收到一个 `TTSSentenceEnd`，该句的 `startTime = cumulativeTime`，`endTime = cumulativeTime + payload.res_params.duration`
- 然后更新 `cumulativeTime = endTime`

### 2. electron/subtitle-popup.ts — 传递句子数据 + 可点击

**show() 签名变更**：
```typescript
// 之前: show(text, trayBounds, duration)
// 之后: show(text, trayBounds, duration, sentences?)
```

**窗口改动**：
- `focusable` 改为 `true`，让窗口能接收鼠标事件
- URL query 中新增 `sentences` 参数（JSON 编码后 encodeURIComponent）

### 3. src/app/subtitle/page.tsx — 句级别滚动 + 关闭按钮

**滚动逻辑替换**：
- 如果 `sentences` 参数存在，使用句级别同步滚动
- 前端维护 `elapsed` 计时器（基于页面加载时间，与 `afplay` 启动时间对齐）
- 根据 `elapsed` 在 `sentences` 数组中二分查找当前句子
- 将该句子所在 DOM 元素滚动到可视区域（`scrollTop` 设置为句子元素的 offsetTop）

**渲染结构变更**：
```tsx
{sentences ? (
  sentences.map((s, i) => (
    <span key={i} data-index={i} ref={el => sentenceRefs.current[i] = el}>
      {s.text}
    </span>
  ))
) : (
  text
)}
```

- 当前句子添加高亮样式（如 `color: #fff`），已读句子保持原色
- 如果没有 `sentences` 数据（降级），保持原有均匀滚动

**关闭按钮**：
- 右上角添加 X 按钮
- 样式：半透明背景圆形按钮（约 18x18px），hover 变亮，与深色毛玻璃风格一致
- 位置：`position: absolute; top: 8px; right: 8px`
- 点击后通过 IPC 通知主进程：`ipcRenderer.send('stop-speaking')`

### 4. electron/main.ts — 适配返回值变更

**speakResult() 改动**：
- `synthesize()` 返回值从 `string` 改为 `{ audioPath, sentences }`
- 将 `sentences` 传给 `subtitlePopup.show()`
- 不再需要通过 `fs.statSync` 估算时长（使用 sentences 的总时长或返回的 duration）

## 降级策略

- 如果 `enable_timestamp` 参数不被支持或 `sentences` 为空，回退到原有的均匀滚动
- 前端根据 URL 参数中是否有 `sentences` 决定使用哪种滚动模式
- TTS 合成失败时静默降级，不影响主流程（保持现有行为）

## 运行时验证

- `TTSSentenceEnd` (event=351) 的 payload 精确字段名需要在实际运行中验证（文档中的字段名 `res_params.duration`、`res_params.text` 可能与实际返回略有不同）
- 实现时应在 351 事件处理中添加日志输出完整 payload，确认字段结构后再做解析
- `enable_timestamp` 仅 TTS 1.0 支持确认可用，当前使用 `volc.service_type.10029` 兼容

## 不在范围内

- 字级别/音素级别的高亮效果
- 播放进度条
- 暂停/恢复功能
- TTS 2.0 模型迁移
