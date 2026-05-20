'use client'

import { ChevronRight, type LucideIcon } from 'lucide-react'

type GlassCardVariant = 'nav' | 'content' | 'status'

interface NavCardProps {
  variant: 'nav'
  icon: LucideIcon
  title: string
  description?: string
  onClick?: () => void
  className?: string
}

interface StatusCardProps {
  variant: 'status'
  icon: LucideIcon
  iconColor?: string
  title: string
  description?: string
  badge?: React.ReactNode
  onClick?: () => void
  className?: string
}

interface ContentCardProps {
  variant?: 'content'
  onClick?: () => void
  className?: string
  children: React.ReactNode
}

type GlassCardProps = NavCardProps | StatusCardProps | ContentCardProps

export default function GlassCard(props: GlassCardProps) {
  const { onClick, className = '' } = props

  const baseClass = [
    'rounded-card p-card-p',
    'bg-bg-surface-1/50 backdrop-blur-xl',
    'border border-line-default',
    'transition-all duration-200 ease-out',
    onClick ? 'cursor-pointer hover:bg-bg-surface-1/70 active:scale-[0.99]' : '',
    className,
  ].join(' ')

  if (props.variant === 'nav') {
    const { icon: Icon, title, description } = props
    return (
      <div className={baseClass} onClick={onClick}>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-icon-box flex items-center justify-center bg-bg-surface-2">
            <Icon size={18} strokeWidth={1.8} className="text-text-muted" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-card-title text-text-primary">{title}</div>
            {description && <div className="text-body-sm text-text-muted mt-0.5 truncate">{description}</div>}
          </div>
          <ChevronRight size={14} className="text-text-muted flex-shrink-0" strokeWidth={2} />
        </div>
      </div>
    )
  }

  if (props.variant === 'status') {
    const { icon: Icon, iconColor, title, description, badge } = props
    return (
      <div className={baseClass} onClick={onClick}>
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-icon-box flex items-center justify-center ${iconColor === 'brand' ? 'bg-brand-soft' : 'bg-bg-surface-2'}`}>
            <Icon size={18} strokeWidth={1.8} className={iconColor === 'brand' ? 'text-brand-primary' : 'text-text-muted'} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-card-title text-text-primary">{title}</div>
            {description && <div className="text-body-sm text-text-muted mt-0.5 truncate">{description}</div>}
          </div>
          {badge}
          <ChevronRight size={14} className="text-text-muted flex-shrink-0" strokeWidth={2} />
        </div>
      </div>
    )
  }

  // variant === 'content' (default)
  const { children } = props as ContentCardProps
  return (
    <div className={baseClass} onClick={onClick}>
      {children}
    </div>
  )
}
