# Persona Name, Avatar & Markdown Separation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split persona into structured name/avatar (profile.json) + freeform personality markdown (persona.md), and wire both to the chat header.

**Architecture:** New `~/.shrew/persona/` directory holds `profile.json` (name + avatar filename), `persona.md` (personality text), and `avatar.png` (uploaded image). persona-file.ts manages all three. Persona page has name input + avatar upload at top, markdown editor below. ChatHeader reads profile via IPC and renders dynamically. executePrompt prepends name to context.

**Tech Stack:** Electron IPC, React state, fs/path (Node.js), native file dialog

---

## File Structure

| File | Responsibility |
|------|---------------|
| `src/lib/persona-file.ts` | All persona file I/O: read/write profile.json, persona.md, avatar file, migration |
| `src/app/persona/page.tsx` | Persona settings UI: avatar button, name input, markdown editor |
| `src/components/chat/ChatHeader.tsx` | Dynamic name/avatar rendering from props |
| `src/app/chat/page.tsx` | Loads persona profile on mount, passes to ChatHeader |
| `electron/main.ts` | IPC handlers for persona load/save/avatar/upload, executePrompt context |
| `src/types/index.ts` | IPC type definitions |
| `src/lib/shrew-context.ts` | No changes needed — already takes a string |

---

### Task 1: Rewrite persona-file.ts with directory structure

**Files:**
- Modify: `src/lib/persona-file.ts`

- [ ] **Step 1: Rewrite persona-file.ts**

Replace the entire file. The module now manages a `~/.shrew/persona/` directory with three files: `profile.json`, `persona.md`, and optionally `avatar.<ext>`.

