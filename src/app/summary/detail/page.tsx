'use client';

import { useState, useEffect, useRef } from 'react';
import { getIpcRenderer } from '@/lib/electron-ipc';
import type { ExecutionRecord, ConversationMessage, ToolCallRecord } from '@/types';

function formatDuration(ms: number): string {
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m${remainingSeconds}s`;
}

function ToolCallItem({ toolCall }: { toolCall: ToolCallRecord }) {
  const [expanded, setExpanded] = useState(false);
  const icon = toolCall.status === 'completed' ? '✓' : '✗';
  const typeLabel: Record<string, string> = {
    read_file: '读取文件',
    edit_file: '编辑文件',
    write_file: '写入文件',
    run_command: '运行命令',
    other: '工具调用',
  };

  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(255,255,255,0.06)',
      borderRadius: 6,
      margin: '4px 0',
    }}>
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          padding: '6px 10px',
          display: 'flex', alignItems: 'center', gap: 8,
          cursor: 'pointer',
          fontSize: 12,
        }}
      >
        <span style={{ color: toolCall.status === 'completed' ? '#34C759' : '#FF453A' }}>{icon}</span>
        <span style={{ color: '#aaa' }}>{typeLabel[toolCall.type] || toolCall.type}</span>
        <span style={{ color: '#888', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
          {toolCall.target}
        </span>
        <span style={{ color: '#555' }}>{expanded ? '▼' : '▶'}</span>
      </div>
      {expanded && toolCall.detail && (
        <div style={{
          padding: '8px 10px',
          borderTop: '1px solid rgba(255,255,255,0.04)',
          background: 'rgba(0,0,0,0.2)',
          borderRadius: '0 0 6px 6px',
        }}>
          <pre style={{
            fontSize: 11, lineHeight: 1.5,
            whiteSpace: 'pre-wrap', wordBreak: 'break-all',
            margin: 0,
            color: '#ccc',
          }}>
            {toolCall.detail}
          </pre>
        </div>
      )}
    </div>
  );
}

function MessageBubble({ message }: { message: ConversationMessage }) {
  if (message.role === 'user') {
    return (
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <div style={{
          background: 'rgba(175,82,222,0.2)',
          border: '1px solid rgba(175,82,222,0.3)',
          borderRadius: '12px 12px 4px 12px',
          padding: '8px 12px',
          maxWidth: '75%',
          fontSize: 13,
          lineHeight: 1.5,
          whiteSpace: 'pre-wrap',
        }}>
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 11, color: '#AF52DE', marginBottom: 4, fontWeight: 500 }}>Claude</div>
      {message.content && (
        <div style={{
          background: 'rgba(255,255,255,0.05)',
          borderRadius: '4px 12px 12px 12px',
          padding: '8px 12px',
          fontSize: 13,
          lineHeight: 1.5,
          whiteSpace: 'pre-wrap',
        }}>
          {message.content}
        </div>
      )}
      {message.toolCalls?.map((tc, i) => (
        <ToolCallItem key={i} toolCall={tc} />
      ))}
    </div>
  );
}

export default function SummaryDetailPage() {
  const [record, setRecord] = useState<ExecutionRecord | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [error, setError] = useState('');
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const ipcRenderer = typeof window !== 'undefined' ? getIpcRenderer() : null;

  useEffect(() => {
    if (!ipcRenderer) return;

    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');
    if (!id) {
      setError('缺少记录 ID');
      return;
    }

    const handler = (_: unknown, data: { record: ExecutionRecord | null }) => {
      if (data.record) {
        setRecord(data.record);
        if (data.record.messages) {
          try {
            setMessages(JSON.parse(data.record.messages));
          } catch {
            setMessages([]);
          }
        } else {
          setMessages([
            { role: 'user', content: data.record.user_prompt },
            ...(data.record.summary ? [{ role: 'assistant' as const, content: data.record.summary }] : []),
          ]);
        }
      } else {
        setError('未找到记录');
      }
    };

    ipcRenderer.on('summary:detail-data', handler);
    ipcRenderer.send('summary:fetch-detail', { id });

    const streamHandler = (_: unknown, data: { id: string; content: string; done: boolean }) => {
      if (data.id !== id) return;
      if (data.done) {
        setIsSending(false);
        return;
      }
      setMessages(prev => [...prev, { role: 'assistant', content: data.content }]);
    };
    ipcRenderer.on('detail:stream-chunk', streamHandler);

    const toolCallHandler = (_: unknown, data: { id: string; toolCall: ToolCallRecord }) => {
      if (data.id !== id) return;
      setMessages(prev => {
        const last = prev[prev.length - 1];
        if (last?.role === 'assistant' && last.toolCalls && last.toolCalls.length > 0) {
          const updated = [...prev];
          const updatedLast = { ...updated[updated.length - 1] };
          updatedLast.toolCalls = [...updatedLast.toolCalls!, data.toolCall];
          updated[updated.length - 1] = updatedLast;
          return updated;
        }
        return [...prev, { role: 'assistant' as const, content: '', toolCalls: [data.toolCall] }];
      });
    };
    ipcRenderer.on('detail:tool-call', toolCallHandler);

    const completeHandler = (_: unknown, data: { id: string; record: ExecutionRecord }) => {
      setRecord(data.record);
      setIsSending(false);
    };
    ipcRenderer.on('detail:execution-complete', completeHandler);

    return () => {
      ipcRenderer.removeListener('summary:detail-data', handler);
      ipcRenderer.removeListener('detail:stream-chunk', streamHandler);
      ipcRenderer.removeListener('detail:tool-call', toolCallHandler);
      ipcRenderer.removeListener('detail:execution-complete', completeHandler);
    };
  }, [ipcRenderer]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = () => {
    if (!inputText.trim() || !record || !ipcRenderer) return;
    setIsSending(true);
    ipcRenderer.send('detail:send-message', { id: record.id, text: inputText.trim() });
    setMessages(prev => [...prev, { role: 'user', content: inputText.trim() }]);
    setInputText('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (error) {
    return (
      <div style={{
        padding: 40, textAlign: 'center', color: '#888',
        fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
        background: '#1a1a1e', height: '100vh',
      }}>
        {error}
      </div>
    );
  }

  if (!record) {
    return (
      <div style={{
        padding: 40, textAlign: 'center', color: '#888',
        fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
        background: '#1a1a1e', height: '100vh',
      }}>
        加载中...
      </div>
    );
  }

  return (
    <div style={{
      fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
      fontSize: 14, color: '#e0e0e0',
      background: '#1a1a1e',
      height: '100vh', display: 'flex', flexDirection: 'column',
    }}>
      {/* 标题栏 */}
      <div style={{
        padding: '10px 16px',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
          {record.title || record.summary?.split('\n')[0] || record.user_prompt}
        </div>
        <div style={{ display: 'flex', gap: 12, fontSize: 11, color: '#666', flexShrink: 0, marginLeft: 16 }}>
          {record.duration_ms != null && <span>{formatDuration(record.duration_ms)}</span>}
          {record.cost_usd != null && <span>${record.cost_usd.toFixed(4)}</span>}
        </div>
      </div>

      {/* 对话区 */}
      <div ref={scrollRef} style={{ flex: 1, overflow: 'auto', padding: 16 }}>
        {messages.map((msg, i) => (
          <MessageBubble key={i} message={msg} />
        ))}
        {isSending && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
            <div style={{
              width: 12, height: 12,
              border: '2px solid rgba(175,82,222,0.3)',
              borderTopColor: '#AF52DE',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
            }} />
            <span style={{ fontSize: 12, color: '#888' }}>Claude 正在回复...</span>
          </div>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* 输入区 */}
      {record.status === 'completed' && record.sdk_session_id && (
        <div style={{
          padding: '10px 16px',
          borderTop: '1px solid rgba(255,255,255,0.08)',
          display: 'flex', gap: 8, alignItems: 'center',
          flexShrink: 0,
        }}>
          <input
            type="text"
            value={inputText}
            onChange={e => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入后续指令..."
            disabled={isSending}
            style={{
              flex: 1,
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 8,
              padding: '8px 12px',
              fontSize: 13,
              color: '#e0e0e0',
              outline: 'none',
              fontFamily: 'inherit',
            }}
          />
          <button
            onClick={handleSend}
            disabled={isSending || !inputText.trim()}
            style={{
              width: 32, height: 32,
              borderRadius: '50%',
              background: isSending ? 'rgba(175,82,222,0.3)' : '#AF52DE',
              border: 'none',
              cursor: isSending ? 'default' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 14,
              color: '#fff',
              flexShrink: 0,
            }}
          >
            ➤
          </button>
        </div>
      )}
    </div>
  );
}
