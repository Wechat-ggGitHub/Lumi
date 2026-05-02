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

  useEffect(() => {
    const ipcRenderer = getIpcRenderer();
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

    const userMessageHandler = (_: unknown, data: { content: string }) => {
      setMessages(prev => [...prev, {
        id: `user-${Date.now()}`,
        segment_id: '',
        role: 'user',
        content: data.content,
        metadata: null,
        execution_id: null,
        created_at: new Date().toISOString(),
      }]);
    };
    ipcRenderer.on('chat:user-message', userMessageHandler);

    const completeHandler = (_: unknown, data: { executionId: string }) => {
      ipcRenderer.send('chat:ready');
    };
    ipcRenderer.on('chat:execution-complete', completeHandler);

    ipcRenderer.send('chat:ready');

    return () => {
      ipcRenderer.removeListener('chat:history', historyHandler);
      ipcRenderer.removeListener('chat:stream-chunk', chunkHandler);
      ipcRenderer.removeListener('chat:state-update', stateHandler);
      ipcRenderer.removeListener('chat:user-message', userMessageHandler);
      ipcRenderer.removeListener('chat:execution-complete', completeHandler);
    };
  }, []);

  const handleSend = useCallback((text: string) => {
    getIpcRenderer()?.send('chat:send-message', { text });
  }, []);

  const handleClear = useCallback(() => {
    getIpcRenderer()?.send('chat:clear');
  }, []);

  const isStreaming = appState === 'thinking' || appState === 'executing';

  return (
    <div className="h-screen flex flex-col bg-bg-window">
      <ChatHeader
        appState={appState}
        sdkSubState={sdkSubState}
        currentToolName={currentToolName}
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
