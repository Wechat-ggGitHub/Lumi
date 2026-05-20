'use client';

import { Mic, Command } from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface CompletionScreenProps {
  onComplete: () => void;
}

export function CompletionScreen({ onComplete }: CompletionScreenProps) {
  return (
    <div className="flex justify-center items-center min-h-screen bg-bg-app">
      <div className="text-center flex flex-col items-center gap-6">
        <div className="w-[72px] h-[72px] rounded-full overflow-hidden">
          <img src="/icon.png" alt="Lumi" className="w-full h-full object-cover" />
        </div>
        <div>
          <h2 className="text-3xl font-semibold text-text-primary mb-2">准备就绪！</h2>
          <p className="text-body text-text-muted">随时可以开始和 Lumi 对话</p>
        </div>
        <div className="flex gap-6">
          <div className="flex flex-col items-center gap-2">
            <div className="w-11 h-11 rounded-xl bg-brand-soft/50 flex items-center justify-center text-text-muted">
              <Mic size={22} strokeWidth={1.8} />
            </div>
            <span className="text-xs text-text-muted whitespace-nowrap">说出 Lumi 唤醒我</span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <div className="w-11 h-11 rounded-xl bg-brand-soft/50 flex items-center justify-center text-text-muted">
              <Command size={22} strokeWidth={1.8} />
            </div>
            <span className="text-xs text-text-muted whitespace-nowrap">按右 Option 开始聊天</span>
          </div>
        </div>
        <Button variant="primary" onClick={onComplete} className="px-10 py-2.5 text-[15px]">
          准备好了
        </Button>
      </div>
    </div>
  );
}
