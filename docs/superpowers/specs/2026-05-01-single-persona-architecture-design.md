# Shrew 单分身架构设计方案

> 基于 PRD `docs/prd/shrew-single-persona-prd.md` v0.1，确认日期 2026-05-01

## 1. 核心决策记录

| # | 问题 | 决策 | 理由 |
|---|------|------|------|
| 1 | 持久化策略 | 保留 SQLite，扩展表结构 | 项目已有 SQLite (WAL 模式)，统一持久化方案避免 JSON 并发写入问题 |
| 2 | 主窗口路由 | 单 BrowserWindow + Next.js 客户端路由 | 窗口内路由切换无白屏，体验流畅 |
| 3 | 聊天数据模型 | `chat_message` + `context_segment_id` 后台分段 | 参考了 OpenClaw 的 JSONL transcript + 时间策略重置方案，简化为 SQLite 实现 |
| 4 | 技能管理范围 | 管理 Shrew 自己的配置，不碰用户项目文件 | 避免与用户本地 Claude Code 配置冲突 |
| 5 | Memory 实现 | LLM 提炼 + SQLite + CLAUDE.md 注入 | Claude Agent SDK 没有自动记忆能力，需自建 |
| 6 | 分身人格注入 | 通过 prompt 前缀注入 persona + memory 上下文 | SDK 默认从 cwd 读 CLAUDE.md，但 Shrew 不碰用户项目文件。通过 prompt 前缀注入更可控 |
| 7 | MCP 配置存储 | Shrew 独立配置目录 | 与技能管理同理，隔离于用户项目 |
| 8 | 实施路径 | 渐进式重构（方案 A） | 在现有代码基础上逐步改造，每阶段可独立验收 |

## 2. 数据层设计

### 2.1 SQLite 新增表

在现有 `execution_history` 表基础上新增 4 张表。迁移脚本在 `src/lib/db.ts` 的 `initDb()` 中执行。

#### context_segment（上下文段）

```sql
CREATE TABLE context_segment (
  id TEXT PRIMARY KEY,
  sdk_session_id TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  ended_at DATETIME
);
```

`/clear` 时当前段设置 `ended_at` 并创建新段。每个段关联一个 SDK session ID，用于 resume。

#### chat_message（消息流）

```sql
CREATE TABLE chat_message (
  id TEXT PRIMARY KEY,
  segment_id TEXT NOT NULL REFERENCES context_segment(id),
  role TEXT NOT NULL,            -- 'user' | 'assistant' | 'system'
  content TEXT NOT NULL,
  metadata TEXT,                 -- JSON: { streaming, toolSummary, ... }
  execution_id TEXT,             -- 关联到 execution_history（可选）
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_chat_message_segment ON chat_message(segment_id, created_at);
```

前台加载 `ORDER BY created_at` 展现连续流，日期分隔线纯渲染逻辑。后台用 `segment_id` 做上下文分段控制。

#### persona（分身设定）

