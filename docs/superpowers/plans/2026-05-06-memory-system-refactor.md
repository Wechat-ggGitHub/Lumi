# 记忆系统重构 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 重构 Aiva 记忆系统为两层架构——SDK Auto-Memory 管理全局核心记忆，Aiva 自管理每日记忆 Markdown 文件。

**Architecture:** 删除 SQLite `memory_item` 表和相关提取/注入逻辑。SDK 的 `autoMemoryDirectory` 设为固定路径 `~/.aiva/memories/`（不受工作目录切换影响）。新增 `daily-memory-reader.ts` 和 `daily-memory-writer.ts` 管理每日 Markdown 文件，每次对话完成后 LLM 评估是否追加到当日文件。`/memory` 页面改为双 tab UI。

**Tech Stack:** TypeScript, Node.js fs, better-sqlite3 (仅迁移用), Claude Agent SDK (autoMemoryDirectory), Electron IPC, Next.js React (page rewrite)

---

## File Structure

| 操作 | 文件 | 职责 |
|------|------|------|
| Create | `src/lib/daily-memory-reader.ts` | 读取每日记忆文件（按日期、列表、最近N天） |
| Create | `src/lib/daily-memory-writer.ts` | LLM 评估 + 追加写入每日记忆文件 |
| Create | `src/__tests__/daily-memory-reader.test.ts` | daily-memory-reader 单元测试 |
| Create | `src/__tests__/daily-memory-writer.test.ts` | daily-memory-writer 单元测试 |
| Modify | `src/lib/claude-client.ts:51-64` | 添加 SDK autoMemoryDirectory 配置 |
| Modify | `src/lib/aiva-context.ts` | 删除 getActiveMemories/getPinnedMemories，修改 buildAivaContext 签名和逻辑 |
| Modify | `src/lib/db.ts:48-61,268-313` | 删除 memory_item 表和相关函数 |
| Modify | `electron/main.ts:12,19-20,381-391,527-539,980-1007` | 删除旧 memory import/IPC/handler，替换为新的每日记忆逻辑 |
| Modify | `src/types/index.ts:114-125,208-214` | 删除 MemoryItem，更新 IPC 类型 |
| Modify | `src/app/memory/page.tsx` | 重写为双 tab UI（核心记忆 + 每日记忆） |
| Delete | `src/lib/memory-extractor.ts` | 被 SDK auto-memory + daily-memory-writer 替代 |

---

### Task 1: Create daily-memory-reader.ts

**Files:**
- Create: `src/lib/daily-memory-reader.ts`
- Create: `src/__tests__/daily-memory-reader.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/__tests__/daily-memory-reader.test.ts
import fs from 'fs';
import path from 'path';
import { readDailyMemory, listDailyMemoryDates, readRecentDailyMemories } from '../lib/daily-memory-reader';

const tmpDir = path.join(process.cwd(), '.tmp-test-daily');

beforeAll(() => {
  fs.mkdirSync(tmpDir, { recursive: true });
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true });
});

beforeEach(() => {
  // Clean up daily dir
  const dailyDir = path.join(tmpDir, 'daily');
  if (fs.existsSync(dailyDir)) fs.rmSync(dailyDir, { recursive: true });
});

test('readDailyMemory returns null when file does not exist', () => {
  const result = readDailyMemory(tmpDir, '2026-05-06');
  expect(result).toBeNull();
});

test('readDailyMemory returns file content when exists', () => {
  const dailyDir = path.join(tmpDir, 'daily');
  fs.mkdirSync(dailyDir, { recursive: true });
  fs.writeFileSync(path.join(dailyDir, '2026-05-06.md'), '# 2026-05-06\n\n## Test entry\n- some content');

  const result = readDailyMemory(tmpDir, '2026-05-06');
  expect(result).toBe('# 2026-05-06\n\n## Test entry\n- some content');
});

test('listDailyMemoryDates returns sorted dates descending', () => {
  const dailyDir = path.join(tmpDir, 'daily');
  fs.mkdirSync(dailyDir, { recursive: true });
  fs.writeFileSync(path.join(dailyDir, '2026-05-04.md'), '# 2026-05-04');
  fs.writeFileSync(path.join(dailyDir, '2026-05-06.md'), '# 2026-05-06');
  fs.writeFileSync(path.join(dailyDir, '2026-05-05.md'), '# 2026-05-05');
  fs.writeFileSync(path.join(dailyDir, 'not-a-date.txt'), 'ignore');

  const dates = listDailyMemoryDates(tmpDir);
  expect(dates).toEqual(['2026-05-06', '2026-05-05', '2026-05-04']);
});

test('readRecentDailyMemories returns recent N days', () => {
  const dailyDir = path.join(tmpDir, 'daily');
  fs.mkdirSync(dailyDir, { recursive: true });
  fs.writeFileSync(path.join(dailyDir, '2026-05-04.md'), 'day4');
  fs.writeFileSync(path.join(dailyDir, '2026-05-05.md'), 'day5');
  fs.writeFileSync(path.join(dailyDir, '2026-05-06.md'), 'day6');

  const result = readRecentDailyMemories(tmpDir, 2);
  expect(result.size).toBe(2);
  expect(result.get('2026-05-06')).toBe('day6');
  expect(result.get('2026-05-05')).toBe('day5');
});

test('readRecentDailyMemories skips missing days', () => {
  const dailyDir = path.join(tmpDir, 'daily');
  fs.mkdirSync(dailyDir, { recursive: true });
  fs.writeFileSync(path.join(dailyDir, '2026-05-06.md'), 'day6');
  // 2026-05-05 doesn't exist

  const result = readRecentDailyMemories(tmpDir, 2);
  expect(result.size).toBe(1);
  expect(result.get('2026-05-06')).toBe('day6');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/__tests__/daily-memory-reader.test.ts --no-cache 2>&1 | tail -5`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/daily-memory-reader.ts
