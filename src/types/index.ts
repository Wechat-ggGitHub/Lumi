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
export type DotColor = 'gray' | 'blue' | 'green' | 'red' | 'yellow' | 'purple';

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
  messages: string | null; // JSON string of ConversationMessage[]
  title: string | null;
  viewed: number;
}

// 对话消息
export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: ToolCallRecord[];
}

// 工具调用记录
export interface ToolCallRecord {
  type: 'read_file' | 'edit_file' | 'write_file' | 'run_command' | 'other';
  target: string;
  status: 'completed' | 'failed';
  detail?: string;
}

// 设置
export type ProviderKey = 'glm-cn' | 'glm-global' | 'anthropic';
export type ModelPreset = 'opus' | 'sonnet' | 'haiku';

export interface AppSettings {
  shortcut: string;
  voiceModel: string;
  claudePermissionMode: string;
  defaultCwd: string;
  vadTimeout: number;
  theme: string;
  provider?: ProviderKey;
  modelPreset?: ModelPreset;
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

  // voice-bar <-> main (audio capture)
  'voice:start-capture': void;
  'voice:stop-capture': void;
  'voice:capture-started': boolean;
  'voice:audio-data': { samples: Float32Array; sampleRate: number };

  // detail window: main -> renderer
  'detail:show': void;
  'detail:history-list': {
    records: ExecutionRecord[];
    appState: AppState;
    sdkSubState: SdkSubState;
    currentToolName?: string;
  };
  'detail:conversation-data': { record: ExecutionRecord | null };
  'detail:stream-chunk': { id: string; content: string; done: boolean };
  'detail:tool-call': { id: string; toolCall: ToolCallRecord };
  'detail:execution-complete': { record: ExecutionRecord };

  // detail window: renderer -> main
  'detail:ready': void;
  'detail:select': { id: string };
  'detail:mark-viewed': { id: string };
  'detail:send-message': { id: string; text: string };

  // main -> renderer (状态更新)
  'state:app-state': { state: AppState };
  'state:sdk-substate': { substate: SdkSubState; toolName?: string };

  // main -> renderer (Tray 点击)
  'tray:click': void;
}
