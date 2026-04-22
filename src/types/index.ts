// 应用状态机
export type AppState =
  | 'idle'
  | 'recording'
  | 'transcribing'
  | 'editing'
  | 'sending'
  | 'executing'
  | 'error';

// SDK 执行子状态
export type SdkSubState =
  | 'thinking'
  | 'executing_tool'
  | 'compacting'
  | 'rate_limited'
  | 'authenticating'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | null;

// 状态小点颜色
export type DotColor = 'gray' | 'blue' | 'green' | 'red' | 'yellow';

// 执行记录
export interface ExecutionRecord {
  id: string;
  sdk_session_id: string | null;
  cwd: string;
  user_prompt: string;
  summary: string | null;
  cost_usd: number | null;
  duration_ms: number | null;
  num_turns: number | null;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  created_at: string;
  completed_at: string | null;
}

// 设置
export interface AppSettings {
  shortcut: string;
  voiceModel: string;
  claudePermissionMode: string;
  defaultCwd: string;
  vadTimeout: number;
  theme: string;
}

// IPC 消息类型
export interface IpcMessages {
  // voice-bar -> main
  'voice:send': { text: string };
  'voice:cancel': void;
  'voice:ready': void;

  // main -> voice-bar
  'voice:start-recording': void;
  'voice:stop-recording': void;
  'voice:transcript': { text: string; isAppending: boolean };
  'voice:transcribing': void;
  'voice:error': { message: string };

  // main -> summary-popup
  'summary:update': { execution: ExecutionRecord | null; history: ExecutionRecord[] };

  // main -> renderer (状态更新)
  'state:app-state': { state: AppState };
  'state:sdk-substate': { substate: SdkSubState; toolName?: string };

  // main -> renderer (Tray 点击)
  'tray:click': void;
}
