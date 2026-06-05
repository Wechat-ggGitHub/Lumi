'use client';

import { type ReactNode } from 'react';

interface SectionHeaderProps {
  title: string;
  description?: string;
  action?: ReactNode;
  tag?: string;
}

export function SectionHeader({ title, description, action, tag }: SectionHeaderProps) {
  return (
    <div className="flex justify-between items-start mb-3">
      <div>
        {tag && (
          <div className="text-section-tag text-brand uppercase mb-2">{tag}</div>
        )}
        <h2 className="text-section-title text-text-primary">{title}</h2>
        {description && (
          <p className="text-body-sm text-text-muted mt-1">{description}</p>
        )}
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}
