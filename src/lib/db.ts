import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import type { ExecutionRecord, ConversationMessage } from '@/types';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS execution_history (
  id TEXT PRIMARY KEY,
  sdk_session_id TEXT,
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
}

export function insertExecution(
  db: Database.Database,
  params: { cwd: string; user_prompt: string; sdk_session_id?: string }
): string {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO execution_history (id, cwd, user_prompt, sdk_session_id) VALUES (?, ?, ?, ?)`
  ).run(id, params.cwd, params.user_prompt, params.sdk_session_id ?? null);
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
