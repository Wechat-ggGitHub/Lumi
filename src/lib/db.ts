import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import type { ExecutionRecord, ConversationMessage, ChatMessage, ContextSegment, Persona, MemoryItem } from '@/types';

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
  name TEXT NOT NULL DEFAULT 'Shrew',
  avatar TEXT,
  bio TEXT,
  personality TEXT DEFAULT '专业',
  tone TEXT DEFAULT '自然',
  detail_level TEXT DEFAULT '平衡',
  clarify_pref TEXT DEFAULT '视情况平衡',
  work_style TEXT DEFAULT '先执行再总结',
  system_prompt TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS memory_item (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  content TEXT NOT NULL,
  source TEXT DEFAULT '自动提炼',
  status TEXT DEFAULT '生效中',
  pinned INTEGER DEFAULT 0,
  execution_id TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_memory_item_type ON memory_item(type);
CREATE INDEX IF NOT EXISTS idx_memory_item_status ON memory_item(status);
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

export function getMessages(
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

export function getTodayExecutions(db: Database.Database, limit: number): ExecutionRecord[] {
  return db.prepare(
    `SELECT * FROM execution_history WHERE created_at >= date('now', 'start of day') ORDER BY created_at DESC LIMIT ?`
  ).all(limit) as ExecutionRecord[];
}

export function getHistoryCount(db: Database.Database): number {
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

export function updateSegmentSessionId(db: Database.Database, segmentId: string, sessionId: string): void {
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

export function getAllChatMessages(db: Database.Database): ChatMessage[] {
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

// --- Persona ---

export function getPersona(db: Database.Database): Persona {
  const row = db.prepare(`SELECT * FROM persona WHERE id = 1`).get() as Persona | undefined;
  if (!row) {
    db.prepare(`INSERT INTO persona (id) VALUES (1)`).run();
    return db.prepare(`SELECT * FROM persona WHERE id = 1`).get() as Persona;
  }
  return row;
}

export function updatePersona(
  db: Database.Database,
  updates: Partial<Omit<Persona, 'id' | 'updated_at'>>
): Persona {
  const fields: string[] = [];
  const values: unknown[] = [];
  for (const [key, value] of Object.entries(updates)) {
    fields.push(`${key} = ?`);
    values.push(value);
  }
  if (fields.length > 0) {
    fields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(1);
    db.prepare(`UPDATE persona SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  }
  return getPersona(db);
}

// --- Memory Item ---

export function listMemories(db: Database.Database): MemoryItem[] {
  return db.prepare(
    `SELECT * FROM memory_item ORDER BY pinned DESC, updated_at DESC`
  ).all() as MemoryItem[];
}

export function addMemory(
  db: Database.Database,
  params: { type: string; content: string; source?: string; executionId?: string }
): MemoryItem {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO memory_item (id, type, content, source, execution_id) VALUES (?, ?, ?, ?, ?)`
  ).run(id, params.type, params.content, params.source ?? '自动提炼', params.executionId ?? null);
  return db.prepare(`SELECT * FROM memory_item WHERE id = ?`).get(id) as MemoryItem;
}

export function updateMemory(db: Database.Database, id: string, content: string): void {
  db.prepare(
    `UPDATE memory_item SET content = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
  ).run(content, id);
}

export function deleteMemory(db: Database.Database, id: string): void {
  db.prepare(`DELETE FROM memory_item WHERE id = ?`).run(id);
}

export function toggleMemoryStatus(db: Database.Database, id: string): void {
  db.prepare(
    `UPDATE memory_item SET status = CASE WHEN status = '生效中' THEN '已失效' ELSE '生效中' END, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
  ).run(id);
}

export function toggleMemoryPin(db: Database.Database, id: string): void {
  db.prepare(
    `UPDATE memory_item SET pinned = CASE WHEN pinned = 1 THEN 0 ELSE 1 END, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
  ).run(id);
}

export function getMemoriesByStatus(db: Database.Database, status: string): MemoryItem[] {
  return db.prepare(
    `SELECT * FROM memory_item WHERE status = ? ORDER BY pinned DESC, updated_at DESC`
  ).all(status) as MemoryItem[];
}
