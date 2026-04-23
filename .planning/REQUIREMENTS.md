# Requirements: Shrew MVP

**Defined:** 2026-04-22
**Core Value:** 按下右 Command，说一句话，Claude 帮你干活——最小交互完成 AI 辅助编程。

## v1 Requirements

Requirements for MVP release. Each maps to roadmap phases.

### 打包构建

- [ ] **PACK-01**: electron-builder.yml 正确包含所有原生模块（better-sqlite3, sherpa-onnx-node, sherpa-onnx-darwin-arm64, uiohook-napi）到 DMG 中
- [ ] **PACK-02**: 构建流程包含 electron-rebuild 步骤，确保 native modules 针对 Electron ABI 编译
- [ ] **PACK-03**: Next.js 静态文件（.next/static, public）合并到 standalone 目录内，页面样式正常加载
- [ ] **PACK-04**: DMG 安装后应用可启动，无 MODULE_NOT_FOUND 或 native module 加载错误
- [ ] **PACK-05**: 构建通用二进制 DMG（arm64 + x64）

### 运行时架构

- [ ] **RUNT-01**: 消除 globalThis 跨进程通信模式，API 路由通过 IPC 或直接函数调用与主进程通信
- [ ] **RUNT-02**: better-sqlite3 在打包后正确加载，数据库文件位于 userData 目录
- [ ] **RUNT-03**: sherpa-onnx-node 及其平台包（sherpa-onnx-darwin-arm64/x64）在打包后正确加载，.dylib 文件可通过 asarUnpack 访问
- [ ] **RUNT-04**: uiohook-napi 在打包后正确加载，可监听全局键盘事件

### 端到端验证

- [ ] **E2E-01**: 用户按下右 Command → 悬浮窗弹出 → 录音 → 转写 → 编辑 → 发送 → Claude 执行 → 菜单栏状态反馈完整流程在打包应用中工作
- [ ] **E2E-02**: 首次启动引导流程完整可用：辅助功能权限 → 语音模型下载 → API Key 配置 → 工作目录设置 → 完成
- [ ] **E2E-03**: 菜单栏 Tray 图标显示，状态小点颜色正确反映应用状态（灰/蓝/绿/红/黄）
- [ ] **E2E-04**: 摘要弹窗显示当前执行状态和最近执行历史

### 错误处理

- [ ] **ERR-01**: 辅助功能权限被撤销时，菜单栏提示用户重新授权，而非静默失败
- [ ] **ERR-02**: 语音模型未下载时尝试录音，提示用户下载模型，而非静默失败
- [ ] **ERR-03**: API Key 过期或无效时，菜单栏红色提示，引导用户到设置页更新
- [ ] **ERR-04**: 网络断开时，Claude 执行失败并显示明确的错误信息
- [ ] **ERR-05**: SQLite 数据库损坏时，自动备份并重建，不阻塞应用启动
- [ ] **ERR-06**: Claude 执行超时（5分钟）自动中断，标记为 failed

## v2 Requirements

Deferred to future release.

### 分发

- **DIST-01**: Apple 代码签名（Developer ID）
- **DIST-02**: macOS 公证（Notarization）
- **DIST-03**: 自动更新（electron-updater）

### 功能扩展

- **FEAT-01**: 完整对话 UI（消息流、代码块渲染、工具调用详情）
- **FEAT-02**: 文字输入框（静音场景）
- **FEAT-03**: 确认模式（工具调用弹窗确认）
- **FEAT-04**: 多会话管理
- **FEAT-05**: 自定义快捷键设置

## Out of Scope

| Feature | Reason |
|---------|--------|
| Windows 支持 | MVP 聚焦 macOS，Electron 架构理论上可扩展但不投入 |
| 实时语音流 | 增加复杂度，MVP 使用录音→转写模式足够 |
| 多语言 UI | 目标用户中文为主，英文界面足够 |
| 云端同步 | 单机应用，无需云端功能 |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| PACK-01 | Phase 1 | Pending |
| PACK-02 | Phase 1 | Pending |
| PACK-03 | Phase 1 | Pending |
| PACK-04 | Phase 1 | Pending |
| PACK-05 | Phase 5 | Pending |
| RUNT-01 | Phase 2 | Pending |
| RUNT-02 | Phase 2 | Pending |
| RUNT-03 | Phase 2 | Pending |
| RUNT-04 | Phase 2 | Pending |
| E2E-01 | Phase 3 | Pending |
| E2E-02 | Phase 3 | Pending |
| E2E-03 | Phase 3 | Pending |
| E2E-04 | Phase 3 | Pending |
| ERR-01 | Phase 4 | Pending |
| ERR-02 | Phase 4 | Pending |
| ERR-03 | Phase 4 | Pending |
| ERR-04 | Phase 4 | Pending |
| ERR-05 | Phase 4 | Pending |
| ERR-06 | Phase 4 | Pending |

**Coverage:**
- v1 requirements: 19 total
- Mapped to phases: 19
- Unmapped: 0 ✓

---
*Requirements defined: 2026-04-22*
*Last updated: 2026-04-22 after roadmap creation*
