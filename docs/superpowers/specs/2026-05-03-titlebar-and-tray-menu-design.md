# 标题栏统一 & Tray 菜单文案优化

日期: 2026-05-03

## 目标

1. 主窗口标题栏颜色与页面背景统一，消除"页面嵌入窗口"的视觉割裂
2. Tray 右键菜单文案简化

## 变更 1：隐藏式标题栏

### BrowserWindow 配置

`electron/main.ts` 中的 `createMainWindow()` 和 `createOnboardingWindow()` 添加：

- `titleBarStyle: 'hidden'` — 隐藏 macOS 标题栏文字和灰色背景，保留原生交通灯按钮
- `backgroundColor: '#faf9f5'` — 避免窗口创建时的白色闪烁
- `trafficLightPosition: { x: 16, y: 18 }` — 将交通灯定位到距左上角合适位置

### 页面 Header 调整

各页面的顶部组件需要：

1. 添加顶部 padding（约 28px / `pt-7`）为交通灯按钮预留空间
2. 整个 header 区域添加 CSS `-webkit-app-region: drag` 使其可拖拽
3. Header 内可交互元素（按钮、输入框等）添加 `-webkit-app-region: no-drag`

涉及组件：
- `src/components/chat/ChatHeader.tsx`
- settings 页面的 `PageHeader`
- 其他有顶部 header 的页面

### 拖拽区域

- Header 区域 = `drag`
- Header 内按钮/输入框 = `no-drag`
- 页面其余区域默认不可拖拽

## 变更 2：Tray 右键菜单文案

`electron/tray.ts` 中的 context menu 从：

```
Aiva (disabled)
---
设置...
---
退出 Aiva
```

改为：

```
设置
---
退出
```

去掉禁用标题行和多余分隔符。

## 不做的事情

- 不做 frame: false 完全无边框（需要手动实现交通灯，工作量大且体验不如原生）
- 不做暗色模式下的 backgroundColor 动态切换（Electron 不支持，交通灯按钮始终可见）
- 不改动 Dock 图标的右键菜单（本次只改 tray）
