import { uIOhook, UiohookKey } from 'uiohook-napi';
import { systemPreferences } from 'electron';
import { log } from '../src/lib/logger';

export class ShortcutManager {
  private isListening = false;
  private lastKeydownTime = 0;

  async init(): Promise<boolean> {
    const accessible = systemPreferences.isTrustedAccessibilityClient(false);
    if (!accessible) {
      log.warn('辅助功能权限未授予，快捷键将无法使用');
      systemPreferences.isTrustedAccessibilityClient(true);
    }
    log.info('快捷键管理器初始化, 辅助功能权限:', accessible);
    return accessible;
  }

  start(onAction: () => void): void {
    if (this.isListening) {
      log.warn('快捷键已在监听中，跳过重复 start');
      return;
    }

    uIOhook.on('keydown', (e) => {
      if (e.keycode !== UiohookKey.AltRight) return;
      if (e.ctrlKey || e.shiftKey || e.metaKey) return;

      const now = Date.now();
      if (now - this.lastKeydownTime < 200) return;
      this.lastKeydownTime = now;

      log.info('右 Option 键按下，触发动作');
      onAction();
    });

    try {
      uIOhook.start();
      this.isListening = true;
      log.info('uIOhook 监听已启动，监听键: Right Option (AltRight)');
    } catch (err) {
      log.error('uIOhook 启动失败，可能需要辅助功能权限:', err);
    }
  }

  stop(): void {
    if (this.isListening) {
      uIOhook.stop();
      this.isListening = false;
      log.info('uIOhook 监听已停止');
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
