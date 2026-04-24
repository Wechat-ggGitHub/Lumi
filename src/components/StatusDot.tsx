'use client';

type DotColor = 'gray' | 'blue' | 'green' | 'red' | 'yellow' | 'purple';

const DOT_STYLES: Record<DotColor, { bg: string; animate?: string }> = {
  gray:   { bg: '#8E8E93' },
  blue:   { bg: '#32ADFF', animate: 'pulse-blue' },
  green:  { bg: '#34C759' },
  red:    { bg: '#FF453A' },
  yellow: { bg: '#FFD60A', animate: 'blink-yellow' },
  purple: { bg: '#AF52DE', animate: 'pulse-purple' },
};

export function StatusDot({ color, size = 8 }: { color: DotColor; size?: number }) {
  const style = DOT_STYLES[color];

  return (
    <>
      <span style={{
        display: 'inline-block',
        width: size,
        height: size,
        borderRadius: '50%',
        background: style.bg,
        animation: style.animate ? `${style.animate} 1.5s ease-in-out infinite` : 'none',
      }} />
      <style>{`
        @keyframes pulse-blue { 0%,100% { box-shadow: 0 0 0 0 rgba(50,173,255,0.4); } 50% { box-shadow: 0 0 0 4px rgba(50,173,255,0); } }
        @keyframes pulse-purple { 0%,100% { box-shadow: 0 0 0 0 rgba(175,82,222,0.4); } 50% { box-shadow: 0 0 0 4px rgba(175,82,222,0); } }
        @keyframes blink-yellow { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }
      `}</style>
    </>
  );
}