```sql
CREATE TABLE persona (
  id INTEGER PRIMARY KEY DEFAULT 1,
  name TEXT NOT NULL DEFAULT 'Shrew',
  avatar TEXT,
  bio TEXT,
  personality TEXT DEFAULT '专业',
  tone TEXT DEFAULT '自然',
  detail_level TEXT DEFAULT '平衡',
  clarify_pref TEXT DEFAULT '视情况平衡',
  work_style TEXT DEFAULT '先执行再总结',
  system_prompt TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

本期只有一条记录（id=1）。

#### memory_item（长期记忆）

```sql
CREATE TABLE memory_item (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,             -- '偏好' | '习惯' | '项目背景' | '约束' | '事实' | '其他'
  content TEXT NOT NULL,
  source TEXT DEFAULT '自动提炼',  -- '自动提炼' | '手动新增' | '手动修正'
  status TEXT DEFAULT '生效中',    -- '生效中' | '已失效'
  pinned INTEGER DEFAULT 0,
  execution_id TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_memory_item_type ON memory_item(type);
CREATE INDEX idx_memory_item_status ON memory_item(status);
```

### 2.2 JSON 配置文件

存储在 `~/Library/Application Support/Shrew/config/` 目录下：

| 文件 | 用途 |
|------|------|
| `settings.json` | 系统设置（模型、API Key 配置、语音凭证、快捷键、工作目录、权限模式） |
| `skills.json` | 技能启用状态与参数 |
| `mcp-servers.json` | MCP 服务连接配置 |
| `claude.md` | Shrew persona 配置备份（非 SDK 直接读取，作为 prompt 前缀注入） |

敏感信息（API Key、Token）继续使用 Electron safeStorage 加密存储在 `secure/` 目录。

### 2.3 execution_history 变更

现有表保留不变，新增 `segment_id TEXT` 字段关联到 `context_segment`。

## 3. 页面与路由设计

### 3.1 路由结构

```
src/app/
├── chat/          → 聊天主页面（主窗口首层）
├── persona/       → 分身设定页
├── memory/        → Memory 管理页
├── skills/        → 技能管理页
├── services/      → 服务连接页
├── settings/      → 设置页（重构现有）
├── voice-bar/     → 语音条（保持不变）
├── onboarding/    → 引导页（基本不变）
└── api/health/    → 健康检查
```

### 3.2 主窗口路由机制

- 主窗口启动加载 `/chat`
- 二级页面通过 `window.history.pushState` 切换，页面不刷新
- 需要一个轻量客户端路由组件管理导航栈（支持返回）
- 现有 `/detail` 页面废弃

### 3.3 聊天主页面组件

```
/chat
├── ChatHeader          -- 头像 + 名称 + 状态点 + 副信息 + 可展开身份卡
├── ChatStream          -- 连续消息流（含日期分隔线）
│   ├── UserMessage
│   ├── AssistantMessage -- Markdown 渲染 + 流式显示
│   └── SystemMessage   -- /clear 提示
├── ChatInput           -- 常驻输入框 + slash 命令 (/clear)
└── NavigationDrawer    -- 侧边导航入口到二级页
```

### 3.4 废弃组件

- `HistorySidebar` — 不再有"历史列表"概念
- `TaskCardExpanded` / `TaskRowCollapsed` — 不再有 per-task 卡片视图
- `/detail` 页面及其 IPC (`detail:*`)

## 4. 状态机调整

### 4.1 状态映射

```
现有 appState        → PRD 状态      变化
──────────────────────────────────────────────
idle                 → 空闲          不变
recording            → 正在听        不变
transcribing         → 正在转写      不变
editing              → 等待发送      重命名语义
sending              → (去掉)        合并到 thinking
(新增)               → 正在思考      新增
executing            → 正在执行      语义收窄为工具调用中
(新增)               → 已完成        新增（瞬态 2-3s）
error                → 出错          不变
```

### 4.2 状态转换规则

```
语音路径: 空闲 → 正在听 → 正在转写 → 等待发送 → 正在思考 → 正在执行 → 已完成 → 空闲
文字路径: 空闲 → 正在思考 → 正在执行 → 已完成 → 空闲
异常路径: 任一处理中状态 → 出错
恢复路径: 出错 → 空闲
```

### 4.3 SDK 子状态（保持不变）

thinking / executing_tool (with currentToolName) / compacting / rate_limited / authenticating / completed / failed / cancelled

SDK 子状态用于驱动前台 `正在思考` vs `正在执行` 的切换：`sdkSubState === 'thinking'` 对应前台"正在思考"，`sdkSubState === 'executing_tool'` 对应前台"正在执行"。

## 5. IPC 设计

### 5.1 新增命名空间

#### chat:*

| 消息 | 方向 | 用途 |
|------|------|------|
| `chat:ready` | renderer → main | 渲染进程就绪，主进程发送历史消息 |
| `chat:send-message` | renderer → main | 发送文字消息 |
| `chat:stream-chunk` | main → renderer | 流式回复 chunk |
| `chat:execution-complete` | main → renderer | 任务完成 |
| `chat:clear` | renderer → main | 请求 /clear |
| `chat:state-update` | main → renderer | 状态变化推送 |
| `chat:history` | main → renderer | 发送聊天历史 |

#### persona:*

| 消息 | 方向 | 用途 |
|------|------|------|
| `persona:load` | invoke | 加载分身设定 |
| `persona:save` | invoke | 保存分身设定 |

#### memory:*

| 消息 | 方向 | 用途 |
|------|------|------|
| `memory:list` | invoke | 列出所有 Memory |
| `memory:add` | invoke | 手动新增 |
| `memory:update` | invoke | 编辑内容 |
| `memory:delete` | invoke | 删除 |
| `memory:toggle-status` | invoke | 切换生效/失效 |
| `memory:toggle-pin` | invoke | 置顶/取消 |

#### skills:*

| 消息 | 方向 | 用途 |
|------|------|------|
| `skills:list` | invoke | 列出技能 |
| `skills:toggle` | invoke | 启用/停用 |
| `skills:configure` | invoke | 配置参数 |

#### services:*

| 消息 | 方向 | 用途 |
|------|------|------|
| `services:list` | invoke | 列出 MCP 服务 |
| `services:add` | invoke | 新增连接 |
| `services:update` | invoke | 更新配置 |
| `services:remove` | invoke | 删除连接 |
| `services:test` | invoke | 测试连接 |

### 5.2 废弃命名空间

- `detail:*` — 全部由 `chat:*` 替代

### 5.3 保留命名空间

- `voice:*` — 语音条通信（不变）
- `settings:*` — 设置页通信（调整字段结构）
- `onboarding:*` — 引导页通信（基本不变）

## 6. 核心流程

### 6.1 文字聊天流程

```
1. 用户在 ChatInput 输入文字 → Enter 发送
2. 写入 chat_message (role='user')
3. 状态机: idle → thinking
4. 构建 system prompt:
   - 从 Shrew 配置目录读取 claude.md（含 persona + memory 摘要）
   - 当前 context_segment 的 SDK session ID（resume 或 new）
5. 调用 SDK query() 发起执行
6. 流式返回:
   - sdkSubState='thinking' → 前台"正在思考"
   - sdkSubState='executing_tool' → 前台"正在执行"
7. 流式 chunk 通过 chat:stream-chunk IPC 推送到渲染进程
8. 每个 chunk 追加到 chat_message
9. 任务完成: 状态 → completed（瞬态 2-3s）→ idle
10. 写入 execution_history 记录
11. 异步触发 Memory 提炼
```

### 6.2 语音条流程

```
1. 右 Command 键 → 唤起语音条
2. 状态机: idle → recording → transcribing → editing(等待发送)
3. 用户编辑文字 → Enter 确认
4. 写入 chat_message 用户消息
5. 状态机: editing → thinking
6. 后续同文字聊天流程 4-11
7. 不自动打开主窗口
```

### 6.3 /clear 流程

```
1. 用户输入 /clear
2. 写入 chat_message 系统消息
3. 当前 context_segment 设置 ended_at
4. 创建新 context_segment
5. 状态机保持 idle
6. 下次发送消息时使用新的 context_segment + 新 SDK session
```

### 6.4 Memory 提炼流程（异步）

```
1. 任务完成后异步触发
2. 获取本次任务的用户消息和分身回复
3. 获取现有 memory_item 列表（用于去重）
4. 调用 LLM (haiku)，prompt 要求提取长期记忆
5. LLM 返回候选 memory 列表
6. 去重：与现有 memory 对比，跳过重复或矛盾的
7. 写入 memory_item 表
8. 更新 claude.md 中的 memory 摘要段落
```

### 6.5 Persona + Memory 上下文构建

每次发起 SDK 调用前，构建 persona 上下文（通过 prompt 前缀注入）：

```
1. 读取 persona 表字段
2. 从 memory_item 表筛选 pinned + 生效中的记忆
3. 按模板拼接上下文：
   - 名字和简介
   - 性格、语气、回答风格
   - 工作偏好
   - 当前 memory 摘要
   - 高级 system prompt（如果有）
4. 作为 prompt 前缀注入到 SDK query() 调用
```

同时维护一份 `~/Library/Application Support/Shrew/config/claude.md` 作为备份，记录当前 persona 配置的完整内容。

### 6.6 SDK 调用配置

每次调用 SDK `query()` 时，需要在用户消息前拼接 Shrew 的 persona 上下文：

```typescript
const shrewContext = buildShrewContext(persona, memories);

query({
  prompt: shrewContext + '\n\n' + userMessage,
  options: {
    cwd: userConfiguredWorkDir,
    model: selectedModel,
    resume: currentSegment.sdk_session_id || undefined,
  }
})
```

**注意**：SDK 默认从 cwd 读取 CLAUDE.md。Shrew 的 persona + memory 信息不写入用户项目的 CLAUDE.md，而是通过 prompt 前缀注入。如果 SDK 支持 `systemPrompt` 或类似选项，优先使用该选项。需要在实现阶段验证 SDK 的 exact API。

### 6.7 流式消息持久化策略

分身回复的消息持久化采用"创建 + 追加"模式：

1. SDK 返回第一个 assistant chunk 时，创建 chat_message 记录（role='assistant', content=''）
2. 后续 chunk 到达时，更新同一条记录的 content（追加方式）
3. 任务完成时，该记录 content 为完整回复

这样保证前端只需要关注一条 chat_message 记录，同时流式过程中数据库始终有最新内容。

## 7. 架构冲击总结

### 7.1 重写级

- 主窗口从 `/settings` 改为 `/chat`
- 新增 5 个页面路由（chat/persona/memory/skills/services）
- `detail:*` IPC 全部替换为 `chat:*`
- HistorySidebar 等现有组件废弃

### 7.2 重构级

- 状态机：7 态 → 8 态（去掉 sending，新增 thinking + completed）
- SQLite：新增 4 表 + execution_history 加字段
- `electron/main.ts`：IPC 注册扩展，窗口创建逻辑调整

### 7.3 新增级

- Memory 子系统（提炼 + CRUD + 注入）
- 技能管理 UI
- 服务连接 UI
- CLAUDE.md 生成器

### 7.4 轻影响

- 语音条：基本不变，仅需对接统一聊天流
- 菜单栏 Tray：状态语义调整
- Onboarding：可能增加 persona 初始化步骤
- 录音/转写：完全不变

## 8. 实施阶段（与 PRD 第 29 节对齐）

### 阶段一：聊天主链路

1. SQLite 新增 context_segment + chat_message 表
2. 主窗口加载 `/chat`
3. 实现 ChatHeader + ChatStream + ChatInput 组件
4. 实现 `chat:*` IPC 通信
5. 状态机 8 态调整
6. 实现 `/clear`
7. 基础状态同步到菜单栏和语音条

### 阶段二：语音快捷入口

1. 语音条消息写入统一聊天流
2. 状态同步验证
3. 发送后不打开主窗口（保持现有行为）

### 阶段三：分身配置 + 系统配置

1. SQLite 新增 persona 表
2. 实现分身设定页
3. 实现 CLAUDE.md 生成器
4. JSON 配置文件（skills.json / mcp-servers.json）
5. 实现技能管理页
6. 实现服务连接页
7. 重构设置页为卡片式布局

### 阶段四：Memory 系统

1. SQLite 新增 memory_item 表
2. 实现 Memory 提炼逻辑（LLM 调用）
3. 实现 Memory 页
4. Memory 注入到 CLAUDE.md
5. Memory 去重逻辑

## 9. 风险与注意事项

1. **SDK session 管理**：context_segment 与 SDK session ID 的映射需要仔细处理，特别是 resume 场景
2. **流式消息持久化**：流式 chunk 需要实时写入 chat_message，同时保证 UI 性能
3. **Memory 提炼成本**：每次任务完成后额外一次 LLM 调用，需要控制成本（用 haiku 模型）
4. **CLAUDE.md 更新频率**：persona 保存 + memory 变更都会更新 claude.md，需要避免竞态写入
5. **现有功能回归**：语音条、录音、转写、tray 状态等功能在重构过程中不能中断
