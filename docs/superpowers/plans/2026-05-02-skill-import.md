# Skill Import 多格式支持 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 Aiva 技能导入支持 `.md` 文件和 `.zip` 压缩包，不再局限于文件夹。

**Architecture:** 在 `skill-manager.ts` 中新增 `importSkillFromMd` 和 `importSkillFromZip` 两个函数，IPC handler 根据文件类型分派。zip 使用 `adm-zip` 解压到临时目录后复用现有目录导入逻辑。

**Tech Stack:** Node.js fs/path/os, adm-zip (纯 JS zip 库), Electron dialog API

---

### Task 1: 安装 adm-zip 依赖

**Files:**
- Modify: `package.json` (自动更新)

- [ ] **Step 1: 安装 adm-zip**

```bash
npm install adm-zip && npm install -D @types/adm-zip
```

- [ ] **Step 2: 验证安装成功**

```bash
node -e "require('adm-zip'); console.log('ok')"
```
Expected: `ok`

- [ ] **Step 3: 提交**

```bash
git add package.json package-lock.json
git commit -m "chore: add adm-zip dependency for skill import"
```

---

### Task 2: 实现 importSkillFromMd（TDD）

**Files:**
- Modify: `src/__tests__/skill-manager.test.ts`
- Modify: `src/lib/skill-manager.ts`

- [ ] **Step 1: 写 importSkillFromMd 的失败测试**

在 `src/__tests__/skill-manager.test.ts` 的 `importSkill` describe 块之后追加：

```typescript
describe('importSkillFromMd', () => {
  it('将 .md 文件导入为技能目录', () => {
    const srcFile = path.join(skillsDir, '..', 'test-skill.md');
    fs.writeFileSync(srcFile, '---\nname: my-md-skill\ndescription: from md\n---\n# 指令正文');
    const result = importSkillFromMd(srcFile, skillsDir);
    expect(result).toBe(true);
    expect(fs.existsSync(path.join(skillsDir, 'my-md-skill', 'SKILL.md'))).toBe(true);
    const content = fs.readFileSync(path.join(skillsDir, 'my-md-skill', 'SKILL.md'), 'utf-8');
    expect(content).toContain('指令正文');
  });

  it('导入失败当 .md 没有 frontmatter name', () => {
    const srcFile = path.join(skillsDir, '..', 'no-name.md');
    fs.writeFileSync(srcFile, '# 没有frontmatter的文件');
    const result = importSkillFromMd(srcFile, skillsDir);
    expect(result).toBe(false);
  });

  it('导入失败当 name 无效（含特殊字符）', () => {
    const srcFile = path.join(skillsDir, '..', 'bad-name.md');
    fs.writeFileSync(srcFile, '---\nname: ../evil\ndescription: hack\n---\n# 指令');
    const result = importSkillFromMd(srcFile, skillsDir);
    expect(result).toBe(false);
  });

  it('导入失败当同名技能已存在', () => {
    const existing = path.join(skillsDir, 'existing-skill');
    fs.mkdirSync(existing);
    fs.writeFileSync(path.join(existing, 'SKILL.md'), '---\nname: existing-skill\ndescription: old\n---\n');

    const srcFile = path.join(skillsDir, '..', 'dup.md');
    fs.writeFileSync(srcFile, '---\nname: existing-skill\ndescription: new\n---\n# 指令');
    const result = importSkillFromMd(srcFile, skillsDir);
    expect(result).toBe(false);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npx jest src/__tests__/skill-manager.test.ts --testNamePattern "importSkillFromMd" -v
```
Expected: FAIL — `importSkillFromMd is not defined`

- [ ] **Step 3: 实现 importSkillFromMd**

在 `src/lib/skill-manager.ts` 的 `importSkill` 函数之后追加：

```typescript
export function importSkillFromMd(filePath: string, skillsDir: string): boolean {
  const content = fs.readFileSync(filePath, 'utf-8');
  const { name } = parseSkillFrontmatter(content);
  if (!name || !isValidSkillName(name)) return false;

  const targetDir = path.join(skillsDir, name);
  if (fs.existsSync(targetDir)) return false;

  fs.mkdirSync(targetDir, { recursive: true });
  fs.writeFileSync(path.join(targetDir, 'SKILL.md'), content);
  return true;
}
```

同时更新文件顶部的 export（在 `importSkill` 的 export 旁边，新函数默认就是 export 的，无需额外操作）。

- [ ] **Step 4: 运行测试确认通过**

```bash
npx jest src/__tests__/skill-manager.test.ts --testNamePattern "importSkillFromMd" -v
```
Expected: 4 tests PASS

- [ ] **Step 5: 提交**

```bash
git add src/lib/skill-manager.ts src/__tests__/skill-manager.test.ts
git commit -m "feat: add importSkillFromMd for single .md file import"
```

