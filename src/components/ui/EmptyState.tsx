'use client';

import { type LucideIcon } from 'lucide-react';
import { type ReactNode } from 'react';

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  const Icon = icon;
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      {Icon && (
        <div className="w-12 h-12 rounded-icon-box bg-bg-surface-1 flex items-center justify-center text-text-muted mb-3">
          <Icon size={22} strokeWidth={1.8} />
        </div>
      )}
      <h3 className="text-section-title text-text-secondary mb-1">{title}</h3>
      {description && <p className="text-body-sm text-text-muted max-w-xs">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
