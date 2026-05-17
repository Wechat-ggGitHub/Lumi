'use client';

import { useEffect, useState } from 'react';

interface CompletionScreenProps {
  onComplete: () => void;
}

export function CompletionScreen({ onComplete }: CompletionScreenProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
      onComplete();
    }, 1500);

    return () => clearTimeout(timer);
  }, [onComplete]);

  if (!visible) return null;

  return (
    <div className="flex justify-center items-center min-h-screen bg-bg-app">
      <div className="text-center">
        <h2 className="text-3xl font-semibold text-text-primary mb-3">配置完成！</h2>
        <p className="text-body text-text-muted">按右 Option 开始使用 Lumi</p>
      </div>
    </div>
  );
}
