'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="zh-CN">
      <body style={{ margin: 0, fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif', padding: 40 }}>
        <h2 style={{ color: '#FF453A' }}>Something went wrong</h2>
        <p style={{ fontSize: 14, color: '#666' }}>{error.message}</p>
        {error.digest && (
          <p style={{ fontSize: 12, color: '#999' }}>Digest: {error.digest}</p>
        )}
        <button
          onClick={reset}
          style={{ marginTop: 16, padding: '8px 16px', borderRadius: 8, border: 'none', background: '#007AFF', color: '#fff', cursor: 'pointer' }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
