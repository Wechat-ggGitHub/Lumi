'use client';

import { type ButtonHTMLAttributes } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost';
type ButtonSize = 'default' | 'sm' | 'icon';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary: 'bg-brand text-white hover:bg-brand-hover shadow-sm',
  secondary: 'bg-bg-surface-2 border border-line-default text-text-primary hover:border-line-strong',
  ghost: 'bg-transparent text-text-muted hover:text-text-primary hover:bg-bg-surface-2',
};

const sizeStyles: Record<ButtonSize, string> = {
  default: 'h-9 px-3.5 rounded-btn text-body-sm',
  sm: 'h-[30px] px-3 rounded-btn text-label',
  icon: 'w-8 h-8 rounded-btn flex items-center justify-center',
};

export function Button({ variant = 'primary', size = 'default', className = '', disabled, children, ...props }: ButtonProps) {
  return (
    <button
      className={`
        inline-flex items-center justify-center gap-1.5
        transition-colors duration-150 cursor-pointer
        disabled:opacity-40 disabled:cursor-default
        ${variantStyles[variant]}
        ${sizeStyles[size]}
        ${className}
      `}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
}
