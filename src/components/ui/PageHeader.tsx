'use client';

import { type ReactNode } from 'react';
import { Button } from './Button';

interface PageHeaderProps {
  title: string;
  onBack?: () => void;
  actions?: ReactNode;
}

export function PageHeader({ title, onBack, actions }: PageHeaderProps) {
  return (
    <div className="flex-shrink-0 px-page-x pt-12 pb-4" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
      <div className="flex items-center justify-between" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        {onBack && (
          <Button variant="ghost" size="sm" onClick={onBack}>
            ← 返回
          </Button>
        )}
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
      <h1 className="text-page-title text-text-primary mt-1">{title}</h1>
    </div>
  );
}
