import fs from 'fs';
import path from 'path';
import { getProvider, resolveModel } from './provider-config';
import { getDailyMemoryDir, toLocalDate } from './daily-memory-reader';
import { log } from './logger';

const EVAL_PROMPT = `你是一个日记助手。根据用户和助手的对话，判断这次对话是否有值得记录的内容。

记录标准：
- 用户表达了明确的偏好或决策 → 值得记录
- 发现了重要问题或 bug → 值得记录
- 有待跟进或未完成的事项 → 值得记录
- 学习了新技术方案或做了关键选择 → 值得记录
- 纯执行任务、无新信息 → 不记录
- 简单查询、无后续影响 → 不记录

返回 JSON 格式：
{"shouldRecord": boolean, "title": "简短标题（10字以内）", "summary": "1-3个要点，每行以 - 开头"}

对话内容：
`;

interface EvalResult {
  shouldRecord: boolean;
  title: string;
  summary: string;
}

export function appendDailyMemory(shrewDir: string, date: string, time: string, title: string, summary: string): void {
  const dir = getDailyMemoryDir(shrewDir);
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
  shrewDir: string,
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

    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'anthropic-version': '2023-06-01',
      ...(provider.authStyle === 'auth_token'
        ? { 'authorization': `Bearer ${apiKey}` }
        : { 'x-api-key': apiKey }),
    };

    const baseUrl = provider.baseUrl || 'https://api.anthropic.com';
    const response = await fetch(`${baseUrl}/v1/messages`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: modelId,
        max_tokens: 512,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      log.warn('每日记忆评估 API 调用失败:', response.status);
      return;
    }

    const data = await response.json() as any;
    const text = data.content?.[0]?.text;
    if (!text) return;

    let result: EvalResult;
    try {
      const jsonStr = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      result = JSON.parse(jsonStr);
    } catch {
      log.warn('每日记忆评估: JSON 解析失败:', text.slice(0, 200));
      return;
    }

    if (!result.shouldRecord) return;

    const now = new Date();
    const dateStr = toLocalDate(now);
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    appendDailyMemory(shrewDir, dateStr, timeStr, result.title, result.summary);
    log.info('每日记忆已写入:', result.title);
  } catch (err) {
    log.error('每日记忆评估异常:', err);
  }
}
