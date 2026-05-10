# Dynamic Persona Update Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow the AI to autonomously update its persona (name and persona.md) during conversations when the user explicitly requests personality/style changes, with real-time UI sync via file watcher.

**Architecture:** Inject update instructions into the persona context prompt so the AI knows it can write to persona files using its existing `write_file` tool. A file watcher in the Electron main process detects changes and broadcasts `persona:updated` IPC events to all windows. Chat and Persona pages listen for this event to refresh their UI.

**Tech Stack:** Node.js `fs.watch`, Electron IPC, existing persona-file module.

---

### Task 1: Add self-update instructions to `buildPersonaContext()`

**Files:**
- Modify: `src/lib/persona-file.ts` (lines 122-129, the `buildPersonaContext` function)
- Test: `src/__tests__/persona-file.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/persona-file.test.ts`:

```ts
import fs from 'fs';
import path from 'path';
import os from 'os';
import { buildPersonaContext, writeProfile, writePersonaMarkdown, ensurePersonaDir } from '@/lib/persona-file';

describe('buildPersonaContext', () => {
  const tmpDir = path.join(os.tmpdir(), `aiva-test-persona-${Date.now()}`);

  beforeAll(() => {
    ensurePersonaDir(tmpDir);
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns persona content with self-update instructions', () => {
    writeProfile(tmpDir, { name: 'TestBot', avatar: null });
    writePersonaMarkdown(tmpDir, '你是一个测试助手。');

    const result = buildPersonaContext(tmpDir);

    // Should contain the name
    expect(result).toContain('你的名称是TestBot。');
    // Should contain the persona markdown
    expect(result).toContain('你是一个测试助手。');
    // Should contain self-update instructions
    expect(result).toContain('自我更新权限');
    // Should contain the absolute file paths
    expect(result).toContain(path.join(tmpDir, 'profile.json'));
    expect(result).toContain(path.join(tmpDir, 'persona.md'));
  });

  it('includes persona vs memory boundary rule', () => {
    writeProfile(tmpDir, { name: 'Aiva', avatar: null });
    writePersonaMarkdown(tmpDir, '你好。');

    const result = buildPersonaContext(tmpDir);

    expect(result).toContain('属于记忆');
    expect(result).toContain('不要写入 persona');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/__tests__/persona-file.test.ts --verbose`
Expected: FAIL — `buildPersonaContext` does not yet include self-update instructions.

- [ ] **Step 3: Write minimal implementation**

Modify `src/lib/persona-file.ts` — replace the `buildPersonaContext` function (lines 122-129):

```ts
export function buildPersonaContext(aivaDir: string): string {
  const profile = readProfile(aivaDir);
  const markdown = readPersonaMarkdown(aivaDir);
  const parts: string[] = [];
  if (profile.name) parts.push(`你的名称是${profile.name}。`);
  if (markdown.trim()) parts.push(markdown.trim());

  const personaDir = getPersonaDir(aivaDir);
  parts.push(`## 自我更新权限

你可以通过写入文件来更新自己的名称和性格设定。

更新规则：
- 仅在用户直接描述希望你的行为方式时更新（如语气、风格、态度等）
- 用户的技术偏好、编码习惯、个人信息 → 这些属于记忆，不要写入 persona
- 更新后简短告知用户你做了什么修改

操作方式：
- 更新名称：将完整 JSON 写入 ${path.join(personaDir, 'profile.json')}，格式 {"name":"新名称","avatar":"原值"}，必须保留 avatar 字段不变
- 更新性格/语气/态度/风格：将完整的 markdown 内容写入 ${path.join(personaDir, 'persona.md')}`);

  return parts.join('\n\n');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/__tests__/persona-file.test.ts --verbose`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/persona-file.ts src/__tests__/persona-file.test.ts