---

### Task 3: 实现 importSkillFromZip（TDD）

**Files:**
- Modify: `src/__tests__/skill-manager.test.ts`
- Modify: `src/lib/skill-manager.ts`

- [ ] **Step 1: 在测试文件顶部导入 adm-zip**

在 `src/__tests__/skill-manager.test.ts` 的 import 区域追加：

```typescript
import AdmZip from 'adm-zip';
```

同时更新第一行的 import，加入新函数名：

```typescript
import { scanSkills, importSkill, importSkillFromMd, importSkillFromZip, deleteSkill, buildSkillCatalog, parseSkillFrontmatter } from '../lib/skill-manager';
```

- [ ] **Step 2: 写 importSkillFromZip 的失败测试**

在 `importSkillFromMd` describe 块之后追加：

```typescript
describe('importSkillFromZip', () => {
  const makeZip = (entries: { path: string; content: string }[]): string => {
    const zip = new AdmZip();
    for (const entry of entries) {
      zip.addFile(entry.path, Buffer.from(entry.content, 'utf-8'));
    }
    const zipPath = path.join(skillsDir, '..', `test-${Date.now()}.zip`);
    zip.writeZip(zipPath);
    return zipPath;
  };

  it('导入扁平 zip（根目录含 SKILL.md）', () => {
    const zipPath = makeZip([
      { path: 'SKILL.md', content: '---\nname: zip-flat\ndescription: flat zip\n---\n# 指令' },
    ]);
    const result = importSkillFromZip(zipPath, skillsDir);
    expect(result).toBe(true);
    expect(fs.existsSync(path.join(skillsDir, 'zip-flat', 'SKILL.md'))).toBe(true);
    expect(fs.readFileSync(path.join(skillsDir, 'zip-flat', 'SKILL.md'), 'utf-8')).toContain('指令');
  });

  it('导入嵌套 zip（子文件夹含 SKILL.md）', () => {
    const zipPath = makeZip([
      { path: 'my-skill/SKILL.md', content: '---\nname: nested-skill\ndescription: nested\n---\n# 指令' },
    ]);
    const result = importSkillFromZip(zipPath, skillsDir);
    expect(result).toBe(true);
    expect(fs.existsSync(path.join(skillsDir, 'nested-skill', 'SKILL.md'))).toBe(true);
  });

  it('导入包含 references 文件夹的 zip', () => {
    const zipPath = makeZip([
      { path: 'SKILL.md', content: '---\nname: with-refs\ndescription: has refs\n---\n# 指令' },
      { path: 'references/guide.md', content: '# 参考文档' },
    ]);
    const result = importSkillFromZip(zipPath, skillsDir);
    expect(result).toBe(true);
    expect(fs.existsSync(path.join(skillsDir, 'with-refs', 'references', 'guide.md'))).toBe(true);
  });

  it('导入失败当 zip 没有 SKILL.md', () => {
    const zipPath = makeZip([
      { path: 'README.md', content: '# 没有SKILL.md' },
    ]);
    const result = importSkillFromZip(zipPath, skillsDir);
    expect(result).toBe(false);
  });

  it('导入失败当 SKILL.md 的 name 无效', () => {
    const zipPath = makeZip([
      { path: 'SKILL.md', content: '---\nname: ../evil\ndescription: hack\n---\n# 指令' },
    ]);
    const result = importSkillFromZip(zipPath, skillsDir);
    expect(result).toBe(false);
  });

  it('导入失败当同名技能已存在', () => {
    const existing = path.join(skillsDir, 'dup-skill');
    fs.mkdirSync(existing);
    fs.writeFileSync(path.join(existing, 'SKILL.md'), '---\nname: dup-skill\ndescription: old\n---\n');

    const zipPath = makeZip([
      { path: 'SKILL.md', content: '---\nname: dup-skill\ndescription: new\n---\n# 指令' },
    ]);
    const result = importSkillFromZip(zipPath, skillsDir);
    expect(result).toBe(false);
  });
});
```

- [ ] **Step 3: 运行测试确认失败**

```bash
npx jest src/__tests__/skill-manager.test.ts --testNamePattern "importSkillFromZip" -v
```
Expected: FAIL — `importSkillFromZip is not defined`

- [ ] **Step 4: 实现 importSkillFromZip**

在 `src/lib/skill-manager.ts` 的 `importSkillFromMd` 函数之后追加：

