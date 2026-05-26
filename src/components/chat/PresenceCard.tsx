'use client';

import { Brain, Zap, Settings, User } from 'lucide-react';
import type { AppState, SdkSubState } from '@/types';
import { getIpcRenderer } from '@/lib/electron-ipc';

interface PresenceCardProps {
  appState: AppState;
  sdkSubState: SdkSubState;
  currentToolName?: string;
  personaName?: string;
  personaAvatar?: string | null;
}

function getStatusText(appState: AppState, currentToolName?: string): string {
  switch (appState) {
    case 'recording': return '正在听...';
    case 'transcribing': return '正在转写...';
    case 'thinking': return '正在思考...';
    case 'executing':
      if (currentToolName) return `正在执行: ${currentToolName}`;
      return '正在执行...';
    case 'completed': return '已完成';
    case 'error': return '出了点问题';
    default: return '随时待命';
  }
}

function getRingState(appState: AppState): string {
  switch (appState) {
    case 'thinking': return 'ring-thinking';
    case 'executing': return 'ring-executing';
    case 'completed': return 'ring-done';
    default: return 'ring-idle';
  }
}

const actionItems = [
  { label: '分身', href: '/persona', icon: User },
  { label: '记忆', href: '/memory', icon: Brain },
  { label: '技能', href: '/skills', icon: Zap },
  { label: '设置', href: '/settings', icon: Settings },
];

export function PresenceCard({ appState, sdkSubState, currentToolName, personaName, personaAvatar }: PresenceCardProps) {
  const statusText = getStatusText(appState, currentToolName);
  const ringState = getRingState(appState);
  const displayName = personaName || 'Lumi';

  return (
    <div className="w-[200px] flex-shrink-0 bg-bg-app border-r border-line-default flex flex-col items-center pt-12 pb-4 px-4"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
      <div className="relative w-16 h-16 mb-3" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <div
          className="absolute -inset-1 rounded-full"
          style={{ animation: `${ringState} ${appState === 'executing' ? '1s' : appState === 'thinking' ? '1.5s' : '3s'} ease-in-out infinite` }}
        />
        <div className="w-16 h-16 rounded-full overflow-hidden">
          <img src={personaAvatar || ''} alt={displayName} className="w-full h-full object-cover" />
        </div>
      </div>
      <div className="text-card-title text-text-primary mb-0.5">{displayName}</div>
      <div className="text-label-xs text-text-muted mb-6 min-h-[16px] transition-opacity duration-300 text-center">
        {statusText}
      </div>
      <div className="flex gap-4 items-center justify-center" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        {actionItems.map(item => (
          <button
            key={item.href}
            onClick={() => getIpcRenderer()?.send('navigate:route', { path: item.href })}
            className="group relative flex items-center justify-center w-7 h-7 rounded-full text-text-muted hover:text-text-secondary hover:bg-bg-surface-1/60 active:scale-[0.92] transition-all duration-150"
          >
            <item.icon size={15} strokeWidth={1.8} />
            <span className="absolute top-full mt-1.5 px-1.5 py-0.5 rounded-md bg-bg-surface-2 text-label-xs text-text-secondary whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity duration-150">
              {item.label}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
