# TTS 字幕精准同步设计

## 目标

将 TTS 音频播放从 `afplay` 迁移到字幕窗口的 Web Audio API，实现歌词式精准同步：当前朗读的句子居中高亮，已读句子渐隐，整体体验流畅精致。

## 问题诊断

当前实现有 3 个根本性问题：

1. **时钟不对齐**：字幕页用 `performance.now()` 计时，`afplay` 独立启动，两者延迟差 100-300ms 且会漂移
2. **无音频位置反馈**：`afplay` 是黑盒，无法获取当前播放位置
3. **stop-speaking IPC 无响应**：字幕关闭按钮发送消息但 `main.ts` 无对应监听器

## 架构

```
main.ts:
  synthesize() → 写 MP3 → 读 Buffer → IPC('tts-audio-data', buffer, sentences)
  等待 IPC('tts-playback-done') → 清理

subtitle renderer (BrowserWindow):
  收到 IPC('tts-audio-data') → Web Audio API 解码播放
  audioContext.currentTime 驱动动画循环
  播放结束 → IPC('tts-playback-done')
  用户关闭 → IPC('tts-stop-requested')
```

## 数据流

### Phase 1: 合成（不变）

`main.ts` `speakResult()` 调用 `ttsService.synthesize()`，获得 `{ audioPath, sentences }`。

### Phase 2: 音频传输（新）

1. 主进程读 MP3 文件为 `Buffer`：`fs.readFileSync(result.audioPath)`
2. 主进程创建字幕窗口（此时不加载字幕页，只创建 BrowserWindow）
3. 字幕页加载完成后，主进程通过 `win.webContents.send('tts-audio-data', audioBuffer, sentences)` 发送数据
4. 字幕页通过 `ipcRenderer.on('tts-audio-data', ...)` 接收

### Phase 3: 播放与同步（新）

字幕页收到音频数据后：

1. `const audioCtx = new AudioContext()`
2. `const audioBuffer = await audioCtx.decodeAudioData(buffer)` 解码 MP3
3. `const source = audioCtx.createBufferSource()` + `source.buffer = audioBuffer` + `source.connect(audioCtx.destination)`
4. 记录 `startTime = audioCtx.currentTime`，调用 `source.start(0)`
5. 动画循环中用 `elapsed = audioCtx.currentTime - startTime` 获取精确播放位置
6. 根据 `elapsed` 匹配 `sentences[]` 中当前句子，更新高亮和滚动

### Phase 4: 结束与清理（改）

1. `source.onended` 触发 → `ipcRenderer.send('tts-playback-done')`
2. 主进程收到后执行清理：`store.setSpeaking(false)`, `subtitlePopup.close()`, `ttsService.stop()`
3. 用户点击关闭按钮 → `ipcRenderer.send('tts-stop-requested')` → 主进程清理

## 组件设计

### 字幕页 (`src/app/subtitle/page.tsx`)

**状态管理：**
```
sentences: TtsSentence[]  — 句子时间戳列表
audioBuffer: AudioBuffer  — 解码后的音频
startTime: number         — audioCtx.currentTime 播放起点
activeIndex: number       — 当前高亮句子索引
visible: boolean          — 淡入控制
```

**动画循环：**
```
每帧:
  elapsed = audioCtx.currentTime - startTime
  遍历 sentences 找到当前句子 (elapsed >= startTime && elapsed < endTime)
  更新 activeIndex → 触发重新渲染
  滚动当前句子 DOM 到容器 1/3 高度处
  检查是否所有句子播完 → 延迟 500ms 后通知主进程
```

**视觉设计（毛玻璃歌词式）：**

窗口整体：
- 毛玻璃背景：`rgba(40,40,55,0.75)` + `backdrop-filter: blur(24px)`
- 圆角 14px，边框 `rgba(255,255,255,0.12)`
- 阴影 `0 4px 24px rgba(0,0,0,0.3)`

头部区域（纯视觉，无文字）：
- Agent 头像：22x22px 圆角矩形，渐变背景 `linear-gradient(135deg,#667eea,#764ba2)`，显示名称首字母
- 音频波形动画：5 条绿色竖条 (#4CAF50)，高度 4-14px 交替动画，模拟声波
- 无任何文字标签

歌词区域：
- 当前句子：白色 (#ffffff)，fontWeight 500，带绿色光晕 `text-shadow: 0 0 12px rgba(76,175,80,0.3)`
- 已读句子：`rgba(255,255,255,0.25)`，极度淡化
- 未读句子：`rgba(255,255,255,0.5~0.7)`，由近到远递减
- 顶部 28px 渐变遮罩：`linear-gradient(rgba(40,40,55,0.9), transparent)`
- 底部 28px 渐变遮罩：`linear-gradient(transparent, rgba(40,40,55,0.9))`
- 当前句子滚动定位到容器高度的 1/3 处（视觉居中偏上）

头像数据来源：
- 主进程在发送音频数据时一并传 `personaName`（从 `readProfile(aivaDir).name` 获取）
- 字幕页用名称首字母渲染头像

### IPC 协议

| 方向 | 事件名 | 数据 | 说明 |
|------|--------|------|------|
| main → subtitle | `tts-audio-data` | `{ audio: Uint8Array, sentences: TtsSentence[], personaName: string }` | 传输音频、字幕和 Agent 名称 |
| subtitle → main | `tts-playback-done` | 无 | 播放自然结束 |
| subtitle → main | `tts-stop-requested` | 无 | 用户点击关闭 |

### 主进程改动 (`electron/main.ts`)

`speakResult()` 改为：
1. 合成音频（不变）
2. 读 MP3 为 Buffer
3. 调用 `subtitlePopup.show()` 并传入 sentences
4. 监听 `tts-playback-done` 和 `tts-stop-requested` IPC 事件
5. 等待播放完毕或用户停止
6. 清理

删除 `ttsService.play()` 调用。

### TtsService 改动 (`electron/tts.ts`)

- `play()` 方法不再需要，可以删除或保留备用
- `stop()` 不再需要杀 afplay 进程
- `synthesize()` 不变

### SubtitlePopup 改动 (`electron/subtitle-popup.ts`)

- `show()` 参数简化：不再需要 `text` 和 `duration`，只需 `sentences`
- 页面不再从 URL query params 读取数据，改为 IPC 接收
- 需要添加 `webContents.send()` 调用来传递音频数据

## 错误处理

- `decodeAudioData` 失败 → 显示错误提示，通知主进程 `tts-playback-done`
- AudioContext 被浏览器策略阻止 → 用户交互触发（点击页面后 resume）
- IPC 传输大文件失败 → 降级回 afplay + performance.now() 模式

## 降级策略

如果 Web Audio API 不可用或解码失败，降级为当前方案（afplay + 独立时钟）。通过 try-catch 捕获后走 fallback 路径。
