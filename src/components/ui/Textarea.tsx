'use client';

import { type TextareaHTMLAttributes } from 'react';

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  helperText?: string;
}

export function Textarea({ label, helperText, className = '', ...props }: TextareaProps) {
  return (
    <div className="mb-block-gap">
      {label && <label className="block text-label text-text-muted mb-1">{label}</label>}
      <textarea
        className={`w-full min-h-[88px] px-3 py-2 rounded-input bg-bg-surface-2 border border-line-default text-body text-text-primary
          outline-none resize-y transition-colors duration-150
          placeholder:text-text-muted
          focus:border-brand
          disabled:opacity-40 ${className}`}
        {...props}
      />
      {helperText && <p className="text-label-xs text-text-muted mt-1">{helperText}</p>}
    </div>
  );
}
