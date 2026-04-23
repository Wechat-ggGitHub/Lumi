'use client';

import { VoiceInput } from '@/components/VoiceInput';
import { getIpcRenderer } from '@/lib/electron-ipc';

export default function VoiceBarPage() {
  const handleSend = (text: string) => {
    getIpcRenderer()?.send('voice:send', { text });
  };

  const handleCancel = () => {
    getIpcRenderer()?.send('voice:cancel');
  };

  return (
    <>
      <style>{`html, body { background: transparent !important; overflow: hidden !important; }`}</style>
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        padding: '0 20px',
      }}>
        <div style={{ width: 600, maxWidth: '100%' }}>
          <VoiceInput onSend={handleSend} onCancel={handleCancel} />
        </div>
      </div>
    </>
  );
}
