'use client';

import { Onboarding } from '@/components/Onboarding';
import { getIpcRenderer } from '@/lib/electron-ipc';

export default function OnboardingPage() {
  return (
    <Onboarding
      onComplete={() => {
        getIpcRenderer()?.send('onboarding:complete');
      }}
    />
  );
}
