'use client';

import { useState, useEffect, useCallback } from 'react';
import { ChatHeader } from '@/components/chat/ChatHeader';
import { ChatStream } from '@/components/chat/ChatStream';
import { ChatInput } from '@/components/chat/ChatInput';
import { getIpcRenderer } from '@/lib/electron-ipc';
import type { ChatMessage, AppState, SdkSubState } from '@/types';

export default function ChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [appState, setAppState] = useState<AppState>('idle');
  const [sdkSubState, setSdkSubState] = useState<SdkSubState>(null);
  const [currentToolName, setCurrentToolName] = useState<string | undefined>();
  const ipcRenderer = typeof window !== 'undefined' ? getIpcRenderer() : null;

  useEffect(() => {
    if (!ipcRenderer) return;

    const historyHandler = (_: unknown, data: { messages: ChatMessage[]; segmentId: string }) => {
      setMessages(data.messages);
    };
    ipcRenderer.on('chat:history', historyHandler);

    const chunkHandler = (_: unknown, data: { messageId: string; content: string; done: boolean }) => {
      if (data.done) return;

      setMessages(prev => {
        const existing = prev.find(m => m.id === data.messageId);
        if (existing) {
          return prev.map(m =>
            m.id === data.messageId
              ? { ...m, content: m.content + data.content }
              : m
          );
        }
        return [...prev, {
          id: data.messageId,
          segment_id: '',
          role: 'assistant' as const,
          content: data.content,
          metadata: null,
          execution_id: null,
          created_at: new Date().toISOString(),
        }];
      });
    };
    ipcRenderer.on('chat:stream-chunk', chunkHandler);

    const stateHandler = (_: unknown, data: { appState: AppState; sdkSubState: SdkSubState; currentToolName?: string }) => {
      setAppState(data.appState);
      setSdkSubState(data.sdkSubState);
      setCurrentToolName(data.currentToolName);
    };
    ipcRenderer.on('chat:state-update', stateHandler);

    const completeHandler = (_: unknown, data: { executionId: string }) => {
      ipcRenderer.send('chat:ready');
    };
    ipcRenderer.on('chat:execution-complete', completeHandler);

    ipcRenderer.send('chat:ready');

    return () => {
      ipcRenderer.removeListener('chat:history', historyHandler);
      ipcRenderer.removeListener('chat:stream-chunk', chunkHandler);
      ipcRenderer.removeListener('chat:state-update', stateHandler);
      ipcRenderer.removeListener('chat:execution-complete', completeHandler);
    };
  }, [ipcRenderer]);

  const handleSend = useCallback((text: string) => {
    const tempId = `temp-${Date.now()}`;
    setMessages(prev => [...prev, {
      id: tempId,
      segment_id: '',
      role: 'user',
      content: text,
      metadata: null,
      execution_id: null,
      created_at: new Date().toISOString(),
    }]);
    ipcRenderer?.send('chat:send-message', { text });
  }, [ipcRenderer]);

  const handleClear = useCallback(() => {
    ipcRenderer?.send('chat:clear');
  }, [ipcRenderer]);

  const handleSettingsClick = useCallback(() => {
    ipcRenderer?.send('navigate:route', { path: '/settings' });
  }, [ipcRenderer]);

  const isStreaming = appState === 'thinking' || appState === 'executing';

  return (
    <div style={{
      fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
      fontSize: 14,
      color: '#e0e0e0',
      background: '#1a1a1e',
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
    }}>
      <ChatHeader
        appState={appState}
        sdkSubState={sdkSubState}
        currentToolName={currentToolName}
        onSettingsClick={handleSettingsClick}
      />
      <ChatStream messages={messages} isStreaming={isStreaming} />
      <ChatInput
        appState={appState}
        onSend={handleSend}
        onClear={handleClear}
      />
    </div>
  );
}
