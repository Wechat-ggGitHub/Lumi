'use client';

import type { AppState, SdkSubState } from '@/types';

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

function getStatusDotColor(appState: AppState): string {
  switch (appState) {
    case 'thinking':
    case 'executing': return '#007AFF';
    case 'completed': return '#34C759';
    case 'error': return '#FF453A';
    case 'recording': return '#FF9500';
    default: return 'transparent';
  }
}

export function ChatHeader({ appState, sdkSubState, currentToolName, onSettingsClick }: ChatHeaderProps) {
  const statusText = getStatusText(appState, sdkSubState, currentToolName);
  const dotColor = getStatusDotColor(appState);
  const isActive = appState !== 'idle';

  return (
    <div style={{
      padding: '12px 16px',
      borderBottom: '1px solid rgba(255,255,255,0.08)',
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      flexShrink: 0,
    }}>
      <div style={{
        width: 36, height: 36,
        borderRadius: '50%',
        background: 'linear-gradient(135deg, #AF52DE, #5856D6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 16, fontWeight: 600, color: '#fff',
        flexShrink: 0,
      }}>
        S
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#e0e0e0' }}>Shrew</div>
        {isActive && (
          <div style={{ fontSize: 11, color: '#888', display: 'flex', alignItems: 'center', gap: 4, marginTop: 1 }}>
            <span style={{
              width: 6, height: 6, borderRadius: '50%',
              background: dotColor,
              animation: 'pulse 1.5s ease-in-out infinite',
            }} />
            {statusText}
          </div>
        )}
      </div>
      <button
        onClick={onSettingsClick}
        style={{
          width: 32, height: 32,
          borderRadius: 8,
          background: 'rgba(255,255,255,0.05)',
          border: '1px solid rgba(255,255,255,0.08)',
          color: '#888',
          fontSize: 16,
          cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        ⚙
      </button>
      <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }`}</style>
    </div>
  );
}
