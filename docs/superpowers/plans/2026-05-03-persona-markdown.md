# Persona Markdown 化实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将分身设定从预定义字段简化为自由编辑的 markdown 文件 (`~/.shrew/persona.md`)。

**Architecture:** 保留数据库 persona 表（仅 `id` + `name`），新增文件 `~/.shrew/persona.md` 存储全部人格设定内容。启动时自动从旧字段迁移。UI 简化为名称 + markdown 编辑器。`buildShrewContext()` 改为读文件内容直接注入。

**Tech Stack:** Electron IPC, Next.js 页面, better-sqlite3, Node.js fs

---

## File Structure

| 文件 | 操作 | 职责 |
|------|------|------|
| `src/lib/persona-file.ts` | **新建** | persona.md 的读写、解析、默认模板生成、迁移逻辑 |
| `src/lib/shrew-context.ts` | **修改** | `buildShrewContext()` 签名改为接收 `content: string` |
| `src/lib/db.ts` | **修改** | 删除旧列迁移，简化 `getPersona()`/`updatePersona()` |
| `src/types/index.ts` | **修改** | `Persona` 接口精简，IPC 类型更新 |
| `src/app/persona/page.tsx` | **重写** | 页面简化为名称 + 编辑器 |
| `electron/main.ts` | **修改** | IPC handler 改为文件读写，`executePrompt()` 适配新逻辑 |

---

### Task 1: 创建 persona-file 模块

**Files:**
- Create: `src/lib/persona-file.ts`

- [ ] **Step 1: 创建 persona-file.ts**

```typescript
import fs from 'fs';
import path from 'path';
import type Database from 'better-sqlite3';

const DEFAULT_CONTENT = `# Shrew

你是一个专业、高效的编程助手。`;

const PERSONA_FILENAME = 'persona.md';

export function getPersonaFilePath(shrewDir: string): string {
  return path.join(shrewDir, PERSONA_FILENAME);
}

export function readPersonaFile(shrewDir: string): { name: string; content: string } {
  const filePath = getPersonaFilePath(shrewDir);
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, DEFAULT_CONTENT, 'utf-8');
    return parsePersonaContent(DEFAULT_CONTENT);
  }
  const raw = fs.readFileSync(filePath, 'utf-8');
  return parsePersonaContent(raw);
}

export function writePersonaFile(shrewDir: string, name: string, content: string): void {
  const fullContent = `# ${name}\n\n${content}`;
  fs.writeFileSync(getPersonaFilePath(shrewDir), fullContent, 'utf-8');
}

