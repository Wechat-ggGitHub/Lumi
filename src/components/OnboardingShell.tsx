'use client';

import { ReactNode } from 'react';

interface OnboardingShellProps {
  currentStep: number;
  totalSteps: number;
  showBack: boolean;
  onBack: () => void;
  children: ReactNode;
}

export function OnboardingShell({ currentStep, totalSteps, showBack, onBack, children }: OnboardingShellProps) {
  return (
    <div className="flex justify-center items-center min-h-screen bg-bg-app pt-8">
      <div className="max-w-md px-10 py-10 w-full">
        {/* 顶部栏：返回按钮 + 进度点 */}
        {showBack && (
          <div className="flex items-center justify-between mb-8">
            <button
              onClick={onBack}
              className="text-text-muted hover:text-text-primary text-sm transition-colors"
            >
              ← 返回
            </button>
            <div className="flex gap-1.5">
              {Array.from({ length: totalSteps }).map((_, i) => (
                <div
                  key={i}
                  className={`w-1.5 h-1.5 rounded-full transition-colors ${
                    i < currentStep
                      ? 'bg-brand/50'
                      : i === currentStep
                        ? 'bg-brand'
                        : 'bg-text-muted/20'
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
