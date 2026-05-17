import fs from 'fs';
import path from 'path';

let _logDir: string | null = null;

export function initLogger(dir: string): void {
  _logDir = dir;
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function localDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function currentLogFile(): string {
  return path.join(_logDir!, `lumi-${localDateStr(new Date())}.log`);
}

function timestamp(): string {
  const d = new Date();
  return d.toTimeString().slice(0, 8);
}

function serialize(arg: unknown): string {
  if (arg instanceof Error) return `${arg.message}\n${arg.stack}`;
  if (typeof arg === 'string') return arg;
  if (typeof arg === 'number' || typeof arg === 'boolean') return String(arg);
  try {
    return JSON.stringify(arg);
  } catch {
    return String(arg);
  }
}

function write(level: string, ...args: unknown[]): void {
  const msg = args.map(serialize).join(' ');
  const line = `[${timestamp()}] [${level}] ${msg}\n`;
  try {
    if (_logDir) {
      fs.appendFileSync(currentLogFile(), line);
    }
  } catch {}
  if (level === 'ERROR') console.error(line.trimEnd());
  else if (level === 'WARN') console.warn(line.trimEnd());
  else console.log(line.trimEnd());
}

export const log = {
  info: (...args: unknown[]) => write('INFO', ...args),
  warn: (...args: unknown[]) => write('WARN', ...args),
  error: (...args: unknown[]) => write('ERROR', ...args),
  debug: (...args: unknown[]) => write('DEBUG', ...args),
  get logPath(): string { return _logDir ? currentLogFile() : ''; },
  get logDir(): string { return _logDir || ''; },
};
