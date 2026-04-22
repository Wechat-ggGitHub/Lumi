import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import type { ExecutionRecord } from '@/types';

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
  completed_at DATETIME
);
CREATE INDEX IF NOT EXISTS idx_execution_history_created ON execution_history(created_at DESC);
`;

export function initDb(db: Database.Database): void {
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.exec(SCHEMA);
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
  updates: Partial<Pick<ExecutionRecord, 'status' | 'summary' | 'duration_ms' | 'num_turns' | 'cost_usd' | 'completed_at'>>
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
  return db.prepare(`SELECT * FROM execution_history WHERE status = 'running' ORDER BY created_at DESC LIMIT 1`).get() as ExecutionRecord | null;
}

export function getRecentExecutions(db: Database.Database, limit: number): ExecutionRecord[] {
  return db.prepare(`SELECT * FROM execution_history ORDER BY created_at DESC LIMIT ?`).all(limit) as ExecutionRecord[];
}

export function getExecutionById(db: Database.Database, id: string): ExecutionRecord | null {
  return db.prepare(`SELECT * FROM execution_history WHERE id = ?`).get(id) as ExecutionRecord | null;
}