import fs from 'fs';
import path from 'path';

export function getDailyMemoryDir(aivaDir: string): string {
  return path.join(aivaDir, 'daily');
}

export function readDailyMemory(aivaDir: string, date: string): string | null {
  const filePath = path.join(getDailyMemoryDir(aivaDir), `${date}.md`);
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath, 'utf-8');
}

export function listDailyMemoryDates(aivaDir: string): string[] {
  const dir = getDailyMemoryDir(aivaDir);
  if (!fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir);
  const dates = files
    .filter(f => /^\d{4}-\d{2}-\d{2}\.md$/.test(f))
    .map(f => f.replace('.md', ''))
    .sort()
    .reverse();
  return dates;
}

export function readRecentDailyMemories(aivaDir: string, days: number): Map<string, string> {
  const result = new Map<string, string>();
  const today = new Date();
  for (let i = 0; i < days; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const content = readDailyMemory(aivaDir, dateStr);
    if (content) {
      result.set(dateStr, content);
    }
  }
  return result;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/__tests__/daily-memory-reader.test.ts --no-cache`
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/daily-memory-reader.ts src/__tests__/daily-memory-reader.test.ts
git commit -m "feat: add daily memory reader module with tests"
```

---

### Task 2: Create daily-memory-writer.ts

**Files:**
- Create: `src/lib/daily-memory-writer.ts`
- Create: `src/__tests__/daily-memory-writer.test.ts`

- [ ] **Step 1: Write the failing tests**

Tests 只覆盖文件写入逻辑（不覆盖 LLM 调用，LLM 调用通过 mock 测试）。

```typescript
// src/__tests__/daily-memory-writer.test.ts
import fs from 'fs';
import path from 'path';
import { appendDailyMemory } from '../lib/daily-memory-writer';

const tmpDir = path.join(process.cwd(), '.tmp-test-writer');

beforeAll(() => {
  fs.mkdirSync(tmpDir, { recursive: true });
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true });
});

beforeEach(() => {
  const dailyDir = path.join(tmpDir, 'daily');
  if (fs.existsSync(dailyDir)) fs.rmSync(dailyDir, { recursive: true });
});

test('appendDailyMemory creates new file with header when file does not exist', () => {
  appendDailyMemory(tmpDir, '2026-05-06', '14:30', '修复登录 Bug', '- 发现 cookie 问题\n- 已修复');

  const content = fs.readFileSync(path.join(tmpDir, 'daily', '2026-05-06.md'), 'utf-8');
  expect(content).toContain('# 2026-05-06');
  expect(content).toContain('## 14:30 - 修复登录 Bug');
  expect(content).toContain('- 发现 cookie 问题');
});

test('appendDailyMemory appends to existing file', () => {
  const dailyDir = path.join(tmpDir, 'daily');
  fs.mkdirSync(dailyDir, { recursive: true });
  fs.writeFileSync(path.join(dailyDir, '2026-05-06.md'), '# 2026-05-06\n\n## 10:00 - 旧条目\n- old');

  appendDailyMemory(tmpDir, '2026-05-06', '16:00', '新功能', '- new stuff');

  const content = fs.readFileSync(path.join(dailyDir, '2026-05-06.md'), 'utf-8');
  expect(content).toContain('## 10:00 - 旧条目');
  expect(content).toContain('## 16:00 - 新功能');
  expect(content).toContain('- new stuff');
});

test('appendDailyMemory creates daily directory if missing', () => {
  // daily/ dir does not exist
  appendDailyMemory(tmpDir, '2026-05-06', '09:00', 'First entry', '- content');

  expect(fs.existsSync(path.join(tmpDir, 'daily', '2026-05-06.md'))).toBe(true);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest src/__tests__/daily-memory-writer.test.ts --no-cache 2>&1 | tail -5`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/daily-memory-writer.ts
import fs from 'fs';
import path from 'path';
import { getProvider, resolveModel } from './provider-config';
import { getDailyMemoryDir } from './daily-memory-reader';
import { log } from './logger';

const EVAL_PROMPT = `你是一个日记助手。根据用户和助手的对话，判断这次对话是否有值得记录的内容。

记录标准：
- 用户表达了明确的偏好或决策 → 值得记录
- 发现了重要问题或 bug → 值得记录
- 有待跟进或未完成的事项 → 值得记录
- 学习了新技术方案或做了关键选择 → 值得记录
- 纯执行任务、无新信息 → 不记录
- 简单查询、无后续影响 → 不记录

返回 JSON 格式：
{"shouldRecord": boolean, "title": "简短标题（10字以内）", "summary": "1-3个要点，每行以 - 开头"}

对话内容：
`;

interface EvalResult {
  shouldRecord: boolean;
  title: string;
  summary: string;
}

export function appendDailyMemory(aivaDir: string, date: string, time: string, title: string, summary: string): void {
  const dir = getDailyMemoryDir(aivaDir);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const filePath = path.join(dir, `${date}.md`);
  const entry = `## ${time} - ${title}\n${summary}\n`;

  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, `# ${date}\n\n${entry}`);
  } else {
    fs.appendFileSync(filePath, `\n${entry}`);
  }
}

