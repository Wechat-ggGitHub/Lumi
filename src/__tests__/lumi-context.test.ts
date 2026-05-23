import fs from 'fs';
import path from 'path';
import { buildLumiContext } from '../lib/lumi-context';
import { toLocalDate } from '../lib/daily-memory-reader';

const tmpDir = path.join(process.cwd(), '.tmp-test-lumi-context');
const memoriesDir = path.join(tmpDir, 'memories');
const dailyDir = path.join(tmpDir, 'daily');

beforeAll(() => {
  fs.mkdirSync(tmpDir, { recursive: true });
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true });
});

beforeEach(() => {
  if (fs.existsSync(memoriesDir)) fs.rmSync(memoriesDir, { recursive: true });
  if (fs.existsSync(dailyDir)) fs.rmSync(dailyDir, { recursive: true });
});

test('buildLumiContext includes core memory when core-memory.md exists', () => {
  fs.mkdirSync(memoriesDir, { recursive: true });
  fs.writeFileSync(path.join(memoriesDir, 'core-memory.md'), '# 核心记忆\n## 用户画像\n测试用户');

  const result = buildLumiContext(tmpDir, 'Persona 内容');

  expect(result).toContain('核心记忆');
  expect(result).toContain('测试用户');
});

test('buildLumiContext excludes core memory section when file absent', () => {
  const result = buildLumiContext(tmpDir, 'Persona 内容');

  expect(result).not.toContain('你对用户的长期了解');
});

test('buildLumiContext includes up to 3 days of daily memory', () => {
  fs.mkdirSync(dailyDir, { recursive: true });

  const today = new Date();
  for (let i = 0; i < 4; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = toLocalDate(d);
    fs.writeFileSync(path.join(dailyDir, `${dateStr}.md`), `第${i}天内容`);
  }

  const result = buildLumiContext(tmpDir, 'Persona');

  expect(result).toContain('第0天内容');
  expect(result).toContain('第1天内容');
  expect(result).toContain('第2天内容');
  expect(result).not.toContain('第3天内容');
});

test('buildLumiContext handles missing daily memories gracefully', () => {
  const result = buildLumiContext(tmpDir, 'Persona');

  expect(result).not.toContain('近期动态');
  expect(result).toContain('每日记忆');
});
