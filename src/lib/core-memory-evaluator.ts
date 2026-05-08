import fs from 'fs';
import os from 'os';
import path from 'path';
import { log } from './logger';
import { getProvider, resolveModel } from './provider-config';

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

const EVAL_PROMPT = `你是一个用户画像记忆管理器。根据对话内容判断是否需要更新用户的核心记忆。

核心记忆存储关于用户的持久信息，而非事件记录。

值得记忆的：
- 用户偏好（语言、风格、习惯、喜好）
- 个人背景（职业、家庭、项目、工具链）
- 持久性决策（"以后都用中文回复"、"不要自动..."）
- 对已有信息的修正或补充

不值得记忆的：
- 一次性任务、临时问答
- 具体事件经过（那是每日记忆的职责）
- 重复已有记忆的信息

`;

const EXISTING_MEMORIES_HEADER = '\n现有核心记忆：\n';
const EXISTING_MEMORIES_EMPTY = '暂无现有记忆。\n';

const INSTRUCTION = `\n根据对话，输出纯 JSON（不要 markdown 代码块）：
{"actions": [{"action": "create"|"update"|"delete"|"none", "filename": "英文短名.md", "reason": "简述原因", "content": "记忆内容（仅 create/update 需要）"}]}

如果无需变更，actions 为空数组。
filename 使用英文小写+连字符，如 work-style.md、food-preference.md。
content 写成一段自然文字，不要用列表格式。
update 时必须与现有 filename 匹配。

对话内容：
`;

function readExistingMemories(memoriesDir: string): string {
  if (!fs.existsSync(memoriesDir)) return EXISTING_MEMORIES_EMPTY;

  const files = fs.readdirSync(memoriesDir)
    .filter(f => f.endsWith('.md') && f !== 'MEMORY.md');

  if (files.length === 0) return EXISTING_MEMORIES_EMPTY;

  const parts = files.map(f => {
    const content = fs.readFileSync(path.join(memoriesDir, f), 'utf-8');
    const preview = content.length > 200 ? content.slice(0, 200) + '...' : content;
    return `### ${f}\n${preview}`;
  });

  return EXISTING_MEMORIES_HEADER + parts.join('\n\n');
}

export async function evaluateAndWriteCoreMemory(
  shrewDir: string,
  userMessage: string,
  assistantMessage: string,
  apiKey: string,
  providerKey: string,
): Promise<void> {
  try {
    const provider = getProvider(providerKey);
    const modelId = resolveModel(providerKey, 'haiku');

    const memoriesDir = path.resolve(path.join(os.homedir(), '.shrew', 'memories'));
    const existingMemories = readExistingMemories(memoriesDir);

    const conversation = `用户: ${userMessage}\n\n助手: ${assistantMessage.slice(0, 2000)}`;
    const prompt = EVAL_PROMPT + existingMemories + INSTRUCTION + conversation;

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
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      log.warn('核心记忆评估 API 调用失败:', response.status);
      return;
    }

    const data = await response.json() as any;
    const text = data.content?.[0]?.text;
    if (!text) return;

    let actions: CoreMemoryAction[];
    try {
      const jsonStr = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const parsed = JSON.parse(jsonStr);
      actions = Array.isArray(parsed?.actions) ? parsed.actions : [];
    } catch {
      log.warn('核心记忆评估: JSON 解析失败:', text.slice(0, 200));
      return;
    }

    if (actions.length === 0) return;

    executeActions(memoriesDir, actions);
    log.info('核心记忆评估完成, 执行了', actions.length, '个操作');
  } catch (err) {
    log.error('核心记忆评估异常:', err);
  }
}
