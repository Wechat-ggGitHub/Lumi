import { uIOhook, UiohookKey } from 'uiohook-napi';
import { systemPreferences } from 'electron';

export class ShortcutManager {
  private isListening = false;
  private lastKeydownTime = 0;

  async init(): Promise<boolean> {
    return true;
  }

  start(onAction: () => void): void {
    if (this.isListening) return;

    uIOhook.on('keydown', (e) => {
      if (e.keycode !== UiohookKey.MetaRight) return;
      if (e.altKey || e.ctrlKey || e.shiftKey) return;

      const now = Date.now();
      if (now - this.lastKeydownTime < 200) return;
      this.lastKeydownTime = now;

      onAction();
    });

    try {
      uIOhook.start();
      this.isListening = true;
    } catch (err) {
      console.error('uIOhook start failed — need Accessibility permission:', err);
    }
  }

  stop(): void {
    if (this.isListening) {
      uIOhook.stop();
      this.isListening = false;
    }
  }

  static checkAccessibility(): boolean {
    try {
      return systemPreferences.isTrustedAccessibilityClient(true);
    } catch {
      return false;
    }
  }
}
