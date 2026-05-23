import os from 'os';
import path from 'path';
import type { SdkSubState, ConversationMessage, ToolCallRecord } from '../types';
import { buildSdkEnv } from './provider-config';
import { log } from './logger';

export interface ClaudeExecutionResult {
  summary: string;
  costUsd: number | null;
  durationMs: number | null;
  numTurns: number | null;
  sdkSessionId: string | null;
  status: 'completed' | 'failed' | 'cancelled';
  error?: string;
}

export interface ClaudeCallbacks {
  onSubState: (substate: SdkSubState, toolName?: string) => void;
  onError: (error: string) => void;
  onMessage?: (message: ConversationMessage) => void;
  onToolCall?: (toolCall: ToolCallRecord) => void;
}

export async function executeClaude(
  prompt: string,
  cwd: string,
  apiKey: string,
  providerKey: string,
  model: string,
  callbacks: ClaudeCallbacks,
  abortSignal?: AbortSignal,
  claudeExecutablePath?: string,
  resumeSessionId?: string,
  skillCatalog?: string,
): Promise<ClaudeExecutionResult> {
  log.info('Claude SDK: 开始执行, cwd:', cwd, 'provider:', providerKey, 'model:', model);
  if (claudeExecutablePath) {
    log.info('Claude SDK: 使用指定二进制路径:', claudeExecutablePath);
  }

  const { query } = await import('@anthropic-ai/claude-agent-sdk');
  log.info('Claude SDK: 模块加载成功');

  const abortController = new AbortController();

  if (abortSignal) {
    abortSignal.addEventListener('abort', () => abortController.abort());
  }

  const startTime = Date.now();
  const constrainedPrompt = `[输出约束：请使用纯文本回复，不要使用 Markdown 格式（不要用 #、**、- 列表、代码块等语法），直接用自然语言段落回答。]\n\n${prompt}`;

  const options: Record<string, unknown> = {
    cwd,
    permissionMode: 'bypassPermissions' as const,
    allowDangerouslySkipPermissions: true,
    abortController,
    env: buildSdkEnv(providerKey, apiKey, model),
    skills: [],
    systemPrompt: {
      type: 'preset',
      preset: 'claude_code',
      ...(skillCatalog ? { append: skillCatalog } : {}),
    },
    autoMemoryEnabled: false,
    autoDreamEnabled: false,
    ...(resumeSessionId ? { resume: resumeSessionId } : {}),
  };

  if (claudeExecutablePath) {
    options.pathToClaudeCodeExecutable = claudeExecutablePath;
  }

  let summary = '';
  let assistantContent = '';
  let costUsd: number | null = null;
  let durationMs: number | null = null;
  let numTurns: number | null = null;
  let sdkSessionId: string | null = null;
  let status: 'completed' | 'failed' | 'cancelled' = 'completed';
  let errorMsg: string | undefined;

  try {
    log.info('Claude SDK: 调用 query() 开始');
    for await (const message of query({ prompt: constrainedPrompt, options })) {
      if (abortController.signal.aborted) {
        log.info('Claude SDK: 执行被取消');
        status = 'cancelled';
        break;
      }

      switch (message.type) {
        case 'assistant':
          callbacks.onSubState('thinking');
          if ('session_id' in message && message.session_id) {
            sdkSessionId = message.session_id as string;
            log.info('Claude SDK: 获取 session_id:', sdkSessionId);
          }
          if ('content' in message && typeof message.content === 'string') {
            assistantContent += message.content;
          }
          if ('content' in message && Array.isArray(message.content)) {
            for (const block of message.content) {
              if (block.type === 'text') {
                assistantContent += block.text;
              }
            }
          }
          break;

        case 'tool_progress':
          callbacks.onSubState(
            'executing_tool',
            'tool_name' in message ? (message as any).tool_name : undefined
          );
          break;

        case 'tool_use_summary': {
          const toolMsg = message as any;
          const toolType = mapToolType(toolMsg.tool_name || toolMsg.name || 'other');
          const toolTarget = toolMsg.file_path || toolMsg.command || toolMsg.target || toolMsg.tool_name || '';
          const toolCall: ToolCallRecord = {
            type: toolType,
            target: toolTarget,
            status: toolMsg.error ? 'failed' : 'completed',
            detail: toolMsg.output || toolMsg.diff || toolMsg.error || undefined,
          };
          callbacks.onToolCall?.(toolCall);

          if (assistantContent.trim()) {
            callbacks.onMessage?.({ role: 'assistant', content: assistantContent.trim() });
            assistantContent = '';
          }
          callbacks.onMessage?.({ role: 'assistant', content: '', toolCalls: [toolCall] });
          break;
        }

        case 'system':
          if ('subtype' in message && message.subtype === 'status' && message.status === 'compacting') {
            log.info('Claude SDK: 正在压缩上下文');
            callbacks.onSubState('compacting');
          }
          break;

        case 'result':
          if (message.subtype === 'success') {
            const success = message as any;
            summary = success.result || '';
            costUsd = success.total_cost_usd;
            durationMs = success.duration_ms;
            numTurns = success.num_turns;
            sdkSessionId = success.session_id ?? sdkSessionId;
            log.info('Claude SDK: 执行成功, 耗时:', durationMs, 'ms, 轮数:', numTurns, '费用:', costUsd);
            if (summary) {
              callbacks.onMessage?.({ role: 'assistant', content: summary });
            }
          } else {
            const err = message as any;
            status = 'failed';
            errorMsg = err.errors?.[0] || 'Execution failed';
            durationMs = err.duration_ms;
            numTurns = err.num_turns;
            costUsd = err.total_cost_usd;
            sdkSessionId = err.session_id ?? sdkSessionId;
            log.error('Claude SDK: 执行失败, 错误:', errorMsg);
          }
          break;

        case 'rate_limit_event':
          log.warn('Claude SDK: 触发速率限制');
          callbacks.onSubState('rate_limited');
          break;

        case 'auth_status':
          if ('error' in message && message.error) {
            log.error('Claude SDK: 认证错误:', message.error);
            callbacks.onError(message.error as string);
          } else {
            log.info('Claude SDK: 认证中...');
            callbacks.onSubState('authenticating');
          }
          break;
      }
    }
  } catch (error) {
    if (abortController.signal.aborted) {
      status = 'cancelled';
    } else {
      status = 'failed';
      errorMsg = (error as Error).message;
      log.error('Claude SDK: 异常:', errorMsg);
      callbacks.onError(errorMsg);
    }
  }

  durationMs = durationMs ?? Date.now() - startTime;

  return { summary, costUsd, durationMs, numTurns, sdkSessionId, status, error: errorMsg };
}

function mapToolType(toolName: string): ToolCallRecord['type'] {
  if (toolName.includes('read') || toolName.includes('cat') || toolName.includes('head') || toolName.includes('tail')) return 'read_file';
  if (toolName.includes('edit') || toolName.includes('patch') || toolName.includes('sed')) return 'edit_file';
  if (toolName.includes('write') || toolName.includes('create')) return 'write_file';
  if (toolName.includes('bash') || toolName.includes('run') || toolName.includes('exec') || toolName.includes('command')) return 'run_command';
  return 'other';
}
