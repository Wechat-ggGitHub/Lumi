import type { AppState, SdkSubState, DotColor } from '@/types';

type ValidTransitions = Record<AppState, AppState[]>;

const VALID_TRANSITIONS: ValidTransitions = {
  idle: ['recording', 'thinking'],
  recording: ['transcribing', 'idle'],
  transcribing: ['thinking', 'idle'],
  thinking: ['executing', 'completed', 'error', 'idle'],
  executing: ['completed', 'error', 'idle'],
  completed: ['idle', 'thinking', 'recording'],
  error: ['idle'],
};

export type RightCommandAction =
  | 'start-recording'
  | 'stop-recording'
  | 'none'
  | 'cancel-execution'
  | 'stop-speaking';

export type StateChangeCallback = (state: { appState: AppState; sdkSubState: SdkSubState }) => void;

export class ShrewStore {
  private _appState: AppState = 'idle';
  private _sdkSubState: SdkSubState = null;
  private _previousSdkSubState: SdkSubState = null;
  private _currentToolName: string | null = null;
  private _completedTimer: ReturnType<typeof setTimeout> | null = null;
  private _speaking: boolean = false;
  private _continuousChatWindow: boolean = false;
  private _listeners: StateChangeCallback[] = [];

  get appState(): AppState { return this._appState; }
  get sdkSubState(): SdkSubState { return this._sdkSubState; }
  get currentToolName(): string | null { return this._currentToolName; }
  get speaking(): boolean { return this._speaking; }
  get continuousChatWindow(): boolean { return this._continuousChatWindow; }

  transition(newState: AppState): void {
    const allowed = VALID_TRANSITIONS[this._appState];
    if (!allowed.includes(newState)) return;

    this._appState = newState;
    this.notify();

    // completed 是瞬态，自动转回 idle（连续对话模式下由外部管理）
    if (newState === 'completed') {
      this._completedTimer = setTimeout(() => {
        if (this._appState === 'completed' && !this._speaking && !this._continuousChatWindow) {
          this.transition('idle');
        }
      }, 2500);
    } else if (this._completedTimer) {
      clearTimeout(this._completedTimer);
      this._completedTimer = null;
    }

    if (newState !== 'thinking' && newState !== 'executing') {
      if (newState === 'idle' && (this._sdkSubState === 'completed' || this._sdkSubState === 'failed')) {
        // preserve substate for dot color until user views
      } else if (newState !== 'idle' && newState !== 'completed') {
        this._sdkSubState = null;
      }
    }
  }

  setSdkSubState(substate: SdkSubState, toolName?: string): void {
    this._previousSdkSubState = this._sdkSubState;
    this._sdkSubState = substate;
    this._currentToolName = toolName ?? null;
    this.notify();
  }

  clearCompletedState(): void {
    if (this._sdkSubState === 'completed' || this._sdkSubState === 'failed') {
      this._sdkSubState = null;
      this.notify();
    }
  }

  setSpeaking(value: boolean): void {
    this._speaking = value;
    this.notify();
  }

  setContinuousChatWindow(value: boolean): void {
    this._continuousChatWindow = value;
    this.notify();
  }

  get dotColor(): DotColor {
    if (this._appState === 'thinking') return 'blue';
    if (this._appState === 'executing') {
      if (this._sdkSubState === 'rate_limited' || this._sdkSubState === 'authenticating') return 'yellow';
      return 'blue';
    }
    if (this._appState === 'completed') return 'green';
    if (this._appState === 'idle') {
      if (this._sdkSubState === 'completed') return 'green';
      if (this._sdkSubState === 'failed') return 'red';
    }
    if (this._appState === 'error') return 'red';
    return 'gray';
  }

  getRightCommandAction(): RightCommandAction {
    if (this._speaking) return 'stop-speaking';
    switch (this._appState) {
      case 'idle':
      case 'completed': return 'start-recording';
      case 'recording': return 'stop-recording';
      case 'transcribing': return 'none';
      case 'thinking':
      case 'executing': return 'cancel-execution';
      default: return 'none';
    }
  }

  onChange(callback: StateChangeCallback): () => void {
    this._listeners.push(callback);
    return () => {
      this._listeners = this._listeners.filter(l => l !== callback);
    };
  }

  private notify(): void {
    for (const cb of this._listeners) {
      cb({ appState: this._appState, sdkSubState: this._sdkSubState });
    }
  }
}
