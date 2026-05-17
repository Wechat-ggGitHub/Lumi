import fs from 'fs';
import path from 'path';

export function toLocalDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function getDailyMemoryDir(lumiDir: string): string {
  return path.join(lumiDir, 'daily');
}

export function readDailyMemory(lumiDir: string, date: string): string | null {
  const filePath = path.join(getDailyMemoryDir(lumiDir), `${date}.md`);
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath, 'utf-8');
}

export function listDailyMemoryDates(lumiDir: string): string[] {
  const dir = getDailyMemoryDir(lumiDir);
  if (!fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir);
  const dates = files
    .filter(f => /^\d{4}-\d{2}-\d{2}\.md$/.test(f))
    .map(f => f.replace('.md', ''))
    .sort()
    .reverse();
  return dates;
}

export function readRecentDailyMemories(lumiDir: string, days: number): Map<string, string> {
  const result = new Map<string, string>();
  const today = new Date();
  for (let i = 0; i < days; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = toLocalDate(d);
    const content = readDailyMemory(lumiDir, dateStr);
    if (content) {
      result.set(dateStr, content);
    }
  }
  return result;
}
