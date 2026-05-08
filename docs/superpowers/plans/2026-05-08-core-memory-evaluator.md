# Core Memory Evaluator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a post-conversation evaluator that automatically updates core memory files based on conversation content, complementing the existing daily memory system.

**Architecture:** New module `src/lib/core-memory-evaluator.ts` mirrors the pattern of `daily-memory-writer.ts` — reads existing memories, sends conversation to haiku for evaluation, executes file actions. Integrated into `electron/main.ts` alongside the existing daily memory call.

**Tech Stack:** TypeScript, fs/path (Node.js), Anthropic Messages API (haiku model), Jest for tests.

---

## File Structure

| File | Responsibility |
|------|---------------|
| `src/lib/core-memory-evaluator.ts` | **Create.** Read existing memories, call haiku, execute file actions. |
| `src/__tests__/core-memory-evaluator.test.ts` | **Create.** Test `executeActions` file operations (unit-testable, no LLM call). |
| `electron/main.ts:24,846-849` | **Modify.** Add import and call site. |

---

### Task 1: Test `executeActions` helper

**Files:**
- Create: `src/__tests__/core-memory-evaluator.test.ts`
- Create: `src/lib/core-memory-evaluator.ts` (only `executeActions` and types)

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/core-memory-evaluator.test.ts
import fs from 'fs';
import path from 'path';
import { executeActions, CoreMemoryAction } from '../lib/core-memory-evaluator';

const tmpDir = path.join(process.cwd(), '.tmp-test-core-memory');
const memoriesDir = path.join(tmpDir, 'memories');

beforeAll(() => {
  fs.mkdirSync(tmpDir, { recursive: true });
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true });
});

beforeEach(() => {
  if (fs.existsSync(memoriesDir)) fs.rmSync(memoriesDir, { recursive: true });
});

test('executeActions creates a new memory file', () => {
  const actions: CoreMemoryAction[] = [
    { action: 'create', filename: 'food-preference.md', content: '用户喜欢吃辣，不吃香菜。' },
  ];

  executeActions(memoriesDir, actions);

  const content = fs.readFileSync(path.join(memoriesDir, 'food-preference.md'), 'utf-8');
  expect(content).toBe('用户喜欢吃辣，不吃香菜。');
});

test('executeActions updates existing memory file', () => {
  fs.mkdirSync(memoriesDir, { recursive: true });
  fs.writeFileSync(path.join(memoriesDir, 'food-preference.md'), '旧内容');

  const actions: CoreMemoryAction[] = [
    { action: 'update', filename: 'food-preference.md', content: '新内容' },
  ];

  executeActions(memoriesDir, actions);

  const content = fs.readFileSync(path.join(memoriesDir, 'food-preference.md'), 'utf-8');
  expect(content).toBe('新内容');
});

test('executeActions downgrades update to create when file missing', () => {
  const actions: CoreMemoryAction[] = [
    { action: 'update', filename: 'missing.md', content: '新建内容' },
  ];

  executeActions(memoriesDir, actions);

  const content = fs.readFileSync(path.join(memoriesDir, 'missing.md'), 'utf-8');
  expect(content).toBe('新建内容');
});

test('executeActions deletes existing file', () => {
  fs.mkdirSync(memoriesDir, { recursive: true });
  fs.writeFileSync(path.join(memoriesDir, 'old.md'), '过时信息');

  const actions: CoreMemoryAction[] = [
    { action: 'delete', filename: 'old.md' },
  ];

  executeActions(memoriesDir, actions);

  expect(fs.existsSync(path.join(memoriesDir, 'old.md'))).toBe(false);
});

test('executeActions skips delete when file missing', () => {
  const actions: CoreMemoryAction[] = [
    { action: 'delete', filename: 'nonexistent.md' },
  ];

  expect(() => executeActions(memoriesDir, actions)).not.toThrow();
});

test('executeActions skips path traversal attempts', () => {
  const actions: CoreMemoryAction[] = [
    { action: 'create', filename: '../etc/passwd', content: '恶意内容' },
  ];

  executeActions(memoriesDir, actions);

  expect(fs.existsSync(path.join(tmpDir, 'etc', 'passwd'))).toBe(false);
});

