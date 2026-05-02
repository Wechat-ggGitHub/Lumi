'use client';

import { type ReactNode } from 'react';

interface ListCardProps {
  children: ReactNode;
  className?: string;
}

export function ListCard({ children, className = '' }: ListCardProps) {
  return (
    <div className={`bg-bg-surface-1 border border-line-default rounded-card-sm p-card-p ${className}`}>
      {children}
    </div>
  );
}
