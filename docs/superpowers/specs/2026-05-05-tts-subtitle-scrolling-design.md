# TTS 字幕面板自动滚动优化

## 背景

当前字幕弹窗（300x120px）在朗读较长文本时，文字展示不全，超出面板高度的部分不可见。需要实现基于播放进度的动态滚动，让用户始终能看到当前朗读的文字位置。

## 方案

**固定面板 + 时间均匀估算滚动**（提词器效果）。

根据 TTS 合成的 MP3 文件大小估算音频时长，从播放开始计时，按总时长均匀滚动文本，确保当前朗读位置始终在可视区域内。

## 设计

### 1. 面板尺寸调整

- 宽度：300px → **340px**
- 高度：120px → **140px**
- 位置计算随宽度调整更新（`subtitle-popup.ts`）

### 2. 时长估算

TTS 合成的 MP3 文件写完后，通过文件大小估算音频时长：
- 使用的 TTS 音频参数：mp3 格式，sample_rate 24000
- 估算公式：`duration = fileSizeInBytes / 3000`（基于 ~24kbps 比特率）
- 估算发生在 `speakResult()` 函数中，`ttsService.synthesize()` 返回文件路径后

### 3. 参数传递

- `subtitlePopup.show()` 签名增加 `duration: number` 参数
- URL query 传递：`/subtitle?text=...&duration=5.2`
- `electron/main.ts` 中 `speakResult()` 调用处传入 duration

### 4. 前端滚动实现

- 页面加载时获取 `duration`（秒）和 `text`
- 文字区域使用固定高度容器 + `overflow: hidden`
- `requestAnimationFrame` 驱动滚动循环：
  - 计算 `elapsed / duration` 进度比例
  - 滚动量 = `maxScroll * progress`，其中 `maxScroll = contentHeight - containerHeight`
  - 使用 `scrollTop` 平滑滚动
- 已读文字有轻微透明度差异（覆盖一层渐变遮罩，上方已读区域 opacity 略低）
- 文字很短不需要滚动时（`contentHeight <= containerHeight`），不滚动

### 5. 边界处理

- 短文本（内容不超出可视区域）：不滚动，行为与现有一致
- 音频播放结束：面板正常关闭（现有行为不变）
- 时长估算为 0 或异常：fallback 不滚动

## 修改文件清单

| 文件 | 改动 |
|------|------|
| `electron/subtitle-popup.ts` | 面板尺寸 340x140，`show()` 增加 `duration` 参数，URL 传 duration |
| `src/app/subtitle/page.tsx` | 读取 duration 参数，实现 requestAnimationFrame 滚动 + 渐变遮罩 |
| `electron/main.ts` | `speakResult()` 中估算音频时长，传入 `subtitlePopup.show()` |

## 不涉及

- TTS 合成逻辑本身不变（仍是单次合成完整文本）
- 状态管理不变
- IPC 通道不变（TTS 无独立 IPC）
