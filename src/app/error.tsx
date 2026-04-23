'use client';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div style={{ padding: 40, fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif' }}>
      <h2 style={{ color: '#FF453A' }}>Something went wrong</h2>
      <p style={{ fontSize: 14, color: '#666' }}>{error.message}</p>
      <button
        onClick={reset}
        style={{ marginTop: 16, padding: '8px 16px', borderRadius: 8, border: 'none', background: '#007AFF', color: '#fff', cursor: 'pointer' }}
      >
        Try again
      </button>
    </div>
  );
}
