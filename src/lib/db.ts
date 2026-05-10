import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import type { ExecutionRecord, ConversationMessage, ChatMessage, ContextSegment } from '@/types';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS execution_history (
  id TEXT PRIMARY KEY,
  sdk_session_id TEXT,
  segment_id TEXT,
  cwd TEXT NOT NULL,
  user_prompt TEXT NOT NULL,
  summary TEXT,
  cost_usd REAL,
  duration_ms INTEGER,
  num_turns INTEGER,
  status TEXT NOT NULL DEFAULT 'running',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME,
  messages TEXT
);
CREATE INDEX IF NOT EXISTS idx_execution_history_created ON execution_history(created_at DESC);

CREATE TABLE IF NOT EXISTS context_segment (
  id TEXT PRIMARY KEY,
  sdk_session_id TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  ended_at DATETIME
);

CREATE TABLE IF NOT EXISTS chat_message (
  id TEXT PRIMARY KEY,
  segment_id TEXT NOT NULL REFERENCES context_segment(id),
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  metadata TEXT,
  execution_id TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_chat_message_segment ON chat_message(segment_id, created_at);

CREATE TABLE IF NOT EXISTS persona (
  id INTEGER PRIMARY KEY DEFAULT 1,
  name TEXT NOT NULL DEFAULT 'Aiva',
  avatar TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

`;

export function initDb(db: Database.Database): void {
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.exec(SCHEMA);

  // 迁移：为已有表添加新列
  const columns = db.pragma('table_info(execution_history)') as { name: string }[];
  if (!columns.some(col => col.name === 'messages')) {
    db.exec('ALTER TABLE execution_history ADD COLUMN messages TEXT');
  }
  if (!columns.some(col => col.name === 'title')) {
    db.exec('ALTER TABLE execution_history ADD COLUMN title TEXT');
  }
  if (!columns.some(col => col.name === 'viewed')) {
    db.exec('ALTER TABLE execution_history ADD COLUMN viewed INTEGER DEFAULT 0');
  }
  if (!columns.some(col => col.name === 'segment_id')) {
    db.exec('ALTER TABLE execution_history ADD COLUMN segment_id TEXT');
  }

  // 确保存在活跃 context_segment
  const activeSegment = db.prepare(
    `SELECT id FROM context_segment WHERE ended_at IS NULL ORDER BY created_at DESC LIMIT 1`
  ).get() as { id: string } | undefined;
  if (!activeSegment) {
    db.prepare(`INSERT INTO context_segment (id) VALUES (?)`).run(randomUUID());
  }

  // 确保存在默认 persona
  const persona = db.prepare(`SELECT id FROM persona WHERE id = 1`).get();
  if (!persona) {
    db.prepare(`INSERT INTO persona (id) VALUES (1)`).run();
  }

  // 迁移：删除 persona 表的旧列
  const personaColumns = db.pragma('table_info(persona)') as { name: string }[];
  const deprecatedColumns = ['bio', 'personality', 'tone', 'detail_level', 'clarify_pref', 'work_style', 'system_prompt'];
  for (const col of deprecatedColumns) {
    if (personaColumns.some(c => c.name === col)) {
      db.exec(`ALTER TABLE persona DROP COLUMN ${col}`);
    }
  }
}

export function insertExecution(
  db: Database.Database,
  params: { cwd: string; user_prompt: string; sdk_session_id?: string; segment_id?: string }
): string {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO execution_history (id, cwd, user_prompt, sdk_session_id, segment_id) VALUES (?, ?, ?, ?, ?)`
  ).run(id, params.cwd, params.user_prompt, params.sdk_session_id ?? null, params.segment_id ?? null);
  return id;
}

export function updateExecution(
  db: Database.Database,
  id: string,
  updates: Partial<Pick<ExecutionRecord, 'status' | 'summary' | 'duration_ms' | 'num_turns' | 'cost_usd' | 'completed_at' | 'sdk_session_id' | 'title' | 'viewed'>>
): void {
  const fields: string[] = [];
  const values: unknown[] = [];

  for (const [key, value] of Object.entries(updates)) {
    fields.push(`${key} = ?`);
    values.push(value);
  }

  if (fields.length === 0) return;

  values.push(id);
  db.prepare(`UPDATE execution_history SET ${fields.join(', ')} WHERE id = ?`).run(...values);
}

export function getActiveExecution(db: Database.Database): ExecutionRecord | null {
  const row = db.prepare(`SELECT * FROM execution_history WHERE status = 'running' ORDER BY created_at DESC LIMIT 1`).get();
  return row ? (row as ExecutionRecord) : null;
}

export function getRecentExecutions(db: Database.Database, limit: number): ExecutionRecord[] {
  return db.prepare(`SELECT * FROM execution_history ORDER BY created_at DESC LIMIT ?`).all(limit) as ExecutionRecord[];
}

export function getExecutionById(db: Database.Database, id: string): ExecutionRecord | null {
  const row = db.prepare(`SELECT * FROM execution_history WHERE id = ?`).get(id);
  return row ? (row as ExecutionRecord) : null;
}

export function appendMessages(
  db: Database.Database,
  id: string,
  messages: ConversationMessage[]
): void {
  const json = JSON.stringify(messages);
  db.prepare('UPDATE execution_history SET messages = ? WHERE id = ?').run(json, id);
}

