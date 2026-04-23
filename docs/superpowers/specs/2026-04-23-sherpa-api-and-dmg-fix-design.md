# Fix: sherpa-onnx API 兼容性 + DMG 安装体验

Date: 2026-04-23

## 问题 1: sherpa-onnx API 不兼容

**错误**: `sherpaOnnx.createOfflineRecognizer is not a function`

**根因**: `sherpa-onnx-node` v1.10+ 移除了 `createOfflineRecognizer()` 工厂函数，改为 `new OfflineRecognizer()` 构造函数。转写流程也从直接操作 recognizer 变为 stream-based 模式。

**修复** (`src/lib/sherpa.ts`):
- `sherpaOnnx.createOfflineRecognizer(config)` → `new sherpaOnnx.OfflineRecognizer(config)`
- `transcribe()` 改为 `createStream()` → `stream.acceptWaveform()` → `decode(stream)` → `getResult(stream)`
- 补上 config 中缺失的 `tokens` 路径

## 问题 2: Launchpad 里找不到 app

**根因**: electron-builder 的 DMG 缺少 `dmg.contents` 配置，用户没有标准的「拖入 Applications」引导。

**修复** (`electron-builder.yml`):
- 添加 `dmg.contents` 配置，提供标准的 DMG 拖拽安装界面
- 拖入 /Applications 后 Launchpad 会自动索引
