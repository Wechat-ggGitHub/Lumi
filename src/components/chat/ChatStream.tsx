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
    <div className="flex justify-end mb-3">
      <div className="bg-brand-soft border border-brand/30 rounded-[12px_12px_4px_12px] px-3.5 py-2 max-w-[75%] text-body-sm leading-relaxed whitespace-pre-wrap break-words">
        {message.content}
      </div>
    </div>
  );
}

function AssistantMessage({ message }: { message: ChatMessage }) {
  return (
    <div className="mb-3">
      <div className="bg-bg-surface-1 rounded-[4px_12px_12px_12px] px-3.5 py-2.5 text-body-sm leading-relaxed whitespace-pre-wrap break-words text-text-secondary">
        {message.content || '...'}
      </div>
    </div>
  );
}

function SystemMessage({ message }: { message: ChatMessage }) {
  return (
    <div className="text-center my-2 text-label-xs text-text-muted">
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
    <div ref={scrollRef} className="flex-1 overflow-auto px-4 py-4">
      {messages.length === 0 && (
        <div className="h-full flex items-center justify-center text-body-sm text-text-muted">
          按 ⌥ 开始语音对话，或在下方输入文字
        </div>
      )}
      {messages.map((msg, i) => (
        <div key={msg.id}>
          {shouldShowDateDivider(messages, i) && (
            <div className="text-center my-4 text-label-xs text-text-muted">
              {formatDate(msg.created_at)}
            </div>
          )}
          {msg.role === 'user' && <UserMessage message={msg} />}
          {msg.role === 'assistant' && <AssistantMessage message={msg} />}
          {msg.role === 'system' && <SystemMessage message={msg} />}
        </div>
      ))}
      {isStreaming && (
        <div className="flex items-center gap-2 py-1">
          <div className="w-3 h-3 border-2 border-brand/30 border-t-brand rounded-full animate-spin" />
          <span className="text-label text-text-muted">Lumi 正在回复...</span>
        </div>
      )}
    </div>
  );
}
