import fs from 'fs';
import path from 'path';
import { log } from './logger';

export interface CoreMemoryAction {
  action: 'create' | 'update' | 'delete' | 'none';
  filename: string;
  reason?: string;
  content?: string;
}

export function executeActions(memoriesDir: string, actions: CoreMemoryAction[]): void {
  const resolved = path.resolve(memoriesDir);
  if (!fs.existsSync(resolved)) {
    fs.mkdirSync(resolved, { recursive: true });
  }

  for (const act of actions) {
    if (act.action === 'none' || !act.filename) continue;

    const targetPath = path.resolve(resolved, act.filename);
    if (!targetPath.startsWith(resolved + path.sep) && targetPath !== resolved) continue;

    switch (act.action) {
      case 'create':
        fs.writeFileSync(targetPath, act.content ?? '');
        log.info('核心记忆: 创建', act.filename, '-', act.reason);
        break;
      case 'update':
        fs.writeFileSync(targetPath, act.content ?? '');
        log.info('核心记忆: 更新', act.filename, '-', act.reason);
        break;
      case 'delete':
        if (fs.existsSync(targetPath)) {
          fs.unlinkSync(targetPath);
          log.info('核心记忆: 删除', act.filename, '-', act.reason);
        }
        break;
    }
  }
}
