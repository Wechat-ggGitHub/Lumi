# 技能管理重构设计

日期: 2026-05-01

## 背景

当前技能管理模块存在根本性问题：`voice-input` 和 `auto-memory` 不是"技能"，而是 Aiva 应用自身功能。真正的技能应该是 Claude Code 风格的 SKILL.md 能力包——模块化的指令集，扩展 Claude 执行任务时的能力。

## 核心决策

| 决策 | 选择 | 原因 |
|------|------|------|
| 数据所有权 | Aiva 独立存储 | 不依赖 Claude Code 的目录结构 |
| 添加方式 | 导入本地 SKILL.md 文件夹 | 复用现有 skill 生态 |
| 执行注入 | 全量注入 systemPrompt.append | 简单可靠，大部分 skill < 2k tokens |
| 旧技能处理 | 移除，始终启用 | 语音输入和自动记忆是应用底层行为 |
| 数据目录 | 统一到 `~/.aiva/` | 与 `config/skills.json` 等分散存储说再见 |

## 目录结构

```
~/.aiva/
├── aiva.db                    # SQLite
├── settings.json               # 应用设置（含 disabledSkills 数组）
├── skills/                     # 技能目录
│   ├── tdd/
│   │   └── SKILL.md
│   ├── brainstorming/
│   │   └── SKILL.md
│   └── ...
├── mcp/
│   └── servers.json            # MCP 服务配置
├── secure/                     # 加密凭据（Electron safeStorage）
│   ├── api-key.enc
│   └── volcengine.json
├── logs/
│   └── aiva-YYYY-MM-DD.log
└── tmp/
    └── recording-*.wav
```

所有数据从 `~/Library/Application Support/Aiva/` 迁移到 `~/.aiva/`。

## Skill 数据模型

### 文件结构

```
~/.aiva/skills/<skill-name>/
├── SKILL.md              # 必须：frontmatter (name, description) + 指令正文
├── scripts/              # 可选：脚本文件
├── references/           # 可选：参考文档
└── assets/               # 可选：模板、资源
```

### SKILL.md 格式

遵循 Claude Code 标准——YAML frontmatter + Markdown body：

```markdown
---
name: tdd
description: 测试驱动开发 — 实现功能或修复 Bug 前先写测试，红-绿-重构循环
---

# 指令正文...
```

### 启用/禁用

启用状态维护在 `settings.json` 中：

```json
{
  "disabledSkills": ["some-disabled-skill"]
}
```

默认所有 `skills/` 目录下的 skill 启用。不修改 SKILL.md 文件本身——导入的文件保持原样。

## 执行注入

修改 `src/lib/claude-client.ts`，调用 `query()` 时注入 skill catalog：

```typescript
const skillCatalog = await buildSkillCatalog(skillsDir, disabledSkills);

const q = query({
  prompt: constrainedPrompt,
  options: {
    ...existingOptions,
    systemPrompt: {
      type: 'preset',
      preset: 'claude_code',
      append: skillCatalog,
    },
  }
});
```

### buildSkillCatalog() 逻辑

1. 扫描 `~/.aiva/skills/` 下所有子目录
2. 过滤 `disabledSkills` 中的 skill
3. 读取每个启用 skill 的 SKILL.md 全文
4. 按模板拼接：

```
# 可用技能

以下是你可以使用的技能。当用户任务匹配某个技能时，按照该技能的指令执行。

---
{SKILL.md 全文 1}
---
{SKILL.md 全文 2}
---
```

全量注入，不做动态按需加载。5-6 个 skill 约 10k tokens，在上下文限制内可接受。

## 技能管理 UI

路由: `/skills`，深色主题。

### 布局

- 顶部：返回按钮 + "技能管理"标题
- 导入区域：点击选择或拖入包含 SKILL.md 的文件夹
- 已安装列表：skill 卡片，显示 name + description + 启用开关
- 卡片右键/长按菜单：查看详情、删除、在 Finder 中打开

### 交互

1. **导入**：原生文件选择器选择文件夹 → 复制到 `~/.aiva/skills/`
2. **启用/禁用**：切换开关，更新 `settings.json` 的 `disabledSkills`
3. **查看详情**：只读展示 SKILL.md 全文 + 目录文件列表
4. **删除**：确认后删除 skill 文件夹 + 清理 disabledSkills
5. **空状态**：引导文案 "导入一个 SKILL.md 文件夹来添加技能"

### V1 不做的事

- 不做 skill 编辑器
- 不做 skill 市场/发现
- 不做 skill 参数配置

## 迁移计划

### 首次启动迁移（electron/main.ts app.whenReady）

迁移不是简单的目录复制，需要重组文件结构：

1. 检测 `~/.aiva/` 是否存在
2. 不存在则检查 `~/Library/Application Support/Aiva/`
3. 旧目录存在则按映射关系迁移：
   - `aiva.db` → `~/.aiva/aiva.db`
   - `settings.json` → `~/.aiva/settings.json`（并添加 `disabledSkills: []` 字段）
   - `config/mcp-servers.json` → `~/.aiva/mcp/servers.json`
   - `secure/*` → `~/.aiva/secure/*`
   - `logs/*` → `~/.aiva/logs/*`
   - `config/skills.json` → 丢弃（旧的 voice-input/auto-memory 不再需要）
   - `config/claude.md` → 丢弃（persona+memory 改为通过 SDK systemPrompt 注入）
4. 创建 `~/.aiva/skills/` 空目录
5. 旧目录保留不删除（安全回退）

### 文件变更清单

**删除/重构**：
- `src/lib/config-files.ts`：删除 skill 相关函数（保留 MCP 函数），迁移 MCP 配置路径
- `src/types/index.ts`：删除 `SkillConfig` 接口和 skills IPC 类型
- `electron/main.ts`：删除旧 skills IPC handler，新增 import/list/toggle/delete IPC
- `src/app/skills/page.tsx`：重写

**新增**：
- `src/lib/skill-manager.ts`：skill 文件系统操作（扫描、导入、删除、构建 catalog）

**修改**：
- `src/lib/claude-client.ts`：添加 `buildSkillCatalog()`，修改 `query()` 调用
- `electron/main.ts`：`userDataDir` 改为 `~/.aiva/`
- `src/lib/db.ts`：数据库路径改为 `~/.aiva/aiva.db`
- `src/lib/keychain.ts`：加密文件路径改为 `~/.aiva/secure/`
- `src/lib/logger.ts`：日志路径改为 `~/.aiva/logs/`
- `electron/recorder.ts`：临时录音路径改为 `~/.aiva/tmp/`
- `src/lib/aiva-context.ts`：删除 `writeAivaClaudeMd()`（不再写文件），persona+memory 改为通过 SDK `systemPrompt.append` 注入（与 skill catalog 合并）
