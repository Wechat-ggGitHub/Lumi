'use client';

import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { getIpcRenderer } from '@/lib/electron-ipc';

export default function PreferencesSettingsPage() {
  return (
    <div className="min-h-screen bg-bg-window flex flex-col">
      <PageHeader title="交互偏好" subtitle="发送方式、清空确认等"
        onBack={() => getIpcRenderer()?.send('navigate:route', { path: '/settings' })} />
      <div className="flex-1 overflow-auto px-page-x">
        <EmptyState title="即将推出" description="交互偏好设置正在开发中，包括发送方式、清空确认等选项。" />
      </div>
    </div>
  );
}
