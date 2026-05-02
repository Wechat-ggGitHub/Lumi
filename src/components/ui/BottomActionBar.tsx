'use client';

import { type ReactNode } from 'react';

interface BottomActionBarProps {
  children: ReactNode;
}

export function BottomActionBar({ children }: BottomActionBarProps) {
  return (
    <div className="flex-shrink-0 px-page-x py-4 border-t border-line-default flex items-center justify-end gap-3">
      {children}
    </div>
  );
}
