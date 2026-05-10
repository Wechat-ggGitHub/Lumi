# 技能管理重构实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将技能管理从 voice-input/auto-memory 开关重构为 Claude Code SKILL.md 风格的技能系统，并将所有数据统一到 `~/.aiva/` 目录。

**Architecture:** 新增 `skill-manager.ts` 模块处理技能文件系统操作。通过 Claude Agent SDK 的 `systemPrompt.append` 将已启用 skill 注入执行上下文。`userDataDir` 从 Electron `app.getPath('userData')` 改为 `~/.aiva/`。首次启动时自动从旧目录迁移数据。

**Tech Stack:** Electron, Next.js 15, better-sqlite3, Claude Agent SDK, Node.js fs/path

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `src/lib/skill-manager.ts` | Create | 技能文件系统操作：扫描、导入、删除、构建 catalog |
| `src/lib/claude-client.ts` | Modify | 注入 skill catalog 到 SDK query() |
| `src/lib/config-files.ts` | Modify | 删除 skill 函数，MCP 路径改为 `~/.aiva/mcp/` |
| `src/types/index.ts` | Modify | 删除 `SkillConfig`，更新 IPC 类型 |
| `src/app/skills/page.tsx` | Rewrite | 新的技能管理 UI |
| `electron/main.ts` | Modify | `userDataDir` 改为 `~/.aiva/`，替换 skills IPC，添加迁移逻辑 |
| `src/lib/aiva-context.ts` | Modify | 删除 `writeAivaClaudeMd()`，删除文件写入逻辑 |
| `src/lib/keychain.ts` | Modify | `KEYCHAIN_DIR` 改为 `~/.aiva/secure/` |
| `src/lib/logger.ts` | Modify | 无需修改（路径由 main.ts 传入） |
| `electron/recorder.ts` | Modify | `tmpDir` 改为 `~/.aiva/tmp/` |
| `src/lib/memory-extractor.ts` | Modify | 删除 `writeAivaClaudeMd` 调用 |
| `src/__tests__/skill-manager.test.ts` | Create | skill-manager 单元测试 |

---

### Task 1: 创建 `skill-manager.ts` 核心模块

**Files:**
- Create: `src/lib/skill-manager.ts`
- Test: `src/__tests__/skill-manager.test.ts`

- [ ] **Step 1: 写测试 — 扫描技能目录**

