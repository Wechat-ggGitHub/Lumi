import type { AppState, SdkSubState, DotColor } from '@/types';

type ValidTransitions = Record<AppState, AppState[]>;

const VALID_TRANSITIONS: ValidTransitions = {
  idle: ['recording'],
  recording: ['transcribing', 'idle'],
  transcribing: ['editing', 'idle'],
  editing: ['sending', 'recording', 'idle'],
  sending: ['executing', 'idle'],
  executing: ['idle', 'error'],
  error: ['idle'],
};

export type RightCommandAction =
  | 'start-recording'
  | 'stop-recording'
  | 'none'
  | 'append-recording'
  | 'cancel-execution';

export type StateChangeCallback = (state: { appState: AppState; sdkSubState: SdkSubState }) => void;

export class ShrewStore {
  private _appState: AppState = 'idle';
  private _sdkSubState: SdkSubState = null;
  private _previousSdkSubState: SdkSubState = null;
  private _currentToolName: string | null = null;
  private _listeners: StateChangeCallback[] = [];

  get appState(): AppState { return this._appState; }
  get sdkSubState(): SdkSubState { return this._sdkSubState; }
  get currentToolName(): string | null { return this._currentToolName; }

  transition(newState: AppState): void {
    const allowed = VALID_TRANSITIONS[this._appState];
    if (!allowed.includes(newState)) return;

    this._appState = newState;
    this.notify();

    if (newState !== 'executing') {
      // Keep completed/failed for dot color display on idle
      if (newState === 'idle' && (this._sdkSubState === 'completed' || this._sdkSubState === 'failed')) {
        // preserve substate for dot color until user views
      } else if (newState !== 'idle') {
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

  get dotColor(): DotColor {
    if (this._appState === 'sending') return 'blue';
    if (this._appState === 'executing') {
      if (this._sdkSubState === 'rate_limited' || this._sdkSubState === 'authenticating') return 'yellow';
      return 'blue';
    }
    if (this._appState === 'idle') {
      if (this._sdkSubState === 'completed') return 'green';
      if (this._sdkSubState === 'failed') return 'red';
    }
    return 'gray';
  }

  getRightCommandAction(): RightCommandAction {
    switch (this._appState) {
      case 'idle': return 'start-recording';
      case 'recording': return 'stop-recording';
      case 'transcribing': return 'none';
      case 'editing': return 'append-recording';
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
