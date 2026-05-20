'use client'

import { type ButtonHTMLAttributes } from 'react'
import type { LucideIcon } from 'lucide-react'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'icon'
type ButtonSize = 'default' | 'sm'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  icon?: LucideIcon
}

const variantStyles: Record<ButtonVariant, string> = {
  primary: 'bg-brand-primary text-white hover:bg-brand-primary-hover active:bg-brand-primary-active',
  secondary: 'border border-brand-primary/30 text-brand-primary hover:bg-brand-primary/10',
  ghost: 'text-text-muted hover:text-text-secondary hover:bg-bg-surface-1',
  danger: 'border border-danger/25 text-red-500/80 dark:text-red-400/80 hover:bg-danger/10',
  icon: 'w-9 h-9 bg-bg-surface-1 text-text-muted hover:text-text-secondary hover:bg-bg-surface-2',
}

const sizeStyles: Record<ButtonSize, string> = {
  default: 'h-9 px-3.5',
  sm: 'h-[30px] px-3',
}

export function Button({ variant = 'primary', size = 'default', icon: Icon, className = '', children, ...props }: ButtonProps) {
  return (
    <button
      className={`
        inline-flex items-center justify-center gap-1.5
        rounded-btn text-[13px] font-medium
        transition-all duration-150
        disabled:opacity-40 disabled:pointer-events-none
        ${variant !== 'icon' ? sizeStyles[size] : ''}
        ${variantStyles[variant]}
        ${className}
      `}
      {...props}
    >
      {Icon && <Icon size={16} strokeWidth={1.8} />}
      {children}
    </button>
  )
}
