import type { SdkSubState } from '../types';

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
}

export async function executeClaude(
  prompt: string,
  cwd: string,
  apiKey: string,
  callbacks: ClaudeCallbacks,
  abortSignal?: AbortSignal
): Promise<ClaudeExecutionResult> {
  // Dynamic import to handle SDK availability
  const { query } = await import('@anthropic-ai/claude-agent-sdk');

  const abortController = new AbortController();

  if (abortSignal) {
    abortSignal.addEventListener('abort', () => abortController.abort());
  }

  const startTime = Date.now();

  const options = {
    cwd,
    permissionMode: 'bypassPermissions' as const,
    allowDangerouslySkipPermissions: true,
    abortController,
    env: { ANTHROPIC_API_KEY: apiKey },
  };

  let summary = '';
  let costUsd: number | null = null;
  let durationMs: number | null = null;
  let numTurns: number | null = null;
  let sdkSessionId: string | null = null;
  let status: 'completed' | 'failed' | 'cancelled' = 'completed';
  let errorMsg: string | undefined;

  try {
    for await (const message of query({ prompt, options })) {
      if (abortController.signal.aborted) {
        status = 'cancelled';
        break;
      }

      switch (message.type) {
        case 'assistant':
          callbacks.onSubState('thinking');
          if ('session_id' in message && message.session_id) {
            sdkSessionId = message.session_id as string;
          }
          break;

        case 'tool_progress':
          callbacks.onSubState(
            'executing_tool',
            'tool_name' in message ? (message as any).tool_name : undefined
          );
          break;

        case 'tool_use_summary':
          break;

        case 'system':
          if ('subtype' in message && message.subtype === 'status' && message.status === 'compacting') {
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
          } else {
            const err = message as any;
            status = 'failed';
            errorMsg = err.errors?.[0] || 'Execution failed';
            durationMs = err.duration_ms;
            numTurns = err.num_turns;
            costUsd = err.total_cost_usd;
            sdkSessionId = err.session_id ?? sdkSessionId;
          }
          break;

        case 'rate_limit_event':
          callbacks.onSubState('rate_limited');
          break;

        case 'auth_status':
          if ('error' in message && message.error) {
            callbacks.onError(message.error as string);
          } else {
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
      callbacks.onError(errorMsg);
    }
  }

  durationMs = durationMs ?? Date.now() - startTime;

  return { summary, costUsd, durationMs, numTurns, sdkSessionId, status, error: errorMsg };
}