```typescript
// src/__tests__/skill-manager.test.ts
import fs from 'fs';
import path from 'path';
import os from 'os';
import { scanSkills, importSkill, deleteSkill, buildSkillCatalog, parseSkillFrontmatter } from '../lib/skill-manager';

describe('skill-manager', () => {
  let skillsDir: string;
  let settingsPath: string;

  beforeEach(() => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aiva-test-'));
    skillsDir = path.join(tmp, 'skills');
    fs.mkdirSync(skillsDir);
    settingsPath = path.join(tmp, 'settings.json');
    fs.writeFileSync(settingsPath, JSON.stringify({ disabledSkills: [] }));
  });

  afterEach(() => {
    const tmp = path.dirname(skillsDir);
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  describe('parseSkillFrontmatter', () => {
    it('解析 SKILL.md frontmatter', () => {
      const content = '---\nname: tdd\ndescription: 测试驱动开发\n---\n# 指令正文';
      const result = parseSkillFrontmatter(content);
      expect(result.name).toBe('tdd');
      expect(result.description).toBe('测试驱动开发');
    });
  });

  describe('scanSkills', () => {
    it('返回空数组当目录为空', () => {
      const skills = scanSkills(skillsDir, []);
      expect(skills).toEqual([]);
    });

    it('扫描到包含 SKILL.md 的目录', () => {
      const skillDir = path.join(skillsDir, 'tdd');
      fs.mkdirSync(skillDir);
      fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '---\nname: tdd\ndescription: 测试驱动开发\n---\n# 指令');
      const skills = scanSkills(skillsDir, []);
      expect(skills).toHaveLength(1);
      expect(skills[0].name).toBe('tdd');
      expect(skills[0].enabled).toBe(true);
    });

    it('过滤 disabledSkills 中的技能', () => {
      const skillDir = path.join(skillsDir, 'tdd');
      fs.mkdirSync(skillDir);
      fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '---\nname: tdd\ndescription: 测试\n---\n# 指令');
      const skills = scanSkills(skillsDir, ['tdd']);
      expect(skills[0].enabled).toBe(false);
    });

    it('跳过没有 SKILL.md 的目录', () => {
      fs.mkdirSync(path.join(skillsDir, 'not-a-skill'));
      const skills = scanSkills(skillsDir, []);
      expect(skills).toEqual([]);
    });
  });

  describe('buildSkillCatalog', () => {
    it('为已启用 skill 构建 catalog 文本', () => {
      const skillDir = path.join(skillsDir, 'tdd');
      fs.mkdirSync(skillDir);
      fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '---\nname: tdd\ndescription: 测试驱动\n---\n# 先写测试');

      const catalog = buildSkillCatalog(skillsDir, []);
      expect(catalog).toContain('可用技能');
      expect(catalog).toContain('先写测试');
    });

    it('不包含已禁用 skill 的正文', () => {
      const skillDir = path.join(skillsDir, 'tdd');
      fs.mkdirSync(skillDir);
      fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '---\nname: tdd\ndescription: 测试驱动\n---\n# 先写测试');

      const catalog = buildSkillCatalog(skillsDir, ['tdd']);
      expect(catalog).not.toContain('先写测试');
    });

    it('无技能时返回空字符串', () => {
      const catalog = buildSkillCatalog(skillsDir, []);
      expect(catalog).toBe('');
    });
  });

  describe('importSkill', () => {
    it('将源文件夹复制到 skills 目录', () => {
      const srcTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aiva-src-'));
      fs.writeFileSync(path.join(srcTmp, 'SKILL.md'), '---\nname: my-skill\ndescription: desc\n---\n# 指令');
      const result = importSkill(srcTmp, skillsDir);
      expect(result).toBe(true);
      expect(fs.existsSync(path.join(skillsDir, 'my-skill', 'SKILL.md'))).toBe(true);
      fs.rmSync(srcTmp, { recursive: true, force: true });
    });

    it('目录名取自 SKILL.md 的 name 字段', () => {
      const srcTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aiva-src-'));
      fs.writeFileSync(path.join(srcTmp, 'SKILL.md'), '---\nname: my-skill\ndescription: desc\n---\n# 指令');
      importSkill(srcTmp, skillsDir);
      expect(fs.existsSync(path.join(skillsDir, 'my-skill'))).toBe(true);
      fs.rmSync(srcTmp, { recursive: true, force: true });
    });

    it('导入失败当源目录没有 SKILL.md', () => {
      const srcTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aiva-src-'));
      const result = importSkill(srcTmp, skillsDir);
      expect(result).toBe(false);
      fs.rmSync(srcTmp, { recursive: true, force: true });
    });

    it('导入失败当目标已存在同名 skill', () => {
      const srcTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aiva-src-'));
      fs.writeFileSync(path.join(srcTmp, 'SKILL.md'), '---\nname: my-skill\ndescription: desc\n---\n# 指令');
      importSkill(srcTmp, skillsDir);
      const result = importSkill(srcTmp, skillsDir);
      expect(result).toBe(false);
      fs.rmSync(srcTmp, { recursive: true, force: true });
    });
  });

  describe('deleteSkill', () => {
    it('删除技能目录', () => {
      const skillDir = path.join(skillsDir, 'tdd');
      fs.mkdirSync(skillDir);
      fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '---\nname: tdd\ndescription: 测试\n---\n');
      deleteSkill('tdd', skillsDir);
      expect(fs.existsSync(skillDir)).toBe(false);
    });

    it('无异常当技能不存在', () => {
      expect(() => deleteSkill('nonexist', skillsDir)).not.toThrow();
    });
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx jest src/__tests__/skill-manager.test.ts --no-cache 2>&1 | head -30`
Expected: FAIL — `Cannot find module '../lib/skill-manager'`

- [ ] **Step 3: 实现 `skill-manager.ts`**

