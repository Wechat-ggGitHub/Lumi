# Dynamic Persona Update Design

## Background

Shrew 的 persona 系统（名称 + persona.md + 头像）目前是单向的：用户在 `/persona` 页面手动编辑，AI 在每次对话时读取。AI 无法主动更新自己的 persona 设定。

## Goal

允许 AI 在对话过程中自主更新 persona（名称和 persona.md），当用户明确表达人设调整意图时实时生效。

## Scope

### Persona vs Memory 边界

- **Persona**：AI 分身自身的画像——语气、性格、态度、风格、人设
- **Memory**：关于用户的事实、偏好、习惯（已有独立 `memory_item` 系统）

AI 只在用户**直接描述/调整 AI 人设**时更新 persona，不处理用户偏好、习惯等信息。

### 可更新的内容

| 文件 | 内容 | 更新场景示例 |
|------|------|-------------|
| `~/.shrew/persona/profile.json` | AI 名称 | 用户说「叫你小助手吧」 |
| `~/.shrew/persona/persona.md` | 性格/语气/态度/风格 | 用户说「说话轻松点」「像资深工程师的口吻」 |

### 不触发的场景

- 用户的技术偏好、编码习惯 → memory
- 用户提到自己的名字、项目信息 → memory
- 普通编程任务中的任何交流

## Design

### 1. Prompt 指令注入

在 `buildPersonaContext()` (`src/lib/persona-file.ts`) 返回内容末尾追加自我更新指令：

```
## 自我更新权限

你可以通过写入文件来更新自己的名称和性格设定。

更新规则：
- 仅在用户直接描述希望你的行为方式时更新
- 用户的技术偏好、编码习惯、个人信息 → 这些属于记忆，不要写入 persona
- 更新后简短告知用户你做了什么修改

操作方式：
- 更新名称：将完整 JSON 写入 {profileJsonPath}，格式 {"name":"新名称","avatar":"原值"}，必须保留 avatar 字段不变
- 更新性格/语气/态度/风格：将完整的 markdown 内容写入 {personaMdPath}
```

路径使用绝对路径（`~/.shrew/persona/` 展开为实际路径），因为 Claude Code 执行时 cwd 是用户的项目目录。

**实现位置**：修改 `buildPersonaContext()` 函数，在返回的字符串中追加指令段落。

### 2. File Watcher

在 `electron/main.ts` 中添加对 `~/.shrew/persona/` 目录的 `fs.watch`：

- 监听 `profile.json` 和 `persona.md` 的 `change` 和 `rename` 事件
- 检测到变更后：
  1. 读取文件内容，验证格式（JSON 合法性、必要字段）
  2. 通过 `BrowserWindow.getAllWindows().forEach(win => win.webContents.send('persona:updated'))` 广播 IPC 事件
- 防护：try-catch 包裹读取逻辑，解析失败时只打日志、不更新 UI
- File watcher 在 app `ready` 时启动，在 `before-quit` 时关闭

### 3. UI 刷新

**Chat 页面** (`src/app/chat/page.tsx`)：
- 添加 `ipcRenderer.on('persona:updated', ...)` 监听器
- 收到事件后重新调用 `persona:load` IPC 刷新 `personaName` 和 `personaAvatar` state
- ChatHeader 自动反映最新名称和头像

**Persona 页面** (`src/app/persona/page.tsx`)：
- 添加同样的监听器
- 收到事件后刷新名称输入框和 markdown 编辑器的内容
- 如果用户正在编辑中（内容有未保存修改），不覆盖，而是提示"AI 已更新 persona，是否刷新？"

### 4. 数据流

```
用户对话
  → AI 判断需要更新人设
  → AI 调用 write_file tool 写入 profile.json 或 persona.md
  → fs.watch 检测到文件变更
  → 验证文件格式
  → IPC 广播 persona:updated
  → 各 BrowserWindow 刷新 UI
```

## Files to Modify

| 文件 | 改动 |
|------|------|
| `src/lib/persona-file.ts` | `buildPersonaContext()` 追加自我更新指令段落 |
| `electron/main.ts` | 添加 file watcher 启动/停止逻辑 + `persona:updated` IPC 广播 |
| `src/app/chat/page.tsx` | 添加 `persona:updated` 监听器，刷新 persona state |
| `src/app/persona/page.tsx` | 添加 `persona:updated` 监听器，处理编辑中冲突 |

## Out of Scope

- AI 更新头像（需要图片处理，复杂度过高，保持手动）
- persona 更新历史/回滚
- 用户确认机制（AI 自主判断即可，用户可以在 /persona 页面随时修正）