```ts
import fs from 'fs';
import path from 'path';
import type Database from 'better-sqlite3';

const PERSONA_DIR = 'persona';
const PROFILE_FILE = 'profile.json';
const MARKDOWN_FILE = 'persona.md';
const AVATAR_FILENAME = 'avatar';

const DEFAULT_PROFILE = { name: 'Shrew', avatar: null as string | null };
const DEFAULT_MARKDOWN = '你是一个专业、高效的编程助手。';

// --- Path helpers ---

export function getPersonaDir(shrewDir: string): string {
  return path.join(shrewDir, PERSONA_DIR);
}

function profilePath(shrewDir: string): string {
  return path.join(getPersonaDir(shrewDir), PROFILE_FILE);
}

function markdownPath(shrewDir: string): string {
  return path.join(getPersonaDir(shrewDir), MARKDOWN_FILE);
}

export function getAvatarPath(shrewDir: string): string | null {
  const dir = getPersonaDir(shrewDir);
  const profile = readProfile(shrewDir);
  if (!profile.avatar) return null;
  return path.join(dir, profile.avatar);
}

// --- Ensure directory exists ---

function ensurePersonaDir(shrewDir: string): void {
  const dir = getPersonaDir(shrewDir);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// --- Profile (profile.json) ---

interface PersonaProfile {
  name: string;
  avatar: string | null;
}

export function readProfile(shrewDir: string): PersonaProfile {
  const filePath = profilePath(shrewDir);
  if (!fs.existsSync(filePath)) {
    return { ...DEFAULT_PROFILE };
  }
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw) as PersonaProfile;
  } catch {
    return { ...DEFAULT_PROFILE };
  }
}

export function writeProfile(shrewDir: string, profile: Partial<PersonaProfile>): void {
  ensurePersonaDir(shrewDir);
  const current = readProfile(shrewDir);
  const merged = { ...current, ...profile };
  fs.writeFileSync(profilePath(shrewDir), JSON.stringify(merged, null, 2), 'utf-8');
}

// --- Markdown (persona.md) ---

export function readPersonaMarkdown(shrewDir: string): string {
  const filePath = markdownPath(shrewDir);
  if (!fs.existsSync(filePath)) {
    return DEFAULT_MARKDOWN;
  }
  return fs.readFileSync(filePath, 'utf-8');
}

export function writePersonaMarkdown(shrewDir: string, content: string): void {
  ensurePersonaDir(shrewDir);
  fs.writeFileSync(markdownPath(shrewDir), content, 'utf-8');
}

// --- Avatar file ---

export function saveAvatarFile(shrewDir: string, sourcePath: string): string {
  ensurePersonaDir(shrewDir);
  const ext = path.extname(sourcePath).toLowerCase();
  const filename = `${AVATAR_FILENAME}${ext}`;
  const dest = path.join(getPersonaDir(shrewDir), filename);

  // Remove old avatar files
  const dir = getPersonaDir(shrewDir);
  for (const file of fs.readdirSync(dir)) {
    if (file.startsWith(AVATAR_FILENAME + '.')) {
      fs.unlinkSync(path.join(dir, file));
    }
  }

  fs.copyFileSync(sourcePath, dest);
  return filename;
}

export function removeAvatarFile(shrewDir: string): void {
  const dir = getPersonaDir(shrewDir);
  if (!fs.existsSync(dir)) return;
  for (const file of fs.readdirSync(dir)) {
    if (file.startsWith(AVATAR_FILENAME + '.')) {
      fs.unlinkSync(path.join(dir, file));
    }
  }
}

// --- Full context for Claude (used by executePrompt) ---

export function buildPersonaContext(shrewDir: string): string {
  const profile = readProfile(shrewDir);
  const markdown = readPersonaMarkdown(shrewDir);
  const parts: string[] = [];
  if (profile.name) parts.push(`你的名称是${profile.name}。`);
  if (markdown.trim()) parts.push(markdown.trim());
  return parts.join('\n\n');
}

// --- Migration from old single-file and DB ---

export function migratePersona(shrewDir: string, db: Database.Database): void {
  const personaDir = getPersonaDir(shrewDir);
  if (fs.existsSync(personaDir)) return;

  fs.mkdirSync(personaDir, { recursive: true });

  // Migrate from old persona.md at ~/.shrew/persona.md
  const oldFile = path.join(shrewDir, 'persona.md');
  if (fs.existsSync(oldFile)) {
    const raw = fs.readFileSync(oldFile, 'utf-8');
    // Extract name from "你的名称是X。" line
    const nameMatch = raw.match(/你的名称是(.+?)。/);
    const name = nameMatch ? nameMatch[1] : 'Shrew';
    // Remove the name line, keep the rest
    const content = raw.replace(/你的名称是.+?\n?/, '').trim();
    writeProfile(shrewDir, { name, avatar: null });
    writePersonaMarkdown(shrewDir, content || DEFAULT_MARKDOWN);
    fs.unlinkSync(oldFile);
    return;
  }

  // Migrate from DB
  const row = db.prepare(`SELECT * FROM persona WHERE id = 1`).get() as Record<string, unknown> | undefined;
  if (!row) {
    writeProfile(shrewDir, DEFAULT_PROFILE);
    writePersonaMarkdown(shrewDir, DEFAULT_MARKDOWN);
    return;
  }

  const name = String(row.name || 'Shrew');
  const parts: string[] = [];
  if (row.bio) parts.push(String(row.bio));
  const styleParts: string[] = [];
  if (row.personality) styleParts.push(`- 性格：${row.personality}`);
  if (row.tone) styleParts.push(`- 语气：${row.tone}`);
  if (row.detail_level) styleParts.push(`- 详细程度：${row.detail_level}`);
  if (row.clarify_pref) styleParts.push(`- 澄清偏好：${row.clarify_pref}`);
  if (row.work_style) styleParts.push(`- 工作方式：${row.work_style}`);
  if (styleParts.length > 0) { parts.push(`## 性格与风格`); parts.push(...styleParts); }
  if (row.system_prompt) parts.push(String(row.system_prompt));

  writeProfile(shrewDir, { name, avatar: null });
  writePersonaMarkdown(shrewDir, parts.join('\n') || DEFAULT_MARKDOWN);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/persona-file.ts
git commit -m "refactor: persona-file.ts to directory-based storage (profile.json + persona.md)"
```

---

### Task 2: Update Electron main.ts IPC handlers and executePrompt

**Files:**
- Modify: `electron/main.ts:10-11` (import)
- Modify: `electron/main.ts:327-329` (executePrompt context)
- Modify: `electron/main.ts:641-649` (IPC handlers)

- [ ] **Step 1: Update imports**

Change line 11 from:
```ts
import { readPersonaFile, writePersonaFile, migratePersonaFromDb } from '../src/lib/persona-file';
```
to:
```ts
import { readProfile, writeProfile, readPersonaMarkdown, writePersonaMarkdown, saveAvatarFile, removeAvatarFile, getAvatarPath, buildPersonaContext, migratePersona, getPersonaDir } from '../src/lib/persona-file';
```

- [ ] **Step 2: Update executePrompt context building**

Change lines 327-329 from:
```ts
  const personaContent = readPersonaFile(shrewDir);
  const memoryLines = getActiveMemories(db);
  const shrewContext = buildShrewContext(personaContent, memoryLines);
```
to:
```ts
  const personaContent = buildPersonaContext(shrewDir);
  const memoryLines = getActiveMemories(db);
  const shrewContext = buildShrewContext(personaContent, memoryLines);
