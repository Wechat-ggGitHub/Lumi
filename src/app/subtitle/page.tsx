'use client';

import { useEffect, useState, useRef, useCallback, Suspense } from 'react';
import { getIpcRenderer } from '@/lib/electron-ipc';

interface TtsWord {
  word: string;
  startTime: number;
  endTime: number;
}

interface TtsAudioPayload {
  audio: Uint8Array;
  words: TtsWord[] | null;
  personaName: string;
}

function SubtitleContent() {
  const [words, setWords] = useState<TtsWord[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [visible, setVisible] = useState(false);
  const [personaName, setPersonaName] = useState('S');

  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const startTimeRef = useRef<number>(0);
  const rafRef = useRef<number>(0);

  const tick = useCallback(() => {
    const ctx = audioCtxRef.current;
    if (!ctx || startTimeRef.current === 0 || words.length === 0) return;

    const elapsed = ctx.currentTime - startTimeRef.current;

    let idx = -1;
    for (let i = words.length - 1; i >= 0; i--) {
      if (elapsed >= words[i].startTime) {
        idx = i;
        break;
      }
    }

    setCurrentIndex(idx);

    const lastEnd = words[words.length - 1].endTime;
    if (elapsed < lastEnd + 0.5) {
      rafRef.current = requestAnimationFrame(tick);
    }
  }, [words]);

  useEffect(() => {
    const ipc = getIpcRenderer();
    if (!ipc) return;

    ipc.send('tts-page-ready');

    const handler = async (_event: any, payload: TtsAudioPayload) => {
      setPersonaName(payload.personaName?.charAt(0).toUpperCase() || 'S');

      let ctx: AudioContext;
      try {
        ctx = new AudioContext();
        audioCtxRef.current = ctx;
      } catch {
        getIpcRenderer()?.send('tts-playback-done');
        return;
      }

      try {
        const audioBuffer = await ctx.decodeAudioData(payload.audio.buffer.slice(0) as ArrayBuffer);
        const source = ctx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(ctx.destination);

        source.onended = () => {
          setIsPlaying(false);
          getIpcRenderer()?.send('tts-playback-done');
        };

        startTimeRef.current = ctx.currentTime;
        source.start(0);
        sourceRef.current = source;
      } catch {
        getIpcRenderer()?.send('tts-playback-done');
        return;
      }

      if (payload.words && payload.words.length > 0) {
        setWords(payload.words);
      }
      setIsPlaying(true);
      requestAnimationFrame(() => setVisible(true));
    };

    ipc.on('tts-audio-data', handler);
    return () => {
      ipc.removeListener('tts-audio-data', handler);
    };
  }, []);

  useEffect(() => {
    if (visible && words.length > 0) {
      rafRef.current = requestAnimationFrame(tick);
    }
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [tick, visible, words]);

  useEffect(() => {
    return () => {
      sourceRef.current?.stop();
      audioCtxRef.current?.close();
    };
  }, []);

  const handleClose = () => {
    sourceRef.current?.stop();
    getIpcRenderer()?.send('tts-stop-requested');
  };

  return (
    <div
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        padding: '14px 18px',
        background: 'rgb(28, 28, 35)',
        borderRadius: '14px',
        boxShadow: '0 4px 24px rgba(0, 0, 0, 0.4)',
        opacity: visible ? 1 : 0,
        transition: 'opacity 0.3s ease',
        minHeight: '80px',
        color: '#e0e0e0',
        fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif',
      }}
    >
      {/* Close button */}
      <button
        onClick={handleClose}
        style={{
          position: 'absolute',
          top: '8px',
          right: '8px',
          width: '18px',
          height: '18px',
          borderRadius: '50%',
          border: 'none',
          background: 'rgba(255, 255, 255, 0.08)',
          cursor: 'pointer',
          padding: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'background 0.15s',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
        }}
      >
        <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
          <path d="M1 1L7 7M7 1L1 7" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>

      {/* Header: avatar + waveform */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
        <div
          style={{
            width: '22px',
            height: '22px',
            borderRadius: '6px',
            background: 'linear-gradient(135deg, #667eea, #764ba2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: '10px', color: 'white', fontWeight: 600 }}>{personaName}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '2px', height: '14px' }}>
          {[6, 10, 14, 8, 12].map((h, i) => (
            <div
              key={i}
              style={{
                width: '2px',
                height: `${h}px`,
                background: '#4CAF50',
                borderRadius: '1px',
                animation: isPlaying ? `waveBar 0.5s ease-in-out ${i * 0.1}s infinite alternate` : 'none',
              }}
            />
          ))}
        </div>
      </div>

      {/* Streaming text area */}
      <div
        style={{
          fontSize: '13px',
          lineHeight: '1.8',
          wordBreak: 'break-word',
        }}
      >
        {words.length > 0
          ? words.map((w, i) => {
              let color = 'transparent';
              if (i < currentIndex) color = 'rgba(255, 255, 255, 0.5)';
              else if (i === currentIndex) color = '#ffffff';
              return (
                <span key={i} style={{ color, transition: 'color 0.1s ease' }}>
                  {w.word}
                </span>
              );
            })
          : '...'}
        {isPlaying && currentIndex >= 0 && currentIndex < words.length - 1 && (
          <span
            style={{
              display: 'inline-block',
              width: '2px',
              height: '13px',
              background: '#4CAF50',
              marginLeft: '1px',
              verticalAlign: 'middle',
              animation: 'blink 0.6s ease-in-out infinite',
            }}
          />
        )}
      </div>
    </div>
  );
}

export default function SubtitlePage() {
  return (
    <>
      <style>{`html, body { background: transparent !important; overflow: hidden !important; }
@keyframes waveBar { from { height: 4px; } to { height: 14px; } }
@keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }`}</style>
      <Suspense fallback={null}>
        <SubtitleContent />
      </Suspense>
    </>
  );
}
