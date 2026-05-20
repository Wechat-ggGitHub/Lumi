'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { getIpcRenderer } from '@/lib/electron-ipc';
import { PageHeader } from '@/components/ui/PageHeader';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { SingleLineInput } from '@/components/ui/SingleLineInput';
import { Textarea } from '@/components/ui/Textarea';
import { Button } from '@/components/ui/Button';
import { BottomActionBar } from '@/components/ui/BottomActionBar';
import { AvatarCropModal } from '@/components/AvatarCropModal';

interface PersonaData {
  name: string;
  avatar: string | null;
  content: string;
}

export default function PersonaPage() {
  const [name, setName] = useState('Lumi');
  const [avatar, setAvatar] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [saved, setSaved] = useState(false);
  const [cropImage, setCropImage] = useState<string | null>(null);
  const loadedRef = useRef(false);
  const [dirty, setDirty] = useState(false);
  const ipcRenderer = typeof window !== 'undefined' ? getIpcRenderer() : null;

  useEffect(() => {
    ipcRenderer?.invoke('persona:load').then((data: PersonaData) => {
      setName(data.name);
      setAvatar(data.avatar);
      setContent(data.content);
      loadedRef.current = true;
    });
  }, [ipcRenderer]);

  useEffect(() => {
    if (!ipcRenderer) return;
    const handler = () => {
      if (dirty || !loadedRef.current) return;
      ipcRenderer.invoke('persona:load').then((data: PersonaData) => {
        setName(data.name);
        setAvatar(data.avatar);
        setContent(data.content);
      });
    };
    ipcRenderer.on('persona:updated', handler);
    return () => { ipcRenderer.removeListener('persona:updated', handler); };
  }, [ipcRenderer, dirty]);

  const handleSave = useCallback(() => {
    if (!ipcRenderer) return;
    ipcRenderer.invoke('persona:save', { name, content }).then(() => {
      setSaved(true);
      setDirty(false);
      setTimeout(() => setSaved(false), 1500);
    });
  }, [name, content, ipcRenderer]);

  const handleAvatarClick = useCallback(async () => {
    if (!ipcRenderer) return;
    const dataUrl = await ipcRenderer.invoke('persona:avatar:select');
    if (dataUrl) setCropImage(dataUrl);
  }, [ipcRenderer]);

  const handleCropConfirm = useCallback(async (croppedDataUrl: string) => {
    if (!ipcRenderer) return;
    setCropImage(null);
    const result = await ipcRenderer.invoke('persona:avatar:save', { dataUrl: croppedDataUrl });
    if (result) setAvatar(result);
  }, [ipcRenderer]);

  const handleCropCancel = useCallback(() => {
    setCropImage(null);
  }, []);

  const handleAvatarRemove = useCallback(() => {
    if (!ipcRenderer) return;
    ipcRenderer.invoke('persona:avatar:remove');
    setAvatar(null);
  }, [ipcRenderer]);

  return (
    <div className="min-h-screen bg-bg-window flex flex-col">
      <PageHeader title="分身设定"
        onBack={() => window.history.back()} />
      <div className="flex-1 overflow-auto px-page-x pb-6">
        <div className="mb-section-gap">
          <SectionHeader title="基础身份" />
          <div className="flex items-center gap-4 mb-block-gap">
            <div
              className="w-12 h-12 rounded-full overflow-hidden flex-shrink-0 cursor-pointer relative group"
              onClick={handleAvatarClick}
              onContextMenu={(e) => { e.preventDefault(); handleAvatarRemove(); }}
            >
              <img src={avatar || ''} alt={name} className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                <span className="text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity">更换</span>
              </div>
            </div>
            <div className="flex-1">
              <SingleLineInput value={name} onChange={e => { setName(e.target.value); setDirty(true); }} placeholder="分身名称" />
            </div>
          </div>
          <button onClick={handleAvatarRemove} className="text-label-xs text-text-muted hover:text-danger transition-colors">
            恢复默认头像
          </button>
        </div>
        <div className="flex-1">
          <SectionHeader title="人格设定" />
          <Textarea value={content} onChange={e => { setContent(e.target.value); setDirty(true); }}
            placeholder="用 Markdown 编写分身的人格设定..."
            className="!font-mono min-h-[400px]" />
        </div>
      </div>
      <BottomActionBar>
        <Button variant="primary" onClick={handleSave}>{saved ? '已保存' : '保存更改'}</Button>
      </BottomActionBar>
      {cropImage && (
        <AvatarCropModal
          imageSrc={cropImage}
          onConfirm={handleCropConfirm}
          onCancel={handleCropCancel}
        />
      )}
    </div>
  );
}
