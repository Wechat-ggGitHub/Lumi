'use client';

import { useState, useRef, useEffect, ReactNode } from 'react';

interface DropdownItem {
  label: string;
  href: string;
  icon?: string;
}

interface HeaderDropdownProps {
  items: DropdownItem[];
  dividerIndex?: number;
  trigger: ReactNode;
}

export function HeaderDropdown({ items, dividerIndex, trigger }: HeaderDropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  function handleSelect(item: DropdownItem) {
    setOpen(false);
    window.location.href = item.href;
  }

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(!open)} className="flex items-center">
        {trigger}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 w-52 bg-bg-surface-1 border border-line-default rounded-btn shadow-lg py-1 z-50">
          {items.map((item, i) => (
            <div key={item.href}>
              {dividerIndex !== undefined && i === dividerIndex && (
                <div className="border-t border-line-default my-1" />
              )}
              <button
                onClick={() => handleSelect(item)}
                className="w-full text-left px-4 py-2 text-body text-text-secondary hover:bg-bg-surface-2 hover:text-text-primary transition-colors flex items-center gap-3"
              >
                {item.icon && <span className="text-base">{item.icon}</span>}
                <span>{item.label}</span>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
