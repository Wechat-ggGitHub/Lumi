'use client';

import { useState, useRef, useEffect } from 'react';
import { Send } from 'lucide-react';
import type { AppState } from '@/types';
import { Button } from '@/components/ui/Button';

interface ChatInputProps {
  appState: AppState;
  onSend: (text: string) => void;
  onClear: () => void;
}

export function ChatInput({ appState, onSend, onClear }: ChatInputProps) {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isBusy = appState === 'thinking' || appState === 'executing' || appState === 'recording' || appState === 'transcribing';

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + 'px';
    }
  }, [text]);

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
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="flex-shrink-0 px-page-x py-2.5 border-t border-line-default">
      <div className="flex items-end gap-2 bg-bg-surface-1/60 backdrop-blur-xl border border-line-default rounded-btn p-2 transition-colors duration-150 focus-within:border-brand-primary/30">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={isBusy ? '处理中...' : '输入消息'}
          disabled={isBusy}
          rows={1}
          className="flex-1 bg-transparent text-body text-text-primary outline-none resize-none
            placeholder:text-text-muted disabled:opacity-40 min-h-[24px] max-h-[120px] leading-relaxed"
        />
        <Button
          variant="icon"
          onClick={handleSubmit}
          disabled={isBusy || !text.trim()}
          icon={Send}
          className="!rounded-full flex-shrink-0 text-brand-primary hover:text-brand-primary-hover"
        />
      </div>
    </div>
  );
}
