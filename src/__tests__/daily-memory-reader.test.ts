import fs from 'fs';
import path from 'path';
import { readDailyMemory, listDailyMemoryDates, readRecentDailyMemories } from '../lib/daily-memory-reader';

const tmpDir = path.join(process.cwd(), '.tmp-test-daily');

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function dateStr(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

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

test('readDailyMemory returns null when file does not exist', () => {
  const result = readDailyMemory(tmpDir, todayStr());
  expect(result).toBeNull();
});

test('readDailyMemory returns file content when exists', () => {
  const dailyDir = path.join(tmpDir, 'daily');
  fs.mkdirSync(dailyDir, { recursive: true });
  const date = todayStr();
  fs.writeFileSync(path.join(dailyDir, `${date}.md`), `# ${date}\n\n## Test entry\n- some content`);

  const result = readDailyMemory(tmpDir, date);
  expect(result).toBe(`# ${date}\n\n## Test entry\n- some content`);
});

test('listDailyMemoryDates returns sorted dates descending', () => {
  const dailyDir = path.join(tmpDir, 'daily');
  fs.mkdirSync(dailyDir, { recursive: true });
  const d0 = dateStr(0);
  const d1 = dateStr(-1);
  const d2 = dateStr(-2);
  fs.writeFileSync(path.join(dailyDir, `${d2}.md`), `# ${d2}`);
  fs.writeFileSync(path.join(dailyDir, `${d0}.md`), `# ${d0}`);
  fs.writeFileSync(path.join(dailyDir, `${d1}.md`), `# ${d1}`);
  fs.writeFileSync(path.join(dailyDir, 'not-a-date.txt'), 'ignore');

  const dates = listDailyMemoryDates(tmpDir);
  expect(dates).toEqual([d0, d1, d2]);
});

test('readRecentDailyMemories returns recent N days', () => {
  const dailyDir = path.join(tmpDir, 'daily');
  fs.mkdirSync(dailyDir, { recursive: true });
  const d0 = dateStr(0);
  const d1 = dateStr(-1);
  const d2 = dateStr(-2);
  fs.writeFileSync(path.join(dailyDir, `${d2}.md`), 'day2');
  fs.writeFileSync(path.join(dailyDir, `${d1}.md`), 'day1');
  fs.writeFileSync(path.join(dailyDir, `${d0}.md`), 'day0');

  const result = readRecentDailyMemories(tmpDir, 2);
  expect(result.size).toBe(2);
  expect(result.get(d0)).toBe('day0');
  expect(result.get(d1)).toBe('day1');
});

test('readRecentDailyMemories skips missing days', () => {
  const dailyDir = path.join(tmpDir, 'daily');
  fs.mkdirSync(dailyDir, { recursive: true });
  const d0 = dateStr(0);
  fs.writeFileSync(path.join(dailyDir, `${d0}.md`), 'day0');

  const result = readRecentDailyMemories(tmpDir, 2);
  expect(result.size).toBe(1);
  expect(result.get(d0)).toBe('day0');
});
