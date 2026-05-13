// 应用状态机
export type AppState =
  | 'idle'
  | 'recording'
  | 'transcribing'
  | 'thinking'
  | 'executing'
  | 'completed'
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
  segment_id: string | null;
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
export type ProviderKey = string;
export type ModelPreset = 'opus' | 'sonnet' | 'haiku';

export interface AppSettings {
  shortcut: string;
  voiceModel: string;
  claudePermissionMode: string;
  defaultCwd: string;
  vadTimeout: number;
  wakeWordEnabled?: boolean;
  wakeWordSilenceTimeout?: number; // seconds, default 3
  theme: string;
  provider?: ProviderKey;
  modelPreset?: ModelPreset;
  disabledSkills?: string[];
  asrProvider?: string;
  ttsProvider?: string;
}

// 上下文段
export interface ContextSegment {
  id: string;
  sdk_session_id: string | null;
  created_at: string;
  ended_at: string | null;
}

// 聊天消息
export interface ChatMessage {
  id: string;
  segment_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  metadata: string | null;
  execution_id: string | null;
  created_at: string;
}

// 分身设定
export interface Persona {
  id: number;
  name: string;
  avatar: string | null;
  updated_at: string;
}

// MCP 服务配置
export interface McpServerConfig {
  id: string;
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  enabled: boolean;
}

// IPC 消息类型
export interface IpcMessages {
  // voice-bar -> main
  'voice:cancel': void;

  // main -> voice-bar
  'voice:state': {
    state: 'recording' | 'transcribing' | 'too-short' | 'error' | 'hidden';
    message?: string;
  };
  'voice:volume': { volume: number };

  // chat window: renderer -> main
  'chat:ready': void;
  'chat:send-message': { text: string };
  'chat:clear': void;

  // chat window: main -> renderer
  'chat:history': { messages: ChatMessage[]; segmentId: string };
  'chat:stream-chunk': { messageId: string; content: string; done: boolean };
  'chat:execution-complete': { executionId: string };
  'chat:state-update': { appState: AppState; sdkSubState: SdkSubState; currentToolName?: string };

  // detail window: main -> renderer (deprecated, keeping for reference)
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

  // detail window: renderer -> main (deprecated)
  'detail:ready': void;
  'detail:select': { id: string };
  'detail:mark-viewed': { id: string };
  'detail:send-message': { id: string; text: string };

  // main -> renderer (状态更新)
  'state:app-state': { state: AppState };
  'state:sdk-substate': { substate: SdkSubState; toolName?: string };

  // main -> renderer (Tray 点击)
  'tray:click': void;

  // persona: invoke (request-response)
  'persona:load': void;
  'persona:save': { name: string; content: string };
  'persona:avatar:select': void;
  'persona:avatar:save': { dataUrl: string };
  'persona:avatar:remove': void;

  // main -> renderer (persona auto-updated)
  'persona:updated': void;

  // skills: invoke
  'skills:list': void;
  'skills:import': void;
  'skills:toggle': { name: string; enabled: boolean };
  'skills:delete': { name: string };
  'skills:read': { name: string };

  // services: invoke
  'services:list': void;
  'services:add': Omit<McpServerConfig, 'id'>;
  'services:update': { id: string } & Partial<Omit<McpServerConfig, 'id'>>;
  'services:remove': { id: string };
  'services:test': { id: string };

  // memory: invoke
  'memory:list-core': void;
  'memory:update-core': { filename: string; content: string };
  'memory:delete-core': { filename: string };
  'memory:list-daily': void;
  'memory:read-daily': { date: string };

  // wake word: invoke (request-response)
  'wake-word:toggle': { enabled: boolean };
  'wake-word:status': void;
  'wake-word:update-keyword': { keyword: string };

  // audio-listener: fire-and-forget
  'audio-listener:pcm-chunk': Float32Array;
  'audio-listener:start': void;
  'audio-listener:stop': void;
  'audio-listener:started': void;
  'audio-listener:error': string;
}
