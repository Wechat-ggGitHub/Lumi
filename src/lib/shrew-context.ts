import Database from 'better-sqlite3';

const DELIVERY_INSTRUCTION = `## 结果交付方式
当你完成用户指令后，根据结果的复杂度选择交付方式：
- 如果结果是简短说明（如"已更新配置"、"创建完成"），直接用文字回复
- 如果结果较长或包含复杂内容（如代码修改总结、多步骤操作、详细分析），将完整内容整理成文件写入 ~/Desktop/ 目录，然后用一两句话告诉用户你做了什么以及文件位置`;

export function buildShrewContext(personaContent: string, memoryLines: string[]): string {
  const parts: string[] = [];

  if (personaContent.trim()) {
    parts.push(personaContent.trim());
  }

  parts.push(DELIVERY_INSTRUCTION);

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
