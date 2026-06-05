'use client'

interface ChipGroupProps {
  options: string[]
  value: string
  onChange: (value: string) => void
}

export function ChipGroup({ options, value, onChange }: ChipGroupProps) {
  return (
    <div className="flex gap-1.5 p-1 rounded-btn bg-bg-surface-1/40">
      {options.map(opt => (
        <button
          key={opt}
          onClick={() => onChange(opt)}
          className={`px-3.5 py-1.5 rounded-lg text-[13px] font-medium transition-all duration-150 cursor-pointer
            ${value === opt
              ? 'bg-brand-soft text-text-primary border border-brand/20'
              : 'text-text-muted hover:text-text-secondary'
            }`}
        >
          {opt}
        </button>
      ))}
    </div>
  )
}