export function parsePersonaContent(raw: string): { name: string; content: string } {
  const lines = raw.split('\n');
  const firstLine = lines[0] || '';
  const nameMatch = firstLine.match(/^#\s+(.+)$/);
  const name = nameMatch ? nameMatch[1].trim() : 'Shrew';
  const content = lines.slice(1).join('\n').trim();
  return { name, content };
}

export function migratePersonaFromDb(shrewDir: string, db: Database.Database): void {
  const filePath = getPersonaFilePath(shrewDir);
  if (fs.existsSync(filePath)) return;

  const row = db.prepare(`SELECT * FROM persona WHERE id = 1`).get() as Record<string, unknown> | undefined;
  if (!row) {
    fs.writeFileSync(filePath, DEFAULT_CONTENT, 'utf-8');
    return;
  }

  const parts: string[] = [];
  const name = String(row.name || 'Shrew');

  if (row.bio) parts.push(String(row.bio));

  const styleParts: string[] = [];
  if (row.personality) styleParts.push(`- 性格：${row.personality}`);
  if (row.tone) styleParts.push(`- 语气：${row.tone}`);
  if (row.detail_level) styleParts.push(`- 详细程度：${row.detail_level}`);
  if (row.clarify_pref) styleParts.push(`- 澄清偏好：${row.clarify_pref}`);
  if (row.work_style) styleParts.push(`- 工作方式：${row.work_style}`);
  if (styleParts.length > 0) {
    parts.push(`## 性格与风格`);
    parts.push(...styleParts);
  }

  if (row.system_prompt) parts.push(String(row.system_prompt));

  const content = parts.join('\n');
  const fullContent = content
    ? `# ${name}\n\n${content}`
    : DEFAULT_CONTENT;

  fs.writeFileSync(filePath, fullContent, 'utf-8');
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/persona-file.ts
git commit -m "feat: add persona-file module for reading/writing persona.md"
```

---

### Task 2: 简化 shrew-context.ts

**Files:**
- Modify: `src/lib/shrew-context.ts`

- [ ] **Step 1: 重写 shrew-context.ts**

将 `buildShrewContext` 的签名从 `(persona: Persona, memoryLines: string[])` 改为 `(personaContent: string, memoryLines: string[])`。移除 `Persona` 类型导入。

```typescript
import Database from 'better-sqlite3';

export function buildShrewContext(personaContent: string, memoryLines: string[]): string {
  const parts: string[] = [];

  if (personaContent.trim()) {
    parts.push(personaContent.trim());
  }

  if (memoryLines.length > 0) {
    parts.push(`\n## 关于用户的记忆`);
    for (const line of memoryLines) {
      parts.push(`- ${line}`);
    }
  }

  return parts.join('\n');
}

export function getActiveMemories(db: Database.Database): string[] {
  const rows = db.prepare(
    `SELECT content FROM memory_item WHERE status = '生效中' ORDER BY pinned DESC, updated_at DESC`
  ).all() as { content: string }[];
  return rows.map(r => r.content);
}

export function getPinnedMemories(db: Database.Database): string[] {
  const rows = db.prepare(
    `SELECT content FROM memory_item WHERE status = '生效中' AND pinned = 1 ORDER BY updated_at DESC`
  ).all() as { content: string }[];
  return rows.map(r => r.content);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/shrew-context.ts
git commit -m "refactor: simplify buildShrewContext to accept raw content string"
```

---

### Task 3: 简化 types 和 db 层

**Files:**
- Modify: `src/types/index.ts:97-109` (Persona 接口)
- Modify: `src/types/index.ts:193` (persona:save IPC 类型)
- Modify: `src/lib/db.ts` (persona 表迁移 + 函数精简)

- [ ] **Step 1: 更新 Persona 接口和 IPC 类型**

在 `src/types/index.ts` 中：

替换 Persona 接口（第 97-109 行）为：

```typescript
export interface Persona {
  id: number;
  name: string;
  avatar: string | null;
  updated_at: string;
}
```

替换 `persona:save` IPC 类型（第 193 行）为：

```typescript
'persona:save': { name: string; content: string };
```

- [ ] **Step 2: 更新 db.ts — 添加列删除迁移并简化函数**

在 `src/lib/db.ts` 的 `initDb` 函数末尾（`if (!persona)` 块之后）添加迁移代码：

```typescript
  // 迁移：删除 persona 表的旧列
  const personaColumns = db.pragma('table_info(persona)') as { name: string }[];
  const deprecatedColumns = ['bio', 'personality', 'tone', 'detail_level', 'clarify_pref', 'work_style', 'system_prompt'];
  for (const col of deprecatedColumns) {
    if (personaColumns.some(c => c.name === col)) {
      // SQLite 不支持 DROP COLUMN 3.35.0 之前，但 better-sqlite3 捆绑的是 3.39+
      db.exec(`ALTER TABLE persona DROP COLUMN ${col}`);
    }
  }
```

简化 `getPersona` 和 `updatePersona`（第 268-293 行）：

```typescript
export function getPersona(db: Database.Database): Persona {
  const row = db.prepare(`SELECT * FROM persona WHERE id = 1`).get() as Persona | undefined;
  if (!row) {
    db.prepare(`INSERT INTO persona (id) VALUES (1)`).run();
    return db.prepare(`SELECT * FROM persona WHERE id = 1`).get() as Persona;
  }
  return row;
}

export function updatePersonaName(db: Database.Database, name: string): void {
  db.prepare(`UPDATE persona SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1`).run(name);
}
```

移除 import 中对旧的 `updatePersona` 的引用（后续在 main.ts 中更新）。

- [ ] **Step 3: Commit**

```bash
git add src/types/index.ts src/lib/db.ts
git commit -m "refactor: simplify Persona type and drop deprecated columns"
```

---

### Task 4: 适配 electron/main.ts

**Files:**
- Modify: `electron/main.ts`

- [ ] **Step 1: 更新 import**

在 `electron/main.ts` 第 10 行的 import 中：
- 将 `updatePersona` 替换为 `updatePersonaName`
- 添加 `import { readPersonaFile, writePersonaFile, migratePersonaFromDb } from '../src/lib/persona-file';`

- [ ] **Step 2: 添加迁移调用**

在 `app.whenReady()` 中，`initDb(db)` 之后（约第 896 行），添加：

```typescript
  // 迁移 persona 旧字段到 persona.md
  migratePersonaFromDb(shrewDir, db);
```

- [ ] **Step 3: 更新 executePrompt 中的 persona 读取**

将第 325-328 行：

```typescript
  const persona = getPersona(db);
  const memoryLines = getActiveMemories(db);
  const shrewContext = buildShrewContext(persona, memoryLines);
```

替换为：

```typescript
  const { content: personaContent } = readPersonaFile(shrewDir);
  const memoryLines = getActiveMemories(db);
  const shrewContext = buildShrewContext(personaContent, memoryLines);
```

- [ ] **Step 4: 更新 persona IPC handler**

将第 641-648 行的 persona IPC 替换为：

```typescript
  ipcMain.handle('persona:load', () => {
    const { name, content } = readPersonaFile(shrewDir);
    return { name, content };
  });

  ipcMain.handle('persona:save', (_, { name, content }: { name: string; content: string }) => {
    writePersonaFile(shrewDir, name, content);
    updatePersonaName(db, name);
    return { name, content };
  });
```

- [ ] **Step 5: Commit**

```bash
git add electron/main.ts
git commit -m "refactor: adapt main.ts to file-based persona system"
```

---

### Task 5: 重写 persona 页面

**Files:**
- Rewrite: `src/app/persona/page.tsx`

- [ ] **Step 1: 重写页面组件**

```tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { getIpcRenderer } from '@/lib/electron-ipc';
import { PageHeader } from '@/components/ui/PageHeader';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { SingleLineInput } from '@/components/ui/SingleLineInput';
import { Textarea } from '@/components/ui/Textarea';
import { Button } from '@/components/ui/Button';
import { BottomActionBar } from '@/components/ui/BottomActionBar';

interface PersonaData {
  name: string;
  content: string;
}

export default function PersonaPage() {
  const [name, setName] = useState('Shrew');
  const [content, setContent] = useState('');
  const [saved, setSaved] = useState(false);
  const ipcRenderer = typeof window !== 'undefined' ? getIpcRenderer() : null;

  useEffect(() => {
    ipcRenderer?.invoke('persona:load').then((data: PersonaData) => {
      setName(data.name);
      setContent(data.content);
    });
  }, [ipcRenderer]);

  const handleSave = useCallback(() => {
    if (!ipcRenderer) return;
    ipcRenderer.invoke('persona:save', { name, content }).then(() => {
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    });
  }, [name, content, ipcRenderer]);

  return (
    <div className="min-h-screen bg-bg-window flex flex-col">
      <PageHeader title="分身设定" subtitle="配置你的 AI 分身身份和行为风格"
        onBack={() => window.history.back()} />
      <div className="flex-1 overflow-auto px-page-x pb-6">
        <div className="mb-section-gap">
          <SectionHeader title="基础身份" />
          <div className="flex items-center gap-4 mb-block-gap">
            <div className="w-12 h-12 rounded-full bg-brand-soft flex items-center justify-center text-section-title text-brand font-semibold flex-shrink-0">
              {name?.[0] || 'S'}
            </div>
            <div className="flex-1">
              <SingleLineInput value={name} onChange={e => setName(e.target.value)} placeholder="分身名称" />
            </div>
          </div>
        </div>
        <div className="flex-1">
          <SectionHeader title="人格设定" />
          <Textarea value={content} onChange={e => setContent(e.target.value)}
            placeholder="用 Markdown 编写分身的人格设定..."
            className="!font-mono min-h-[400px]" />
        </div>
      </div>
      <BottomActionBar>
        <Button variant="primary" onClick={handleSave}>{saved ? '已保存' : '保存更改'}</Button>
      </BottomActionBar>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/persona/page.tsx
git commit -m "refactor: simplify persona page to name + markdown editor"
```

---

### Task 6: 验证和清理

- [ ] **Step 1: 编译检查**

```bash
npm run build
npm run build:electron
```

预期：无类型错误，编译通过。

- [ ] **Step 2: 手动验证**

1. 启动 `npm run electron:dev`
2. 检查 `~/.shrew/persona.md` 是否自动生成（旧字段内容应已迁移）
3. 打开分身设定页面，确认名称和编辑器正确显示
4. 编辑内容并保存，确认文件已更新
5. 发送一条消息，检查 Agent 收到的 prompt 中包含 persona 内容

- [ ] **Step 3: 最终提交**

如果有任何修复：

```bash
git add -A
git commit -m "fix: persona markdown migration fixes"
```
