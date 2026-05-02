'use client';

import type { AppState, SdkSubState } from '@/types';
import { Button } from '@/components/ui/Button';

interface ChatHeaderProps {
  appState: AppState;
  sdkSubState: SdkSubState;
  currentToolName?: string;
  onSettingsClick: () => void;
}

function getStatusText(appState: AppState, sdkSubState: SdkSubState, currentToolName?: string): string {
  switch (appState) {
    case 'recording': return '正在听...';
    case 'transcribing': return '正在转写...';
    case 'editing': return '等待发送';
    case 'thinking': return '正在思考...';
    case 'executing':
      if (currentToolName) return `正在执行: ${currentToolName}`;
      return '正在执行...';
    case 'completed': return '已完成';
    case 'error': return '出错';
    default: return '';
  }
}

function getDotColorClass(appState: AppState): string {
  switch (appState) {
    case 'thinking':
    case 'executing': return 'bg-brand';
    case 'completed': return 'bg-success';
    case 'error': return 'bg-danger';
    case 'recording': return 'bg-warning';
    default: return '';
  }
}

export function ChatHeader({ appState, sdkSubState, currentToolName, onSettingsClick }: ChatHeaderProps) {
  const statusText = getStatusText(appState, sdkSubState, currentToolName);
  const dotColor = getDotColorClass(appState);
  const isActive = appState !== 'idle';

  return (
    <div className="flex-shrink-0 px-4 py-3 border-b border-line-default flex items-center gap-2.5">
      <div className="w-9 h-9 rounded-full bg-brand-soft flex items-center justify-center text-label text-brand font-semibold flex-shrink-0">
        S
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-card-title text-text-primary">Shrew</div>
        {isActive && (
          <div className="text-label-xs text-text-muted flex items-center gap-1 mt-0.5">
            <span className={`w-1.5 h-1.5 rounded-full ${dotColor} animate-pulse-blue`} />
            {statusText}
          </div>
        )}
      </div>
      <Button variant="ghost" size="icon" onClick={onSettingsClick}>
        ⚙
      </Button>
    </div>
  );
}
