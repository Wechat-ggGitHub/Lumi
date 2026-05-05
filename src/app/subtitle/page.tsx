'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useState, useRef, useCallback, Suspense } from 'react';
import { ipcRenderer } from 'electron';

interface TtsSentence {
  text: string;
  startTime: number;
  endTime: number;
}

function SubtitleContent() {
  const searchParams = useSearchParams();
  const text = searchParams.get('text') || '';
  const duration = parseFloat(searchParams.get('duration') || '0');
  const sentencesParam = searchParams.get('sentences');

  const sentences: TtsSentence[] | null = sentencesParam
    ? JSON.parse(decodeURIComponent(sentencesParam))
    : null;

  const [visible, setVisible] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const sentenceRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const startTimeRef = useRef<number>(0);
  const rafRef = useRef<number>(0);

  // 均匀滚动（降级模式）
  const tickLinear = useCallback(() => {
    if (!scrollRef.current || !contentRef.current || duration <= 0) return;

    if (startTimeRef.current === 0) {
      startTimeRef.current = performance.now();
    }

    const elapsed = (performance.now() - startTimeRef.current) / 1000;
    const progress = Math.min(elapsed / duration, 1);
    const maxScroll = contentRef.current.scrollHeight - scrollRef.current.clientHeight;

    if (maxScroll > 0) {
      scrollRef.current.scrollTop = maxScroll * progress;
    }

    if (progress < 1) {
      rafRef.current = requestAnimationFrame(tickLinear);
    }
  }, [duration]);

  // 句级别同步滚动
  const tickSynced = useCallback(() => {
    if (!scrollRef.current || !sentences || sentences.length === 0) return;

    if (startTimeRef.current === 0) {
      startTimeRef.current = performance.now();
    }

    const elapsed = (performance.now() - startTimeRef.current) / 1000;
    const totalDuration = sentences[sentences.length - 1].endTime;

    // 查找当前句子
    let currentIdx = -1;
    for (let i = 0; i < sentences.length; i++) {
      if (elapsed >= sentences[i].startTime && elapsed < sentences[i].endTime) {
        currentIdx = i;
        break;
      }
    }
    // 如果超出最后一句话的 endTime，标记为最后一句
    if (currentIdx === -1 && elapsed >= sentences[sentences.length - 1].startTime) {
      currentIdx = sentences.length - 1;
    }

    if (currentIdx !== activeIndex) {
      setActiveIndex(currentIdx);
    }

    // 滚动到当前句子
    if (currentIdx >= 0) {
      const el = sentenceRefs.current[currentIdx];
      if (el && scrollRef.current) {
        const containerHeight = scrollRef.current.clientHeight;
        const targetScroll = el.offsetTop - containerHeight / 3;
        scrollRef.current.scrollTop = Math.max(0, targetScroll);
      }
    }

    if (elapsed < totalDuration + 0.5) {
      rafRef.current = requestAnimationFrame(tickSynced);
    }
  }, [sentences, activeIndex]);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  useEffect(() => {
    if (sentences && sentences.length > 0) {
      rafRef.current = requestAnimationFrame(tickSynced);
    } else if (duration > 0) {
      rafRef.current = requestAnimationFrame(tickLinear);
    }
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [tickSynced, tickLinear, sentences, duration]);

  const handleClose = () => {
    ipcRenderer.send('stop-speaking');
  };

  return (
    <div
      style={{
        position: 'relative',
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
      {/* 关闭按钮 */}
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
          background: 'rgba(255, 255, 255, 0.1)',
          color: 'rgba(255, 255, 255, 0.5)',
          fontSize: '10px',
          lineHeight: '18px',
          textAlign: 'center',
          cursor: 'pointer',
          padding: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'background 0.15s, color 0.15s',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
          e.currentTarget.style.color = 'rgba(255, 255, 255, 0.8)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
          e.currentTarget.style.color = 'rgba(255, 255, 255, 0.5)';
        }}
      >
        ✕
      </button>

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
        <div ref={contentRef} style={{ position: 'relative' }}>
          {sentences && sentences.length > 0 ? (
            sentences.map((s, i) => (
              <span
                key={i}
                ref={(el) => { sentenceRefs.current[i] = el; }}
                style={{
                  color: i === activeIndex ? '#ffffff' : i < activeIndex ? '#a0a0a0' : '#e0e0e0',
                  fontWeight: i === activeIndex ? 500 : 400,
                  transition: 'color 0.2s ease, font-weight 0.2s ease',
                }}
              >
                {s.text}
              </span>
            ))
          ) : (
            text
          )}
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
