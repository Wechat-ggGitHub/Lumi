'use client';

import { type ReactNode } from 'react';

interface BottomActionBarProps {
  children: ReactNode;
}

export function BottomActionBar({ children }: BottomActionBarProps) {
  return (
    <div className="sticky bottom-0 flex-shrink-0 bg-bg-window/90 backdrop-blur-xl border-t border-line-default px-page-x py-3.5 flex justify-end gap-2.5">
      {children}
    </div>
  );
}