```

- [ ] **Step 3: Update migration call**

Find the `migratePersonaFromDb` call in `main.ts` and replace with `migratePersona`. Search for `migratePersonaFromDb` — it's called during app initialization. Replace:
```ts
migratePersonaFromDb(shrewDir, db);
```
with:
```ts
migratePersona(shrewDir, db);
```

- [ ] **Step 4: Replace persona IPC handlers**

Replace lines 641-649:
```ts
  // persona
  ipcMain.handle('persona:load', () => {
    return { content: readPersonaFile(shrewDir) };
  });

  ipcMain.handle('persona:save', (_, { content }: { content: string }) => {
    writePersonaFile(shrewDir, content);
    return { content };
  });
```
with:
```ts
  // persona
  ipcMain.handle('persona:load', () => {
    const profile = readProfile(shrewDir);
    const content = readPersonaMarkdown(shrewDir);
    const avatarPath = getAvatarPath(shrewDir);
    return {
      name: profile.name,
      avatar: avatarPath && fs.existsSync(avatarPath) ? avatarPath : null,
      content,
    };
  });

  ipcMain.handle('persona:save', (_, { name, content }: { name: string; content: string }) => {
    writeProfile(shrewDir, { name });
    writePersonaMarkdown(shrewDir, content);
    return { name, content };
  });

  ipcMain.handle('persona:avatar:upload', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      title: '选择头像',
      filters: [{ name: '图片', extensions: ['jpg', 'jpeg', 'png', 'webp'] }],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    const filename = saveAvatarFile(shrewDir, result.filePaths[0]);
    writeProfile(shrewDir, { avatar: filename });
    const avatarPath = path.join(getPersonaDir(shrewDir), filename);
    return avatarPath;
  });

  ipcMain.handle('persona:avatar:remove', () => {
    removeAvatarFile(shrewDir);
    writeProfile(shrewDir, { avatar: null });
  });
```

- [ ] **Step 5: Commit**

```bash
git add electron/main.ts
git commit -m "refactor: update IPC handlers and executePrompt for directory-based persona"
```

---

### Task 3: Update IPC type definitions

**Files:**
- Modify: `src/types/index.ts:184-186`

- [ ] **Step 1: Update persona IPC types**

Change lines 184-186 from:
```ts
  // persona: invoke (request-response)
  'persona:load': void;
  'persona:save': { content: string };
```
to:
```ts
  // persona: invoke (request-response)
  'persona:load': void;
  'persona:save': { name: string; content: string };
  'persona:avatar:upload': void;
  'persona:avatar:remove': void;
