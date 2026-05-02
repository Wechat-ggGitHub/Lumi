'use client';

import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { getIpcRenderer } from '@/lib/electron-ipc';

export default function PrivacySettingsPage() {
  return (
    <div className="min-h-screen bg-bg-window flex flex-col">
      <PageHeader title="数据与隐私" subtitle="日志、历史、缓存管理"
        onBack={() => getIpcRenderer()?.send('navigate:route', { path: '/settings' })} />
      <div className="flex-1 overflow-auto px-page-x">
        <EmptyState title="即将推出" description="数据与隐私管理功能正在开发中，包括日志查看、历史记录管理和缓存清理。" />
      </div>
    </div>
  );
}
