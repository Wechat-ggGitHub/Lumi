# Persona Markdown 化设计

**日期**: 2026-05-03
**目标**: 将分身设定从预定义字段（ChipGroup 单选）简化为自由编辑的 markdown 文档

## 背景

当前 persona 系统有 7 个预定义字段（bio、personality、tone、detail_level、clarify_pref、work_style、system_prompt），通过 ChipGroup 单选或 Textarea 编辑。这些字段格式僵化，用户无法自由定义分身的表达方式。system_prompt 作为"高级设置"藏在折叠区域里，实际是最灵活的部分。

## 方案

保留名称(name)和头像(首字母)，其余所有字段合并为一个 `~/.shrew/persona.md` 文件，用户可自由编写。

## 文件结构与存储

**文件路径**: `~/.shrew/persona.md`

**格式**:
```markdown
# Shrew

你是一个专业、高效的编程助手。
说话简洁直接，先执行再总结。
用中文回复。
```

**读取规则**:
- 第一行 `# xxx` 提取名称（用于 tray 标题、头像首字母显示）
- 去掉第一行标题后，剩余全部作为 promptContent 注入 Agent 上下文
- 如果文件不存在，用内置默认模板自动生成

**默认模板**:
```markdown
# Shrew

你是一个专业、高效的编程助手。
```

## 数据库迁移

- 删除 persona 表的列: `bio`, `personality`, `tone`, `detail_level`, `clarify_pref`, `work_style`, `system_prompt`
- 保留 `id` 和 `name` 列（name 作为缓存，启动时从文件同步）
- 迁移逻辑: 旧字段按现有 `buildShrewContext()` 格式拼合，写入 `~/.shrew/persona.md`

迁移后的 schema:
```sql
CREATE TABLE persona (
  id INTEGER PRIMARY KEY DEFAULT 1,
  name TEXT NOT NULL DEFAULT 'Shrew',
  avatar TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

## UI 变更

分身设定页面（`/persona`）简化为:

1. **顶部**: 名称输入框（SingleLineInput）+ 头像（首字母圆圈）
2. **主体**: 大 Textarea（等宽字体，高度撑满剩余空间），直接编辑 markdown 内容
3. **底部**: 保存按钮

移除:
- 所有 ChipGroup（性格、语气、回答详略、澄清偏好、工作方式）
- bio 独立 Textarea
- 高级设置折叠区域和 system_prompt

## IPC 变更

- `persona:load` → 返回 `{ name: string, content: string }`（从文件读取）
- `persona:save` → 接收 `{ name: string, content: string }`（写回文件，name 同步到数据库缓存）

## 上下文注入变更

`buildShrewContext()` 简化为:

1. 读取 `~/.shrew/persona.md` 内容
2. 提取 name（第一行 `# xxx`）
3. 剩余内容作为 persona prompt
4. 如果存在生效中的 memory，追加 `## 关于用户的记忆` 段落

拼出的最终 prompt 示例:
```
# Shrew

你是一个专业、高效的编程助手。
说话简洁直接，先执行再总结。

## 关于用户的记忆
- 用户喜欢用中文写注释
```

persona.md 的内容原封不动注入，不做格式转换。

## 受影响文件

| 文件 | 变更 |
|------|------|
| `src/app/persona/page.tsx` | 页面重写，简化为名称 + 编辑器 |
| `src/lib/shrew-context.ts` | `buildShrewContext()` 改为接收 content string |
| `src/lib/db.ts` | 删除旧列迁移，简化 `getPersona()` / `updatePersona()` |
| `electron/main.ts` | `executePrompt()` 中 persona 读取改为文件，IPC handler 适配 |
| `src/types/index.ts` | `Persona` 接口精简为 `{ id, name, avatar }` |