```typescript
// src/lib/skill-manager.ts
import fs from 'fs';
import path from 'path';

export interface SkillInfo {
  name: string;
  description: string;
  enabled: boolean;
  skillDir: string;
}

export function parseSkillFrontmatter(content: string): { name: string; description: string } {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!match) return { name: '', description: '' };

  const frontmatter = match[1];
  const nameMatch = frontmatter.match(/^name:\s*(.+)$/m);
  const descMatch = frontmatter.match(/^description:\s*(.+)$/m);

  return {
    name: nameMatch?.[1]?.trim() || '',
    description: descMatch?.[1]?.trim() || '',
  };
}

export function scanSkills(skillsDir: string, disabledSkills: string[]): SkillInfo[] {
  if (!fs.existsSync(skillsDir)) return [];

  const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
  const skills: SkillInfo[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const skillMdPath = path.join(skillsDir, entry.name, 'SKILL.md');
    if (!fs.existsSync(skillMdPath)) continue;

    const content = fs.readFileSync(skillMdPath, 'utf-8');
    const { name, description } = parseSkillFrontmatter(content);
    if (!name) continue;

    skills.push({
      name,
      description,
      enabled: !disabledSkills.includes(name),
      skillDir: path.join(skillsDir, entry.name),
    });
  }

  return skills;
}

export function buildSkillCatalog(skillsDir: string, disabledSkills: string[]): string {
  const skills = scanSkills(skillsDir, disabledSkills);
  const enabled = skills.filter(s => s.enabled);
  if (enabled.length === 0) return '';

  const parts: string[] = [
    '# 可用技能\n',
    '以下是你可以使用的技能。当用户任务匹配某个技能时，按照该技能的指令执行。\n',
  ];

  for (const skill of enabled) {
    const skillMdPath = path.join(skill.skillDir, 'SKILL.md');
    const content = fs.readFileSync(skillMdPath, 'utf-8');
    parts.push('---');
    parts.push(content);
    parts.push('---\n');
  }

  return parts.join('\n');
}

export function importSkill(sourceDir: string, skillsDir: string): boolean {
  const skillMdPath = path.join(sourceDir, 'SKILL.md');
  if (!fs.existsSync(skillMdPath)) return false;

  const content = fs.readFileSync(skillMdPath, 'utf-8');
  const { name } = parseSkillFrontmatter(content);
  if (!name) return false;

  const targetDir = path.join(skillsDir, name);
  if (fs.existsSync(targetDir)) return false;

  fs.cpSync(sourceDir, targetDir, { recursive: true });
  return true;
}

export function deleteSkill(name: string, skillsDir: string): void {
  const targetDir = path.join(skillsDir, name);
  if (fs.existsSync(targetDir)) {
    fs.rmSync(targetDir, { recursive: true, force: true });
  }
}

export function readSkillContent(name: string, skillsDir: string): string | null {
  const skillMdPath = path.join(skillsDir, name, 'SKILL.md');
  if (!fs.existsSync(skillMdPath)) return null;
  return fs.readFileSync(skillMdPath, 'utf-8');
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx jest src/__tests__/skill-manager.test.ts --no-cache`
Expected: PASS — all tests green

- [ ] **Step 5: 提交**

```bash
git add src/lib/skill-manager.ts src/__tests__/skill-manager.test.ts
git commit -m "feat: add skill-manager module with scan, import, delete, catalog"
```

---

### Task 2: 修改数据目录为 `~/.aiva/`

**Files:**
- Modify: `electron/main.ts:24-26`
- Modify: `src/lib/keychain.ts:9`

- [ ] **Step 1: 修改 `electron/main.ts` — userDataDir 改为 `~/.aiva/`**

将第 24-26 行：

```typescript
const userDataDir = app.getPath('userData');
const settingsPath = path.join(userDataDir, 'settings.json');
const dbPath = path.join(userDataDir, 'aiva.db');
```

改为：

```typescript
const aivaDir = path.join(app.getPath('home'), '.aiva');
const settingsPath = path.join(aivaDir, 'settings.json');
const dbPath = path.join(aivaDir, 'aiva.db');
```

然后在文件中把所有 `userDataDir` 替换为 `aivaDir`（包括日志初始化、IPC handler 等）。具体需要替换的位置：
- 第 24 行 `const userDataDir = ...` → `const aivaDir = ...`
- 第 608 行 `writeAivaClaudeMd(userDataDir, context)` → 删除这行（Task 4 处理）
- 第 614 行 `return loadSkills(userDataDir)` → 删除（Task 3 处理）
- 第 619 行 `return toggleSkill(userDataDir, ...)` → 删除（Task 3 处理）
- 第 623 行 `return configureSkill(userDataDir, ...)` → 删除（Task 3 处理）
- 第 627 行 `return loadMcpServers(userDataDir)` → `return loadMcpServers(aivaDir)`
- 第 631-638 行 `addMcpServer(userDataDir, ...)` → `...McpServer(aivaDir, ...)`
- 第 731 行 `initLogger(path.join(userDataDir, 'logs'))` → `initLogger(path.join(aivaDir, 'logs'))`
- 第 735 行 `log.info('userData:', userDataDir)` → `log.info('aivaDir:', aivaDir)`

确保在 `app.whenReady()` 开头创建目录：

```typescript
if (!fs.existsSync(aivaDir)) {
  fs.mkdirSync(aivaDir, { recursive: true });
}
```

- [ ] **Step 2: 修改 `src/lib/keychain.ts` — KEYCHAIN_DIR 改为 `~/.aiva/secure/`**

将第 9 行：

```typescript
const KEYCHAIN_DIR = path.join(app.getPath('userData'), 'secure');
```

改为：

```typescript
const KEYCHAIN_DIR = path.join(app.getPath('home'), '.aiva', 'secure');
```

- [ ] **Step 3: 修改 `electron/recorder.ts` — tmpDir 改为 `~/.aiva/tmp/`**

将第 21 行：

```typescript
this.tmpDir = path.join(app.getPath('userData'), 'tmp');
```

改为：

```typescript
this.tmpDir = path.join(app.getPath('home'), '.aiva', 'tmp');
```

- [ ] **Step 4: 修改 `src/lib/config-files.ts` — MCP 路径改为 `~/.aiva/mcp/`**

将 MCP 相关函数的文件路径从 `config/mcp-servers.json` 改为 `mcp/servers.json`：

