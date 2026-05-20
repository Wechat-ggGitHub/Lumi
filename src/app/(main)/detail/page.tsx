'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { getIpcRenderer } from '@/lib/electron-ipc';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Button } from '@/components/ui/Button';
import type { ExecutionRecord, ConversationMessage, ToolCallRecord, AppState, SdkSubState } from '@/types';

function formatDuration(ms: number): string {
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m${remainingSeconds}s`;
}

function ToolCallItem({ toolCall }: { toolCall: ToolCallRecord }) {
  const [expanded, setExpanded] = useState(false);
  const typeLabel: Record<string, string> = {
    read_file: '读取文件',
    edit_file: '编辑文件',
    write_file: '写入文件',
    run_command: '运行命令',
    other: '工具调用',
  };

  return (
    <div className="bg-bg-surface-1 border border-line-default rounded-md my-1">
      <div
        onClick={() => setExpanded(!expanded)}
        className="px-2.5 py-1.5 flex items-center gap-2 cursor-pointer text-xs"
      >
        <StatusBadge
          status={toolCall.status === 'completed' ? 'success' : 'danger'}
          label={toolCall.status === 'completed' ? '完成' : '失败'}
        />
        <span className="text-text-muted">{typeLabel[toolCall.type] || toolCall.type}</span>
        <span className="text-text-muted overflow-hidden text-ellipsis whitespace-nowrap flex-1">
          {toolCall.target}
        </span>
        <span className="text-text-muted">{expanded ? '▼' : '▶'}</span>
      </div>
      {expanded && toolCall.detail && (
        <div className="px-2.5 py-2 border-t border-line-default">
          <pre className="text-[11px] leading-relaxed whitespace-pre-wrap break-all m-0 text-text-secondary">
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
      <div className="flex justify-end mb-3">
        <div className="bg-brand-soft border border-brand/30 rounded-xl rounded-br-sm px-3 py-2 max-w-[75%] text-[13px] leading-relaxed whitespace-pre-wrap text-text-primary">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="mb-3">
      <div className="text-[11px] text-brand mb-1 font-medium">Claude</div>
      {message.content && (
        <div className="bg-bg-surface-1 rounded-md rounded-tr-sm px-3 py-2 text-[13px] leading-relaxed whitespace-pre-wrap text-text-primary">
          {message.content}
        </div>
      )}
      {message.toolCalls?.map((tc, i) => (
        <ToolCallItem key={i} toolCall={tc} />
      ))}
    </div>
  );
}

export default function DetailPage() {
  const [records, setRecords] = useState<ExecutionRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [record, setRecord] = useState<ExecutionRecord | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [appState, setAppState] = useState<AppState>('idle');
  const [sdkSubState, setSdkSubState] = useState<SdkSubState>(null);
  const [currentToolName, setCurrentToolName] = useState<string | undefined>();
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const ipcRenderer = typeof window !== 'undefined' ? getIpcRenderer() : null;

  useEffect(() => {
    if (!ipcRenderer) return;

    const historyHandler = (_: unknown, data: {
      records: ExecutionRecord[];
      appState: AppState;
      sdkSubState: SdkSubState;
      currentToolName?: string;
    }) => {
      setRecords(data.records);
      setAppState(data.appState);
      setSdkSubState(data.sdkSubState);
      setCurrentToolName(data.currentToolName);

      setSelectedId(prev => {
        if (prev) return prev;
        const first = data.records[0];
        if (first) {
          ipcRenderer.send('detail:select', { id: first.id });
          return first.id;
        }
        return null;
      });
    };
    ipcRenderer.on('detail:history-list', historyHandler);

    const conversationHandler = (_: unknown, data: { record: ExecutionRecord | null }) => {
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
      }
    };
    ipcRenderer.on('detail:conversation-data', conversationHandler);

    const streamHandler = (_: unknown, data: { id: string; content: string; done: boolean }) => {
      if (data.id !== selectedId) return;
      if (data.done) { setIsSending(false); return; }
      setMessages(prev => [...prev, { role: 'assistant', content: data.content }]);
    };
    ipcRenderer.on('detail:stream-chunk', streamHandler);

    const toolCallHandler = (_: unknown, data: { id: string; toolCall: ToolCallRecord }) => {
      if (data.id !== selectedId) return;
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

    const completeHandler = (_: unknown, data: { record: ExecutionRecord }) => {
      if (data.record.id === selectedId) {
        setRecord(data.record);
      }
      setIsSending(false);
      setRecords(prev => prev.map(r => r.id === data.record.id ? data.record : r));
    };
    ipcRenderer.on('detail:execution-complete', completeHandler);

    const showHandler = () => {
      ipcRenderer.send('detail:ready');
    };
    ipcRenderer.on('detail:show', showHandler);

    ipcRenderer.send('detail:ready');

    return () => {
      ipcRenderer.removeListener('detail:history-list', historyHandler);
      ipcRenderer.removeListener('detail:conversation-data', conversationHandler);
      ipcRenderer.removeListener('detail:stream-chunk', streamHandler);
      ipcRenderer.removeListener('detail:tool-call', toolCallHandler);
      ipcRenderer.removeListener('detail:execution-complete', completeHandler);
      ipcRenderer.removeListener('detail:show', showHandler);
    };
  }, [ipcRenderer, selectedId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSelect = useCallback((id: string) => {
    setSelectedId(id);
    ipcRenderer?.send('detail:select', { id });
    ipcRenderer?.send('detail:mark-viewed', { id });
  }, [ipcRenderer]);

  const handleSend = () => {
    if (!inputText.trim() || !record || !ipcRenderer) return;
    setIsSending(true);
    ipcRenderer.send('detail:send-message', { id: record.id, text: inputText.trim() });
    setMessages(prev => [...prev, { role: 'user', content: inputText.trim() }]);
    setInputText('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleSend();
    }
  };

  const title = record?.title || record?.summary?.split('\n')[0] || record?.user_prompt || '';
  const subtitleParts: string[] = [];
  if (record?.duration_ms != null) subtitleParts.push(formatDuration(record.duration_ms));
  if (record?.cost_usd != null) subtitleParts.push(`$${record.cost_usd.toFixed(4)}`);
  const subtitleText = subtitleParts.join(' · ');

  const recordStatusBadge = record?.status === 'completed'
    ? <StatusBadge status="success" label="已完成" />
    : record?.status === 'failed'
      ? <StatusBadge status="danger" label="失败" />
      : record?.status === 'running'
        ? <StatusBadge status="info" label="执行中" />
        : record?.status === 'cancelled'
          ? <StatusBadge status="warning" label="已取消" />
          : null;

  return (
    <div className="min-h-screen bg-bg-window flex flex-col h-screen">
      {!record ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-text-muted text-[13px]">
            {records.length === 0 ? '按 ⌥ 开始对话' : '选择一个对话'}
          </p>
        </div>
      ) : (
        <>
          <PageHeader
            title={title}
            actions={
              <div className="flex items-center gap-2">
                {subtitleText && <span className="text-page-subtitle text-text-muted">{subtitleText}</span>}
                {recordStatusBadge}
              </div>
            }
          />

          <div ref={scrollRef} className="flex-1 overflow-auto px-page-x">
            {messages.map((msg, i) => (
              <MessageBubble key={i} message={msg} />
            ))}
            {isSending && (
              <div className="flex items-center gap-2 py-1">
                <div className="w-3 h-3 border-2 border-brand/30 border-t-brand rounded-full animate-spin" />
                <span className="text-xs text-text-muted">Claude 正在回复...</span>
              </div>
            )}
          </div>

          {record.status === 'completed' && record.sdk_session_id && (
            <div className="border-t border-line-default px-page-x py-2.5 flex gap-2 items-center flex-shrink-0">
              <input
                type="text"
                value={inputText}
                onChange={e => setInputText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="输入后续指令..."
                disabled={isSending}
                className="flex-1 bg-bg-surface-1 border border-line-default rounded-lg px-3 py-2 text-[13px] text-text-primary outline-none placeholder:text-text-muted focus:border-line-strong"
              />
              <Button
                variant="icon"
                onClick={handleSend}
                disabled={isSending || !inputText.trim()}
              >
                ➤
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
