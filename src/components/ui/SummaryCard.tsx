'use client';

import { StatusBadge } from './StatusBadge';

type SummaryCardStatus = 'configured' | 'unconfigured' | 'default';

interface SummaryCardProps {
  title: string;
  summary: string;
  status?: SummaryCardStatus;
  onClick?: () => void;
}

const statusLabels: Record<SummaryCardStatus, string> = {
  configured: '已配置',
  unconfigured: '未配置',
  default: '',
};

export function SummaryCard({ title, summary, status, onClick }: SummaryCardProps) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-bg-surface-1 border border-line-default rounded-card p-card-p
        hover:border-line-strong transition-colors duration-150 cursor-pointer"
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-card-title text-text-primary">{title}</span>
        <div className="flex items-center gap-2">
          {status && statusLabels[status] && (
            <StatusBadge status={status === 'configured' ? 'success' : status === 'unconfigured' ? 'warning' : 'default'} label={statusLabels[status]} />
          )}
          <span className="text-text-muted text-label">→</span>
        </div>
      </div>
      <p className="text-body-sm text-text-muted">{summary}</p>
    </button>
  );
}
