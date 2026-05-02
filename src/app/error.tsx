'use client';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="p-10 font-sans">
      <h2 className="text-danger">Something went wrong</h2>
      <p className="text-body text-text-muted">{error.message}</p>
      <button
        onClick={reset}
        className="mt-4 px-4 py-2 rounded-btn border-none bg-brand text-white cursor-pointer"
      >
        Try again
      </button>
    </div>
  );
}
