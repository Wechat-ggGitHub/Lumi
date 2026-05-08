import fs from 'fs';
import path from 'path';
import { executeActions, CoreMemoryAction } from '../lib/core-memory-evaluator';

const tmpDir = path.join(process.cwd(), '.tmp-test-core-memory');
const memoriesDir = path.join(tmpDir, 'memories');

beforeAll(() => {
  fs.mkdirSync(tmpDir, { recursive: true });
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true });
});

beforeEach(() => {
  if (fs.existsSync(memoriesDir)) fs.rmSync(memoriesDir, { recursive: true });
});

test('executeActions creates a new memory file', () => {
  const actions: CoreMemoryAction[] = [
    { action: 'create', filename: 'food-preference.md', content: '用户喜欢吃辣，不吃香菜。' },
  ];

  executeActions(memoriesDir, actions);

  const content = fs.readFileSync(path.join(memoriesDir, 'food-preference.md'), 'utf-8');
  expect(content).toBe('用户喜欢吃辣，不吃香菜。');
});

test('executeActions updates existing memory file', () => {
  fs.mkdirSync(memoriesDir, { recursive: true });
  fs.writeFileSync(path.join(memoriesDir, 'food-preference.md'), '旧内容');

  const actions: CoreMemoryAction[] = [
    { action: 'update', filename: 'food-preference.md', content: '新内容' },
  ];

  executeActions(memoriesDir, actions);

  const content = fs.readFileSync(path.join(memoriesDir, 'food-preference.md'), 'utf-8');
  expect(content).toBe('新内容');
});

test('executeActions downgrades update to create when file missing', () => {
  const actions: CoreMemoryAction[] = [
    { action: 'update', filename: 'missing.md', content: '新建内容' },
  ];

  executeActions(memoriesDir, actions);

  const content = fs.readFileSync(path.join(memoriesDir, 'missing.md'), 'utf-8');
  expect(content).toBe('新建内容');
});

test('executeActions deletes existing file', () => {
  fs.mkdirSync(memoriesDir, { recursive: true });
  fs.writeFileSync(path.join(memoriesDir, 'old.md'), '过时信息');

  const actions: CoreMemoryAction[] = [
    { action: 'delete', filename: 'old.md' },
  ];

  executeActions(memoriesDir, actions);

  expect(fs.existsSync(path.join(memoriesDir, 'old.md'))).toBe(false);
});

test('executeActions skips delete when file missing', () => {
  const actions: CoreMemoryAction[] = [
    { action: 'delete', filename: 'nonexistent.md' },
  ];

  expect(() => executeActions(memoriesDir, actions)).not.toThrow();
});

test('executeActions skips path traversal attempts', () => {
  const actions: CoreMemoryAction[] = [
    { action: 'create', filename: '../etc/passwd', content: '恶意内容' },
  ];

  executeActions(memoriesDir, actions);

  expect(fs.existsSync(path.join(tmpDir, 'etc', 'passwd'))).toBe(false);
});

test('executeActions creates memoriesDir if missing', () => {
  const actions: CoreMemoryAction[] = [
    { action: 'create', filename: 'test.md', content: '内容' },
  ];

  expect(fs.existsSync(memoriesDir)).toBe(false);
  executeActions(memoriesDir, actions);
  expect(fs.existsSync(path.join(memoriesDir, 'test.md'))).toBe(true);
});
