'use client';

import { type InputHTMLAttributes } from 'react';

interface SingleLineInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: string;
  helperText?: string;
  placeholderClassName?: string;
}

export function SingleLineInput({ label, helperText, placeholderClassName, className = '', ...props }: SingleLineInputProps) {
  return (
    <div className="mb-block-gap">
      {label && <label className="block text-label text-text-muted mb-1">{label}</label>}
      <input
        className={`w-full h-10 px-3 rounded-input bg-bg-surface-2 border border-line-default text-body text-text-primary
          outline-none transition-colors duration-150
          ${placeholderClassName ? placeholderClassName : 'placeholder:text-text-muted'}
          focus:border-brand
          disabled:opacity-40 ${className}`}
        {...props}
      />
      {helperText && <p className="text-label-xs text-text-muted mt-1">{helperText}</p>}
    </div>
  );
}
