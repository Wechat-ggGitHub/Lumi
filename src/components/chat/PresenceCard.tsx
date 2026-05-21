'use client';

import { Brain, Zap, Settings } from 'lucide-react';
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
      <div className="flex flex-col gap-2 w-full" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        {actionItems.map(item => (
          <button
            key={item.href}
            onClick={() => getIpcRenderer()?.send('navigate:route', { path: item.href })}
            className="flex items-center gap-2 px-3 py-2 rounded-btn bg-bg-surface-1 border border-line-default text-label text-text-secondary hover:bg-bg-surface-2 hover:border-line-strong hover:text-text-primary active:scale-[0.98] transition-all duration-150"
          >
            <item.icon size={14} />
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}