export async function evaluateAndWriteDailyMemory(
  aivaDir: string,
  userMessage: string,
  assistantMessage: string,
  apiKey: string,
  providerKey: string,
): Promise<void> {
  try {
    const provider = getProvider(providerKey);
    const modelId = resolveModel(providerKey, 'haiku');

    const conversation = `用户: ${userMessage}\n\n助手: ${assistantMessage.slice(0, 2000)}`;
    const prompt = EVAL_PROMPT + conversation;

    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'anthropic-version': '2023-06-01',
      'x-api-key': apiKey,
    };

    const baseUrl = provider.baseUrl || 'https://api.anthropic.com';
    const response = await fetch(`${baseUrl}/v1/messages`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: modelId,
        max_tokens: 512,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      log.warn('每日记忆评估 API 调用失败:', response.status);
      return;
    }

    const data = await response.json() as any;
    const text = data.content?.[0]?.text;
    if (!text) return;

    let result: EvalResult;
    try {
      const jsonStr = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      result = JSON.parse(jsonStr);
    } catch {
      log.warn('每日记忆评估: JSON 解析失败:', text.slice(0, 200));
      return;
    }

    if (!result.shouldRecord) return;

    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    appendDailyMemory(aivaDir, dateStr, timeStr, result.title, result.summary);
    log.info('每日记忆已写入:', result.title);
  } catch (err) {
    log.error('每日记忆评估异常:', err);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/__tests__/daily-memory-writer.test.ts --no-cache`
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/daily-memory-writer.ts src/__tests__/daily-memory-writer.test.ts
git commit -m "feat: add daily memory writer module with tests"
```

---

### Task 3: Add SDK memory global config

**Files:**
- Modify: `src/lib/claude-client.ts:51-64`

- [ ] **Step 1: Add autoMemoryDirectory to SDK options**

In `src/lib/claude-client.ts`, add three lines to the `options` object (after line 63, before the closing paren):

```typescript
  const options: Record<string, unknown> = {
    cwd,
    permissionMode: 'bypassPermissions' as const,
    allowDangerouslySkipPermissions: true,
    abortController,
    env: buildSdkEnv(providerKey, apiKey, modelPreset),
    skills: [],
    systemPrompt: {
      type: 'preset',
      preset: 'claude_code',
      ...(skillCatalog ? { append: skillCatalog } : {}),
    },
    autoMemoryDirectory: '~/.aiva/memories',
    autoMemoryEnabled: true,
    autoDreamEnabled: true,
    ...(resumeSessionId ? { resume: resumeSessionId } : {}),
  };
```

The key changes: add `autoMemoryDirectory`, `autoMemoryEnabled`, `autoDreamEnabled` to the options object.

- [ ] **Step 2: Verify build passes**

Run: `npx tsc --noEmit --project tsconfig.electron.json 2>&1 | head -20`
Expected: no errors related to claude-client.ts

- [ ] **Step 3: Commit**

```bash
git add src/lib/claude-client.ts
git commit -m "feat: configure SDK auto-memory with global directory"
```

---

### Task 4: Update aiva-context.ts

**Files:**
- Modify: `src/lib/aiva-context.ts`

- [ ] **Step 1: Rewrite aiva-context.ts**

Replace the entire file. Remove `getActiveMemories`, `getPinnedMemories`, and the `memoryLines` parameter. Add daily memory injection.

```typescript
// src/lib/aiva-context.ts
import fs from 'fs';
import path from 'path';
import { readDailyMemory } from './daily-memory-reader';

const DELIVERY_INSTRUCTION = `## 结果交付方式
当你完成用户指令后，根据结果的复杂度选择交付方式：
- 如果结果是简短说明（如"已更新配置"、"创建完成"），直接用文字回复
- 如果结果较长或包含复杂内容（如代码修改总结、多步骤操作、详细分析），将完整内容整理成文件写入 ~/Desktop/ 目录，然后用一两句话告诉用户你做了什么以及文件位置`;

const DAILY_MEMORY_HINT = `## 每日记忆
每日记忆存储在 ~/.aiva/daily/ 目录，格式为 YYYY-MM-DD.md。当用户提及过去发生的事或询问之前讨论过的内容时，用 Read 工具读取对应日期的文件。`;

export function buildAivaContext(aivaDir: string, personaContent: string): string {
  const parts: string[] = [];

  if (personaContent.trim()) {
    parts.push(personaContent.trim());
  }

  parts.push(DELIVERY_INSTRUCTION);

  // 注入前一天的每日记忆
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().slice(0, 10);
  const yesterdayMemory = readDailyMemory(aivaDir, yesterdayStr);
  if (yesterdayMemory) {
    parts.push(`\n## 近期动态\n以下是 ${yesterdayStr} 的记忆摘要：\n${yesterdayMemory}`);
  }

  parts.push(DAILY_MEMORY_HINT);

  return parts.join('\n');
}
```

- [ ] **Step 2: Verify build passes**

Run: `npx tsc --noEmit --project tsconfig.electron.json 2>&1 | head -20`
Expected: will show errors in main.ts because `getActiveMemories` import is removed — that's expected, fixed in Task 7

- [ ] **Step 3: Commit**

```bash
git add src/lib/aiva-context.ts
git commit -m "refactor: replace memory injection with daily memory context"
```

---

### Task 5: Update types/index.ts

**Files:**
- Modify: `src/types/index.ts:114-125,208-214`

- [ ] **Step 1: Remove MemoryItem interface and update IPC types**

In `src/types/index.ts`:

Remove lines 114-125 (the `MemoryItem` interface).

Replace lines 208-214 (memory IPC types):
```typescript
  // memory: invoke (new file-based)
  'memory:list-core': void;
  'memory:update-core': { filename: string; content: string };
  'memory:delete-core': { filename: string };
  'memory:list-daily': void;
  'memory:read-daily': { date: string };
