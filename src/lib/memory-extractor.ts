import Database from 'better-sqlite3';
import { getProvider, resolveModel } from './provider-config';
import { addMemory, listMemories } from './db';
import { getActiveMemories, writeShrewClaudeMd, buildShrewContext } from './shrew-context';
import { getPersona } from './db';
import { log } from './logger';

const EXTRACTION_PROMPT = `你是一个记忆提取助手。根据用户和助手的对话，提取值得长期记住的信息。

提取规则：
1. 只提取关于用户的偏好、习惯、项目背景、约束、事实
2. 忽略一次性的指令和临时需求
3. 每条记忆应该简短（一句话）
4. 按类型分类：偏好、习惯、项目背景、约束、事实、其他

返回 JSON 格式：
{"memories": [{"type": "偏好", "content": "..."}, ...]}

如果没有值得提取的信息，返回：{"memories": []}

对话内容：
`;

interface ExtractionResult {
  memories: Array<{ type: string; content: string }>;
}

export async function extractMemories(
  db: Database.Database,
  userMessage: string,
  assistantMessage: string,
  apiKey: string,
  providerKey: string,
  executionId: string,
): Promise<void> {
  try {
    const provider = getProvider(providerKey);
    const modelId = resolveModel(providerKey, 'haiku');

    const conversation = `用户: ${userMessage}\n\n助手: ${assistantMessage}`;
    const prompt = EXTRACTION_PROMPT + conversation;

    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'anthropic-version': '2023-06-01',
    };
    if (provider.authStyle === 'auth_token') {
      headers['x-api-key'] = apiKey;
    } else {
      headers['x-api-key'] = apiKey;
    }

    const baseUrl = provider.baseUrl || 'https://api.anthropic.com';
    const response = await fetch(`${baseUrl}/v1/messages`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: modelId,
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      log.warn('Memory 提炼 API 调用失败:', response.status);
      return;
    }

    const data = await response.json() as any;
    const text = data.content?.[0]?.text;
    if (!text) return;

    let result: ExtractionResult;
    try {
      // 尝试解析 JSON，可能被包在 markdown 代码块中
      const jsonStr = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      result = JSON.parse(jsonStr);
    } catch {
      log.warn('Memory 提炼: JSON 解析失败:', text.slice(0, 200));
      return;
    }

    if (!result.memories || result.memories.length === 0) return;

    // 去重：与现有 memory 对比
    const existing = listMemories(db).map(m => m.content);
    const newMemories = result.memories.filter(m => {
      // 简单去重：检查是否有内容高度相似的已有记忆
      return !existing.some(e => similarity(e, m.content) > 0.7);
    });

    if (newMemories.length === 0) return;

    for (const memory of newMemories) {
      addMemory(db, {
        type: memory.type,
        content: memory.content,
        source: '自动提炼',
        executionId,
      });
    }

    log.info(`Memory 提炼完成: 新增 ${newMemories.length} 条记忆`);

    // 更新 claude.md 备份
    const persona = getPersona(db);
    const allMemories = getActiveMemories(db);
    const context = buildShrewContext(persona, allMemories);
    const userDataDir = (db.prepare('PRAGMA database_list').get() as any)?.file?.replace('/shrew.db', '') || '';
    if (userDataDir) {
      writeShrewClaudeMd(userDataDir, context);
    }
  } catch (err) {
    log.error('Memory 提炼异常:', err);
  }
}

function similarity(a: string, b: string): number {
  const aLower = a.toLowerCase();
  const bLower = b.toLowerCase();
  if (aLower === bLower) return 1;

  // 简单的词重叠率
  const aWords = new Set(aLower.split(/\s+/));
  const bWords = new Set(bLower.split(/\s+/));
  const intersection = [...aWords].filter(w => bWords.has(w)).length;
  const union = new Set([...aWords, ...bWords]).size;
  return union === 0 ? 0 : intersection / union;
}
