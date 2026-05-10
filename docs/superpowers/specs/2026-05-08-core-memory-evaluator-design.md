# Core Memory Evaluator Design

## Problem

Core memory (`~/.aiva/memories/`) relies entirely on Claude Agent SDK's `autoMemoryEnabled` feature, which rarely triggers in short voice conversations. The result: core memories are barely updated, and users have no voice-accessible way to manage them.

Daily memory works reliably because it has an independent post-conversation evaluation step. Core memory lacks an equivalent mechanism.

## Solution

Add a post-conversation core memory evaluator (`src/lib/core-memory-evaluator.ts`) that runs after each successful conversation, parallel to the existing daily memory evaluator. It uses haiku to assess whether the conversation reveals persistent user information worth adding to or updating in core memory.

### Architecture

```
Conversation completes
  ├── evaluateAndWriteDailyMemory()   (existing)
  └── evaluateAndWriteCoreMemory()    (new, parallel)
```

### New Module: `src/lib/core-memory-evaluator.ts`

**Function signature:**
```ts
evaluateAndWriteCoreMemory(
  aivaDir: string,
  userMessage: string,
  assistantMessage: string,
  apiKey: string,
  providerKey: string,
): Promise<void>
```

**Flow:**
1. Read all `.md` files from `~/.aiva/memories/` (excluding `MEMORY.md`)
2. Build a summary of existing memories (filename + content)
3. Send conversation + existing memory summary to haiku
4. Parse JSON response with actions array
5. Execute file operations (create/update/delete)

### Evaluation Prompt

```
你是一个用户画像记忆管理器。根据对话内容判断是否需要更新用户的核心记忆。

核心记忆存储关于用户的持久信息，而非事件记录。

值得记忆的：
- 用户偏好（语言、风格、习惯、喜好）
- 个人背景（职业、家庭、项目、工具链）
- 持久性决策（"以后都用中文回复"、"不要自动..."）
- 对已有信息的修正或补充

不值得记忆的：
- 一次性任务、临时问答
- 具体事件经过（那是每日记忆的职责）
- 重复已有记忆的信息

现有核心记忆：
{existing_memories}

根据对话，输出 JSON（不要 markdown）：
{"actions": [{"action": "create"|"update"|"delete"|"none", "filename": "英文短名.md", "reason": "简述原因", "content": "记忆内容（仅 create/update 需要）"}]}

如果无需变更，actions 为空数组。
filename 使用英文小写+连字符，如 work-style.md、food-preference.md。
content 写成一段自然文字，不要用列表格式。
update 时必须与现有 filename 匹配。
```

### LLM Call Details

- Model: haiku (via `resolveModel(providerKey, 'haiku')`)
- `max_tokens: 1024` (larger than daily memory's 512, to accommodate multiple actions)
- Same API call pattern as `daily-memory-writer.ts`
- Conversation content truncated to 2000 characters

### Action Execution

```ts
for (const action of actions) {
  switch (action.action) {
    case 'create':
      writeFileSync(path.join(memoriesDir, action.filename), action.content);
      break;
    case 'update':
      if (existsSync(target)) writeFileSync(target, action.content);
      else writeFileSync(target, action.content); // downgrade to create
      break;
    case 'delete':
      if (existsSync(target)) unlinkSync(target);
      break;
  }
}
```

### Path Safety

Same protection as existing IPC handlers:

```ts
const memoriesDir = path.resolve(path.join(os.homedir(), '.aiva', 'memories'));
const targetPath = path.resolve(memoriesDir, action.filename);
if (!targetPath.startsWith(memoriesDir)) continue; // skip path traversal attempts
```

### Edge Cases

| Case | Handling |
|------|----------|
| `~/.aiva/memories/` doesn't exist | `mkdirSync({ recursive: true })` |
| No existing memories | Prompt notes "暂无现有记忆" |
| Unparseable JSON from haiku | Skip, log warn (same as daily memory) |
| `update` target file doesn't exist | Downgrade to `create` |
| `delete` target file doesn't exist | Skip silently |
| Empty actions array | No-op |

### Integration Point

In `electron/main.ts`, after `evaluateAndWriteDailyMemory()` call (around line 841):

```ts
evaluateAndWriteCoreMemory(aivaDir, prompt, assistantContent, ak, providerKey).catch(err => {
  log.error('核心记忆评估异常:', err);
});
```

Both evaluators run in parallel, neither blocks the other.

### What We Don't Change

- SDK's `autoMemoryEnabled` / `autoDreamEnabled` settings remain as-is (coexistence)
- `/memory` page UI unchanged (already supports manual management)
- No voice commands added (fully automatic evaluation is sufficient)
- `src/lib/aiva-context.ts` unchanged (daily memory injection works as-is)