```

- [ ] **Step 2: Commit**

```bash
git add src/types/index.ts
git commit -m "refactor: update IPC types for file-based memory system"
```

---

### Task 6: Update electron/main.ts

这是最大的改动任务。需要：
1. 更新 import 语句
2. 修改 executePrompt 中的上下文构建和记忆提炼逻辑
3. 替换 memory IPC handlers

**Files:**
- Modify: `electron/main.ts`

- [ ] **Step 1: Update imports**

在 `electron/main.ts` 顶部：

删除第 12 行中的 memory 相关 DB 函数导入：
```
// 从这行的 import 中删除: listMemories, addMemory, updateMemory, deleteMemory, toggleMemoryStatus, toggleMemoryPin
```
修改后：
```typescript
import { initDb, insertExecution, updateExecution, getRecentExecutions, getExecutionById, appendMessages, getActiveExecution, getActiveSegment, endSegment, createSegment, updateSegmentSessionId, insertChatMessage, appendChatMessageContent, getChatMessages, getLatestAssistantMessage } from '../src/lib/db';
```

删除第 19 行：
```typescript
// 删除: import { buildAivaContext, getActiveMemories } from '../src/lib/aiva-context';
```
替换为：
```typescript
import { buildAivaContext } from '../src/lib/aiva-context';
import { listDailyMemoryDates, readDailyMemory } from '../src/lib/daily-memory-reader';
import { evaluateAndWriteDailyMemory } from '../src/lib/daily-memory-writer';
```

删除第 20 行：
```typescript
// 删除: import { extractMemories } from '../src/lib/memory-extractor';
```

- [ ] **Step 2: Update executePrompt — replace context building**

将第 380-391 行：
```typescript
  // 构建 persona + memory 上下文
  const personaContent = buildPersonaContext(aivaDir);
  const memoryLines = getActiveMemories(db);
  const aivaContext = buildAivaContext(personaContent, memoryLines);

  // 构建 skill catalog
  const skillCatalog = buildSkillCatalog(
    path.join(aivaDir, 'skills'),
    settings.disabledSkills || []
  );

  const fullPrompt = aivaContext ? aivaContext + '\n\n' + prompt : prompt;
