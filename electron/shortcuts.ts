import { app } from 'electron';
import path from 'path';
import type { RightCommandAction } from '../src/lib/store';

type KeyEventType = 'keydown' | 'keyup';
type KeyCallback = (event: KeyEventType) => void;

export class ShortcutManager {
  private nativeAddon: { startListening: (cb: KeyCallback) => void; stopListening: () => void } | null = null;
  private isListening = false;
  private onKeyDown?: (action: RightCommandAction) => void;

  async init(): Promise<boolean> {
    try {
      // 尝试加载 native addon
      const addonPath = app.isPackaged
        ? path.join(process.resourcesPath, 'native', 'key_event_tap.node')
        : path.join(__dirname, '..', 'electron', 'native', 'key-event-tap', 'build', 'Release', 'key_event_tap.node');

      this.nativeAddon = require(addonPath);
      return true;
    } catch {
      console.error('Failed to load key event tap addon');
      return false;
    }
  }

  start(onAction: (action: RightCommandAction) => void): void {
    if (!this.nativeAddon || this.isListening) return;
    this.onKeyDown = onAction;
    this.isListening = true;

    let lastKeydownTime = 0;

    this.nativeAddon.startListening((event) => {
      if (event === 'keydown') {
        const now = Date.now();
        if (now - lastKeydownTime < 200) return; // 防抖
        lastKeydownTime = now;
        // 具体的 action 由 store.getRightCommandAction() 决定
        // main.ts 中通过 store 获取当前 action 后调用对应处理
      }
    });
  }

  stop(): void {
    if (this.nativeAddon && this.isListening) {
      this.nativeAddon.stopListening();
      this.isListening = false;
    }
  }

  static checkAccessibility(): boolean {
    // 检查辅助功能权限
    try {
      const { systemPreferences } = require('electron');
      return systemPreferences.isTrustedAccessibilityClient(true);
    } catch {
      return false;
    }
  }
}
