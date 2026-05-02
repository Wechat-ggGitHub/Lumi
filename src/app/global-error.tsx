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
      <body className="m-0 font-sans p-10">
        <h2 className="text-danger">Something went wrong</h2>
        <p className="text-body text-text-muted">{error.message}</p>
        {error.digest && (
          <p className="text-label text-text-muted">Digest: {error.digest}</p>
        )}
        <button
          onClick={reset}
          className="mt-4 px-4 py-2 rounded-btn border-none bg-brand text-white cursor-pointer"
        >
          Try again
        </button>
      </body>
    </html>
  );
}