```

替换为：
```typescript
  // 构建 persona + 每日记忆上下文
  const personaContent = buildPersonaContext(aivaDir);
  const aivaContext = buildAivaContext(aivaDir, personaContent);

  // 构建 skill catalog
  const skillCatalog = buildSkillCatalog(
    path.join(aivaDir, 'skills'),
    settings.disabledSkills || []
  );

  const fullPrompt = aivaContext ? aivaContext + '\n\n' + prompt : prompt;
```

- [ ] **Step 3: Update executePrompt — replace memory extraction with daily memory writer**

将第 527-539 行：
```typescript
    // 异步触发 Memory 提炼（不阻塞主流程）
    if (result.status === 'completed') {
      const segment = getActiveSegment(db);
      const settings = loadSettings();
      const ak = loadApiKey();
      if (ak) {
        const assistantContent = conversationMessages
          .filter(m => m.role === 'assistant').map(m => m.content).join('\n');
        extractMemories(
          db, prompt, result.summary || assistantContent,
          ak, settings.provider || 'glm-cn', executionId
        ).catch(err => log.error('Memory 提炼异常:', err));
      }
    }
```

替换为：
```typescript
    // 异步写入每日记忆（不阻塞主流程）
    if (result.status === 'completed') {
      const ak = loadApiKey();
      if (ak) {
        const assistantContent = conversationMessages
          .filter(m => m.role === 'assistant').map(m => m.content).join('\n');
        evaluateAndWriteDailyMemory(
          aivaDir, prompt, result.summary || assistantContent,
          ak, providerKey,
        ).catch(err => log.error('每日记忆写入异常:', err));
      }
    }
