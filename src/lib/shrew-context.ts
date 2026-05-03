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
