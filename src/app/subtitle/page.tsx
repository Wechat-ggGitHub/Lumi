'use client';

import { useEffect, useState, useRef, useCallback, Suspense } from 'react';
import { getIpcRenderer } from '@/lib/electron-ipc';

interface TtsSentence {
  text: string;
  startTime: number;
  endTime: number;
}

interface TtsAudioPayload {
  audio: Uint8Array;
  sentences: TtsSentence[] | null;
  personaName: string;
}

function SubtitleContent() {
  const [sentences, setSentences] = useState<TtsSentence[] | null>(null);
  const [personaName, setPersonaName] = useState('S');
  const [activeIndex, setActiveIndex] = useState(-1);
  const [visible, setVisible] = useState(false);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const startTimeRef = useRef<number>(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentenceRefs = useRef<(HTMLDivElement | null)[]>([]);
  const rafRef = useRef<number>(0);

  const tick = useCallback(() => {
    const ctx = audioCtxRef.current;
    if (!ctx || startTimeRef.current === 0) return;

    const elapsed = ctx.currentTime - startTimeRef.current;

    if (sentences && sentences.length > 0) {
      let currentIdx = -1;
      for (let i = 0; i < sentences.length; i++) {
        if (elapsed >= sentences[i].startTime && elapsed < sentences[i].endTime) {
          currentIdx = i;
          break;
        }
      }
      if (currentIdx === -1 && elapsed >= sentences[sentences.length - 1].startTime) {
        currentIdx = sentences.length - 1;
      }

      if (currentIdx !== activeIndex) {
        setActiveIndex(currentIdx);
      }

      if (currentIdx >= 0 && sentenceRefs.current[currentIdx] && scrollRef.current) {
        const el = sentenceRefs.current[currentIdx]!;
        const containerHeight = scrollRef.current.clientHeight;
        scrollRef.current.scrollTop = Math.max(0, el.offsetTop - containerHeight / 3);
      }

      const totalDuration = sentences[sentences.length - 1].endTime;
      if (elapsed < totalDuration + 0.5) {
        rafRef.current = requestAnimationFrame(tick);
      }
    }
  }, [sentences, activeIndex]);

  useEffect(() => {
    const ipc = getIpcRenderer();
    if (!ipc) return;

    // Signal readiness so main process sends audio data
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
          getIpcRenderer()?.send('tts-playback-done');
        };

        startTimeRef.current = ctx.currentTime;
        source.start(0);
        sourceRef.current = source;
      } catch {
        getIpcRenderer()?.send('tts-playback-done');
        return;
      }

      setSentences(payload.sentences);
      requestAnimationFrame(() => setVisible(true));
    };

    ipc.on('tts-audio-data', handler);
    return () => {
      ipc.removeListener('tts-audio-data', handler);
    };
  }, []);

  useEffect(() => {
    if (visible && sentences && sentences.length > 0) {
      rafRef.current = requestAnimationFrame(tick);
    }
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [tick, visible, sentences]);

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

  const getSentenceColor = (index: number) => {
    if (index === activeIndex) return '#ffffff';
    if (index < activeIndex) return 'rgba(255, 255, 255, 0.25)';
    const distance = index - activeIndex;
    return `rgba(255, 255, 255, ${Math.max(0.35, 0.7 - distance * 0.12)})`;
  };

  return (
    <div
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        padding: '14px 18px',
        background: 'rgba(40, 40, 55, 0.75)',
        borderRadius: '14px',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        border: '1px solid rgba(255, 255, 255, 0.12)',
        boxShadow: '0 4px 24px rgba(0, 0, 0, 0.3)',
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

      {/* Header: avatar + waveform (no text) */}
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
                animation: `waveBar 0.5s ease-in-out ${i * 0.1}s infinite alternate`,
              }}
            />
          ))}
        </div>
      </div>

      {/* Lyric area */}
      <div
        ref={scrollRef}
        style={{
          position: 'relative',
          fontSize: '13px',
          lineHeight: '1.8',
          wordBreak: 'break-word',
          overflow: 'hidden',
          height: '90px',
        }}
      >
        <div style={{ position: 'relative' }}>
          {sentences && sentences.length > 0
            ? sentences.map((s, i) => (
                <div
                  key={i}
                  ref={(el) => {
                    sentenceRefs.current[i] = el;
                  }}
                  style={{
                    color: getSentenceColor(i),
                    fontWeight: i === activeIndex ? 500 : 400,
                    textShadow:
                      i === activeIndex ? '0 0 12px rgba(76, 175, 80, 0.3)' : 'none',
                    transition: 'color 0.2s ease',
                    padding: '2px 0',
                  }}
                >
                  {s.text}
                </div>
              ))
            : '...'}
        </div>
        {/* Top gradient mask */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: '28px',
            background: 'linear-gradient(to bottom, rgba(40, 40, 55, 0.9), transparent)',
            pointerEvents: 'none',
          }}
        />
        {/* Bottom gradient mask */}
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: '28px',
            background: 'linear-gradient(to top, rgba(40, 40, 55, 0.9), transparent)',
            pointerEvents: 'none',
          }}
        />
      </div>
    </div>
  );
}

export default function SubtitlePage() {
  return (
    <>
      <style>{`html, body { background: transparent !important; overflow: hidden !important; }
@keyframes waveBar { from { height: 4px; } to { height: 14px; } }`}</style>
      <Suspense fallback={null}>
        <SubtitleContent />
      </Suspense>
    </>
  );
}
