'use client';

import { useState } from 'react';
import type { AppState } from '@/types';

interface ChatInputProps {
  appState: AppState;
  onSend: (text: string) => void;
  onClear: () => void;
}

export function ChatInput({ appState, onSend, onClear }: ChatInputProps) {
  const [text, setText] = useState('');
  const isBusy = appState === 'thinking' || appState === 'executing' || appState === 'recording' || appState === 'transcribing';

  const handleSubmit = () => {
    const trimmed = text.trim();
    if (!trimmed || isBusy) return;

    if (trimmed === '/clear') {
      onClear();
      setText('');
      return;
    }

    onSend(trimmed);
    setText('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div style={{
      padding: '10px 16px',
      borderTop: '1px solid rgba(255,255,255,0.08)',
      display: 'flex',
      gap: 8,
      alignItems: 'center',
      flexShrink: 0,
    }}>
      <input
        type="text"
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={isBusy ? '处理中...' : '输入消息，/clear 清空对话'}
        disabled={isBusy}
        style={{
          flex: 1,
          background: 'rgba(255,255,255,0.05)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 8,
          padding: '10px 14px',
          fontSize: 13,
          color: '#e0e0e0',
          outline: 'none',
          fontFamily: 'inherit',
        }}
      />
      <button
        onClick={handleSubmit}
        disabled={isBusy || !text.trim()}
        style={{
          width: 36, height: 36,
          borderRadius: '50%',
          background: isBusy ? 'rgba(175,82,222,0.3)' : '#AF52DE',
          border: 'none',
          cursor: isBusy ? 'default' : 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 15,
          color: '#fff',
          flexShrink: 0,
        }}
      >
        ➤
      </button>
    </div>
  );
}