```

- [ ] **Step 2: Commit**

```bash
git add src/types/index.ts
git commit -m "refactor: update persona IPC type definitions"
```

---

### Task 4: Rewrite persona page UI

**Files:**
- Modify: `src/app/persona/page.tsx`

- [ ] **Step 1: Rewrite persona page**

Replace the entire file with avatar upload + name input + markdown editor:

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
  avatar: string | null;
  content: string;
}

export default function PersonaPage() {
  const [name, setName] = useState('Shrew');
  const [avatar, setAvatar] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [saved, setSaved] = useState(false);
  const ipcRenderer = typeof window !== 'undefined' ? getIpcRenderer() : null;

  useEffect(() => {
    ipcRenderer?.invoke('persona:load').then((data: PersonaData) => {
      setName(data.name);
      setAvatar(data.avatar);
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

  const handleAvatarClick = useCallback(async () => {
    if (!ipcRenderer) return;
    const result = await ipcRenderer.invoke('persona:avatar:upload');
    if (result) setAvatar(result);
  }, [ipcRenderer]);

  const handleAvatarRemove = useCallback(() => {
    if (!ipcRenderer) return;
    ipcRenderer.invoke('persona:avatar:remove');
    setAvatar(null);
  }, [ipcRenderer]);

  const initial = name?.[0] || 'S';

  return (
    <div className="min-h-screen bg-bg-window flex flex-col">
      <PageHeader title="分身设定" subtitle="配置你的 AI 分身身份和行为风格"
        onBack={() => window.history.back()} />
      <div className="flex-1 overflow-auto px-page-x pb-6">
        <div className="mb-section-gap">
          <SectionHeader title="基础身份" />
          <div className="flex items-center gap-4 mb-block-gap">
            {avatar ? (
              <div
                className="w-12 h-12 rounded-full overflow-hidden flex-shrink-0 cursor-pointer relative group"
                onClick={handleAvatarClick}
                onContextMenu={(e) => { e.preventDefault(); handleAvatarRemove(); }}
              >
                <img src={`file://${avatar}`} alt={name} className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                  <span className="text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity">更换</span>
                </div>
              </div>
            ) : (
              <div
                className="w-12 h-12 rounded-full bg-brand-soft flex items-center justify-center text-section-title text-brand font-semibold flex-shrink-0 cursor-pointer"
                onClick={handleAvatarClick}
              >
                {initial}
              </div>
            )}
            <div className="flex-1">
              <SingleLineInput value={name} onChange={e => setName(e.target.value)} placeholder="分身名称" />
            </div>
          </div>
          {avatar && (
            <button onClick={handleAvatarRemove} className="text-label-xs text-text-muted hover:text-danger transition-colors">
              移除头像
            </button>
          )}
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
git commit -m "feat: persona page with name input, avatar upload, and markdown editor"
```

---

### Task 5: Wire ChatHeader to persona profile

**Files:**
- Modify: `src/components/chat/ChatHeader.tsx`
- Modify: `src/app/chat/page.tsx`

- [ ] **Step 1: Update ChatHeader to accept name/avatar props**

In `src/components/chat/ChatHeader.tsx`, update the props interface and rendering:

Change the interface from:
```ts
interface ChatHeaderProps {
  appState: AppState;
  sdkSubState: SdkSubState;
  currentToolName?: string;
}
```
to:
```ts
interface ChatHeaderProps {
  appState: AppState;
  sdkSubState: SdkSubState;
  currentToolName?: string;
  personaName?: string;
  personaAvatar?: string | null;
}
```

Change the function signature from:
```ts
export function ChatHeader({ appState, sdkSubState, currentToolName }: ChatHeaderProps) {
```
to:
```ts
export function ChatHeader({ appState, sdkSubState, currentToolName, personaName, personaAvatar }: ChatHeaderProps) {
```

Add after `const isActive` line:
```ts
  const displayName = personaName || 'Shrew';
  const initial = displayName[0] || 'S';
```

Replace the hardcoded avatar div (the `<div className="w-9 h-9 rounded-full ...">S</div>`) with:
```tsx
      {personaAvatar ? (
        <div className="w-9 h-9 rounded-full overflow-hidden flex-shrink-0" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <img src={`file://${personaAvatar}`} alt={displayName} className="w-full h-full object-cover" />
        </div>
      ) : (
        <div className="w-9 h-9 rounded-full bg-brand-soft flex items-center justify-center text-label text-brand font-semibold flex-shrink-0" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          {initial}
        </div>
      )}
```

Replace the hardcoded name `<div className="text-card-title text-text-primary">Shrew</div>` with:
```tsx
        <div className="text-card-title text-text-primary">{displayName}</div>
```

- [ ] **Step 2: Update chat/page.tsx to load and pass persona profile**

In `src/app/chat/page.tsx`, add persona state and loading.

After the existing `useState` declarations, add:
```ts
  const [personaName, setPersonaName] = useState<string>('');
  const [personaAvatar, setPersonaAvatar] = useState<string | null>(null);
```

Inside the `useEffect`, before `ipcRenderer.send('chat:ready');`, add:
```ts
    ipcRenderer.invoke('persona:load').then((data: { name: string; avatar: string | null; content: string }) => {
      setPersonaName(data.name);
      setPersonaAvatar(data.avatar);
    });
```

Update the ChatHeader JSX from:
```tsx
      <ChatHeader
        appState={appState}
        sdkSubState={sdkSubState}
        currentToolName={currentToolName}
      />
```
to:
```tsx
      <ChatHeader
        appState={appState}
        sdkSubState={sdkSubState}
        currentToolName={currentToolName}
        personaName={personaName}
        personaAvatar={personaAvatar}
      />
```

- [ ] **Step 3: Commit**

```bash
git add src/components/chat/ChatHeader.tsx src/app/chat/page.tsx
git commit -m "feat: wire ChatHeader to dynamic persona name and avatar"
```

---

### Task 6: Build and verify

- [ ] **Step 1: Run type check**

```bash
npx tsc --noEmit --project tsconfig.json
```
Expected: no errors

- [ ] **Step 2: Run Next.js build**

```bash
npm run build
```
Expected: build succeeds

- [ ] **Step 3: Run Electron build**

```bash
npm run electron:build
```
Expected: DMG and ZIP produced in `release/`

- [ ] **Step 4: Commit any fixes if needed, then final commit**

```bash
git add -A
git commit -m "feat: persona name/avatar separation with chat header integration"
```
