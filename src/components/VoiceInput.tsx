'use client';

import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';

type VoiceState = 'recording' | 'transcribing' | 'too-short' | 'error';

type VoiceStatePayload = {
  state: VoiceState | 'hidden';
  message?: string;
};

type VoiceInputProps = {
  onCancel: () => void;
};

const BAR_COUNT = 5;
const RECORDING_BASE = [6, 10, 14, 8, 12];

export function VoiceInput({ onCancel }: VoiceInputProps) {
  const [state, setState] = useState<VoiceState>('recording');
  const [message, setMessage] = useState<string>('正在听…');
  const volumeRef = useRef(0);
  const barRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const animFrameRef = useRef<number>(0);

  // IPC: voice:state 切换状态；voice:volume 喂音量
  useEffect(() => {
    const { ipcRenderer } = window.require('electron');
    const onState = (_: unknown, payload: VoiceStatePayload) => {
      if (payload.state === 'hidden') return; // hidden 由窗口 hide 处理，不进入渲染
      setState(payload.state);
      if (payload.message !== undefined) setMessage(payload.message);
    };
    const onVolume = (_: unknown, data: { volume: number }) => {
      volumeRef.current = data.volume;
    };
    ipcRenderer.on('voice:state', onState);
    ipcRenderer.on('voice:volume', onVolume);
    return () => {
      ipcRenderer.removeListener('voice:state', onState);
      ipcRenderer.removeListener('voice:volume', onVolume);
    };
  }, []);

  // 仅 recording 状态用音量驱动 5 根条；其它状态走静态 / CSS 动画
  useEffect(() => {
    if (state !== 'recording') return;
    const tick = () => {
      const v = volumeRef.current;
      for (let i = 0; i < BAR_COUNT; i++) {
        const el = barRefs.current[i];
        if (!el) continue;
        const base = RECORDING_BASE[i];
        const amp = base + v * 8 * Math.sin((Date.now() / 120) + i);
        const h = Math.max(3, Math.min(14, amp));
        el.style.height = `${h}px`;
      }
      animFrameRef.current = requestAnimationFrame(tick);
    };
    animFrameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [state]);

  // ESC 关闭（仅 recording / error 允许；transcribing / too-short 不可中断）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && (state === 'recording' || state === 'error')) {
        onCancel();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel, state]);

  const showClose = state === 'recording' || state === 'error';
  const barColor =
    state === 'recording' ? 'var(--success)'
    : state === 'transcribing' ? 'var(--brand-primary)'
    : state === 'too-short' ? 'var(--warning)'
    : 'var(--danger)';
  const messageColor =
    state === 'error' ? 'var(--danger)'
    : state === 'too-short' ? 'var(--text-muted)'
    : 'var(--text-secondary)';

  return (
    <>
      <style>{`
        @keyframes vbWaveSlow { from { height:4px } to { height:10px } }
      `}</style>
      <div style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 10,
        background: 'var(--bg-surface-1)',
        borderRadius: 14,
        padding: '10px 14px',
        boxShadow: '0 0 0 1px var(--line-strong)',
        color: messageColor,
        fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif',
        fontSize: 13,
      }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 2, height: 14 }}>
          {Array.from({ length: BAR_COUNT }).map((_, i) => (
            <span
              key={i}
              ref={(el) => { barRefs.current[i] = el; }}
              style={{
                width: 2,
                borderRadius: 1,
                background: barColor,
                display: 'block',
                height: state === 'recording' ? `${RECORDING_BASE[i]}px`
                  : state === 'transcribing' ? '4px'
                  : state === 'too-short' ? (i === 2 ? '6px' : '4px')
                  : (i === 2 ? '8px' : '4px'),
                animation: state === 'transcribing'
                  ? `vbWaveSlow 0.9s ease-in-out ${i * 0.12}s infinite alternate`
                  : 'none',
              }}
            />
          ))}
        </div>
        <span>{message}</span>
        {showClose && (
          <button
            onClick={onCancel}
            style={{
              width: 18,
              height: 18,
              borderRadius: '50%',
              border: 'none',
              background: 'var(--bg-surface-2)',
              cursor: 'pointer',
              padding: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginLeft: 4,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-surface-3)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--bg-surface-2)'; }}
          >
            <X size={14} style={{ color: 'var(--text-muted)' }} />
          </button>
        )}
      </div>
    </>
  );
}
