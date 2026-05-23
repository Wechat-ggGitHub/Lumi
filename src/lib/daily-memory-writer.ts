import fs from 'fs';
import path from 'path';
import { getProvider, resolveModel, buildAuthHeaders } from './provider-config';
import { getDailyMemoryDir, toLocalDate } from './daily-memory-reader';
import { log } from './logger';

const EVAL_PROMPT = `你是一个日记助手。根据用户和助手的对话，判断这次对话是否有值得作为事件记录的内容。

记录标准（仅记录事件/行动，不记录偏好和习惯）：
- 完成了具体任务或达成了某个结果 → 值得记录
- 发现了重要问题或 bug → 值得记录
- 有待跟进或未完成的事项 → 值得记录
- 做了关键的技术选择或架构决策 → 值得记录

不记录：
- 用户表达偏好或习惯 → 这是核心记忆的职责，不记录
- 纯执行无新信息 → 不记录
- 简单查询无后续影响 → 不记录
- 助手的推荐、观点或情绪 → 不记录

返回 JSON 格式：
{"shouldRecord": boolean, "title": "简短标题（10字以内）", "summary": "1-3个要点，每行以 - 开头"}

对话内容：
`;

interface EvalResult {
  shouldRecord: boolean;
  title: string;
  summary: string;
}

export function appendDailyMemory(lumiDir: string, date: string, time: string, title: string, summary: string): void {
  const dir = getDailyMemoryDir(lumiDir);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const filePath = path.join(dir, `${date}.md`);
  const entry = `## ${time} - ${title}\n${summary}\n`;

  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, `# ${date}\n\n${entry}`);
  } else {
    fs.appendFileSync(filePath, `\n${entry}`);
  }
}

export async function evaluateAndWriteDailyMemory(
  lumiDir: string,
  userMessage: string,
  assistantMessage: string,
  apiKey: string,
  providerKey: string,
): Promise<void> {
  try {
    const provider = getProvider(providerKey);
    const modelId = resolveModel(providerKey, 'haiku');

    const conversation = `用户: ${userMessage}\n\n助手: ${assistantMessage.slice(0, 2000)}`;
    const prompt = EVAL_PROMPT + conversation;

    const headers = buildAuthHeaders(provider, apiKey);

    const baseUrl = provider.baseUrl || 'https://api.anthropic.com';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    let response: Response;
    try {
      response = await fetch(`${baseUrl}/v1/messages`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: modelId,
          max_tokens: 512,
          messages: [{ role: 'user', content: prompt }],
        }),
        signal: controller.signal,
      });
    } catch {
      log.warn('每日记忆评估 API 请求失败');
      clearTimeout(timeout);
      return;
    }
    clearTimeout(timeout);

    if (!response.ok) {
      log.warn('每日记忆评估 API 调用失败:', response.status);
      return;
    }

    const data = await response.json() as any;
    const text = data.content?.[0]?.text;
    if (!text) {
      log.warn('每日记忆评估: API 返回空文本, response:', JSON.stringify(data).slice(0, 300));
      return;
    }

    let result: EvalResult;
    try {
      const jsonStr = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      result = JSON.parse(jsonStr);
    } catch {
      log.warn('每日记忆评估: JSON 解析失败:', text.slice(0, 300));
      return;
    }

    if (typeof result.shouldRecord !== 'boolean') {
      log.warn('每日记忆评估: shouldRecord 不是布尔值, text:', text.slice(0, 300));
      return;
    }

    if (!result.shouldRecord) {
      log.info('每日记忆评估: 无需记录');
      return;
    }

    const now = new Date();
    const dateStr = toLocalDate(now);
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    appendDailyMemory(lumiDir, dateStr, timeStr, result.title, result.summary);
    log.info('每日记忆已写入:', result.title);
  } catch (err) {
    log.error('每日记忆评估异常:', err);
  }
}
