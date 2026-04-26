import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { initDb, insertExecution, updateExecution, getRecentExecutions, getActiveExecution, getExecutionById, markAllUnviewedAsViewed } from '../lib/db';

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
  const baseTime = new Date('2026-01-01T00:00:00Z');
  for (let i = 0; i < 5; i++) {
    const id = insertExecution(db, {
      cwd: '/Users/test',
      user_prompt: `指令 ${i}`,
    });
    const time = new Date(baseTime.getTime() + i * 1000).toISOString();
    db.prepare(`UPDATE execution_history SET status = 'completed', created_at = ? WHERE id = ?`).run(time, id);
  }

  const recent = getRecentExecutions(db, 3);
  expect(recent.length).toBe(3);
  expect(recent[0].user_prompt).toBe('指令 4');
  expect(recent[2].user_prompt).toBe('指令 2');
});

test('getExecutionById returns correct record', () => {
  const id = insertExecution(db, {
    cwd: '/Users/test/project',
    user_prompt: '重构认证模块',
  });

  updateExecution(db, id, {
    status: 'completed',
    summary: '已将认证逻辑从 middleware 移至 service 层',
    duration_ms: 25000,
    num_turns: 5,
  });

  const record = getExecutionById(db, id);
  expect(record).not.toBeNull();
  expect(record!.id).toBe(id);
  expect(record!.user_prompt).toBe('重构认证模块');
  expect(record!.summary).toBe('已将认证逻辑从 middleware 移至 service 层');
  expect(record!.status).toBe('completed');
  expect(record!.duration_ms).toBe(25000);
});

test('getExecutionById returns null for non-existent id', () => {
  const record = getExecutionById(db, 'non-existent-uuid');
  expect(record).toBeNull();
});

test('markAllUnviewedAsViewed updates only completed/failed/cancelled and returns true when any rows updated', () => {
  const idRunning = insertExecution(db, { cwd: '/x', user_prompt: 'A' });
  // running 保持 viewed=0

  const idDone = insertExecution(db, { cwd: '/x', user_prompt: 'B' });
  updateExecution(db, idDone, { status: 'completed', summary: 's' });
  // viewed 默认 0

  const idFail = insertExecution(db, { cwd: '/x', user_prompt: 'C' });
  updateExecution(db, idFail, { status: 'failed' });

  const idAlreadyViewed = insertExecution(db, { cwd: '/x', user_prompt: 'D' });
  updateExecution(db, idAlreadyViewed, { status: 'completed', viewed: 1 });

  const result = markAllUnviewedAsViewed(db);
  expect(result).toBe(true);

  expect(getExecutionById(db, idRunning)!.viewed).toBe(0);     // running 不动
  expect(getExecutionById(db, idDone)!.viewed).toBe(1);        // 已被标
  expect(getExecutionById(db, idFail)!.viewed).toBe(1);        // 已被标
  expect(getExecutionById(db, idAlreadyViewed)!.viewed).toBe(1); // 原本就是 1
});

test('markAllUnviewedAsViewed returns false when nothing to mark', () => {
  const idRunning = insertExecution(db, { cwd: '/x', user_prompt: 'X' });
  // 数据库里只有 running 任务，没有未读已完成

  const result = markAllUnviewedAsViewed(db);
  expect(result).toBe(false);
});
