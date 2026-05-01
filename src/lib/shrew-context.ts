import type { Persona } from '@/types';
import Database from 'better-sqlite3';

export function buildShrewContext(persona: Persona, memoryLines: string[]): string {
  const parts: string[] = [];

  parts.push(`# 你是 ${persona.name}`);
  if (persona.bio) {
    parts.push(persona.bio);
  }

  parts.push(`\n## 性格与风格`);
  parts.push(`- 性格：${persona.personality}`);
  parts.push(`- 语气：${persona.tone}`);
  parts.push(`- 详细程度：${persona.detail_level}`);
  parts.push(`- 澄清偏好：${persona.clarify_pref}`);
  parts.push(`- 工作方式：${persona.work_style}`);

  if (memoryLines.length > 0) {
    parts.push(`\n## 关于用户的记忆`);
    for (const line of memoryLines) {
      parts.push(`- ${line}`);
    }
  }

  if (persona.system_prompt) {
    parts.push(`\n## 额外指令`);
    parts.push(persona.system_prompt);
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
