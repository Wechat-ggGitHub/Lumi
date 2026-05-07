'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

type VoiceInputProps = {
  onCancel: () => void;
};

export function VoiceInput({ onCancel }: VoiceInputProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number>(0);
  const volumeRef = useRef(0);
  const [status, setStatus] = useState<'recording' | 'hint'>('recording');

  // 接收实时音量
  useEffect(() => {
    const { ipcRenderer } = require('electron');
    const onVolume = (_: any, data: { volume: number }) => {
      volumeRef.current = data.volume;
    };
    const onHint = () => {
      setStatus('hint');
    };
    const onRecording = () => {
      setStatus('recording');
    };

    ipcRenderer.on('voice:volume', onVolume);
    ipcRenderer.on('voice:continuous-chat-hint', onHint);
    ipcRenderer.on('voice:start-recording', onRecording);

    return () => {
      ipcRenderer.removeListener('voice:volume', onVolume);
      ipcRenderer.removeListener('voice:continuous-chat-hint', onHint);
      ipcRenderer.removeListener('voice:start-recording', onRecording);
    };
  }, []);

  // Canvas 波浪动画
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = 160 * dpr;
    canvas.height = 24 * dpr;
    ctx.scale(dpr, dpr);

    let phase = 0;

    const draw = () => {
      ctx.clearRect(0, 0, 160, 24);

      const amplitude = 2 + volumeRef.current * 10;
      ctx.beginPath();
      ctx.strokeStyle = '#5B8DEF';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';

      for (let x = 0; x < 160; x++) {
        const y = 12 + Math.sin((x / 160) * Math.PI * 4 + phase) * amplitude;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      phase += 0.05 + volumeRef.current * 0.1;
      animFrameRef.current = requestAnimationFrame(draw);
    };

    draw();
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [status]);

  // ESC 键关闭
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  if (status === 'hint') {
    return (
      <div style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <div style={{
          width: 80,
          height: 3,
          borderRadius: 2,
          background: 'rgba(91, 141, 239, 0.4)',
          animation: 'breathe 1.5s ease-in-out infinite',
        }} />
        <style>{`
          @keyframes breathe {
            0%, 100% { opacity: 0.3; }
            50% { opacity: 0.8; }
          }
        `}</style>
      </div>
    );
  }

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: '8px 16px',
    }}>
      <canvas
        ref={canvasRef}
        style={{ width: 160, height: 24 }}
      />
      <button
        onClick={onCancel}
        style={{
          background: 'rgba(255,255,255,0.1)',
          border: 'none',
          borderRadius: '50%',
          width: 28,
          height: 28,
          color: 'rgba(255,255,255,0.5)',
          fontSize: 16,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'color 0.15s',
        }}
        onMouseEnter={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.9)')}
        onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.5)')}
      >
        ×
      </button>
    </div>
  );
}
