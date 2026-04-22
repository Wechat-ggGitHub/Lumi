'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

type VoiceInputProps = {
  onSend: (text: string) => void;
  onCancel: () => void;
};

export function VoiceInput({ onSend, onCancel }: VoiceInputProps) {
  const [text, setText] = useState('');
  const [status, setStatus] = useState<'recording' | 'transcribing' | 'editing'>('recording');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    // 监听 IPC 事件
    if (typeof window === 'undefined') return;

    const { ipcRenderer } = require('electron');

    const handlers = {
      'voice:transcript': (_: unknown, data: { text: string; isAppending: boolean }) => {
        setText(prev => data.isAppending ? prev + data.text : data.text);
        setStatus('editing');
        textareaRef.current?.focus();
      },
      'voice:transcribing': () => setStatus('transcribing'),
      'voice:start-recording': () => setStatus('recording'),
      'voice:error': (_: unknown, data: { message: string }) => {
        setText(prev => prev + `\n[错误: ${data.message}]`);
        setStatus('editing');
      },
    };

    for (const [channel, handler] of Object.entries(handlers)) {
      ipcRenderer.on(channel, handler);
    }

    return () => {
      for (const [channel, handler] of Object.entries(handlers)) {
        ipcRenderer.removeListener(channel, handler);
      }
    };
  }, []);

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
  }, [text, onSend]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
    if (e.key === 'Escape') {
      onCancel();
    }
  }, [handleSend, onCancel]);

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: '16px 20px',
      background: 'rgba(30, 30, 30, 0.95)',
      borderRadius: 16,
      backdropFilter: 'blur(20px)',
      color: '#fff',
      width: '100%',
      boxSizing: 'border-box',
    }}>
      {/* 状态指示 */}
      {status === 'recording' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
          <RecordingPulse />
          <span style={{ fontSize: 14, opacity: 0.7 }}>正在聆听...</span>
        </div>
      )}

      {status === 'transcribing' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
          <Spinner />
          <span style={{ fontSize: 14, opacity: 0.7 }}>识别中...</span>
        </div>
      )}

      {status === 'editing' && (
        <>
          <button
            onClick={() => {
              // 通知 main process 追加录音
              const { ipcRenderer } = require('electron');
              ipcRenderer.send('voice:request-append');
            }}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: 20,
              padding: 4,
              opacity: 0.6,
            }}
            title="追加语音"
          >
            🎤
          </button>
          <textarea
            ref={textareaRef}
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              color: '#fff',
              fontSize: 15,
              resize: 'none',
              outline: 'none',
              maxHeight: 80,
              minHeight: 24,
              fontFamily: 'inherit',
              lineHeight: 1.5,
            }}
            rows={1}
            autoFocus
          />
          <button
            onClick={handleSend}
            disabled={!text.trim()}
            style={{
              background: text.trim() ? '#007AFF' : '#333',
              color: text.trim() ? '#fff' : '#666',
              border: 'none',
              borderRadius: 8,
              padding: '6px 16px',
              cursor: text.trim() ? 'pointer' : 'default',
              fontSize: 14,
            }}
          >
            发送
          </button>
        </>
      )}
    </div>
  );
}

function RecordingPulse() {
  return (
    <div style={{
      width: 12, height: 12, borderRadius: '50%',
      background: '#FF3B30',
      animation: 'pulse 1.5s ease-in-out infinite',
    }}>
      <style>{`@keyframes pulse { 0%,100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.5; transform: scale(1.3); } }`}</style>
    </div>
  );
}

function Spinner() {
  return (
    <div style={{
      width: 16, height: 16, borderRadius: '50%',
      border: '2px solid #333',
      borderTopColor: '#007AFF',
      animation: 'spin 0.8s linear infinite',
    }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
