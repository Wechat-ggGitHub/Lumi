'use client';

interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  label?: string;
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export function Select({ label, options, value, onChange, className = '' }: SelectProps) {
  return (
    <div className="mb-block-gap">
      {label && <label className="block text-label text-text-muted mb-1.5">{label}</label>}
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className={`w-full h-10 px-3.5 rounded-btn bg-bg-surface-1/60 border border-line-default text-body text-text-primary
          outline-none cursor-pointer transition-colors duration-150
          focus:border-brand/30 ${className}`}
      >
        {options.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  );
}
