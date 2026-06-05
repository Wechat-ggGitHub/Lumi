'use client';

import { type InputHTMLAttributes, type ReactNode } from 'react';

interface SingleLineInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: string;
  labelAction?: ReactNode;
  helperText?: string;
  placeholderClassName?: string;
}

export function SingleLineInput({ label, labelAction, helperText, placeholderClassName, className = '', ...props }: SingleLineInputProps) {
  return (
    <div className="mb-block-gap">
      {(label || labelAction) && (
        <div className="flex items-center gap-2 mb-1.5">
          {label && <label className="text-label text-text-muted">{label}</label>}
          {labelAction}
        </div>
      )}
      <input
        className={`w-full h-10 px-3.5 rounded-btn bg-bg-surface-1/60 border border-line-default text-body text-text-primary
          outline-none transition-colors duration-150
          ${placeholderClassName ? placeholderClassName : 'placeholder:text-text-muted'}
          focus:border-brand/30
          disabled:opacity-40 ${className}`}
        {...props}
      />
      {helperText && <p className="text-label-xs text-text-muted mt-1">{helperText}</p>}
    </div>
  );
}
