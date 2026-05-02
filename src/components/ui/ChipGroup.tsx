'use client';

interface ChipGroupProps {
  options: string[];
  value: string;
  onChange: (value: string) => void;
}

export function ChipGroup({ options, value, onChange }: ChipGroupProps) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(opt => (
        <button
          key={opt}
          onClick={() => onChange(opt)}
          className={`px-3 py-1 rounded-chip text-body-sm transition-colors duration-150 cursor-pointer
            ${value === opt
              ? 'bg-brand-soft text-brand border border-brand/30'
              : 'bg-bg-surface-2 text-text-muted border border-line-default hover:border-line-strong'
            }`}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}