```typescript
// 删除旧的 CONFIG_DIR_NAME 和 getConfigDir/ensureConfigDir
// 替换为：

function getMcpDir(aivaDir: string): string {
  return path.join(aivaDir, 'mcp');
}

function ensureMcpDir(aivaDir: string): void {
  const dir = getMcpDir(aivaDir);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}
```

然后修改 `loadMcpServers` 和 `saveMcpServers` 中的文件路径：

```typescript
const filePath = path.join(getMcpDir(aivaDir), 'servers.json');
```

同时删除所有 skill 相关函数（`loadSkills`, `saveSkills`, `toggleSkill`, `configureSkill`, `DEFAULT_SKILLS`）和 `SkillConfig` 导入。

- [ ] **Step 5: 验证编译通过**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: 可能有未使用的 import 报错（Task 3 会清理），但不能有类型错误

- [ ] **Step 6: 提交**

```bash
git add electron/main.ts src/lib/keychain.ts electron/recorder.ts src/lib/config-files.ts
git commit -m "refactor: change data directory from Application Support to ~/.aiva/"
```

---

### Task 3: 清理旧 skill 代码，更新类型

**Files:**
- Modify: `src/types/index.ts:110-117, 203-206`
- Modify: `electron/main.ts:614-624`
- Modify: `electron/main.ts:14` (import)

- [ ] **Step 1: 从 `src/types/index.ts` 删除 `SkillConfig` 和旧 skills IPC 类型**

删除第 110-117 行的 `SkillConfig` 接口。

将 `IpcMessages` 中的 skills IPC（第 203-206 行）：

```typescript
// skills: invoke
'skills:list': void;
'skills:toggle': { id: string; enabled: boolean };
'skills:configure': { id: string; params: Record<string, string> };
```

替换为新的：

```typescript
// skills: invoke
'skills:list': void;
'skills:import': void;
'skills:toggle': { name: string; enabled: boolean };
'skills:delete': { name: string };
'skills:read': { name: string };
```

- [ ] **Step 2: 从 `electron/main.ts` 删除旧 skills IPC handler 和旧 import**

删除第 14 行的 `loadSkills, toggleSkill, configureSkill` import。

删除第 614-624 行的旧 skills IPC handler：

```typescript
// skills (旧 — 删除)
ipcMain.handle('skills:list', () => { ... });
ipcMain.handle('skills:toggle', (_, { id, enabled }) => { ... });
ipcMain.handle('skills:configure', (_, { id, params }) => { ... });
```

替换为新的 skills IPC handler：

```typescript
// skills
ipcMain.handle('skills:list', () => {
  const settings = loadSettings();
  return scanSkills(path.join(aivaDir, 'skills'), settings.disabledSkills || []);
});

ipcMain.handle('skills:import', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory'],
    title: '选择技能文件夹（包含 SKILL.md）',
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  const imported = importSkill(result.filePaths[0], path.join(aivaDir, 'skills'));
  if (!imported) return { error: '导入失败：目录中没有有效的 SKILL.md，或已存在同名技能' };
  const settings = loadSettings();
  return scanSkills(path.join(aivaDir, 'skills'), settings.disabledSkills || []);
});

ipcMain.handle('skills:toggle', (_, { name, enabled }) => {
  const settings = loadSettings();
  let disabled = settings.disabledSkills || [];
  if (enabled) {
    disabled = disabled.filter((s: string) => s !== name);
  } else {
    if (!disabled.includes(name)) disabled.push(name);
  }
  saveSettings({ ...settings, disabledSkills: disabled });
  return scanSkills(path.join(aivaDir, 'skills'), disabled);
});

ipcMain.handle('skills:delete', (_, { name }) => {
  deleteSkill(name, path.join(aivaDir, 'skills'));
  const settings = loadSettings();
  const disabled = (settings.disabledSkills || []).filter((s: string) => s !== name);
  saveSettings({ ...settings, disabledSkills: disabled });
  return scanSkills(path.join(aivaDir, 'skills'), disabled);
});

ipcMain.handle('skills:read', (_, { name }) => {
  return readSkillContent(name, path.join(aivaDir, 'skills'));
});
```

添加新 import 到 `electron/main.ts` 顶部：

```typescript
import { scanSkills, importSkill, deleteSkill, buildSkillCatalog, readSkillContent } from '../src/lib/skill-manager';
```

- [ ] **Step 3: 验证编译通过**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: 无错误（旧 skills 代码已完全清理）

- [ ] **Step 4: 提交**

```bash
git add src/types/index.ts electron/main.ts
git commit -m "refactor: replace old skill system with new skill-manager IPC"
```

---

### Task 4: 将 skill catalog 注入 SDK 执行

**Files:**
- Modify: `src/lib/claude-client.ts:50-57`
- Modify: `electron/main.ts:314-318`（executePrompt 中的上下文构建）
- Modify: `src/lib/aiva-context.ts`
- Modify: `src/lib/memory-extractor.ts:106-112`

