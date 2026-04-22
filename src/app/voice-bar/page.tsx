'use client';

import { VoiceInput } from '@/components/VoiceInput';

export default function VoiceBarPage() {
  const handleSend = (text: string) => {
    const { ipcRenderer } = require('electron');
    ipcRenderer.send('voice:send', { text });
  };

  const handleCancel = () => {
    const { ipcRenderer } = require('electron');
    ipcRenderer.send('voice:cancel');
  };

  return (
    <html lang="zh-CN">
      <body style={{
        margin: 0,
        background: 'transparent',
        overflow: 'hidden',
        WebkitAppRegion: 'no-drag',
      }}>
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
      </body>
    </html>
  );
}
