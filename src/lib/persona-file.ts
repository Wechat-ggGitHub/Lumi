import fs from 'fs';
import path from 'path';
import type Database from 'better-sqlite3';

const DEFAULT_CONTENT = `# Shrew

你是一个专业、高效的编程助手。`;

const PERSONA_FILENAME = 'persona.md';

export function getPersonaFilePath(shrewDir: string): string {
  return path.join(shrewDir, PERSONA_FILENAME);
}

export function readPersonaFile(shrewDir: string): { name: string; content: string } {
  const filePath = getPersonaFilePath(shrewDir);
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, DEFAULT_CONTENT, 'utf-8');
    return parsePersonaContent(DEFAULT_CONTENT);
  }
  const raw = fs.readFileSync(filePath, 'utf-8');
  return parsePersonaContent(raw);
}

export function writePersonaFile(shrewDir: string, name: string, content: string): void {
  const fullContent = `# ${name}\n\n${content}`;
  fs.writeFileSync(getPersonaFilePath(shrewDir), fullContent, 'utf-8');
}

export function parsePersonaContent(raw: string): { name: string; content: string } {
  const lines = raw.split('\n');
  const firstLine = lines[0] || '';
  const nameMatch = firstLine.match(/^#\s+(.+)$/);
  const name = nameMatch ? nameMatch[1].trim() : 'Shrew';
  const content = lines.slice(1).join('\n').trim();
  return { name, content };
}

export function migratePersonaFromDb(shrewDir: string, db: Database.Database): void {
  const filePath = getPersonaFilePath(shrewDir);
  if (fs.existsSync(filePath)) return;

  const row = db.prepare(`SELECT * FROM persona WHERE id = 1`).get() as Record<string, unknown> | undefined;
  if (!row) {
    fs.writeFileSync(filePath, DEFAULT_CONTENT, 'utf-8');
    return;
  }

  const parts: string[] = [];
  const name = String(row.name || 'Shrew');

  if (row.bio) parts.push(String(row.bio));

  const styleParts: string[] = [];
  if (row.personality) styleParts.push(`- 性格：${row.personality}`);
  if (row.tone) styleParts.push(`- 语气：${row.tone}`);
  if (row.detail_level) styleParts.push(`- 详细程度：${row.detail_level}`);
  if (row.clarify_pref) styleParts.push(`- 澄清偏好：${row.clarify_pref}`);
  if (row.work_style) styleParts.push(`- 工作方式：${row.work_style}`);
  if (styleParts.length > 0) {
    parts.push(`## 性格与风格`);
    parts.push(...styleParts);
  }

  if (row.system_prompt) parts.push(String(row.system_prompt));

  const content = parts.join('\n');
  const fullContent = content
    ? `# ${name}\n\n${content}`
    : DEFAULT_CONTENT;

  fs.writeFileSync(filePath, fullContent, 'utf-8');
}