- [ ] **Step 1: 修改 `src/lib/claude-client.ts` — 添加 `skillCatalog` 参数**

在 `executeClaude` 函数签名中添加 `skillCatalog` 参数：

```typescript
export async function executeClaude(
  prompt: string,
  cwd: string,
  apiKey: string,
  providerKey: string,
  modelPreset: string,
  callbacks: ClaudeCallbacks,
  abortSignal?: AbortSignal,
  claudeExecutablePath?: string,
  resumeSessionId?: string,
  skillCatalog?: string,
): Promise<ClaudeExecutionResult> {
```

修改 options 构建（第 50-57 行），加入 `systemPrompt`：

```typescript
const options: Record<string, unknown> = {
  cwd,
  permissionMode: 'bypassPermissions' as const,
  allowDangerouslySkipPermissions: true,
  abortController,
  env: buildSdkEnv(providerKey, apiKey, modelPreset),
  ...(resumeSessionId ? { resume: resumeSessionId } : {}),
};

if (skillCatalog) {
  options.systemPrompt = {
    type: 'preset',
    preset: 'claude_code',
    append: skillCatalog,
  };
}
```

- [ ] **Step 2: 修改 `electron/main.ts` — 在 executePrompt 中构建 skill catalog 并传递**

在 `executePrompt` 函数中（约第 314 行），将上下文构建改为同时包含 persona + memory + skills：

```typescript
// 构建 persona + memory 上下文
const persona = getPersona(db);
const memoryLines = getActiveMemories(db);
const aivaContext = buildAivaContext(persona, memoryLines);

// 构建 skill catalog
const settings = loadSettings();
const skillCatalog = buildSkillCatalog(
  path.join(aivaDir, 'skills'),
  settings.disabledSkills || []
);

// 合并：persona+memory 作为 prompt 前缀，skill catalog 通过 SDK systemPrompt 注入
const fullPrompt = aivaContext + '\n\n' + prompt;
```

然后在 `executeClaude` 调用（约第 321 行）添加 `skillCatalog` 参数：

```typescript
const result = await executeClaude(
  fullPrompt,
  cwd,
  apiKey,
  providerKey,
  modelPreset,
  { /* callbacks */ },
  currentAbortController.signal,
  claudeExecutablePath,
  segment.sdk_session_id ?? undefined,
  skillCatalog,
);
```

- [ ] **Step 3: 修改 `src/lib/aiva-context.ts` — 删除 `writeAivaClaudeMd` 和文件写入逻辑**

删除 `writeAivaClaudeMd` 函数（第 67-71 行）及其辅助函数 `getConfigDir`、`ensureConfigDir`、`CONFIG_DIR_NAME`。只保留 `buildAivaContext`、`getActiveMemories`、`getPinnedMemories`。

```typescript
// src/lib/aiva-context.ts — 精简后
import type { Persona } from '@/types';
import Database from 'better-sqlite3';

export function buildAivaContext(persona: Persona, memoryLines: string[]): string {
  // ...保持原有逻辑不变
}

export function getActiveMemories(db: Database.Database): string[] {
  // ...保持原有逻辑不变
}

export function getPinnedMemories(db: Database.Database): string[] {
  // ...保持原有逻辑不变
}
```

- [ ] **Step 4: 修改 `src/lib/memory-extractor.ts` — 删除 `writeAivaClaudeMd` 调用**

删除 `import { ..., writeAivaClaudeMd } from './aiva-context'` 中的 `writeAivaClaudeMd`。

删除第 106-112 行的 `writeAivaClaudeMd` 调用：

```typescript
// 删除这段
const persona = getPersona(db);
const allMemories = getActiveMemories(db);
const context = buildAivaContext(persona, allMemories);
const userDataDir = (db.prepare('PRAGMA database_list').get() as any)?.file?.replace('/aiva.db', '') || '';
if (userDataDir) {
  writeAivaClaudeMd(userDataDir, context);
}
```

- [ ] **Step 5: 删除 `electron/main.ts` 中 `persona:save` handler 里的 `writeAivaClaudeMd` 调用**

将 `persona:save` handler（约第 604-610 行）改为：

```typescript
ipcMain.handle('persona:save', (_, updates) => {
  const persona = updatePersona(db, updates);
  return persona;
});
```

- [ ] **Step 6: 清理 import**

在 `electron/main.ts` 中更新 import 行：
- 删除 `writeAivaClaudeMd` import
- 确认 `buildAivaContext`, `getActiveMemories` 仍被 import

- [ ] **Step 7: 验证编译通过**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: 无错误

- [ ] **Step 8: 提交**

```bash
git add src/lib/claude-client.ts electron/main.ts src/lib/aiva-context.ts src/lib/memory-extractor.ts
git commit -m "feat: inject skill catalog into Claude SDK via systemPrompt.append"
```