```

- [ ] **Step 4: Replace memory IPC handlers**

将第 980-1007 行的 6 个旧 memory IPC handler 全部替换为：

```typescript
  // memory (file-based)
  ipcMain.handle('memory:list-core', () => {
    const memoriesDir = path.join(aivaDir, 'memories');
    if (!fs.existsSync(memoriesDir)) return [];
    const files = fs.readdirSync(memoriesDir).filter(f => f.endsWith('.md') && f !== 'MEMORY.md');
    return files.map(f => {
      const content = fs.readFileSync(path.join(memoriesDir, f), 'utf-8');
      return { filename: f, content };
    });
  });

  ipcMain.handle('memory:update-core', (_, { filename, content }: { filename: string; content: string }) => {
    const filePath = path.join(aivaDir, 'memories', filename);
    if (!fs.existsSync(filePath)) return false;
    fs.writeFileSync(filePath, content);
    return true;
  });

  ipcMain.handle('memory:delete-core', (_, { filename }: { filename: string }) => {
    const filePath = path.join(aivaDir, 'memories', filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    return true;
  });

  ipcMain.handle('memory:list-daily', () => {
    return listDailyMemoryDates(aivaDir);
  });

  ipcMain.handle('memory:read-daily', (_, { date }: { date: string }) => {
    return readDailyMemory(aivaDir, date);
  });
```

- [ ] **Step 5: Verify build passes**

Run: `npm run build:electron 2>&1 | tail -5`
Expected: build succeeds

- [ ] **Step 6: Commit**

```bash
git add electron/main.ts
git commit -m "refactor: switch main.ts to file-based memory system"
```

---

### Task 7: Remove old memory code from db.ts

**Files:**
- Modify: `src/lib/db.ts`
- Modify: `src/types/index.ts` (remove MemoryItem import)

- [ ] **Step 1: Remove memory_item from schema**

在 `src/lib/db.ts` 中：

删除第 3 行中的 `MemoryItem` 类型导入：
```typescript
// 将: import type { ExecutionRecord, ConversationMessage, ChatMessage, ContextSegment, MemoryItem } from '@/types';
// 改为:
import type { ExecutionRecord, ConversationMessage, ChatMessage, ContextSegment } from '@/types';
```

删除第 48-61 行（`memory_item` 表创建和索引）。

- [ ] **Step 2: Remove memory functions**

删除第 268-313 行的所有 memory 函数（`listMemories`, `addMemory`, `updateMemory`, `deleteMemory`, `toggleMemoryStatus`, `toggleMemoryPin`, `getMemoriesByStatus`）。

- [ ] **Step 3: Verify build passes**

Run: `npm run build 2>&1 | tail -10`
Expected: build succeeds

- [ ] **Step 4: Run existing tests**

Run: `npx jest src/__tests__/db.test.ts --no-cache`
Expected: all PASS（db.test.ts 不依赖 memory 函数）

- [ ] **Step 5: Commit**

```bash
git add src/lib/db.ts
git commit -m "refactor: remove memory_item table and functions from db"
```

---

### Task 8: Delete memory-extractor.ts

**Files:**
- Delete: `src/lib/memory-extractor.ts`

- [ ] **Step 1: Delete the file**

```bash
git rm src/lib/memory-extractor.ts
```

- [ ] **Step 2: Verify build passes**

Run: `npm run build:electron 2>&1 | tail -5`
Expected: build succeeds（Task 6 已经移除了 import）

- [ ] **Step 3: Commit**

```bash
git commit -m "refactor: delete legacy memory-extractor module"
```

---

### Task 9: Add data migration

将旧的 `memory_item` 表数据迁移到 Markdown 文件。

**Files:**
- Modify: `src/lib/db.ts` (在 `initDb` 中添加迁移逻辑)

- [ ] **Step 1: Add migration in initDb**

在 `src/lib/db.ts` 的 `initDb()` 函数末尾（persona 迁移代码之后）添加：

```typescript
  // 迁移：将 memory_item 数据导出为 Markdown 文件
  const tables = db.pragma('table_info(memory_item)') as { name: string }[];
  if (tables.length > 0) {
    const memories = db.prepare(`SELECT * FROM memory_item WHERE status = '生效中'`).all() as Array<{ type: string; content: string }>;
    if (memories.length > 0) {
      const memoriesDir = path.join(appHomeDir || aivaDirFromDb(db), 'memories');
      fs.mkdirSync(memoriesDir, { recursive: true });

      const indexLines: string[] = [];
      for (const m of memories) {
        const slug = m.type.toLowerCase().replace(/[^a-z0-9一-鿿]+/g, '-').slice(0, 20);
        const filename = `${slug}-${Date.now()}.md`;
        const filePath = path.join(memoriesDir, filename);
        const content = `---\nname: ${m.type}\ndescription: ${m.content.slice(0, 60)}\ntype: user\n---\n${m.content}\n`;
        fs.writeFileSync(filePath, content);
        indexLines.push(`- [${m.type}](${filename}) — ${m.content.slice(0, 50)}`);
      }

      const indexPath = path.join(memoriesDir, 'MEMORY.md');
      if (fs.existsSync(indexPath)) {
        fs.appendFileSync(indexPath, '\n' + indexLines.join('\n'));
      } else {
        fs.writeFileSync(indexPath, indexLines.join('\n') + '\n');
      }

      db.exec('DROP TABLE IF EXISTS memory_item');
      log.info(`迁移完成: ${memories.length} 条记忆已导出为 Markdown 文件`);
    }
  }
```

注意：`initDb` 需要 `aivaDir` 参数。当前 `initDb` 只接收 `db`，需要额外传入 `aivaDir` 路径。或者改为在 `electron/main.ts` 的初始化阶段单独调用迁移函数。

**更好的方案**：在 `src/lib/db.ts` 中添加一个独立的 `migrateMemoryItems` 函数：

```typescript
export function migrateMemoryItems(db: Database.Database, aivaDir: string): void {
  const tables = db.pragma('table_info(memory_item)') as { name: string }[];
  if (tables.length === 0) return;

  const memories = db.prepare(`SELECT * FROM memory_item WHERE status = '生效中'`).all() as Array<{ type: string; content: string }>;
  if (memories.length === 0) {
    db.exec('DROP TABLE IF EXISTS memory_item');
    return;
  }

  const memoriesDir = path.join(aivaDir, 'memories');
  fs.mkdirSync(memoriesDir, { recursive: true });

  const indexLines: string[] = [];
  for (const m of memories) {
    const slug = m.type.toLowerCase().replace(/[^a-z0-9一-鿿]+/g, '-').slice(0, 20);
    const filename = `${slug}-${Date.now()}.md`;
    fs.writeFileSync(path.join(memoriesDir, filename), `---\nname: ${m.type}\ndescription: ${m.content.slice(0, 60)}\ntype: user\n---\n${m.content}\n`);
    indexLines.push(`- [${m.type}](${filename}) — ${m.content.slice(0, 50)}`);
  }

  const indexPath = path.join(memoriesDir, 'MEMORY.md');
  if (fs.existsSync(indexPath)) {
    fs.appendFileSync(indexPath, '\n' + indexLines.join('\n'));
  } else {
    fs.writeFileSync(indexPath, indexLines.join('\n') + '\n');
  }

  db.exec('DROP TABLE IF EXISTS memory_item');
}
```

需要在 `db.ts` 顶部添加 `import fs from 'fs';` 和 `import path from 'path';`。

在 `electron/main.ts` 的初始化代码中（`initDb(db)` 之后）添加调用：

```typescript
  migrateMemoryItems(db, aivaDir);
```

同时在 `electron/main.ts` 的 import 中添加 `migrateMemoryItems`。

- [ ] **Step 2: Verify build passes**

Run: `npm run build:electron 2>&1 | tail -5`
Expected: build succeeds

- [ ] **Step 3: Commit**

```bash
git add src/lib/db.ts electron/main.ts
git commit -m "feat: add migration from memory_item table to Markdown files"
```

---

### Task 10: Rewrite /memory page

**Files:**
- Modify: `src/app/memory/page.tsx`

- [ ] **Step 1: Rewrite the page component**

替换整个 `src/app/memory/page.tsx` 为双 tab UI：

```tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { getIpcRenderer } from '@/lib/electron-ipc';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Textarea } from '@/components/ui/Textarea';

