# 默认头像 + 引导完成页改进

## 背景

Lumi 目前存在两个体验问题：
1. 聊天头部默认显示字母 "L" 而非应用 icon，缺乏品牌识别度
2. 引导完成页仅停留 1.5 秒就自动消失并弹出聊天窗口，用户来不及阅读提示信息

## 改动一：默认头像改用应用 Icon

### 当前行为
- `ChatHeader.tsx` 和 `persona/page.tsx` 在没有用户头像时，显示品牌色圆形 + 名称首字母 "L"
- `electron/main.ts` 的 `persona:load` handler 仅在 `~/.lumi/persona/avatar.*` 存在时返回头像数据

### 新行为
- `persona:load` handler：若 `~/.lumi/persona/avatar.*` 不存在，读取 `resources/icon.png` 作为默认头像，以 base64 data URL 返回
- 前端统一使用 `<img>` 圆形裁剪渲染，移除首字母 fallback 逻辑

### 影响文件
| 文件 | 改动 |
|---|---|
| `electron/main.ts` | `persona:load` handler 添加默认头像 fallback（读取 `resources/icon.png`） |
| `src/components/chat/ChatHeader.tsx` | 移除首字母 fallback，仅保留 `<img>` 渲染 |
| `src/app/(main)/persona/page.tsx` | 同上 |

### 约束
- 默认头像以圆形展示
- 用户上传自定义头像后，`~/.lumi/persona/avatar.*` 存在，走正常逻辑，不读取默认 icon

## 改动二：引导完成页常驻 + 新布局

### 当前行为
- `CompletionScreen.tsx` 显示"配置完成！"，1.5 秒 setTimeout 后调用 `onComplete()`
- `main.ts` 的 `onboarding:complete` handler 关闭引导窗口并调用 `createMainWindow()`

### 新行为

#### 页面布局（居中单列）
1. 应用 icon（圆形裁剪，72px）
2. 标题："准备就绪！"
3. 副标题："随时可以开始和 Lumi 对话"
4. 两个图标 + 单行文字提示：
   - 🎙️ "说出 Lumi 唤醒我"
   - ⌥ "按右 Option 开始聊天"
5. 按钮："准备好了"

#### 交互流程
- 页面常驻，无自动消失
- 用户点击"准备好了" → 发送 `onboarding:complete` IPC → 关闭引导窗口
- **不创建聊天主窗口**，仅保留托盘图标
- 后续用户通过点击托盘图标打开聊天窗口

### 影响文件
| 文件 | 改动 |
|---|---|
| `src/components/CompletionScreen.tsx` | 重写 UI 为居中单列布局；移除 setTimeout；添加"准备好了"按钮触发 onComplete |
| `electron/main.ts` | `onboarding:complete` handler 中移除 `createMainWindow()` 调用 |

## 不在范围内
- 托盘图标样式变更
- 唤醒词引擎启动逻辑（保持现有行为：引导完成后启动）
- 字幕弹窗头像逻辑（已通过 `persona:load` 的 fallback 自动覆盖）