---

### Task 5: 重写技能管理 UI

**Files:**
- Rewrite: `src/app/skills/page.tsx`

- [ ] **Step 1: 重写 `/skills` 页面**

```tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { getIpcRenderer } from '@/lib/electron-ipc';

interface SkillInfo {
  name: string;
  description: string;
  enabled: boolean;
  skillDir: string;
}

export default function SkillsPage() {
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [detailSkill, setDetailSkill] = useState<{ name: string; content: string } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ name: string; x: number; y: number } | null>(null);
  const ipcRenderer = typeof window !== 'undefined' ? getIpcRenderer() : null;

  const loadSkills = useCallback(() => {
    ipcRenderer?.invoke('skills:list').then((data: SkillInfo[]) => {
      setSkills(data);
    });
  }, [ipcRenderer]);

  useEffect(() => {
    loadSkills();
  }, [loadSkills]);

  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, []);

  const handleImport = async () => {
    setImportError(null);
    const result = await ipcRenderer?.invoke('skills:import');
    if (result?.error) {
      setImportError(result.error);
    } else if (result) {
      setSkills(result);
    }
  };

  const handleToggle = async (name: string, enabled: boolean) => {
    const updated = await ipcRenderer?.invoke('skills:toggle', { name, enabled });
    if (updated) setSkills(updated);
  };

  const handleDelete = async (name: string) => {
    if (!confirm(`确定删除技能「${name}」？`)) return;
    const updated = await ipcRenderer?.invoke('skills:delete', { name });
    if (updated) setSkills(updated);
    setDetailSkill(null);
  };

  const handleViewDetail = async (name: string) => {
    const content = await ipcRenderer?.invoke('skills:read', { name });
    if (content) {
      setDetailSkill({ name, content });
    }
  };

  const handleContextMenu = (e: React.MouseEvent, name: string) => {
    e.preventDefault();
    setContextMenu({ name, x: e.clientX, y: e.clientY });
  };

  const styles = {
    container: {
      fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
      fontSize: 14, color: '#e0e0e0',
      background: '#1a1a1e', minHeight: '100vh',
      padding: 24, maxWidth: 600, margin: '0 auto',
    },
    header: {
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      marginBottom: 24,
    },
    title: { fontSize: 18, fontWeight: 600, margin: 0 },
    backBtn: {
      padding: '6px 16px', borderRadius: 8,
      background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
      color: '#888', fontSize: 13, cursor: 'pointer',
    },
    importArea: {
      border: '2px dashed rgba(255,255,255,0.1)',
      borderRadius: 12, padding: '24px 16px',
      textAlign: 'center' as const, marginBottom: 24,
      cursor: 'pointer', color: '#666',
      transition: 'border-color 0.2s',
    },
    sectionTitle: {
      fontSize: 13, color: '#888', marginBottom: 12,
      textTransform: 'uppercase' as const, letterSpacing: '0.5px',
    },
    card: {
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(255,255,255,0.06)',
      borderRadius: 10, padding: '14px 16px', marginBottom: 10,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      cursor: 'pointer',
    },
    cardDisabled: {
      opacity: 0.5,
    },
    toggle: (on: boolean) => ({
      width: 44, height: 24, borderRadius: 12,
      border: 'none', background: on ? '#AF52DE' : 'rgba(255,255,255,0.1)',
      cursor: 'pointer', position: 'relative' as const,
      transition: 'background 0.2s', flexShrink: 0,
    }),
    toggleKnob: (on: boolean) => ({
      width: 18, height: 18, borderRadius: '50%',
      background: '#fff', position: 'absolute' as const,
      top: 3, left: on ? 23 : 3, transition: 'left 0.2s',
    }),
    emptyState: { color: '#666', textAlign: 'center' as const, padding: 40 },
    overlay: {
      position: 'fixed' as const, top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.7)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', zIndex: 100,
    },
    modal: {
      background: '#2a2a2e', borderRadius: 12, padding: 24,
      maxWidth: 560, width: '90%', maxHeight: '80vh',
      display: 'flex', flexDirection: 'column' as const,
    },
    pre: {
      background: '#1a1a1e', borderRadius: 8, padding: 16,
      overflow: 'auto', flex: 1, fontSize: 12, lineHeight: 1.6,
      whiteSpace: 'pre-wrap' as const, wordBreak: 'break-word' as const,
    },
    contextMenu: {
      position: 'fixed' as const, background: '#2a2a2e',
      border: '1px solid rgba(255,255,255,0.1)',
      borderRadius: 8, padding: '4px 0', zIndex: 200,
      minWidth: 160,
    },
    contextItem: {
      padding: '8px 16px', cursor: 'pointer', fontSize: 13,
      color: '#e0e0e0', display: 'block', width: '100%',
      border: 'none', background: 'none', textAlign: 'left' as const,
    },
    error: { color: '#ff6b6b', fontSize: 12, marginTop: 8 },
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>技能管理</h1>
        <button onClick={() => window.history.back()} style={styles.backBtn}>返回</button>
      </div>

      <div style={styles.importArea} onClick={handleImport}>
        点击选择包含 SKILL.md 的文件夹来导入技能
      </div>

      {importError && <div style={styles.error}>{importError}</div>}

      <div style={styles.sectionTitle}>已安装 ({skills.length})</div>

      {skills.length === 0 && (
        <div style={styles.emptyState}>
          暂无技能。导入一个包含 SKILL.md 的文件夹来添加技能。
        </div>
      )}

      {skills.map(skill => (
        <div
          key={skill.name}
          style={{ ...styles.card, ...(!skill.enabled ? styles.cardDisabled : {}) }}
          onClick={() => handleToggle(skill.name, !skill.enabled)}
          onContextMenu={(e) => handleContextMenu(e, skill.name)}
        >
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 2 }}>{skill.name}</div>
            <div style={{ fontSize: 12, color: '#666' }}>{skill.description}</div>
          </div>
          <button style={styles.toggle(skill.enabled)} onClick={(e) => { e.stopPropagation(); }}>
            <div style={styles.toggleKnob(skill.enabled)} />
          </button>
        </div>
      ))}

      {contextMenu && (
        <div style={{ ...styles.contextMenu, top: contextMenu.y, left: contextMenu.x }}>
          <button style={styles.contextItem} onClick={() => { handleViewDetail(contextMenu.name); setContextMenu(null); }}>
            查看详情
          </button>
          <button style={{ ...styles.contextItem, color: '#ff6b6b' }} onClick={() => { handleDelete(contextMenu.name); setContextMenu(null); }}>
            删除
          </button>
        </div>
      )}

      {detailSkill && (
        <div style={styles.overlay} onClick={() => setDetailSkill(null)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
              <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>{detailSkill.name}</h2>
              <button
                style={{ ...styles.backBtn, fontSize: 12 }}
                onClick={() => setDetailSkill(null)}
              >关闭</button>
            </div>
            <pre style={styles.pre}>{detailSkill.content}</pre>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 验证 Next.js 构建**

Run: `npm run build 2>&1 | tail -20`
Expected: 构建成功，无报错

- [ ] **Step 3: 提交**

```bash
git add src/app/skills/page.tsx
git commit -m "feat: rewrite skills UI with import, toggle, detail view, context menu"
```

---

### Task 6: 添加 `AppSettings.disabledSkills` 字段

**Files:**
- Modify: `src/types/index.ts:65-74`

- [ ] **Step 1: 更新 `AppSettings` 类型**

在 `src/types/index.ts` 的 `AppSettings` 接口中添加 `disabledSkills`：

```typescript
export interface AppSettings {
  shortcut: string;
  voiceModel: string;
  claudePermissionMode: string;
  defaultCwd: string;
  vadTimeout: number;
  theme: string;
  provider?: ProviderKey;
  modelPreset?: ModelPreset;
  disabledSkills?: string[];
}
```

- [ ] **Step 2: 更新 `electron/main.ts` 中 `loadSettings` 的默认值**

在默认 settings 对象中添加 `disabledSkills`:

```typescript
return {
  shortcut: 'right_cmd',
  claudePermissionMode: 'bypassPermissions',
  defaultCwd: '~/Documents',
  vadTimeout: 2,
  theme: 'system',
  provider: 'glm-cn',
  modelPreset: 'opus',
  disabledSkills: [],
};
```

- [ ] **Step 3: 提交**

```bash
git add src/types/index.ts electron/main.ts
git commit -m "feat: add disabledSkills field to AppSettings"
```

---

### Task 7: 添加首次启动迁移逻辑

**Files:**
- Modify: `electron/main.ts` (app.whenReady 内)

- [ ] **Step 1: 在 `app.whenReady()` 中添加迁移函数**

在 `app.whenReady().then(async () => {` 之后、`initLogger` 之前添加迁移逻辑：

```typescript
app.whenReady().then(async () => {
  // 迁移旧数据到 ~/.aiva/
  const oldDir = app.getPath('userData');
  const homeDir = app.getPath('home');
  if (!fs.existsSync(aivaDir) && fs.existsSync(oldDir)) {
    log.info('检测到旧数据目录，开始迁移:', oldDir, '→', aivaDir);
    fs.mkdirSync(aivaDir, { recursive: true });

    // 迁移数据库
    const oldDb = path.join(oldDir, 'aiva.db');
    if (fs.existsSync(oldDb)) {
      fs.copyFileSync(oldDb, dbPath);
      // 同时复制 WAL/SHM 文件
      for (const ext of ['-wal', '-shm']) {
        const src = oldDb + ext;
        if (fs.existsSync(src)) fs.copyFileSync(src, dbPath + ext);
      }
    }

    // 迁移 settings
    const oldSettings = path.join(oldDir, 'settings.json');
    if (fs.existsSync(oldSettings)) {
      const raw = JSON.parse(fs.readFileSync(oldSettings, 'utf-8'));
      raw.disabledSkills = raw.disabledSkills || [];
      fs.writeFileSync(settingsPath, JSON.stringify(raw, null, 2));
    }

    // 迁移 MCP 配置
    const oldMcp = path.join(oldDir, 'config', 'mcp-servers.json');
    if (fs.existsSync(oldMcp)) {
      fs.mkdirSync(path.join(aivaDir, 'mcp'), { recursive: true });
      fs.copyFileSync(oldMcp, path.join(aivaDir, 'mcp', 'servers.json'));
    }

    // 迁移加密凭据
    const oldSecure = path.join(oldDir, 'secure');
    if (fs.existsSync(oldSecure)) {
      fs.cpSync(oldSecure, path.join(aivaDir, 'secure'), { recursive: true });
    }

    // 迁移日志
    const oldLogs = path.join(oldDir, 'logs');
    if (fs.existsSync(oldLogs)) {
      fs.cpSync(oldLogs, path.join(aivaDir, 'logs'), { recursive: true });
    }

    // 不迁移 config/skills.json 和 config/claude.md
    log.info('迁移完成');
  }

  // 确保 ~/.aiva/ 和子目录存在
  fs.mkdirSync(aivaDir, { recursive: true });
  fs.mkdirSync(path.join(aivaDir, 'skills'), { recursive: true });
  fs.mkdirSync(path.join(aivaDir, 'mcp'), { recursive: true });

  initLogger(path.join(aivaDir, 'logs'));
  // ...
```

注意：`aivaDir`、`settingsPath`、`dbPath` 在文件顶部已经定义（Task 2 中改过），迁移逻辑在创建目录后执行。需要确保迁移逻辑在 `initLogger` 之前，因为 logger 依赖目录存在。

另外 `initLogger` 需要放在迁移之后——因为日志目录可能需要从旧位置迁移过来。但 `log.info` 在迁移中也需要用。所以调整策略：先创建日志目录，初始化 logger，再执行其余迁移。

```typescript
  // 确保基础目录存在
  fs.mkdirSync(aivaDir, { recursive: true });
  fs.mkdirSync(path.join(aivaDir, 'logs'), { recursive: true });
  fs.mkdirSync(path.join(aivaDir, 'skills'), { recursive: true });
  fs.mkdirSync(path.join(aivaDir, 'mcp'), { recursive: true });

  initLogger(path.join(aivaDir, 'logs'));
  log.info('=== Aiva 应用启动 ===');
  log.info('日志文件:', log.logPath);
  log.info('版本:', app.getVersion(), '模式:', isDev ? '开发' : '生产');
  log.info('aivaDir:', aivaDir);

  // 迁移旧数据
  const oldDir = app.getPath('userData');
  if (fs.existsSync(oldDir)) {
    const markerFile = path.join(aivaDir, '.migrated');
    if (!fs.existsSync(markerFile)) {
      log.info('检测到旧数据目录，开始迁移:', oldDir, '→', aivaDir);
      try {
        // ... 迁移逻辑 ...
        fs.writeFileSync(markerFile, new Date().toISOString());
        log.info('迁移完成');
      } catch (err) {
        log.error('迁移失败:', err);
      }
    }
  }
```

使用 `.migrated` 标记文件避免重复迁移。

- [ ] **Step 2: 提交**

```bash
git add electron/main.ts
git commit -m "feat: add migration logic from Application Support to ~/.aiva/"
```

---

### Task 8: 验证整体流程

- [ ] **Step 1: 运行全部测试**

Run: `npx jest --no-cache`
Expected: 全部通过

- [ ] **Step 2: 验证 TypeScript 编译**

Run: `npx tsc --noEmit`
Expected: 无错误

- [ ] **Step 3: 验证 Next.js 构建**

Run: `npm run build`
Expected: 构建成功

- [ ] **Step 4: 手动冒烟测试（Electron 模式）**

Run: `npm run electron:dev`

检查清单：
1. 应用正常启动，`~/.aiva/` 目录已创建
2. 设置页面正常加载，API Key 和其他设置保留
3. 技能管理页面显示空状态引导
4. 点击"导入"，选择一个包含 SKILL.md 的文件夹
5. 导入成功，技能卡片显示 name + description
6. 切换启用/禁用开关
7. 右键查看详情，弹出 modal 显示 SKILL.md 内容
8. 删除技能功能正常
9. 发送一条消息给 Claude，确认 skill 内容被注入（检查日志）
10. 如果之前有旧数据，确认迁移正常（数据库、设置、MCP 配置都在）

- [ ] **Step 5: 提交最终验证**

```bash
git add -A
git commit -m "chore: verify skill management refactor end-to-end"
```
