# Aiva UI Bug 修复设计文档

日期: 2026-04-23

## 概述

修复 Aiva 应用的 4 个 UI/UX 问题：语音转文字为空、Dock 图标缺失、Tray 点击行为异常、语音悬浮窗缺少关闭按钮。同时新增摘要面板记录详情查看功能。

---

## Bug 1: 语音转文字为空

### 根因

`electron/main.ts` 中 `handleRightCommand` 在 `stopRecording` 后调用 `recorder.transcribe()`，sherpa-onnx 可能返回空字符串，但状态仍从 `transcribing` 转到 `editing`，用户看到空文本框。可能的根因包括：
- sherpa-onnx 模型文件（`sensevoice-small-int8.onnx`）缺失或路径错误
- 录音文件为空或格式不对
- sherpa-onnx 初始化失败但被静默吞掉

### 修复方案

**层 1 — 防御性处理**:
- 在 `handleRightCommand` 的 `stop-recording` 分支中，转写完成后检查结果是否为空
- 空结果时：状态回退到 `idle`，向 voiceBar 发送 `voice:error` 事件
- voiceBar 收到后显示 "未能识别语音，请重试" 提示，2 秒后自动关闭窗口

**层 2 — 根因排查**:
- 检查 sherpa-onnx 模型文件路径和加载逻辑
- 在 `recorder.transcribe()` 中添加日志，记录模型加载状态和转写结果
- 校验录音文件大小，小于阈值时提前报错

### 涉及文件

- `electron/main.ts` — handleRightCommand 中空文本处理
- `electron/recorder.ts` — transcribe 添加日志和错误处理
- `src/components/VoiceInput.tsx` — 添加 error 状态 UI
- `src/app/voice-bar/page.tsx` — 处理 `voice:error` IPC 事件

---

## Bug 2: Dock 图标缺失

### 根因

`electron-builder.yml` 未配置 `mac.icon`，`resources/` 目录下没有 `.icns` 图标文件。

### 修复方案

1. 生成一个简单的占位 `.icns` 图标（紫色背景 + "S" 字母），放到 `resources/icon.icns`
2. 在 `electron-builder.yml` 中添加：
   ```yaml
   mac:
     icon: resources/icon.icns
   ```
3. 不调用 `app.dock.hide()`，保留 Dock 图标显示

### 涉及文件

- `electron-builder.yml` — 添加 mac.icon 配置
- `resources/icon.icns` — 新增图标文件

---

## Bug 3: 左键 Tray 点击行为异常

### 根因

`tray.ts` 中 `this.summaryWindow` 和 `main.ts` 中全局 `summaryPopup` 是两个不同的 SummaryPopupWindow 实例。`toggleSummaryPopup` 操作的是 tray 自己的引用，而 `show` 通过回调委托给 main.ts 的全局实例，导致窗口管理不一致。

此外，macOS 上 `tray.setContextMenu()` 会同时绑定左键和右键行为，导致左键无法触发 `click` 事件。

### 修复方案

1. **移除 `tray.setContextMenu()` 的自动绑定**，改为手动管理右键菜单
2. **使用 `tray.on('click')` 处理左键**：调用 main.ts 的回调显示摘要面板
3. **使用 `tray.on('right-click')` 处理右键**：用 `Menu.popup()` 手动弹出上下文菜单
4. **统一 SummaryPopupWindow 为单例**：移除 tray.ts 内部的 `this.summaryWindow`，所有操作委托给 main.ts 的唯一实例

### 涉及文件

- `electron/tray.ts` — 重构点击事件处理，移除内部 summaryWindow
- `electron/main.ts` — 调整 tray 初始化和回调注册

---

## Bug 4: 语音悬浮窗缺少关闭按钮

### 根因

`VoiceInput.tsx` 没有关闭按钮 UI。`recording` 和 `transcribing` 状态下没有绑定 Escape 键，用户无法取消操作。

### 修复方案

1. 在 VoiceInput.tsx 中添加一个绝对定位的 X 关闭按钮，固定在右上角
2. 三种状态（recording、transcribing、editing）下都显示该按钮
3. hover 时高亮（颜色变亮 + 圆形背景）
4. 点击 X 触发 `onCancel`，执行：
   - recording → 停止录音 + 关闭窗口 + 回到 idle
   - transcribing → 中断转写 + 关闭窗口 + 回到 idle
   - editing → 丢弃文本 + 关闭窗口 + 回到 idle

### 涉及文件

- `src/components/VoiceInput.tsx` — 添加 X 按钮 UI
- `src/app/voice-bar/page.tsx` — 确保 onCancel 在所有状态下正确处理
- `electron/main.ts` — `voice:cancel` 处理中增加对 recording/transcribing 状态的停止逻辑

---

## 新功能: 摘要面板记录详情

### 需求

用户点击摘要面板中的记录条目时，弹出一个新的详情窗口，展示完整的执行输入和输出。

### 设计

1. 摘要面板每条记录添加 `cursor: pointer` 和 hover 高亮效果
2. 点击记录后通过 IPC 发送 `summary:open-detail` 事件到 main.ts
3. main.ts 创建一个新的 BrowserWindow 显示详情页
4. 详情页路由: `/summary/detail?id=<execution_id>`
5. 详情页内容：
   - 顶部：返回按钮（关闭窗口）
   - 标题：用户原始输入
   - 状态 + 时间
   - 输入区域（用户 prompt）
   - 输出区域（Claude 响应）
6. 数据来源：从 SQLite `execution_history` 表按 id 查询

### 涉及文件

- `electron/main.ts` — 新增详情窗口创建逻辑，监听 `summary:open-detail` IPC
- `src/app/summary/page.tsx` — 记录条目添加点击事件和 hover 样式
- `src/app/summary/detail/page.tsx` — 新增详情页面
- `src/lib/db.ts` — 可能需要添加按 id 查询的方法