```typescript
import AdmZip from 'adm-zip';

function findSkillRootInZip(extractDir: string): string | null {
  if (fs.existsSync(path.join(extractDir, 'SKILL.md'))) return extractDir;

  const entries = fs.readdirSync(extractDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory() && fs.existsSync(path.join(extractDir, entry.name, 'SKILL.md'))) {
      return path.join(extractDir, entry.name);
    }
  }
  return null;
}

export function importSkillFromZip(filePath: string, skillsDir: string): boolean {
  let extractDir = '';
  try {
    extractDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aiva-skill-'));
    const zip = new AdmZip(filePath);
    zip.extractAllTo(extractDir, true);

    const skillRoot = findSkillRootInZip(extractDir);
    if (!skillRoot) return false;

    const content = fs.readFileSync(path.join(skillRoot, 'SKILL.md'), 'utf-8');
    const { name } = parseSkillFrontmatter(content);
    if (!name || !isValidSkillName(name)) return false;

    const targetDir = path.join(skillsDir, name);
    if (fs.existsSync(targetDir)) return false;

    fs.cpSync(skillRoot, targetDir, { recursive: true });
    return true;
  } finally {
    if (extractDir && fs.existsSync(extractDir)) {
      fs.rmSync(extractDir, { recursive: true, force: true });
    }
  }
}
```

注意：需要在文件顶部追加 `import os from 'os';` 和 `import AdmZip from 'adm-zip';`（`os` 可能已经导入了，检查一下）。

- [ ] **Step 5: 运行测试确认通过**

```bash
npx jest src/__tests__/skill-manager.test.ts --testNamePattern "importSkillFromZip" -v
```
Expected: 6 tests PASS

- [ ] **Step 6: 运行全部 skill-manager 测试确认无回归**

```bash
npx jest src/__tests__/skill-manager.test.ts -v
```
Expected: 所有测试 PASS

- [ ] **Step 7: 提交**

```bash
git add src/lib/skill-manager.ts src/__tests__/skill-manager.test.ts
git commit -m "feat: add importSkillFromZip for .zip archive import"
```

---

### Task 4: 更新 IPC handler 支持三种输入

**Files:**
- Modify: `electron/main.ts:625-635`

- [ ] **Step 1: 更新 skills:import handler**

在 `electron/main.ts` 中，更新 `importSkill` 的 import 语句（在文件顶部的 import 区域），加入新函数：

```typescript
import { scanSkills, importSkill, importSkillFromMd, importSkillFromZip, deleteSkill, readSkillContent, buildSkillCatalog } from '../src/lib/skill-manager';
```

然后将 `ipcMain.handle('skills:import', ...)` 替换为：

```typescript
ipcMain.handle('skills:import', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile', 'openDirectory'],
    title: '导入技能',
    filters: [{ name: '技能文件', extensions: ['md', 'zip'] }],
  });
  if (result.canceled || result.filePaths.length === 0) return null;

  const selected = result.filePaths[0];
  const stat = fs.statSync(selected);
  const skillsDir = path.join(aivaDir, 'skills');

  let imported: boolean;
  if (stat.isDirectory()) {
    imported = importSkill(selected, skillsDir);
  } else if (selected.endsWith('.md')) {
    imported = importSkillFromMd(selected, skillsDir);
  } else if (selected.endsWith('.zip')) {
    imported = importSkillFromZip(selected, skillsDir);
  } else {
    return { error: '不支持的文件类型' };
  }

  if (!imported) return { error: '导入失败：文件缺少有效的 SKILL.md，或已存在同名技能' };
  const settings = loadSettings();
  return scanSkills(skillsDir, settings.disabledSkills || []);
});
```

注意：需要确认 `fs` 和 `path` 在 `electron/main.ts` 顶部已经导入（通常已有）。

- [ ] **Step 2: 提交**

```bash
git add electron/main.ts
git commit -m "feat: update skills:import IPC handler for .md/.zip/folder"
```

---

### Task 5: 更新 UI 提示文字

**Files:**
- Modify: `src/app/skills/page.tsx:154-155`

- [ ] **Step 1: 更新导入区域文字和空状态文字**

在 `src/app/skills/page.tsx` 中，将第 155 行的：

```
点击选择包含 SKILL.md 的文件夹来导入技能
```

改为：

```
点击导入技能（支持 .md 文件、.zip 压缩包、文件夹）
```

将第 164 行的：

```
暂无技能。导入一个包含 SKILL.md 的文件夹来添加技能。
```

改为：

```
暂无技能。点击上方区域导入 .md 文件、.zip 压缩包或包含 SKILL.md 的文件夹。
```

- [ ] **Step 2: 提交**

```bash
git add src/app/skills/page.tsx
git commit -m "feat: update skills UI text for multi-format import"
```

---

### Task 6: 集成测试

**Files:** 无新增

- [ ] **Step 1: 运行全部测试**

```bash
npx jest -v
```
Expected: 所有测试 PASS

- [ ] **Step 2: 运行 `npm run build` 确认构建通过**

```bash
npm run build
```
Expected: 构建成功，无类型错误

- [ ] **Step 3: 运行 `npm run build:electron` 确认 Electron 构建通过**

```bash
npm run build:electron
```
Expected: 构建成功
