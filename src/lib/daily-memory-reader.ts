import fs from 'fs';
import path from 'path';

export function toLocalDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function getDailyMemoryDir(aivaDir: string): string {
  return path.join(aivaDir, 'daily');
}

export function readDailyMemory(aivaDir: string, date: string): string | null {
  const filePath = path.join(getDailyMemoryDir(aivaDir), `${date}.md`);
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath, 'utf-8');
}

export function listDailyMemoryDates(aivaDir: string): string[] {
  const dir = getDailyMemoryDir(aivaDir);
  if (!fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir);
  const dates = files
    .filter(f => /^\d{4}-\d{2}-\d{2}\.md$/.test(f))
    .map(f => f.replace('.md', ''))
    .sort()
    .reverse();
  return dates;
}

export function readRecentDailyMemories(aivaDir: string, days: number): Map<string, string> {
  const result = new Map<string, string>();
  const today = new Date();
  for (let i = 0; i < days; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = toLocalDate(d);
    const content = readDailyMemory(aivaDir, dateStr);
    if (content) {
      result.set(dateStr, content);
    }
  }
  return result;
}
