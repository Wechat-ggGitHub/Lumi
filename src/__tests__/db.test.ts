import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { initDb, insertExecution, updateExecution, getRecentExecutions, getActiveExecution } from '../lib/db';

// 使用临时数据库
const tmpDir = path.join(process.cwd(), '.tmp-test');
let db: Database.Database;

beforeAll(() => {
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
});

afterAll(() => {
  if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true });
});

beforeEach(() => {
  const dbPath = path.join(tmpDir, `test-${Date.now()}.db`);
  db = new Database(dbPath);
  initDb(db);
});

afterEach(() => {
  db.close();
});

test('insertExecution creates a running execution', () => {
  const id = insertExecution(db, {
    cwd: '/Users/test/project',
    user_prompt: '创建一个 React 项目',
  });
  expect(id).toBeTruthy();

  const active = getActiveExecution(db);
  expect(active).not.toBeNull();
  expect(active!.user_prompt).toBe('创建一个 React 项目');
  expect(active!.status).toBe('running');
});

test('updateExecution marks completion', () => {
  const id = insertExecution(db, {
    cwd: '/Users/test/project',
    user_prompt: '修复 bug',
  });

  updateExecution(db, id, {
    status: 'completed',
    summary: '已修复登录页面的空指针异常',
    duration_ms: 15000,
    num_turns: 3,
    cost_usd: 0.05,
  });

  const active = getActiveExecution(db);
  expect(active).toBeNull();

  const recent = getRecentExecutions(db, 5);
  expect(recent.length).toBe(1);
  expect(recent[0].status).toBe('completed');
  expect(recent[0].summary).toBe('已修复登录页面的空指针异常');
});

test('getRecentExecutions returns ordered by created_at desc', () => {
  for (let i = 0; i < 5; i++) {
    const id = insertExecution(db, {
      cwd: '/Users/test',
      user_prompt: `指令 ${i}`,
    });
    updateExecution(db, id, { status: 'completed', completed_at: new Date().toISOString() });
  }

  const recent = getRecentExecutions(db, 3);
  expect(recent.length).toBe(3);
  expect(new Date(recent[0].created_at) > new Date(recent[2].created_at)).toBe(true);
});
