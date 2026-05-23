import path from 'path';
import { readRecentDailyMemories } from './daily-memory-reader';
import { readCoreMemoryFile, CORE_MEMORY_FILE } from './core-memory-evaluator';

const DELIVERY_INSTRUCTION = `## 结果交付方式
当你完成用户指令后，根据结果的复杂度选择交付方式：
- 如果结果是简短说明（如"已更新配置"、"创建完成"），直接用文字回复
- 如果结果较长或包含复杂内容（如代码修改总结、多步骤操作、详细分析），将完整内容整理成文件写入 ~/Desktop/ 目录，然后用一两句话告诉用户你做了什么以及文件位置`;

const DAILY_MEMORY_HINT = `## 每日记忆
每日记忆存储在 ~/.lumi/daily/ 目录，格式为 YYYY-MM-DD.md。当用户提及过去发生的事或询问之前讨论过的内容时，用 Read 工具读取对应日期的文件。`;

export function buildLumiContext(lumiDir: string, personaContent: string): string {
  const parts: string[] = [];

  if (personaContent.trim()) {
    parts.push(personaContent.trim());
  }

  parts.push(DELIVERY_INSTRUCTION);

  // 注入核心记忆
  const memoriesDir = path.join(lumiDir, 'memories');
  const coreMemoryContent = readCoreMemoryFile(memoriesDir).trim();
  if (coreMemoryContent) {
    parts.push(`\n## 核心记忆\n以下是你对用户的长期了解，始终以此为参考：\n${coreMemoryContent}`);
  }

  // 注入近 3 天的每日记忆
  const recentMemories = readRecentDailyMemories(lumiDir, 3);
  if (recentMemories.size > 0) {
    const memoryEntries = Array.from(recentMemories.entries())
      .map(([date, content]) => `### ${date}\n${content}`)
      .join('\n\n');
    parts.push(`\n## 近期动态\n以下是近 3 天的记忆摘要：\n${memoryEntries}`);
  }

  parts.push(DAILY_MEMORY_HINT);

  return parts.join('\n');
}