git commit -m "feat: add self-update instructions to persona context prompt"
```

---

### Task 2: Add file watcher in Electron main process

**Files:**
- Modify: `electron/main.ts`

- [ ] **Step 1: Add file watcher setup function**

In `electron/main.ts`, add a module-level variable for the watcher and a setup function. Insert after the global state declarations (after line 39, `let currentAbortController`):

```ts
let personaWatcher: fs.FSWatcher | null = null;

function startPersonaWatcher(): void {
  const personaDir = getPersonaDir(aivaDir);
  ensurePersonaDir(aivaDir);

  personaWatcher = fs.watch(personaDir, (eventType, filename) => {
    if (!filename) return;
    if (filename !== 'profile.json' && filename !== 'persona.md') return;

    log.info(`Persona 文件变更: ${filename} (${eventType})`);

    try {
      const profile = readProfile(aivaDir);
      if (!profile.name) {
        log.warn('Persona watcher: profile.json 缺少 name 字段，跳过广播');
        return;
      }
    } catch (err) {
      log.error('Persona watcher: 解析 profile.json 失败:', err);
      return;
    }

    BrowserWindow.getAllWindows().forEach(win => {
      if (!win.isDestroyed()) {
        win.webContents.send('persona:updated');
      }
    });
  });

  personaWatcher.on('error', (err) => {
    log.error('Persona watcher 错误:', err);
  });

  log.info('Persona file watcher 已启动');
}
```

- [ ] **Step 2: Start watcher after persona migration**

In the `app.whenReady().then(...)` callback, after `migratePersona(aivaDir, db);` (line 945) and `initDb(db);` (line 947), add:

```ts
  startPersonaWatcher();
```

- [ ] **Step 3: Close watcher on app quit**

In the `app.on('before-quit', ...)` handler (line 1070), add `personaWatcher?.close();` after `shortcutManager?.stop();`:

```ts
app.on('before-quit', () => {
  personaWatcher?.close();
  shortcutManager?.stop();
  voiceBar?.destroy();
  db?.close();
  if (nextServer) {
    nextServer.kill();
    nextServer = null;
  }
});
```

- [ ] **Step 4: Commit**

```bash
git add electron/main.ts
git commit -m "feat: add persona file watcher with IPC broadcast"
```

---

### Task 3: Add `persona:updated` listener to Chat page

**Files:**
- Modify: `src/app/chat/page.tsx`
- Modify: `src/types/index.ts` (add IPC type)

- [ ] **Step 1: Add IPC type for `persona:updated`**

In `src/types/index.ts`, inside the `IpcMessages` interface, after the `persona:avatar:remove` line (line 189), add:

```ts
  // main -> renderer (persona auto-updated)
  'persona:updated': void;
```

- [ ] **Step 2: Add listener in Chat page useEffect**

In `src/app/chat/page.tsx`, inside the existing `useEffect` (starting at line 18), add the `persona:updated` listener. Insert after the `completeHandler` definition and before the `ipcRenderer.invoke('persona:load')` call (around line 77):

```ts
    const personaUpdatedHandler = () => {
      ipcRenderer.invoke('persona:load').then((data: { name: string; avatar: string | null; content: string }) => {
        setPersonaName(data.name);
        setPersonaAvatar(data.avatar);
      });
    };
    ipcRenderer.on('persona:updated', personaUpdatedHandler);
```

Add cleanup in the return cleanup function (after line 89, `ipcRenderer.removeListener('chat:execution-complete', completeHandler);`):

```ts
      ipcRenderer.removeListener('persona:updated', personaUpdatedHandler);
