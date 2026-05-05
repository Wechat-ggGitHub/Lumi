'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useState, useRef, useCallback, Suspense } from 'react';

function SubtitleContent() {
  const searchParams = useSearchParams();
  const text = searchParams.get('text') || '';
  const duration = parseFloat(searchParams.get('duration') || '0');
  const [visible, setVisible] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const startTimeRef = useRef<number>(0);
  const rafRef = useRef<number>(0);

  const tick = useCallback(() => {
    if (!scrollRef.current || !contentRef.current || duration <= 0) return;

    if (startTimeRef.current === 0) {
      startTimeRef.current = performance.now();
    }

    const elapsed = (performance.now() - startTimeRef.current) / 1000;
    const progress = Math.min(elapsed / duration, 1);
    const containerHeight = scrollRef.current.clientHeight;
    const contentHeight = contentRef.current.scrollHeight;
    const maxScroll = contentHeight - containerHeight;

    if (maxScroll > 0) {
      scrollRef.current.scrollTop = maxScroll * progress;
    }

    if (progress < 1) {
      rafRef.current = requestAnimationFrame(tick);
    }
  }, [duration]);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  useEffect(() => {
    if (duration > 0) {
      rafRef.current = requestAnimationFrame(tick);
    }
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [tick, duration]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        padding: '12px 16px',
        background: 'rgba(30, 30, 40, 0.92)',
        borderRadius: '10px',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        opacity: visible ? 1 : 0,
        transition: 'opacity 0.3s ease',
        minHeight: '80px',
        color: '#e0e0e0',
        fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
        <div
          style={{
            width: '12px',
            height: '12px',
            background: '#4CAF50',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <span style={{ fontSize: '6px', color: 'white' }}>▶</span>
        </div>
        <span style={{ fontSize: '10px', color: '#888' }}>Shrew 正在朗读...</span>
      </div>
      <div
        ref={scrollRef}
        style={{
          position: 'relative',
          fontSize: '13px',
          lineHeight: '1.6',
          wordBreak: 'break-word',
          overflow: 'hidden',
          height: '90px',
        }}
      >
        <div
          ref={contentRef}
          style={{
            position: 'relative',
          }}
        >
          {text}
        </div>
        {/* 渐变遮罩：顶部已读区域变暗 */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: '24px',
            background: 'linear-gradient(to bottom, rgba(30, 30, 40, 0.6), transparent)',
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
      <style>{`html, body { background: transparent !important; overflow: hidden !important; }`}</style>
      <Suspense fallback={null}>
        <SubtitleContent />
      </Suspense>
    </>
  );
}
