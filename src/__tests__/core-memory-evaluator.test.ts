import fs from 'fs';
import path from 'path';
import { writeCoreMemory, readCoreMemoryFile } from '../lib/core-memory-evaluator';

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

test('writeCoreMemory creates core-memory.md', () => {
  writeCoreMemory(memoriesDir, '# 核心记忆\n## 用户画像\n测试内容');

  const content = fs.readFileSync(path.join(memoriesDir, 'core-memory.md'), 'utf-8');
  expect(content).toBe('# 核心记忆\n## 用户画像\n测试内容');
});

test('writeCoreMemory overwrites existing content', () => {
  fs.mkdirSync(memoriesDir, { recursive: true });
  fs.writeFileSync(path.join(memoriesDir, 'core-memory.md'), '旧内容');

  writeCoreMemory(memoriesDir, '新内容');

  const content = fs.readFileSync(path.join(memoriesDir, 'core-memory.md'), 'utf-8');
  expect(content).toBe('新内容');
});

test('writeCoreMemory creates memoriesDir if missing', () => {
  expect(fs.existsSync(memoriesDir)).toBe(false);

  writeCoreMemory(memoriesDir, '内容');

  expect(fs.existsSync(path.join(memoriesDir, 'core-memory.md'))).toBe(true);
});

test('readCoreMemoryFile returns empty string when file missing', () => {
  const result = readCoreMemoryFile(memoriesDir);
  expect(result).toBe('');
});

test('readCoreMemoryFile returns file content', () => {
  fs.mkdirSync(memoriesDir, { recursive: true });
  fs.writeFileSync(path.join(memoriesDir, 'core-memory.md'), '已有内容');

  const result = readCoreMemoryFile(memoriesDir);
  expect(result).toBe('已有内容');
});
