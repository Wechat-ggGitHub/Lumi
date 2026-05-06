# 字幕弹窗固定高度优化

## 问题

当前字幕弹窗在 Agent 交付结果后朗读时，窗口高度会动态跳变：
- 窗口初始 140px
- ResizeObserver 检测到所有文字渲染后，通过 IPC 将窗口调整到 `42 + contentHeight + 28`（最大 400px）
- 所有 word 一次性全部渲染，导致高度从 140px 跳变到内容实际高度
- 没有 height transition，跳变是瞬时的

用户体验差：弹窗高度不稳定，视觉上造成干扰。

## 方案

采用**固定高度 + 平滑滚动**方案：

- 弹窗窗口高度固定为 150px，不再动态调整
- 文字区域固定约 4 行（92px），超出内容通过滚动查看
- 当前朗读词通过 scrollIntoView({ block: 'center', behavior: 'smooth' }) 自动居中
- 底部添加渐变遮罩（28px），暗示还有更多内容
- 已读文字半透明（rgba(255,255,255,0.45)），当前词高亮（#ffffff），未读文字透明

## 参数

| 属性 | 值 |
|------|-----|
| 窗口宽度 | 340px（不变） |
| 窗口高度 | 150px（固定） |
| 头部区域 | 头像 + 波形 ≈ 32px |
| 文字区域 | ≈ 92px（4行 × 23px 行高） |
| 渐变遮罩 | 底部 28px，transparent → 背景色 |
| 滚动方式 | scrollIntoView({ block: 'center', behavior: 'smooth' }) |
| 动态调高 | 移除 |

## 改动范围

### `electron/subtitle-popup.ts`

- `ensureWindow()` 中窗口初始高度改为 150px
- 移除 `tts-content-height` IPC 监听器（不再动态调整窗口高度）
- `show()` 中不再需要高度相关逻辑

### `src/app/subtitle/page.tsx`

- 滚动容器设为固定高度 `92px`（或通过 calc 从 150px 减去 header 和 padding）
- 移除 ResizeObserver 中向主进程发送 `tts-content-height` 的逻辑
- 添加底部渐变遮罩元素（position: absolute，bottom: 14px，28px 高）
- 保持现有的 scrollIntoView 自动滚动行为不变
- 保持现有的手动滚动暂停 2 秒行为不变

## 不变的部分

- word 渲染方式（一次性全部渲染，通过透明度区分已读/当前/未读）
- 50ms tick 定时器驱动的 currentIndex 更新
- 音频播放逻辑
- 头部区域（头像 + 波形动画）
- 关闭按钮行为
- 页面加载和 IPC 通信流程