```

- [ ] **Step 3: Commit**

```bash
git add src/app/chat/page.tsx src/types/index.ts
git commit -m "feat: chat page refreshes persona on AI-initiated update"
```

---

### Task 4: Add `persona:updated` listener to Persona page

**Files:**
- Modify: `src/app/persona/page.tsx`

- [ ] **Step 1: Add listener with dirty-state guard**

In `src/app/persona/page.tsx`, add a `dirty` state and a `persona:updated` listener. The dirty state tracks whether the user has unsaved edits — if so, we don't overwrite.

Add a `loaded` ref to distinguish initial load from user edits, and add the `persona:updated` listener.

Add imports at the top — change line 3 to:

```ts
import { useState, useEffect, useCallback, useRef } from 'react';
```

Add a loaded ref after line 24 (`const [cropImage, setCropImage] = useState<string | null>(null);`):

```ts
  const loadedRef = useRef(false);
```

Modify the existing load useEffect (lines 27-33) to set the ref:

```ts
  useEffect(() => {
    ipcRenderer?.invoke('persona:load').then((data: PersonaData) => {
      setName(data.name);
      setAvatar(data.avatar);
      setContent(data.content);
      loadedRef.current = true;
    });
  }, [ipcRenderer]);
```

Add a new useEffect for `persona:updated` (after the load useEffect):

```ts
  useEffect(() => {
    if (!ipcRenderer) return;
    const handler = () => {
      if (!loadedRef.current) return;
      ipcRenderer.invoke('persona:load').then((data: PersonaData) => {
        setName(data.name);
        setAvatar(data.avatar);
        setContent(data.content);
      });
    };
    ipcRenderer.on('persona:updated', handler);
    return () => { ipcRenderer.removeListener('persona:updated', handler); };
  }, [ipcRenderer]);
```

The dirty-state guard works via a simple heuristic: if the user has manually edited the name or content fields, the component will re-render with their values, and the `persona:updated` handler will overwrite them. To prevent this, track whether the user has made edits since the last save. Add a `dirty` state:

```ts
  const [dirty, setDirty] = useState(false);
```

Modify the name and content inputs to set dirty. Update the `SingleLineInput` (around line 96):

```tsx
  <SingleLineInput value={name} onChange={e => { setName(e.target.value); setDirty(true); }} placeholder="分身名称" />
```

Update the `Textarea` (around line 107):

```tsx
  <Textarea value={content} onChange={e => { setContent(e.target.value); setDirty(true); }}
```

Guard the `persona:updated` handler with the dirty check:

```ts
    const handler = () => {
      if (dirty || !loadedRef.current) return;
```

Clear dirty on save. In `handleSave` callback, after `setSaved(true);` add:

```ts
      setDirty(false);
```

- [ ] **Step 2: Commit**

```bash
git add src/app/persona/page.tsx
git commit -m "feat: persona page refreshes on AI update, preserves unsaved edits"
```

---

### Task 5: Manual integration test

- [ ] **Step 1: Start dev server**

Run: `npm run electron:dev`

- [ ] **Step 2: Test prompt instruction injection**

1. Open the app, go to `/chat`
2. Type a message and observe the prompt being sent (check console logs for `executePrompt` output)
3. Verify the full prompt contains the `## 自我更新权限` section with absolute file paths

- [ ] **Step 3: Test AI-initiated persona update**

1. In the chat, send: "请把你的名字改成小助手"
2. Verify the AI writes to `~/.aiva/persona/profile.json`
3. Verify the chat header name updates to "小助手"
4. Check `~/.aiva/persona/profile.json` to confirm the change persisted

- [ ] **Step 4: Test persona.md update**

1. In the chat, send: "说话轻松点，不要太正式"
2. Verify the AI writes to `~/.aiva/persona/persona.md`
3. Go to `/persona` page and verify the markdown content updated
4. Send another message and verify the AI's tone changed

- [ ] **Step 5: Test Persona page dirty guard**

1. Go to `/persona` page
2. Start editing the name (don't save)
3. In another way, trigger a persona update (e.g., via chat)
4. Verify the unsaved edit is NOT overwritten

- [ ] **Step 6: Commit final state if any adjustments were needed**

```bash
git add -A
git commit -m "fix: adjustments from manual testing"
```
