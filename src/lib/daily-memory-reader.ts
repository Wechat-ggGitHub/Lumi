import fs from 'fs';
import path from 'path';

export function toLocalDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function getDailyMemoryDir(shrewDir: string): string {
  return path.join(shrewDir, 'daily');
}

export function readDailyMemory(shrewDir: string, date: string): string | null {
  const filePath = path.join(getDailyMemoryDir(shrewDir), `${date}.md`);
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath, 'utf-8');
}

export function listDailyMemoryDates(shrewDir: string): string[] {
  const dir = getDailyMemoryDir(shrewDir);
  if (!fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir);
  const dates = files
    .filter(f => /^\d{4}-\d{2}-\d{2}\.md$/.test(f))
    .map(f => f.replace('.md', ''))
    .sort()
    .reverse();
  return dates;
}

export function readRecentDailyMemories(shrewDir: string, days: number): Map<string, string> {
  const result = new Map<string, string>();
  const today = new Date();
  for (let i = 0; i < days; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = toLocalDate(d);
    const content = readDailyMemory(shrewDir, dateStr);
    if (content) {
      result.set(dateStr, content);
    }
  }
  return result;
}
