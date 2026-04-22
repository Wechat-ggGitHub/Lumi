import { NextResponse } from 'next/server';

export async function GET() {
  const store = (globalThis as any).__shrewStore;
  if (!store) {
    return NextResponse.json({ state: 'idle', substate: null });
  }

  return NextResponse.json({
    state: store.appState,
    substate: store.sdkSubState,
    dotColor: store.dotColor,
  });
}
