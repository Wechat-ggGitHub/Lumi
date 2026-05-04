'use client';

import { useState, useCallback } from 'react';
import Cropper from 'react-easy-crop';
import type { Area } from 'react-easy-crop';
import { Button } from '@/components/ui/Button';

interface AvatarCropModalProps {
  imageSrc: string;
  onConfirm: (croppedDataUrl: string) => void;
  onCancel: () => void;
}

async function getCroppedImg(imageSrc: string, pixelArea: Area): Promise<string> {
  const img = new Image();
  img.src = imageSrc;
  await new Promise((resolve) => { img.onload = resolve; });

  const canvas = document.createElement('canvas');
  const size = 256;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.drawImage(
    img,
    pixelArea.x,
    pixelArea.y,
    pixelArea.width,
    pixelArea.height,
    0,
    0,
    size,
    size,
  );

  return canvas.toDataURL('image/png');
}

export function AvatarCropModal({ imageSrc, onConfirm, onCancel }: AvatarCropModalProps) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);

  const handleCropComplete = useCallback((_croppedArea: Area, croppedPixels: Area) => {
    setCroppedAreaPixels(croppedPixels);
  }, []);

  const handleConfirm = useCallback(async () => {
    if (!croppedAreaPixels) return;
    const dataUrl = await getCroppedImg(imageSrc, croppedAreaPixels);
    onConfirm(dataUrl);
  }, [imageSrc, croppedAreaPixels, onConfirm]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-bg-surface rounded-2xl shadow-2xl w-[360px] flex flex-col overflow-hidden">
        <div className="px-5 pt-5 pb-3">
          <h3 className="text-card-title text-text-primary">裁剪头像</h3>
        </div>
        <div className="relative w-full h-[280px] bg-black">
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={1}
            cropShape="round"
            showGrid={false}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={handleCropComplete}
          />
        </div>
        <div className="px-5 py-3">
          <input
            type="range"
            min={1}
            max={3}
            step={0.1}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="w-full accent-brand"
          />
        </div>
        <div className="flex gap-3 px-5 pb-5">
          <Button variant="secondary" onClick={onCancel} className="flex-1">取消</Button>
          <Button variant="primary" onClick={handleConfirm} className="flex-1">确认</Button>
        </div>
      </div>
    </div>
  );
}
