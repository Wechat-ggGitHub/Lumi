'use client';

import { type ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';

interface PageHeaderProps {
  title: string;
  onBack?: () => void;
  actions?: ReactNode;
}

export function PageHeader({ title, onBack, actions }: PageHeaderProps) {
  return (
    <div className="flex-shrink-0 px-page-x pt-12 pb-3" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
      <div className="flex items-center justify-between" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <div className="flex items-center gap-2">
          {onBack && (
            <button
              onClick={onBack}
              className="w-[30px] h-[30px] rounded-btn bg-bg-surface-1/60 flex items-center justify-center text-text-muted hover:text-text-secondary transition-colors duration-150"
            >
              <ArrowLeft size={14} strokeWidth={2} />
            </button>
          )}
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      </div>
      <h1 className="text-page-title text-text-primary mt-1">{title}</h1>
    </div>
  );
}