interface CoreMemory {
  filename: string;
  content: string;
}

export default function MemoryPage() {
  const [tab, setTab] = useState<'core' | 'daily'>('core');
  const [coreMemories, setCoreMemories] = useState<CoreMemory[]>([]);
  const [dailyDates, setDailyDates] = useState<string[]>([]);
  const [expandedDaily, setExpandedDaily] = useState<string | null>(null);
  const [dailyContent, setDailyContent] = useState<Record<string, string>>({});
  const [editingFile, setEditingFile] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const ipcRenderer = typeof window !== 'undefined' ? getIpcRenderer() : null;

  const loadCoreMemories = useCallback(() => {
    ipcRenderer?.invoke('memory:list-core').then((data: CoreMemory[]) => {
      setCoreMemories(data);
    });
  }, [ipcRenderer]);

  const loadDailyDates = useCallback(() => {
    ipcRenderer?.invoke('memory:list-daily').then((data: string[]) => {
      setDailyDates(data);
    });
  }, [ipcRenderer]);

  useEffect(() => {
    loadCoreMemories();
    loadDailyDates();
  }, [loadCoreMemories, loadDailyDates]);

  const handleExpandDaily = useCallback((date: string) => {
    if (expandedDaily === date) {
      setExpandedDaily(null);
      return;
    }
    setExpandedDaily(date);
    if (!dailyContent[date]) {
      ipcRenderer?.invoke('memory:read-daily', { date }).then((content: string | null) => {
        if (content) {
          setDailyContent(prev => ({ ...prev, [date]: content }));
        }
      });
    }
  }, [ipcRenderer, expandedDaily, dailyContent]);

  const handleStartEdit = useCallback((memory: CoreMemory) => {
    setEditingFile(memory.filename);
    setEditContent(memory.content);
  }, []);

  const handleSaveEdit = useCallback(() => {
    if (!editingFile || !editContent.trim()) return;
    ipcRenderer?.invoke('memory:update-core', { filename: editingFile, content: editContent.trim() }).then(() => {
      setEditingFile(null);
      setEditContent('');
      loadCoreMemories();
    });
  }, [ipcRenderer, editingFile, editContent, loadCoreMemories]);

  const handleDelete = useCallback((filename: string) => {
    ipcRenderer?.invoke('memory:delete-core', { filename }).then(() => {
      loadCoreMemories();
    });
  }, [ipcRenderer, loadCoreMemories]);

  return (
    <div className="min-h-screen bg-bg-window flex flex-col">
      <PageHeader title="记忆管理" subtitle="Aiva 记住了什么"
        onBack={() => window.history.back()} />
      <div className="flex-1 overflow-auto px-page-x pb-6">
        {/* Tab switcher */}
        <div className="flex gap-2 mb-section-gap">
          <button
            className={`px-4 py-2 rounded-card-sm text-body-sm font-medium transition-colors ${tab === 'core' ? 'bg-brand text-white' : 'bg-bg-surface-2 text-text-muted hover:bg-bg-surface-3'}`}
            onClick={() => setTab('core')}>
            核心记忆
          </button>
          <button
            className={`px-4 py-2 rounded-card-sm text-body-sm font-medium transition-colors ${tab === 'daily' ? 'bg-brand text-white' : 'bg-bg-surface-2 text-text-muted hover:bg-bg-surface-3'}`}
            onClick={() => setTab('daily')}>
            每日记忆
          </button>
        </div>

        {/* Core memories tab */}
        {tab === 'core' && (
          <>
            {coreMemories.length === 0 && (
              <EmptyState title="暂无核心记忆" description="Claude 会在对话中自主记录重要信息到核心记忆" />
            )}
            {coreMemories.map(memory => (
              <div key={memory.filename} className="bg-bg-surface-1 border border-line-default rounded-card-sm p-card-p mb-2">
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-label-xs text-text-muted mb-1">{memory.filename}</div>
                    {editingFile === memory.filename ? (
                      <div className="flex gap-2">
                        <Textarea value={editContent} onChange={e => setEditContent(e.target.value)} />
                        <div className="flex flex-col gap-1">
                          <Button variant="primary" size="sm" onClick={handleSaveEdit}>保存</Button>
                          <Button variant="ghost" size="sm" onClick={() => setEditingFile(null)}>取消</Button>
                        </div>
                      </div>
                    ) : (
                      <div className="text-body-sm leading-relaxed whitespace-pre-wrap">{memory.content}</div>
                    )}
                  </div>
                  {editingFile !== memory.filename && (
                    <div className="flex gap-1 flex-shrink-0">
                      <Button variant="ghost" size="sm" onClick={() => handleStartEdit(memory)}>编辑</Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(memory.filename)} className="!text-danger">删除</Button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </>
        )}

        {/* Daily memories tab */}
        {tab === 'daily' && (
          <>
            {dailyDates.length === 0 && (
              <EmptyState title="暂无每日记忆" description="每次对话完成后，有价值的交流会被自动记录到每日记忆中" />
            )}
            {dailyDates.map(date => (
              <div key={date} className="bg-bg-surface-1 border border-line-default rounded-card-sm mb-2 overflow-hidden">
                <button
                  className="w-full text-left p-card-p flex items-center justify-between hover:bg-bg-surface-2 transition-colors"
                  onClick={() => handleExpandDaily(date)}>
                  <span className="text-card-title text-text-primary">{date}</span>
                  <span className="text-text-muted text-label">{expandedDaily === date ? '▲' : '▼'}</span>
                </button>
                {expandedDaily === date && dailyContent[date] && (
                  <div className="px-card-p pb-card-p border-t border-line-default">
                    <div className="text-body-sm leading-relaxed whitespace-pre-wrap mt-2">{dailyContent[date]}</div>
                  </div>
                )}
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify build passes**

Run: `npm run build 2>&1 | tail -10`
Expected: build succeeds

- [ ] **Step 3: Manual test — run electron dev**

Run: `npm run electron:dev`
Verify:
- /memory 页面加载正常，显示双 tab
- 核心记忆 tab 显示 `~/.aiva/memories/` 下的文件内容
- 每日记忆 tab 显示 `~/.aiva/daily/` 下的日期列表
- 点击日期可展开查看内容

- [ ] **Step 4: Commit**

```bash
git add src/app/memory/page.tsx
git commit -m "feat: rewrite /memory page with dual-tab UI"
```

---

### Task 11: Final integration test

- [ ] **Step 1: Run all tests**

Run: `npx jest --no-cache`
Expected: all tests pass

- [ ] **Step 2: Run full build**

Run: `npm run build && npm run build:electron`
Expected: both builds succeed

- [ ] **Step 3: Manual integration test**

Run: `npm run electron:dev`

Test scenarios:
1. 执行一次对话，确认执行完成后没有 memory 提炼报错
2. 检查 `~/.aiva/daily/` 目录下是否生成了当日文件
3. 检查 `~/.aiva/memories/` 目录是否被 SDK 使用（Claude 应能自主写入记忆）
4. 打开 /memory 页面，确认核心记忆和每日记忆 tab 都正常工作
5. 换一个工作目录（设置中修改），执行对话，确认 SDK 记忆不会丢失

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: complete memory system refactor — SDK global + daily markdown"
```

---

## Self-Review

**1. Spec coverage:**
- Section 1 (delete old): Tasks 5, 7, 8
- Section 2 (SDK global): Task 3
- Section 3 (daily writer): Tasks 1, 2
- Section 4 (daily injection): Task 4
- Section 5 (daily reader): Task 1
- Section 6 (/memory page): Task 10
- Section 7 (IPC changes): Task 6
- Section 8 (migration): Task 9

**2. Placeholder scan:** No TBD/TODO found.

**3. Type consistency:**
- `CoreMemory` interface defined in Task 10 matches IPC return type from Task 6
- `readDailyMemory(aivaDir, date)` signature consistent between Task 1 and Task 4/6
- `evaluateAndWriteDailyMemory` parameters match Task 2 and Task 6
- IPC channel names (`memory:list-core`, etc.) consistent across Task 5, Task 6, Task 10
