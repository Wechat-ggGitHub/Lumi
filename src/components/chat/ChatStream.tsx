'use client';

import { useEffect, useRef } from 'react';
import type { ChatMessage } from '@/types';

interface ChatStreamProps {
  messages: ChatMessage[];
  isStreaming: boolean;
}

function formatDate(isoString: string): string {
  const d = new Date(isoString);
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const hours = d.getHours().toString().padStart(2, '0');
  const minutes = d.getMinutes().toString().padStart(2, '0');
  return `${month}月${day}日 ${hours}:${minutes}`;
}

function shouldShowDateDivider(messages: ChatMessage[], index: number): boolean {
  if (index === 0) return true;
  const prev = new Date(messages[index - 1].created_at).toDateString();
  const curr = new Date(messages[index].created_at).toDateString();
  return prev !== curr;
}

function UserMessage({ message }: { message: ChatMessage }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
      <div style={{
        background: 'rgba(175,82,222,0.2)',
        border: '1px solid rgba(175,82,222,0.3)',
        borderRadius: '12px 12px 4px 12px',
        padding: '8px 14px',
        maxWidth: '75%',
        fontSize: 13,
        lineHeight: 1.6,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
      }}>
        {message.content}
      </div>
    </div>
  );
}

function AssistantMessage({ message }: { message: ChatMessage }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{
        background: 'rgba(255,255,255,0.05)',
        borderRadius: '4px 12px 12px 12px',
        padding: '10px 14px',
        fontSize: 13,
        lineHeight: 1.6,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        color: '#d0d0d0',
      }}>
        {message.content || '...'}
      </div>
    </div>
  );
}

function SystemMessage({ message }: { message: ChatMessage }) {
  return (
    <div style={{
      textAlign: 'center',
      margin: '8px 0',
      fontSize: 11,
      color: '#555',
    }}>
      {message.content}
    </div>
  );
}

export function ChatStream({ messages, isStreaming }: ChatStreamProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <div ref={scrollRef} style={{ flex: 1, overflow: 'auto', padding: '16px 16px 8px' }}>
      {messages.length === 0 && (
        <div style={{
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#444',
          fontSize: 13,
        }}>
          按 ⌘ 开始语音对话，或在下方输入文字
        </div>
      )}
      {messages.map((msg, i) => (
        <div key={msg.id}>
          {shouldShowDateDivider(messages, i) && (
            <div style={{
              textAlign: 'center',
              margin: '16px 0 12px',
              fontSize: 11,
              color: '#444',
            }}>
              {formatDate(msg.created_at)}
            </div>
          )}
          {msg.role === 'user' && <UserMessage message={msg} />}
          {msg.role === 'assistant' && <AssistantMessage message={msg} />}
          {msg.role === 'system' && <SystemMessage message={msg} />}
        </div>
      ))}
      {isStreaming && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
          <div style={{
            width: 12, height: 12,
            border: '2px solid rgba(175,82,222,0.3)',
            borderTopColor: '#AF52DE',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
          }} />
          <span style={{ fontSize: 12, color: '#888' }}>Shrew 正在回复...</span>
        </div>
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
