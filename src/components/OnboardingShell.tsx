'use client';

import { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';

interface OnboardingShellProps {
  currentStep: number;
  totalSteps: number;
  showBack: boolean;
  onBack: () => void;
  children: ReactNode;
}

export function OnboardingShell({ currentStep, totalSteps, showBack, onBack, children }: OnboardingShellProps) {
  return (
    <div className="flex justify-center items-center min-h-screen bg-bg-app pt-8" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
      <div className="max-w-md px-10 py-10 w-full" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        {/* 顶部栏：返回按钮 + 进度点 */}
        {showBack && (
          <div className="flex items-center justify-between mb-8">
            <button
              onClick={onBack}
              className="text-text-muted hover:text-text-primary transition-colors"
            >
              <ArrowLeft size={14} strokeWidth={2} />
            </button>
            <div className="flex gap-1.5">
              {Array.from({ length: totalSteps }).map((_, i) => (
                <div
                  key={i}
                  className={`w-1.5 h-1.5 rounded-full transition-colors ${
                    i < currentStep
                      ? 'bg-brand-primary/50'
                      : i === currentStep
                        ? 'bg-brand-primary'
                        : 'bg-bg-surface-2'
                  }`}
                />
              ))}
            </div>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
