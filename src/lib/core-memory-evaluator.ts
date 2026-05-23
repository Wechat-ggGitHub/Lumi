import fs from 'fs';
import path from 'path';
import { log } from './logger';
import { getProvider, resolveModel, buildAuthHeaders } from './provider-config';

export const CORE_MEMORY_FILE = 'core-memory.md';

const SECTION_TEMPLATE = `# 核心记忆

## 用户画像
<!-- 基本身份：职业、所在地、家庭状况等长期不变的背景 -->

## 偏好与习惯
<!-- 明确表达过的喜好：语言、风格、工具、工作流偏好 -->

## 项目与工作
<!-- 当前进行中的项目、常用技术栈、工作上下文 -->

## 持久决策
<!-- 用户做出的长期指令，如"以后都用中文回复"、"不要自动..." -->
`;

export function readCoreMemoryFile(memoriesDir: string): string {
  const filePath = path.join(memoriesDir, CORE_MEMORY_FILE);
  if (!fs.existsSync(filePath)) return '';
  return fs.readFileSync(filePath, 'utf-8');
}

export function writeCoreMemory(memoriesDir: string, content: string): void {
  const resolved = path.resolve(memoriesDir);
  if (!fs.existsSync(resolved)) {
    fs.mkdirSync(resolved, { recursive: true });
  }
  fs.writeFileSync(path.join(resolved, CORE_MEMORY_FILE), content);
  log.info('核心记忆已更新');
}

const EVAL_PROMPT = `你是一个用户画像记忆管理器。你的职责是维护一份关于用户的长期核心记忆文件。

## 判断标准（最重要）

核心记忆只记录**持久性事实**——应用"一个月测试"：这条信息在一个月后仍然成立吗？
- 成立 → 属于核心记忆
- 不成立（是一次性事件、临时状态）→ 属于每日记忆，不记录

## 应该记录的

1. **用户画像**：职业、所在地、家庭状况、教育背景等长期身份信息
2. **偏好与习惯**：用户明确说过的喜好（如"我喜欢简洁的回复"、"用中文"）、常用工具、工作流偏好
3. **项目与工作**：当前参与的项目、常用技术栈、团队角色、工作上下文
4. **持久决策**：用户做出的长期指令（如"以后都用 TypeScript"、"不要自动..."）
5. **信息修正**：用户纠正了之前的记忆内容（如"我换工作了，现在在..."）

## 不应该记录的

1. **一次性任务和临时问答**：如"帮我写个脚本"、"今天天气怎样"
2. **具体事件经过**：如"今天修了一个 bug"、"讨论了架构方案" → 这是每日记忆
3. **助手的内容**：助手推荐的工具、给出的建议、表达的观点都不是用户信息
4. **重复已有记忆**：信息已经记录过就不要重复
5. **情绪和氛围**：如"用户今天很开心" → 不记录
6. **猜测和推断**：只记录用户明确说过的，不推断

## 输出格式

返回纯 JSON（不要 markdown 代码块）：
{"should_update": boolean, "updated_content": "完整的更新后文件内容", "changes_summary": "简要说明改了什么"}

如果无需变更，返回：{"should_update": false}

updated_content 必须保持原有的 ## 标题结构，只在内容部分修改。不要删除空的章节标题。

`;

const REQUIRED_SECTIONS = ['## 用户画像', '## 偏好与习惯', '## 项目与工作', '## 持久决策'];

const CONVERSATION_HEADER = '\n对话内容：\n';

export async function evaluateAndWriteCoreMemory(
  lumiDir: string,
  userMessage: string,
  assistantMessage: string,
  apiKey: string,
  providerKey: string,
): Promise<void> {
  try {
    const provider = getProvider(providerKey);
    const modelId = resolveModel(providerKey, 'haiku');

    const memoriesDir = path.resolve(path.join(lumiDir, 'memories'));
    const existingContent = readCoreMemoryFile(memoriesDir);
    const displayContent = existingContent || SECTION_TEMPLATE;

    const conversation = `用户: ${userMessage}\n\n助手: ${assistantMessage.slice(0, 2000)}`;
    const prompt = EVAL_PROMPT
      + '\n## 当前核心记忆内容\n'
      + displayContent
      + CONVERSATION_HEADER
      + conversation;

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
          max_tokens: 2048,
          messages: [{ role: 'user', content: prompt }],
        }),
        signal: controller.signal,
      });
    } catch {
      log.warn('核心记忆评估 API 请求失败');
      clearTimeout(timeout);
      return;
    }
    clearTimeout(timeout);

    if (!response.ok) {
      log.warn('核心记忆评估 API 调用失败:', response.status);
      return;
    }

    const data = await response.json() as any;
    const text = data.content?.[0]?.text;
    if (!text) {
      log.warn('核心记忆评估: API 返回空文本, response:', JSON.stringify(data).slice(0, 300));
      return;
    }

    let result: { should_update: boolean; updated_content?: string; changes_summary?: string };
    try {
      const jsonStr = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      result = JSON.parse(jsonStr);
    } catch {
      log.warn('核心记忆评估: JSON 解析失败:', text.slice(0, 300));
      return;
    }

    if (!result.should_update || !result.updated_content) {
      log.info('核心记忆评估: 无需变更');
      return;
    }

    const missing = REQUIRED_SECTIONS.filter(s => !result.updated_content!.includes(s));
    if (missing.length > 0) {
      log.warn('核心记忆评估: 返回内容缺少章节:', missing.join(', '));
      return;
    }

    writeCoreMemory(memoriesDir, result.updated_content);
    log.info('核心记忆评估完成:', result.changes_summary || '已更新');
  } catch (err) {
    log.error('核心记忆评估异常:', err);
  }
}
