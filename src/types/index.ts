// 应用状态机
export type AppState =
  | 'idle'
  | 'recording'
  | 'transcribing'
  | 'editing'
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
  bio: string | null;
  personality: string;
  tone: string;
  detail_level: string;
  clarify_pref: string;
  work_style: string;
  system_prompt: string | null;
  updated_at: string;
}

// 技能配置
export interface SkillConfig {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  params?: Record<string, string>;
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

// 记忆条目
export interface MemoryItem {
  id: string;
  type: string;
  content: string;
  source: string;
  status: string;
  pinned: number;
  execution_id: string | null;
  created_at: string;
  updated_at: string;
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
  'persona:save': Partial<Omit<Persona, 'id' | 'updated_at'>>;

  // skills: invoke
  'skills:list': void;
  'skills:toggle': { id: string; enabled: boolean };
  'skills:configure': { id: string; params: Record<string, string> };

  // services: invoke
  'services:list': void;
  'services:add': Omit<McpServerConfig, 'id'>;
  'services:update': { id: string } & Partial<Omit<McpServerConfig, 'id'>>;
  'services:remove': { id: string };
  'services:test': { id: string };

  // memory: invoke
  'memory:list': void;
  'memory:add': { type: string; content: string; source?: string };
  'memory:update': { id: string; content: string };
  'memory:delete': { id: string };
  'memory:toggle-status': { id: string };
  'memory:toggle-pin': { id: string };
}
