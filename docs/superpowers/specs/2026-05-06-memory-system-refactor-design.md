# 记忆系统重构设计

日期: 2026-05-06

## 背景

Aiva 当前有两套并行的记忆系统：
1. **自建 memory_item 表**（SQLite）：每次执行后用 haiku 提取，全量拼接到 prompt 前面
2. **SDK Auto-Memory**（Markdown 文件）：按工作目录隔离，Claude 自主读写，有相关性召回

两套系统互不知晓、功能重叠，且存在以下问题：
- 记忆无容量限制，全量注入浪费 token
- 去重算法（Jaccard）对中文支持差
- 换工作目录后 SDK 记忆丢失，用户体感不一致
- 没有按时间维度组织记忆的能力

## 设计目标

1. 统一为一套记忆系统，消除重叠
2. 全局核心记忆不受工作目录切换影响
3. 新增每日记忆维度，支持回溯"前几天发生了什么"
4. 复用 SDK 的记忆能力（自主读写、相关性召回、/dream 整合）
5. 复用现有 /memory 页面 UI，增加每日记忆 tab

## 架构

```
┌─────────────────────────────────────────────────┐
│                  记忆系统（两层）                   │
├──────────────────────┬──────────────────────────┤
│   全局核心记忆         │      每日记忆              │
│   SDK Auto-Memory    │   Aiva 自管理             │
├──────────────────────┼──────────────────────────┤
│ 存: ~/.aiva/memories/│ 存: ~/.aiva/daily/       │
│   MEMORY.md (索引)    │   2026-05-06.md           │
│   user_name.md       │   2026-05-05.md           │
│   github_accounts.md │   ...                     │
├──────────────────────┼──────────────────────────┤
│ 写: Claude 自主写入    │ 写: 每次对话后 LLM 评估     │
│   + /remember 命令    │   有价值则追加到当日文件     │
├──────────────────────┼──────────────────────────┤
│ 读: SDK system prompt │ 读: 自动注入前1天 + AI 按需  │
│   + 相关性召回         │   读取更早的文件            │
├──────────────────────┼──────────────────────────┤
│ 管: /memory 页面      │ 管: /memory 页面（每日      │
│   核心记忆 tab        │   记忆 tab）               │
└──────────────────────┴──────────────────────────┘
```

## 详细设计

### 1. 删除旧的记忆系统

删除以下代码：

| 文件 | 删除内容 |
|------|---------|
| `src/lib/db.ts` | `memory_item` 表创建语句 + 所有 memory 相关函数（listMemories, addMemory, updateMemory, deleteMemory, toggleMemoryStatus, toggleMemoryPin, getMemoriesByStatus） |
| `src/lib/memory-extractor.ts` | 整个文件删除 |
| `src/lib/aiva-context.ts` | `getActiveMemories()`, `getPinnedMemories()` 函数；`buildAivaContext()` 中移除 `memoryLines` 参数和记忆拼接逻辑 |
| `electron/main.ts` | 6 个 memory IPC handler；`executePrompt()` 中记忆拼接逻辑（`memoryLines` 获取和 `aivaContext` 拼接）；记忆提炼触发逻辑（`extractMemories` 调用） |
| `src/types/index.ts` | `MemoryItem` 类型 + memory 相关 IPC 类型定义 |

### 2. SDK 全局化

在 `src/lib/claude-client.ts` 的 `options` 中新增：

```typescript
autoMemoryDirectory: '~/.aiva/memories',
autoMemoryEnabled: true,
autoDreamEnabled: true,
```

效果：SDK 的记忆始终读写 `~/.aiva/memories/` 目录，不受工作目录切换影响。SDK 的相关性召回和 /dream 整合继续正常工作。

### 3. 每日记忆 — 写入

新增 `src/lib/daily-memory-writer.ts`：

**触发时机**: 对话完成后（`result.status === 'completed'`），在 `electron/main.ts` 中异步调用。

**评估逻辑**:
- 用用户配置的 provider 的 haiku 模型（`resolveModel(providerKey, 'haiku')`）发送评估 prompt，包含用户原始 prompt + Claude 回复摘要
- prompt 要求返回 JSON: `{ shouldRecord: boolean, title: string, summary: string }`
- 评估标准：包含用户偏好/决策/发现的问题/待跟进事项 → 值得记录；纯执行/无新信息 → 不记录

