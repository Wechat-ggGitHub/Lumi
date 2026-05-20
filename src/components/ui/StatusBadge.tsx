'use client'

interface StatusBadgeProps {
  status: 'success' | 'warning' | 'danger' | 'info' | 'default'
  label: string
}

const dotColors: Record<StatusBadgeProps['status'], string> = {
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  info: 'bg-info',
  default: 'bg-text-muted',
}

export function StatusBadge({ status, label }: StatusBadgeProps) {
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-chip bg-white/[0.03] dark:bg-white/[0.03] bg-black/[0.03] text-label text-text-secondary">
      <span className={`w-1.5 h-1.5 rounded-full ${dotColors[status]}`} />
      {label}
    </span>
  )
}
