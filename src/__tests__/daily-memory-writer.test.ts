import fs from 'fs';
import path from 'path';
import { appendDailyMemory } from '../lib/daily-memory-writer';

const tmpDir = path.join(process.cwd(), '.tmp-test-writer');

beforeAll(() => {
  fs.mkdirSync(tmpDir, { recursive: true });
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true });
});

beforeEach(() => {
  const dailyDir = path.join(tmpDir, 'daily');
  if (fs.existsSync(dailyDir)) fs.rmSync(dailyDir, { recursive: true });
});

test('appendDailyMemory creates new file with header when file does not exist', () => {
  appendDailyMemory(tmpDir, '2026-05-06', '14:30', '修复登录 Bug', '- 发现 cookie 问题\n- 已修复');

  const content = fs.readFileSync(path.join(tmpDir, 'daily', '2026-05-06.md'), 'utf-8');
  expect(content).toContain('# 2026-05-06');
  expect(content).toContain('## 14:30 - 修复登录 Bug');
  expect(content).toContain('- 发现 cookie 问题');
});

test('appendDailyMemory appends to existing file', () => {
  const dailyDir = path.join(tmpDir, 'daily');
  fs.mkdirSync(dailyDir, { recursive: true });
  fs.writeFileSync(path.join(dailyDir, '2026-05-06.md'), '# 2026-05-06\n\n## 10:00 - 旧条目\n- old');

  appendDailyMemory(tmpDir, '2026-05-06', '16:00', '新功能', '- new stuff');

  const content = fs.readFileSync(path.join(dailyDir, '2026-05-06.md'), 'utf-8');
  expect(content).toContain('## 10:00 - 旧条目');
  expect(content).toContain('## 16:00 - 新功能');
  expect(content).toContain('- new stuff');
});

test('appendDailyMemory creates daily directory if missing', () => {
  appendDailyMemory(tmpDir, '2026-05-06', '09:00', 'First entry', '- content');

  expect(fs.existsSync(path.join(tmpDir, 'daily', '2026-05-06.md'))).toBe(true);
});