function getMessages(
  db: Database.Database,
  id: string
): ConversationMessage[] {
  const row = db.prepare('SELECT messages FROM execution_history WHERE id = ?').get(id) as { messages: string | null } | undefined;
  if (!row?.messages) return [];
  try {
    return JSON.parse(row.messages);
  } catch {
    return [];
  }
}

function getTodayExecutions(db: Database.Database, limit: number): ExecutionRecord[] {
  return db.prepare(
    `SELECT * FROM execution_history WHERE created_at >= date('now', 'start of day') ORDER BY created_at DESC LIMIT ?`
  ).all(limit) as ExecutionRecord[];
}

function getHistoryCount(db: Database.Database): number {
  const row = db.prepare(
    `SELECT COUNT(*) as count FROM execution_history WHERE created_at < date('now', 'start of day')`
  ).get() as { count: number };
  return row.count;
}

export function markViewed(db: Database.Database, id: string): void {
  db.prepare('UPDATE execution_history SET viewed = 1 WHERE id = ?').run(id);
}

export function markAllUnviewedAsViewed(db: Database.Database): boolean {
  const result = db.prepare(
    `UPDATE execution_history
     SET viewed = 1
     WHERE viewed = 0
       AND status IN ('completed', 'failed', 'cancelled')`
  ).run();
  return result.changes > 0;
}

// --- Context Segment ---

export function getActiveSegment(db: Database.Database): ContextSegment {
  const row = db.prepare(
    `SELECT * FROM context_segment WHERE ended_at IS NULL ORDER BY created_at DESC LIMIT 1`
  ).get() as ContextSegment | undefined;
  if (!row) {
    const id = randomUUID();
    db.prepare(`INSERT INTO context_segment (id) VALUES (?)`).run(id);
    return { id, sdk_session_id: null, created_at: new Date().toISOString(), ended_at: null };
  }
  return row;
}

export function endSegment(db: Database.Database, segmentId: string): void {
  db.prepare(`UPDATE context_segment SET ended_at = CURRENT_TIMESTAMP WHERE id = ?`).run(segmentId);
}

export function createSegment(db: Database.Database): string {
  const id = randomUUID();
  db.prepare(`INSERT INTO context_segment (id) VALUES (?)`).run(id);
  return id;
}

export function updateSegmentSessionId(db: Database.Database, segmentId: string, sessionId: string | null): void {
  db.prepare(`UPDATE context_segment SET sdk_session_id = ? WHERE id = ?`).run(sessionId, segmentId);
}

// --- Chat Message ---

export function insertChatMessage(
  db: Database.Database,
  params: { segmentId: string; role: ChatMessage['role']; content: string; metadata?: string; executionId?: string }
): string {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO chat_message (id, segment_id, role, content, metadata, execution_id) VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, params.segmentId, params.role, params.content, params.metadata ?? null, params.executionId ?? null);
  return id;
}

export function appendChatMessageContent(db: Database.Database, id: string, content: string): void {
  db.prepare(`UPDATE chat_message SET content = content || ? WHERE id = ?`).run(content, id);
}

export function updateChatMessageContent(db: Database.Database, id: string, content: string): void {
  db.prepare(`UPDATE chat_message SET content = ? WHERE id = ?`).run(content, id);
}

export function getChatMessages(db: Database.Database, segmentId: string): ChatMessage[] {
  return db.prepare(
    `SELECT * FROM chat_message WHERE segment_id = ? ORDER BY created_at ASC`
  ).all(segmentId) as ChatMessage[];
}

function getAllChatMessages(db: Database.Database): ChatMessage[] {
  return db.prepare(
    `SELECT * FROM chat_message ORDER BY created_at ASC`
  ).all() as ChatMessage[];
}

export function getLatestAssistantMessage(db: Database.Database, segmentId: string): ChatMessage | null {
  const row = db.prepare(
    `SELECT * FROM chat_message WHERE segment_id = ? AND role = 'assistant' ORDER BY created_at DESC LIMIT 1`
  ).get(segmentId) as ChatMessage | undefined;
  return row ?? null;
}

export function migrateMemoryItems(db: Database.Database, aivaDir: string): void {
  const tables = db.pragma('table_info(memory_item)') as { name: string }[];
  if (tables.length === 0) return;

  const memories = db.prepare(`SELECT * FROM memory_item WHERE status = '生效中'`).all() as Array<{ type: string; content: string }>;
  if (memories.length === 0) {
    db.exec('DROP TABLE IF EXISTS memory_item');
    return;
  }

  const memoriesDir = path.join(aivaDir, 'memories');
  fs.mkdirSync(memoriesDir, { recursive: true });

  const indexLines: string[] = [];
  for (const m of memories) {
    const slug = m.type.toLowerCase().replace(/[^a-z0-9一-鿿]+/g, '-').slice(0, 20);
    const filename = `${slug}-${Date.now()}.md`;
    fs.writeFileSync(
      path.join(memoriesDir, filename),
      `---\nname: ${m.type}\ndescription: ${m.content.slice(0, 60)}\ntype: user\n---\n${m.content}\n`
    );
    indexLines.push(`- [${m.type}](${filename}) — ${m.content.slice(0, 50)}`);
  }

  const indexPath = path.join(memoriesDir, 'MEMORY.md');
  if (fs.existsSync(indexPath)) {
    fs.appendFileSync(indexPath, '\n' + indexLines.join('\n'));
  } else {
    fs.writeFileSync(indexPath, indexLines.join('\n') + '\n');
  }

  db.exec('DROP TABLE IF EXISTS memory_item');
}
