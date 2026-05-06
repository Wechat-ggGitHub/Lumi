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
  personaAvatar: string | null;
}

function SubtitleContent() {
  const [words, setWords] = useState<TtsWord[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [visible, setVisible] = useState(false);
  const [personaName, setPersonaName] = useState('S');
  const [personaAvatar, setPersonaAvatar] = useState<string | null>(null);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const startTimeRef = useRef<number>(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const wordRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const autoScrollRef = useRef(true);
  const manualScrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastIndexRef = useRef(-1);

  const stopTick = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const startTick = useCallback(() => {
    stopTick();
    intervalRef.current = setInterval(() => {
      const ctx = audioCtxRef.current;
      if (!ctx || startTimeRef.current === 0) return;

      const elapsed = ctx.currentTime - startTimeRef.current;
      const currentWords = words;
      if (currentWords.length === 0) return;

      let idx = -1;
      for (let i = currentWords.length - 1; i >= 0; i--) {
        if (elapsed >= currentWords[i].startTime) {
          idx = i;
          break;
        }
      }

      if (idx !== lastIndexRef.current) {
        lastIndexRef.current = idx;
        setCurrentIndex(idx);
      }

      // Auto-scroll to current word
      if (idx >= 0 && autoScrollRef.current && wordRefs.current[idx]) {
        wordRefs.current[idx]?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }

      const lastEnd = currentWords[currentWords.length - 1].endTime;
      if (elapsed >= lastEnd + 0.5) {
        stopTick();
      }
    }, 50);
  }, [words, stopTick]);

  // Start tick loop when words are loaded and visible
  useEffect(() => {
    if (visible && words.length > 0) {
      startTick();
    }
    return () => stopTick();
  }, [startTick, visible, words]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopTick();
      sourceRef.current?.stop();
      audioCtxRef.current?.close();
      if (manualScrollTimerRef.current) clearTimeout(manualScrollTimerRef.current);
    };
  }, [stopTick]);

  // Manual scroll override handler
  const handleScroll = useCallback(() => {
    autoScrollRef.current = false;
    if (manualScrollTimerRef.current) clearTimeout(manualScrollTimerRef.current);
    manualScrollTimerRef.current = setTimeout(() => {
      autoScrollRef.current = true;
    }, 2000);
  }, []);

  useEffect(() => {
    const ipc = getIpcRenderer();
    if (!ipc) return;

    const resetHandler = () => {
      stopTick();
      sourceRef.current?.stop();
      sourceRef.current = null;
      setWords([]);
      setCurrentIndex(-1);
      lastIndexRef.current = -1;
      wordRefs.current = [];
      setVisible(false);
      setIsPlaying(false);
    };

    ipc.on('tts-reset', resetHandler);

    const handler = async (_event: any, payload: TtsAudioPayload) => {
      // Stop any previous playback
      stopTick();
      sourceRef.current?.stop();
      sourceRef.current = null;

      setPersonaName(payload.personaName?.charAt(0).toUpperCase() || 'S');
      setPersonaAvatar(payload.personaAvatar || null);
      setCurrentIndex(-1);
      lastIndexRef.current = -1;
      wordRefs.current = [];

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
          stopTick();
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

    const stopHandler = () => {
      stopTick();
      sourceRef.current?.stop();
      sourceRef.current = null;
      setIsPlaying(false);
      getIpcRenderer()?.send('tts-stop-requested');
    };
    ipc.on('tts-stop', stopHandler);

    return () => {
      ipc.removeListener('tts-reset', resetHandler);
      ipc.removeListener('tts-audio-data', handler);
      ipc.removeListener('tts-stop', stopHandler);
    };
  }, [stopTick]);

  const handleClose = () => {
    stopTick();
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
          zIndex: 10,
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
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px', flexShrink: 0 }}>
        <div
          style={{
            width: '22px',
            height: '22px',
            borderRadius: '6px',
            background: personaAvatar ? 'transparent' : 'linear-gradient(135deg, #667eea, #764ba2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            overflow: 'hidden',
          }}
        >
          {personaAvatar ? (
            <img src={personaAvatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <span style={{ fontSize: '10px', color: 'white', fontWeight: 600 }}>{personaName}</span>
          )}
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

      {/* Scrollable text area */}
      <div
        ref={(el) => {
          scrollContainerRef.current = el;
        }}
        onScroll={handleScroll}
        style={{
          fontSize: '13px',
          lineHeight: '1.8',
          wordBreak: 'break-word',
          overflowY: 'auto',
          height: '92px',
          paddingRight: '4px',
        }}
      >
        <div>
          {words.length > 0
            ? words.map((w, i) => {
                let color = 'transparent';
                if (i < currentIndex) color = 'rgba(255, 255, 255, 0.5)';
                else if (i === currentIndex) color = '#ffffff';
                return (
                  <span
                    key={i}
                    ref={(el) => { wordRefs.current[i] = el; }}
                    style={{ color, transition: 'color 0.1s ease' }}
                  >
                    {w.word}
                  </span>
                );
              })
            : '...'}
        </div>
      </div>

      {/* Bottom gradient mask */}
      <div
        style={{
          position: 'absolute',
          bottom: '14px',
          left: '18px',
          right: '18px',
          height: '28px',
          background: 'linear-gradient(transparent, rgb(28, 28, 35))',
          pointerEvents: 'none',
          zIndex: 5,
        }}
      />
    </div>
  );
}

export default function SubtitlePage() {
  return (
    <>
      <style>{`html, body { background: transparent !important; overflow: hidden !important; }
@keyframes waveBar { from { height: 4px; } to { height: 14px; } }
@keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
::-webkit-scrollbar { width: 4px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 2px; }
::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.3); }`}</style>
      <Suspense fallback={null}>
        <SubtitleContent />
      </Suspense>
    </>
  );
}
