'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function SubtitlePage() {
  const searchParams = useSearchParams();
  const text = searchParams.get('text') || '';
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  return (
    <>
      <style>{`html, body { background: transparent !important; overflow: hidden !important; }`}</style>
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
        <div style={{ fontSize: '13px', lineHeight: '1.6', wordBreak: 'break-word' }}>
          {text}
        </div>
      </div>
    </>
  );
}
