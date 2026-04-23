# Roadmap: Shrew MVP

**Created:** 2026-04-22
**Granularity:** Standard
**Total phases:** 5
**Total requirements mapped:** 19

---

## Phase 1: Build Configuration Fix

**Goal:** 修复 electron-builder 打包配置，使 DMG 安装后应用可正常启动

**Requirements:** PACK-01, PACK-02, PACK-03, PACK-04

**Success Criteria:**
1. `npm run electron:build` 成功生成 DMG
2. DMG 安装后应用启动无 MODULE_NOT_FOUND 错误
3. 菜单栏 Tray 图标正常显示
4. 设置页在打包应用中正确渲染（有样式，非裸 HTML）

**Key Tasks:**
- 修复 electron-builder.yml（移除 `!node_modules/**/*`，选择性包含原生模块）
- 添加 asarUnpack 规则（.node, .dylib 文件）
- 构建流程添加 electron-rebuild 步骤
- Next.js 静态文件合并到 standalone 目录内
- 验证 sherpa-onnx .dylib 加载路径

---

## Phase 2: Cross-Process Communication Fix

**Goal:** 修复 globalThis 跨进程通信问题，使 Claude 执行在打包应用中可用

**Requirements:** RUNT-01, RUNT-02, RUNT-03, RUNT-04

**Success Criteria:**
1. /api/chat 路由在打包应用中不再返回 503
2. better-sqlite3 在打包应用中正常创建/查询数据库
3. sherpa-onnx 在打包应用中可加载模型并转写语音
4. uiohook-napi 在打包应用中可监听全局键盘事件

**Key Tasks:**
- 替换 globalThis 跨进程通信（建议：消除 /api/chat API 路由，直接通过 IPC 执行）
- 验证 native modules 在 Electron main process 中正确加载
- 修复 sherpa-onnx .dylib 路径解析

---

## Phase 3: End-to-End Validation

**Goal:** 验证完整的语音→Claude 流程在打包应用中端到端工作

**Requirements:** E2E-01, E2E-02, E2E-03, E2E-04

**Success Criteria:**
1. 右 Command → 录音 → 转写 → 编辑 → 发送 → Claude 执行 → 状态反馈完整流程可用
2. 首次启动引导完整走通（权限→模型下载→API Key→cwd→完成）
3. 菜单栏状态小点正确反映应用状态（灰/蓝/绿/红/黄）
4. 摘要弹窗显示当前执行和最近历史

**Key Tasks:**
- 在打包应用中测试完整语音流程
- 测试首次引导各步骤
- 验证状态小点颜色转换
- 验证摘要弹窗数据展示

---

## Phase 4: Error Handling Hardening

**Goal:** 加固错误处理，确保主要失败场景下用户体验良好

**Requirements:** ERR-01, ERR-02, ERR-03, ERR-04, ERR-05, ERR-06

**Success Criteria:**
1. 辅助功能权限被撤销时，菜单栏有明确提示（非静默失败）
2. 模型未下载时录音有明确提示
3. API Key 过期时有红色提示并引导更新
4. Claude 执行超时 5 分钟自动中断

**Key Tasks:**
- 添加权限状态定期检查
- 添加模型存在性检查
- 添加 API Key 运行时验证
- 添加网络状态检测
- 添加 SQLite 数据库损坏恢复
- 添加执行超时自动中断

---

## Phase 5: Distribution Preparation

**Goal:** 准备分发：通用二进制、代码签名准备

**Requirements:** PACK-05

**Success Criteria:**
1. arm64 和 x64 双架构 DMG 可正常构建
2. 在 Apple Silicon 和 Intel Mac 上均可运行

**Key Tasks:**
- 配置 electron-builder 通用二进制构建
- 验证 sherpa-onnx-darwin-x64 兼容性
- 验证 uiohook-napi 在 x64 上工作
- 为代码签名/公证做准备（需 Apple Developer 证书）

---

## Phase Dependencies

```
Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5
```

Phase 1 必须先完成（DMG 能跑才能测后续）
Phase 2 必须在 Phase 3 之前（Claude 执行需要跨进程通信）
Phase 4 可与 Phase 3 部分重叠（错误处理可在验证中逐步添加）
Phase 5 最后执行（分发准备不阻塞功能验证）

---
*Roadmap created: 2026-04-22*
