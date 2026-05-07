'use client';

import { VoiceInput } from '@/components/VoiceInput';
import { useCallback } from 'react';

export default function VoiceBarPage() {
  const handleCancel = useCallback(() => {
    const { ipcRenderer } = require('electron');
    ipcRenderer.send('voice:cancel');
  }, []);

  return (
    <>
      <style>{`html, body { background: transparent !important; overflow: hidden !important; }`}</style>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
      }}>
        <VoiceInput onCancel={handleCancel} />
      </div>
    </>
  );
}
