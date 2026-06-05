'use client';

import { User, Brain, Zap, Settings } from 'lucide-react';
import type { AppState, SdkSubState } from '@/types';
import { HeaderDropdown } from '@/components/ui/HeaderDropdown';

interface ChatHeaderProps {
  appState: AppState;
  sdkSubState: SdkSubState;
  currentToolName?: string;
  personaName?: string;
  personaAvatar?: string | null;
}

function getStatusText(appState: AppState, sdkSubState: SdkSubState, currentToolName?: string): string {
  switch (appState) {
    case 'recording': return '正在听...';
    case 'transcribing': return '正在转写...';
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
    case 'transcribing': return 'bg-text-muted';
    default: return '';
  }
}

export function ChatHeader({ appState, sdkSubState, currentToolName, personaName, personaAvatar }: ChatHeaderProps) {
  const statusText = getStatusText(appState, sdkSubState, currentToolName);
  const dotColor = getDotColorClass(appState);
  const isActive = appState !== 'idle';
  const displayName = personaName || 'Lumi';

  const menuItems = [
    { label: '分身设定', href: '/persona', icon: User },
    { label: '记忆管理', href: '/memory', icon: Brain },
    { label: '技能管理', href: '/skills', icon: Zap },
    { label: '设置', href: '/settings', icon: Settings },
  ];

  return (
    <div className="flex-shrink-0 px-4 pt-12 pb-3 border-b border-line-default flex items-center gap-2.5" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
      <div className="w-9 h-9 rounded-full overflow-hidden flex-shrink-0" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <img src={personaAvatar || ''} alt={displayName} className="w-full h-full object-cover" />
      </div>
      <div className="flex-1 min-w-0" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <div className="text-card-title text-text-primary">{displayName}</div>
        {isActive && (
          <div className="text-label-xs text-text-muted flex items-center gap-1 mt-0.5">
            <span className={`w-1.5 h-1.5 rounded-full ${dotColor} animate-pulse`} />
            {statusText}
          </div>
        )}
      </div>
      <div style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <HeaderDropdown items={menuItems} />
      </div>
    </div>
  );
}
