'use client';

import { type ReactNode } from 'react';
import { Button } from './Button';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  actions?: ReactNode;
}

export function PageHeader({ title, subtitle, onBack, actions }: PageHeaderProps) {
  return (
    <div className="flex-shrink-0 px-page-x pt-12 pb-4" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
      <div className="flex items-center justify-between mb-1" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <div className="flex items-center gap-3">
          {onBack && (
            <Button variant="ghost" size="sm" onClick={onBack}>
              ← 返回
            </Button>
          )}
          <h1 className="text-page-title text-text-primary">{title}</h1>
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
      {subtitle && (
        <p className="text-page-subtitle text-text-muted mt-1">{subtitle}</p>
      )}
    </div>
  );
}
