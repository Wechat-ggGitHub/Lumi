'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { getIpcRenderer } from '@/lib/electron-ipc';
import { AudioCapture } from '@/lib/audio-capture';

type VoiceInputProps = {
  onSend: (text: string) => void;
  onCancel: () => void;
};

export function VoiceInput({ onSend, onCancel }: VoiceInputProps) {
  const [text, setText] = useState('');
  const [status, setStatus] = useState<'recording' | 'transcribing' | 'editing' | 'error'>('recording');
  const [errorMessage, setErrorMessage] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const statusRef = useRef(status);
  statusRef.current = status;

  const audioCaptureRef = useRef<AudioCapture | null>(null);

  // Initialize AudioCapture once
  useEffect(() => {
    audioCaptureRef.current = new AudioCapture();
    return () => {
      audioCaptureRef.current?.close();
      audioCaptureRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const ipcRenderer = getIpcRenderer();
    if (!ipcRenderer) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handlers: Record<string, (...args: any[]) => void> = {
      'voice:transcript': (_: any, data: { text: string; isAppending: boolean }) => {
        setText(prev => data.isAppending ? prev + data.text : data.text);
        setStatus('editing');
        textareaRef.current?.focus();
      },
      'voice:transcribing': () => setStatus('transcribing'),
      'voice:error': (_: any, data: { message: string }) => {
        if (statusRef.current === 'recording' || statusRef.current === 'transcribing') {
          setErrorMessage(data.message);
          setStatus('error');
          setTimeout(() => onCancel(), 2000);
        } else {
          setText(prev => prev + `\n[错误: ${data.message}]`);
        }
      },
      'voice:start-capture': async () => {
        console.log('[voice-bar] Received voice:start-capture, audioCaptureRef:', !!audioCaptureRef.current);
        setStatus('recording');
        try {
          await audioCaptureRef.current?.start();
          console.log('[voice-bar] AudioCapture started successfully');
          ipcRenderer.send('voice:capture-started', true);
        } catch (err) {
          console.error('[voice-bar] AudioCapture start failed:', err);
          ipcRenderer.send('voice:capture-started', false);
        }
      },
      'voice:stop-capture': () => {
        const result = audioCaptureRef.current?.stop();
        if (result) {
          ipcRenderer.send('voice:audio-data', result);
        }
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
  }, [onCancel]);

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
  }, [text, onSend]);

  // Global Escape listener — works in all states, not just when textarea has focus
  useEffect(() => {
    const onGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onGlobalKeyDown);
    return () => window.removeEventListener('keydown', onGlobalKeyDown);
  }, [onCancel]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

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
      position: 'relative',
    }}>
      {/* Close button — visible in all states */}
      <button
        onClick={onCancel}
        style={{
          position: 'absolute',
          top: -10,
          right: -10,
          width: 26,
          height: 26,
          borderRadius: '50%',
          border: 'none',
          background: 'rgba(80, 80, 80, 0.95)',
          color: 'rgba(255,255,255,0.8)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 12,
          lineHeight: 1,
          padding: 0,
          pointerEvents: 'all',
          transition: 'background 0.15s ease, color 0.15s ease',
        }}
        onMouseEnter={e => {
          e.currentTarget.style.background = 'rgba(200, 60, 60, 0.95)';
          e.currentTarget.style.color = '#fff';
        }}
        onMouseLeave={e => {
          e.currentTarget.style.background = 'rgba(80, 80, 80, 0.95)';
          e.currentTarget.style.color = 'rgba(255,255,255,0.8)';
        }}
      >
        ✕
      </button>

      {/* Error state */}
      {status === 'error' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
          <span style={{ fontSize: 14, color: '#FF453A' }}>{errorMessage || '发生错误'}</span>
        </div>
      )}

      {/* Recording state */}
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
              getIpcRenderer()?.send('voice:request-append');
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