test('executeActions creates memoriesDir if missing', () => {
  const actions: CoreMemoryAction[] = [
    { action: 'create', filename: 'test.md', content: '内容' },
  ];

  expect(fs.existsSync(memoriesDir)).toBe(false);
  executeActions(memoriesDir, actions);
  expect(fs.existsSync(path.join(memoriesDir, 'test.md'))).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/__tests__/core-memory-evaluator.test.ts --no-coverage 2>&1 | tail -20`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/core-memory-evaluator.ts
import fs from 'fs';
import path from 'path';
import os from 'os';
import { getProvider, resolveModel } from './provider-config';
import { log } from './logger';

export interface CoreMemoryAction {
  action: 'create' | 'update' | 'delete' | 'none';
  filename: string;
  reason?: string;
  content?: string;
}

export function executeActions(memoriesDir: string, actions: CoreMemoryAction[]): void {
  const resolved = path.resolve(memoriesDir);
  if (!fs.existsSync(resolved)) {
    fs.mkdirSync(resolved, { recursive: true });
  }

  for (const act of actions) {
    if (act.action === 'none' || !act.filename) continue;

    const targetPath = path.resolve(resolved, act.filename);
    if (!targetPath.startsWith(resolved + path.sep) && targetPath !== resolved) continue;

    switch (act.action) {
      case 'create':
        fs.writeFileSync(targetPath, act.content ?? '');
        log.info('核心记忆: 创建', act.filename, '-', act.reason);
        break;
      case 'update':
        fs.writeFileSync(targetPath, act.content ?? '');
        log.info('核心记忆: 更新', act.filename, '-', act.reason);
        break;
      case 'delete':
        if (fs.existsSync(targetPath)) {
          fs.unlinkSync(targetPath);
          log.info('核心记忆: 删除', act.filename, '-', act.reason);
        }
        break;
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/__tests__/core-memory-evaluator.test.ts --no-coverage 2>&1 | tail -20`
Expected: All 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/core-memory-evaluator.ts src/__tests__/core-memory-evaluator.test.ts
git commit -m "feat(core-memory): add executeActions helper with tests"
```

---

### Task 2: Implement `evaluateAndWriteCoreMemory` function

**Files:**
- Modify: `src/lib/core-memory-evaluator.ts` (add the main function)

- [ ] **Step 1: Add `readExistingMemories` helper and `evaluateAndWriteCoreMemory` function**

Append to `src/lib/core-memory-evaluator.ts` after the `executeActions` function:

```ts
const EVAL_PROMPT = `你是一个用户画像记忆管理器。根据对话内容判断是否需要更新用户的核心记忆。

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

`;

const EXISTING_MEMORIES_HEADER = '\n现有核心记忆：\n';
const EXISTING_MEMORIES_EMPTY = '暂无现有记忆。\n';

const INSTRUCTION = `\n根据对话，输出纯 JSON（不要 markdown 代码块）：
{"actions": [{"action": "create"|"update"|"delete"|"none", "filename": "英文短名.md", "reason": "简述原因", "content": "记忆内容（仅 create/update 需要）"}]}

如果无需变更，actions 为空数组。
filename 使用英文小写+连字符，如 work-style.md、food-preference.md。
content 写成一段自然文字，不要用列表格式。
update 时必须与现有 filename 匹配。

对话内容：
`;

function readExistingMemories(memoriesDir: string): string {
  if (!fs.existsSync(memoriesDir)) return EXISTING_MEMORIES_EMPTY;

  const files = fs.readdirSync(memoriesDir)
    .filter(f => f.endsWith('.md') && f !== 'MEMORY.md');

  if (files.length === 0) return EXISTING_MEMORIES_EMPTY;

  const parts = files.map(f => {
    const content = fs.readFileSync(path.join(memoriesDir, f), 'utf-8');
    const preview = content.length > 200 ? content.slice(0, 200) + '...' : content;
    return `### ${f}\n${preview}`;
  });

  return EXISTING_MEMORIES_HEADER + parts.join('\n\n');
}

export async function evaluateAndWriteCoreMemory(
  shrewDir: string,
  userMessage: string,
  assistantMessage: string,
  apiKey: string,
  providerKey: string,
): Promise<void> {
  try {
    const provider = getProvider(providerKey);
    const modelId = resolveModel(providerKey, 'haiku');

    const memoriesDir = path.resolve(path.join(os.homedir(), '.shrew', 'memories'));
    const existingMemories = readExistingMemories(memoriesDir);

    const conversation = `用户: ${userMessage}\n\n助手: ${assistantMessage.slice(0, 2000)}`;
    const prompt = EVAL_PROMPT + existingMemories + INSTRUCTION + conversation;

    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'anthropic-version': '2023-06-01',
      ...(provider.authStyle === 'auth_token'
        ? { 'authorization': `Bearer ${apiKey}` }
        : { 'x-api-key': apiKey }),
    };

    const baseUrl = provider.baseUrl || 'https://api.anthropic.com';
    const response = await fetch(`${baseUrl}/v1/messages`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: modelId,
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      log.warn('核心记忆评估 API 调用失败:', response.status);
      return;
    }

    const data = await response.json() as any;
    const text = data.content?.[0]?.text;
    if (!text) return;

    let actions: CoreMemoryAction[];
    try {
      const jsonStr = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const parsed = JSON.parse(jsonStr);
      actions = Array.isArray(parsed?.actions) ? parsed.actions : [];
    } catch {
      log.warn('核心记忆评估: JSON 解析失败:', text.slice(0, 200));
      return;
    }

    if (actions.length === 0) return;

    executeActions(memoriesDir, actions);
    log.info('核心记忆评估完成, 执行了', actions.length, '个操作');
  } catch (err) {
    log.error('核心记忆评估异常:', err);
  }
}
```

- [ ] **Step 2: Verify no TypeScript errors**

Run: `npx tsc --noEmit src/lib/core-memory-evaluator.ts 2>&1 | tail -10`
Expected: No errors. (If tsc flags import issues, check that `os` and `./logger` resolve correctly.)

- [ ] **Step 3: Commit**

```bash
git add src/lib/core-memory-evaluator.ts
git commit -m "feat(core-memory): add evaluateAndWriteCoreMemory function"
```

---

### Task 3: Integrate into `electron/main.ts`

**Files:**
- Modify: `electron/main.ts:24` (add import)
- Modify: `electron/main.ts:846-849` (add call site)

- [ ] **Step 1: Add import**

At line 24, after the existing `daily-memory-writer` import:

```ts
import { evaluateAndWriteDailyMemory } from '../src/lib/daily-memory-writer';
```

Add:

```ts
import { evaluateAndWriteCoreMemory } from '../src/lib/core-memory-evaluator';
```

- [ ] **Step 2: Add call site**

At lines 846-849, after the existing `evaluateAndWriteDailyMemory` call:

```ts
        evaluateAndWriteDailyMemory(
          shrewDir, prompt, result.summary || assistantContent,
          ak, providerKey,
        ).catch(err => log.error('每日记忆写入异常:', err));
```

Add:

```ts
        evaluateAndWriteCoreMemory(
          shrewDir, prompt, assistantContent,
          ak, providerKey,
        ).catch(err => log.error('核心记忆评估异常:', err));
```

- [ ] **Step 3: Verify build compiles**

Run: `npm run build:electron 2>&1 | tail -10`
Expected: Build succeeds with no errors.

- [ ] **Step 4: Commit**

```bash
git add electron/main.ts
git commit -m "feat(core-memory): integrate evaluator into post-conversation flow"
```

---

### Task 4: Manual smoke test

- [ ] **Step 1: Start dev environment**

Run: `npm run electron:dev`

- [ ] **Step 2: Have a voice conversation that reveals a preference**

Say something like: "我以后都用英文回复" or "我是做前端的，主要用 React"

- [ ] **Step 3: Check if core memory was updated**

Run: `ls -la ~/.shrew/memories/ && cat ~/.shrew/memories/*.md`

Expected: A new or updated `.md` file reflecting the preference/background information from the conversation.

- [ ] **Step 4: Have a trivial conversation and verify no memory is created**

Say something like: "今天天气怎么样"

Expected: No new core memory files created for trivial conversations.
