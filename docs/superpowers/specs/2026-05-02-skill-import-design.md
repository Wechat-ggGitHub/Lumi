# Skill Import: 支持 .md 文件和 .zip 压缩包导入

## 背景

当前 Shrew 的技能导入只支持选择文件夹（必须包含 `SKILL.md`）。用户无法导入单个 `.md` 技能文件或 `.zip` 压缩包。

## 设计

### 导入入口

一个导入按钮，弹出 Electron 文件选择器，同时支持选文件（`.md`、`.zip`）和文件夹。

### 导入逻辑（按选中类型分派）

| 选中类型 | 处理 |
|---------|------|
| `.md` 文件 | 读 frontmatter 取 `name` → 创建 `~/.shrew/skills/<name>/SKILL.md` |
| `.zip` 文件 | 解压到临时目录 → 找 SKILL.md（根目录或一层子目录）→ 读 frontmatter 取 `name` → 复制整个目录到 `~/.shrew/skills/<name>/` |
| 文件夹 | 现有逻辑：检查根目录有 SKILL.md → 复制到 `~/.shrew/skills/<name>/` |

### 文件夹命名规则

统一使用 SKILL.md frontmatter 的 `name` 字段。没有 frontmatter 或 `name` 无效的导入失败。

### Zip 结构兼容

两种结构都支持：
- **扁平**：zip 根目录直接包含 `SKILL.md`
- **嵌套**：zip 里有一层子文件夹包含 `SKILL.md`

查找逻辑：先查根目录，没有则扫描一级子目录。

## 改动文件

### `src/lib/skill-manager.ts`

现有 `importSkill(sourceDir, skillsDir)` 保持不变。新增：

**`importSkillFromMd(filePath: string, skillsDir: string): boolean`**
- 读 .md 文件，解析 frontmatter 取 `name`
- 验证 name（`isValidSkillName`）
- 检查目标目录不存在
- 创建 `skillsDir/name/` 目录，写入 `SKILL.md`

**`importSkillFromZip(filePath: string, skillsDir: string): boolean`**
- 用 adm-zip 解压到 `os.tmpdir()` + 随机后缀
- 查找 SKILL.md：先查根目录，再查一级子目录
- 解析 frontmatter 取 `name`，验证
- 检查目标目录不存在
- 复制找到的技能目录（整个文件夹含 references 等）到 `skillsDir/name/`
- 清理临时目录

### `electron/main.ts`

`skills:import` IPC handler：
- `dialog.showOpenDialog` 的 `properties` 改为 `['openFile', 'openDirectory']`
- 加 `filters: [{ name: '技能文件', extensions: ['md', 'zip'] }]`
- 选中后用 `fs.statSync` 判断类型，分派到对应函数
- 统一错误提示

### `src/app/skills/page.tsx`

- 导入区域提示文字改为 `"点击导入技能（支持 .md 文件、.zip 压缩包、文件夹）"`

## 新增依赖

- `adm-zip` — 纯 JS zip 解压库，无 native 依赖

## 错误处理

- 无 frontmatter 或 name 无效 → `"导入失败：SKILL.md 缺少有效的 name 字段"`
- 同名技能已存在 → `"导入失败：已存在同名技能"`
- zip 中找不到 SKILL.md → `"导入失败：压缩包中没有找到 SKILL.md"`
- 不支持的文件类型 → `"不支持的文件类型"`
