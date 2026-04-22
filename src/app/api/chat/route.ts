import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { prompt, cwd, executionId } = body;

  if (!prompt || !cwd) {
    return NextResponse.json({ error: 'Missing prompt or cwd' }, { status: 400 });
  }

  // The actual Claude SDK call runs in the Electron main process.
  // This API route receives requests and forwards them via IPC to main.
  // Native modules (better-sqlite3, sherpa-onnx) only work in Node.js,
  // and Next.js API routes run in Node.js, so they can call directly.

  // Uses the executor exposed on globalThis
  const executor = (globalThis as any).__shrewExecutor;
  if (!executor) {
    return NextResponse.json({ error: 'Executor not ready' }, { status: 503 });
  }

  try {
    const result = await executor.execute(prompt, cwd, executionId);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