**写入逻辑**:
- 如果 `shouldRecord === true`，将内容追加到 `~/.aiva/daily/YYYY-MM-DD.md`
- 文件格式：

```markdown
# 2026-05-06

## 14:32 - 修复登录 Bug
- 用户报告登录页面在 Safari 上白屏
- 根因：Cookie SameSite 策略问题
- 修改了 auth middleware 的配置

## 16:05 - 添加 TTS 语音输出
- 使用了 Web Audio API
- 选定了豆包 TTS 引擎
```

- 如果文件不存在，创建文件并写入 `# YYYY-MM-DD` 标题
- 追加格式：`## HH:MM - <title>` + summary 内容

### 4. 每日记忆 — 注入与读取

**自动注入**（在 `aiva-context.ts` 中）:
- 读取前一天（`YYYY-MM-DD`）的每日记忆文件
- 作为 `## 近期动态` 段落拼接到 aivaContext 中
- 只注入 1 天，保持轻量

**按需读取**:
- 在 aivaContext 的系统提示中追加："每日记忆存储在 `~/.aiva/daily/` 目录，格式为 `YYYY-MM-DD.md`。当用户提及过去发生的事时，用 Read 工具读取对应日期的文件。"
- AI 利用 SDK 已有的 Read 工具直接读取文件，不需要注册新工具

### 5. 新增 `src/lib/daily-memory-reader.ts`

提供以下函数：

```typescript
readDailyMemory(date: string): string | null
listDailyMemoryDates(): string[]  // 返回所有有记忆的日期列表
readRecentDailyMemories(days: number): Map<string, string>  // 读取最近 N 天
```

读取 `~/.aiva/daily/` 目录下的文件，返回内容。

### 6. /memory 页面重写

双 tab 布局：

**核心记忆 tab**:
- 读取 `~/.aiva/memories/MEMORY.md` 获取索引
- 展示为可展开的卡片列表，每个卡片显示记忆的 name、description、内容
- 支持编辑（直接修改 Markdown 文件）
- 支持删除（删除 .md 文件 + 更新 MEMORY.md 索引）

**每日记忆 tab**:
- 列出 `~/.aiva/daily/` 下的所有日期文件，按日期倒序排列
- 点击展开查看当日记忆内容
- 只读展示，不支持编辑

### 7. IPC 通道变更

**删除**:
- `memory:list`, `memory:add`, `memory:update`, `memory:delete`, `memory:toggle-status`, `memory:toggle-pin`

**新增**:
- `memory:list-core` — 读取 `~/.aiva/memories/` 目录，返回核心记忆列表
- `memory:update-core` — 编辑指定核心记忆文件
- `memory:delete-core` — 删除指定核心记忆文件 + 更新 MEMORY.md
- `memory:list-daily` — 列出所有每日记忆日期
- `memory:read-daily` — 读取指定日期的每日记忆内容

### 8. 数据迁移

对于已有的 `memory_item` 表数据：
- 应用启动时检测 `memory_item` 表是否存在且有数据
- 如果存在，将所有"生效中"的记忆写入 `~/.aiva/memories/` 目录下的独立 .md 文件（使用 type 作为文件名前缀，如 `pref-dark-mode.md`）
- 更新 MEMORY.md 索引
- 迁移完成后删除 `memory_item` 表

## 影响范围

| 模块 | 变更类型 |
|------|---------|
| `src/lib/claude-client.ts` | 修改：新增 SDK memory 配置 |
| `src/lib/aiva-context.ts` | 修改：移除记忆拼接，改为注入前1天摘要 + 提示 |
| `src/lib/db.ts` | 修改：删除 memory 相关代码 |
| `electron/main.ts` | 修改：删除旧 IPC handler + 记忆逻辑，新增每日记忆写入触发 |
| `src/app/memory/page.tsx` | 重写：双 tab UI |
| `src/lib/daily-memory-writer.ts` | 新增 |
| `src/lib/daily-memory-reader.ts` | 新增 |
| `src/lib/memory-extractor.ts` | 删除 |
| `src/types/index.ts` | 修改：删除 MemoryItem 类型，新增新 IPC 类型 |
